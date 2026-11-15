"""El mapa representa todos los datos y aumenta el detalle espacial con el zoom."""

import csv
from datetime import date
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from api.api import app
from app.firms import discover_files
from app.map_points import get_map_observations, map_path, prepare_map_files

HEADER = ['latitude', 'longitude', 'acq_date', 'acq_time', 'satellite', 'instrument', 'frp']
WORLD = dict(west=-180, south=-90, east=180, north=90, zoom=2)


class MapTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        environment = patch.dict(os.environ, {'FIRMS_PATHS': str(self.root),
                                              'FIRMS_CACHE_DIR': str(self.root / 'cache')})
        environment.start()
        self.addCleanup(environment.stop)

    def write(self, rows):
        for source in {'MODIS', *(row[3] for row in rows)}:
            with (self.root / f'{source}.csv').open('w', newline='') as stream:
                writer = csv.writer(stream)
                writer.writerow(HEADER)
                for latitude, longitude, day, sensor, frp in rows:
                    if sensor == source:
                        writer.writerow([latitude, longitude, day, '0009',
                                         'Terra' if source == 'MODIS' else 'SNPP', source, frp])
        return self.root / 'MODIS.csv'

    def test_all_days_and_regions_are_represented_beyond_first_page(self):
        self.write([(-20, -60, '2026-01-01', 'MODIS', 10)] * 5001 + [
            (-10, 25, '2026-02-01', 'VIIRS', 25), (35, 100, '2026-03-01', 'MODIS', 50)])
        result = get_map_observations(**WORLD)
        self.assertEqual(result.total, 5003)
        self.assertEqual(len(result.points), 3)
        self.assertEqual(sum(point.count for point in result.points), 5003)
        group = next(point for point in result.points if point.count > 1)
        self.assertEqual((group.modis, group.viirs, group.max_frp), (5001, 0, 10))
        self.assertEqual(max(point.last_detection.date() for point in result.points), date(2026, 3, 1))

    def test_zoom_subdivides_groups_without_losing_observations(self):
        self.write([(-20, -60, '2026-01-01', 'MODIS', 10),
                    (-20.05, -60.05, '2026-01-02', 'VIIRS', 20)])
        distant = get_map_observations(**WORLD)
        close = get_map_observations(west=-60.1, east=-59.9, south=-20.1, north=-19.9, zoom=12)
        self.assertEqual(len(distant.points), 1)
        self.assertEqual((distant.points[0].modis, distant.points[0].viirs), (1, 1))
        self.assertEqual(distant.points[0].max_frp, 20)
        self.assertEqual(len(close.points), 2)
        self.assertEqual(close.total, distant.total)

    def test_visible_area_dates_and_exact_continent_filters(self):
        self.write([(-20, -60, '2026-01-01', 'MODIS', 10),
                    (-10, 25, '2026-01-01', 'VIIRS', 20),
                    (-10, 25, '2026-01-02', 'VIIRS', 30),
                    (0, 0, '2026-01-01', 'MODIS', 5)])
        self.assertEqual(get_map_observations(**WORLD, continents=['África']).total, 2)
        self.assertEqual(get_map_observations(**WORLD, continents=['África', 'Sudamérica']).total, 3)
        self.assertEqual(get_map_observations(**WORLD, continents=[]).total, 0)
        self.assertEqual(get_map_observations(**WORLD, start_date=date(2026, 1, 1),
                                             end_date=date(2026, 1, 1), continents=['África']).total, 1)
        area = get_map_observations(west=20, east=30, south=-15, north=-5, zoom=6)
        self.assertEqual(area.total, 2)
        self.assertEqual(get_map_observations(west=50, east=60, south=0, north=10, zoom=6).total, 0)

    def test_antimeridian_keeps_both_sides_and_excludes_other_longitudes(self):
        self.write([(10, 179, '2026-01-01', 'MODIS', 10),
                    (10, -179, '2026-01-01', 'VIIRS', 20),
                    (10, 0, '2026-01-01', 'MODIS', 30)])
        result = get_map_observations(west=170, east=-170, south=0, north=20, zoom=4)
        self.assertEqual(result.total, 2)
        self.assertTrue(all(abs(point.longitude) > 170 for point in result.points))

    def test_empty_files_and_cache_invalidation(self):
        path = self.write([])
        self.assertEqual(get_map_observations(**WORLD).total, 0)
        old_cache = map_path(discover_files()[0])
        with patch('app.map_points._build_map', side_effect=AssertionError('Recalculó el mapa')):
            self.assertEqual(get_map_observations(**WORLD).points, [])
        with path.open('a', newline='') as stream:
            csv.writer(stream).writerow([-20, -60, '2026-01-01', '0009', 'Terra', 'MODIS', 10])
        self.assertNotEqual(old_cache, map_path(discover_files()[0]))
        self.assertEqual(get_map_observations(**WORLD).total, 1)

    def test_api_validates_filters_and_returns_complete_spatial_counts(self):
        self.write([(-20, -60, '2026-01-01', 'MODIS', 10)])
        prepare_map_files(discover_files())
        client = TestClient(app)
        response = client.get('/api/v1/map', params=WORLD)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['total'], 1)
        self.assertEqual(response.json()['points'][0]['count'], 1)
        for invalid in [dict(south=91), dict(south=20, north=0), dict(zoom=20), dict(west=float('nan')),
                        dict(continent='Desconocido'), dict(start_date='2026-02-01', end_date='2026-01-01')]:
            self.assertEqual(client.get('/api/v1/map', params={**WORLD, **invalid}).status_code, 422)

    def test_api_reports_preparation_and_errors_without_partial_points(self):
        status = dict(state='preparing', stage='map', completed=1, total=8, progress=12,
                      current_file='MODIS.csv', error=None)
        with patch('api.api.map_status', return_value=status), patch('api.api.get_map_observations') as query:
            response = TestClient(app).get('/api/v1/map', params=WORLD)
            self.assertEqual(response.status_code, 202)
            self.assertEqual(response.json(), status)
            query.assert_not_called()
        with patch('api.api.map_status', return_value={**status, 'state': 'error', 'error': 'Fallo de lectura'}):
            response = TestClient(app).get('/api/v1/map', params=WORLD)
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()['detail'], 'Fallo de lectura')


if __name__ == '__main__':
    unittest.main()
