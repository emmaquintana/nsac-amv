"""Regresiones de descubrimiento FIRMS y consultas con varias descargas."""

import csv
from datetime import date
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from threading import Event
from unittest.mock import patch

from fastapi.testclient import TestClient

from api.api import app
from app.catalog import cache_path, prepare_files
from app.firms import discover_files
from app.services import get_observations
from app.time_series import get_time_series, prepare_summaries, summary_path

HEADER = ["latitude", "longitude", "brightness", "scan", "track", "acq_date",
          "acq_time", "satellite", "instrument", "confidence", "version", "frp", "daynight"]


class FirmsTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.env = patch.dict(os.environ, {"FIRMS_PATHS": str(self.root), "FIRMS_CACHE_DIR": str(self.root / "cache")})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.geo = patch("app.services.continent_for", return_value="Sudamérica")
        self.geo.start()
        self.addCleanup(self.geo.stop)

    def write(self, name, *, satellite="Terra", instrument="MODIS", day="2026-01-01", version="61.03", empty=False):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.writer(stream)
            writer.writerow(HEADER)
            if not empty:
                writer.writerow([-20, -60, 320, 1, 1, day, "0009", satellite,
                                 instrument, "n" if instrument != "MODIS" else "90", version, 10, "N"])
        return path

    def test_recursive_archive_nrt_and_all_platforms(self):
        self.write("DL_FIRE_M-C61_1/fire_archive_M-C61_1.csv")
        self.write("DL_FIRE_J1V-C2_2/fire_nrt_J1V-C2_2.csv", satellite="N20", instrument="VIIRS", version="2.0NRT")
        self.write("DL_FIRE_J2V-C2_3/fire_archive_J2V-C2_3.csv", satellite="N21", instrument="VIIRS")
        # NASA identifica el instrumento S-NPP como SNPP en estos archivos.
        self.write("DL_FIRE_SV-C2_4/fire_nrt_SV-C2_4.csv", satellite="SNPP", instrument="SNPP")
        (self.root / "Readme.txt").write_text("NASA")
        (self.root / "resultados.csv").write_text("id_modis,id_viirs\n1,2\n")
        self.assertEqual(len(discover_files()), 4)
        items = get_observations(limit=10)
        self.assertEqual(len(items), 4)
        self.assertEqual({item.source for item in items}, {"MODIS", "VIIRS"})
        self.assertEqual({item.satellite for item in items}, {"Terra", "N20", "N21", "SNPP"})
        nrt = next(item for item in items if item.satellite == "N20")
        self.assertEqual((nrt.version, nrt.data_kind, nrt.product), ("2.0NRT", "nrt", "J1V-C2"))
        self.assertEqual(nrt.detected_at.strftime("%H:%M%z"), "00:09+0000")

    def test_direct_files_directories_duplicates_and_renamed_csv(self):
        first = self.write("a/custom.csv")
        second = self.write("b/custom.csv", instrument="VIIRS", satellite="N21")
        files = discover_files([self.root / "a", first, second])
        self.assertEqual(len(files), 2)
        self.assertEqual(len({item.tag for item in files}), 2)
        self.assertEqual(len({item.id for item in get_observations()}), 2)

    def test_header_only_nasa_file_is_valid_and_empty(self):
        self.write("DL_FIRE_SV-C2_1/fire_archive_SV-C2_1.csv", empty=True)
        self.assertEqual(discover_files()[0].source, "VIIRS")
        self.assertEqual(get_observations(), [])

    def test_dates_sources_continents_and_pagination(self):
        self.write("later.csv", day="2026-02-01")
        self.write("earlier.csv", day="2026-01-01", instrument="VIIRS", satellite="SNPP")
        self.write("middle.csv", day="2026-01-15")
        page = get_observations(limit=1, offset=1)
        self.assertEqual(page[0].detected_at.date(), date(2026, 1, 15))
        self.assertEqual(len(get_observations(source="VIIRS")), 1)
        self.assertEqual(len(get_observations(start_date=date(2026, 1, 15), end_date=date(2026, 1, 15))), 1)
        self.assertEqual(len(get_observations(continent="sudamérica")), 3)
        self.assertEqual(get_observations(continent="Europa"), [])

    def test_equal_timestamps_keep_same_order_across_page_sizes(self):
        path = self.write("MODIS.csv")
        with path.open("a", newline="") as stream:
            writer = csv.writer(stream)
            for _ in range(15):
                writer.writerow([-20, -60, 320, 1, 1, "2026-01-01", "0009", "Terra", "MODIS", "90", "61.03", 10, "N"])
        all_rows = get_observations(limit=100)
        pages = [item for offset in range(0, len(all_rows), 3)
                 for item in get_observations(limit=3, offset=offset)]
        self.assertEqual([item.id for item in all_rows], [item.id for item in pages])

    def test_api_reports_missing_data_instead_of_silent_empty_list(self):
        client = TestClient(app)
        self.assertEqual(client.get("/api/v1/observations").status_code, 503)
        with patch.dict(os.environ, {"FIRMS_PATHS": str(self.root / "missing")}):
            response = client.get("/api/v1/observations")
            self.assertEqual(response.status_code, 503)
            self.assertIn("No existe", response.json()["detail"])
        self.write("MODIS.csv")
        prepare_files(discover_files())
        self.assertEqual(client.get("/api/v1/observations").status_code, 200)
        self.assertEqual(client.get("/api/v1/observations?start_date=2026-02-01&end_date=2026-01-01").status_code, 422)

    def test_cli_combines_files_without_reusing_observation_ids(self):
        self.write("DL_FIRE_M-C61_1/fire_archive_M-C61_1.csv")
        self.write("DL_FIRE_M-C61_1/fire_nrt_M-C61_1.csv", version="6.1NRT")
        self.write("DL_FIRE_SV-C2_2/fire_archive_SV-C2_2.csv", satellite="SNPP", instrument="SNPP", version="2")
        out = self.root / "resultados"
        result = subprocess.run(
            [sys.executable, "-m", "app.data.ArmMV_FRP_por_par", "--entrada", str(self.root),
             "--salida", str(out), "--desde", "2026-01-01", "--hasta", "2026-01-01"],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        with (out / "coincidencias_modis_viirs.csv").open() as stream:
            pairs = list(csv.DictReader(stream))
        self.assertEqual(len(pairs), 2)
        items = get_observations()
        self.assertEqual({item.id for item in items if item.source == "MODIS"}, {row["id_modis"] for row in pairs})
        self.assertEqual({item.id for item in items if item.source == "VIIRS"}, {row["id_viirs"] for row in pairs})
        self.assertEqual(len(discover_files()), 3)  # No ingiere sus propios resultados.

    def test_cache_is_reused_and_invalidated_when_csv_changes(self):
        path = self.write("MODIS.csv")
        self.assertEqual(len(get_observations()), 1)
        old_cache = cache_path(discover_files()[0])
        with patch("app.catalog._build", side_effect=AssertionError("No debe volver a leer el CSV")):
            self.assertEqual(len(get_observations()), 1)
        with path.open("a", newline="") as stream:
            csv.writer(stream).writerow([-20, -60, 321, 1, 1, "2026-01-02", "0100", "Terra", "MODIS", "80", "61.03", 11, "D"])
        self.assertNotEqual(old_cache, cache_path(discover_files()[0]))
        self.assertEqual(len(get_observations()), 2)

    def test_geography_uses_bundled_file_without_network(self):
        from app.geography import _natural_earth, continent_for
        _natural_earth.cache_clear()
        with patch("urllib.request.urlopen", side_effect=AssertionError("No debe descargar geografía")):
            self.assertEqual(continent_for(-64, -31), "Sudamérica")

    def test_api_returns_preparation_state_without_waiting_for_csv(self):
        status = {"state": "preparing", "completed": 1, "total": 8, "progress": 12,
                  "current_file": "fire.csv", "error": None}
        with patch("api.api.catalog_status", return_value=status):
            client = TestClient(app)
            self.assertEqual(client.get("/api/v1/data/status").json(), status)
            response = client.get("/api/v1/observations")
            self.assertEqual(response.status_code, 202)
            self.assertEqual(response.json(), status)

    def test_background_preparation_is_shared_and_reaches_ready(self):
        from app import catalog
        self.write("MODIS.csv")
        files = discover_files()
        entered, release = Event(), Event()
        original = catalog._build

        def build(dataset, target):
            entered.set()
            release.wait(timeout=5)
            original(dataset, target)

        with patch("app.catalog._build", side_effect=build) as mocked:
            self.assertEqual(catalog.catalog_status(files)["state"], "preparing")
            try:
                self.assertTrue(entered.wait(timeout=3))
                self.assertEqual(catalog.catalog_status(files)["state"], "preparing")
                self.assertEqual(mocked.call_count, 1)
            finally:
                release.set()
                catalog._worker.join(timeout=5)
        status = catalog.catalog_status(files)
        self.assertEqual(status["state"], "ready")
        self.assertEqual(status["progress"], 100)

    def test_daily_totals_include_later_days_beyond_first_observation_page(self):
        path = self.write("MODIS.csv", day="2025-11-16")
        with path.open("a", newline="") as stream:
            writer = csv.writer(stream)
            for _ in range(5000):
                writer.writerow([-20, -60, 320, 1, 1, "2025-11-16", "0009", "Terra", "MODIS", "90", "61.03", 10, "N"])
            writer.writerow([-20, -60, 320, 1, 1, "2026-11-14", "2359", "Terra", "MODIS", "90", "61.03", 10, "N"])
        self.write("VIIRS.csv", day="2026-06-01", instrument="VIIRS", satellite="SNPP")
        page = get_observations(limit=5000)
        self.assertEqual({item.detected_at.date() for item in page}, {date(2025, 11, 16)})
        summary = get_time_series()
        self.assertEqual(summary.total, 5003)
        self.assertEqual([item.count for item in summary.counts], [5001, 1, 1])
        self.assertEqual(summary.available_days, [date(2025, 11, 16), date(2026, 6, 1), date(2026, 11, 14)])
        self.assertEqual(summary.observed_days, 3)
        self.assertEqual((summary.first_day, summary.last_day), (date(2025, 11, 16), date(2026, 11, 14)))

    def test_daily_totals_filter_dates_regions_and_report_unassigned(self):
        path = self.write("MODIS.csv", day="2026-01-01")
        with path.open("a", newline="") as stream:
            writer = csv.writer(stream)
            for latitude, longitude, day in [(-10, 25, "2026-01-01"), (0, -150, "2026-01-02"), (-10, 25, "2026-01-03")]:
                writer.writerow([latitude, longitude, 320, 1, 1, day, "2359", "Terra", "MODIS", "90", "61.03", 10, "N"])
        summary = get_time_series(start_date=date(2026, 1, 1), end_date=date(2026, 1, 2), continents=["África"])
        self.assertEqual(summary.total, 1)
        self.assertEqual([(item.day, item.continent, item.count) for item in summary.counts], [(date(2026, 1, 1), "África", 1)])
        self.assertEqual(summary.unassigned, 1)
        self.assertEqual(summary.available_days, [date(2026, 1, 1), date(2026, 1, 2)])
        self.assertEqual(get_time_series(start_date=date(2026, 1, 2), end_date=date(2026, 1, 2)).total, 0)
        self.assertEqual(get_time_series(continents=[]).total, 0)

    def test_daily_totals_support_empty_files_and_periods(self):
        self.write("DL_FIRE_SV-C2_1/fire_archive_SV-C2_1.csv", empty=True)
        summary = get_time_series()
        self.assertEqual(summary.total, 0)
        self.assertEqual(summary.counts, [])
        self.assertEqual(summary.available_days, [])
        self.assertIsNone(summary.first_day)
        self.assertIsNone(summary.last_day)

    def test_daily_cache_is_reused_and_invalidated_by_csv_or_geography(self):
        from app.geography import NATURAL_EARTH_FILE
        path = self.write("MODIS.csv")
        self.assertEqual(get_time_series().total, 1)
        dataset = discover_files()[0]
        old_cache = summary_path(dataset)
        with patch("app.time_series._build_summary", side_effect=AssertionError("No debe recalcular")):
            self.assertEqual(get_time_series().total, 1)
        with path.open("a", newline="") as stream:
            csv.writer(stream).writerow([-20, -60, 320, 1, 1, "2026-01-02", "0009", "Terra", "MODIS", "90", "61.03", 10, "N"])
        self.assertNotEqual(old_cache, summary_path(dataset))
        self.assertEqual(get_time_series().total, 2)
        geography = self.root / "countries.geojson"
        geography.write_bytes(NATURAL_EARTH_FILE.read_bytes())
        with patch.dict(os.environ, {"NATURAL_EARTH_GEOJSON": str(geography)}):
            old_cache = summary_path(dataset)
            geography.write_bytes(geography.read_bytes() + b"\n")
            self.assertNotEqual(old_cache, summary_path(dataset))

    def test_vectorized_geography_agrees_with_point_queries(self):
        from app.geography import continent_for, continents_for
        points = [(-64, -31), (25, -10), (10, 50), (-100, 40), (100, 35), (135, -25), (0, -85), (0, 0), (-150, 0)]
        expected = [continent_for(longitude, latitude) for longitude, latitude in points]
        self.assertEqual(continents_for([point[0] for point in points], [point[1] for point in points]).tolist(), expected)
        self.assertEqual(continents_for([], []).tolist(), [])

    def test_daily_api_returns_complete_totals_and_validates_filters(self):
        self.write("MODIS.csv")
        prepare_summaries(discover_files())
        client = TestClient(app)
        response = client.get("/api/v1/time-series?continent=Sudam%C3%A9rica&continent=%C3%81frica")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["counts"], [{"day": "2026-01-01", "continent": "Sudamérica", "count": 1}])
        self.assertEqual(response.json()["available_days"], ["2026-01-01"])
        self.assertEqual(client.get("/api/v1/time-series?start_date=2026-02-01&end_date=2026-01-01").status_code, 422)
        self.assertEqual(client.get("/api/v1/time-series?continent=Desconocido").status_code, 422)

    def test_daily_api_never_returns_partial_counts_during_preparation(self):
        status = {"state": "preparing", "completed": 1, "total": 8, "progress": 12,
                  "current_file": "fire.csv", "error": None, "stage": "summary"}
        with patch("api.api.time_series_status", return_value=status), patch("api.api.get_time_series") as query:
            response = TestClient(app).get("/api/v1/time-series")
            self.assertEqual(response.status_code, 202)
            self.assertEqual(response.json(), status)
            query.assert_not_called()


if __name__ == "__main__":
    unittest.main()
