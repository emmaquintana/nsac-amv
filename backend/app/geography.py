"""Clasificación de puntos usando polígonos Admin 0 de Natural Earth."""

from functools import lru_cache
import os
from pathlib import Path

import geopandas as gpd
import numpy as np
import shapely
from shapely.geometry import Point

NATURAL_EARTH_FILE = Path(__file__).resolve().parent / "resources" / "ne_110m_admin_0_countries.geojson"
CONTINENT_NAMES = {
    "South America": "Sudamérica",
    "North America": "Norteamérica",
    "Africa": "África",
    "Asia": "Asia",
    "Europe": "Europa",
    "Oceania": "Oceanía",
    "Antarctica": "Antártida",
}


def geography_signature() -> tuple[str, int, int]:
    local_path = os.getenv("NATURAL_EARTH_GEOJSON")
    source = (Path(local_path) if local_path else NATURAL_EARTH_FILE).expanduser().resolve()
    stat = source.stat()
    return str(source), stat.st_size, stat.st_mtime_ns


@lru_cache(maxsize=1)
def _natural_earth(signature: tuple[str, int, int] | None = None) -> gpd.GeoDataFrame:
    source = (signature or geography_signature())[0]
    countries = gpd.read_file(source)
    if "CONTINENT" not in countries.columns:
        raise ValueError("El dataset Natural Earth debe incluir la columna CONTINENT")
    return countries[["CONTINENT", "geometry"]].to_crs("EPSG:4326")


def continent_bounds(continent: str) -> tuple[float, float, float, float] | None:
    """Prefiltro SQL conservador; el polígono decide la pertenencia exacta."""
    original = next((key for key, name in CONTINENT_NAMES.items()
                     if name.casefold() == continent.casefold()), None)
    countries = _natural_earth(geography_signature())
    selected = countries.loc[countries["CONTINENT"] == original]
    if selected.empty:
        return None
    west, south, east, north = selected.total_bounds
    return float(west), float(south), float(east), float(north)


def continent_for(longitude: float, latitude: float) -> str | None:
    """Devuelve el continente de Natural Earth que contiene la coordenada."""
    point = Point(longitude, latitude)
    countries = _natural_earth(geography_signature())
    candidate_indexes = countries.sindex.query(point, predicate="intersects")
    matches = [index for index in candidate_indexes if countries.geometry.iloc[index].covers(point)]
    if len(matches) == 0:
        return None
    name = str(countries.iloc[int(matches[0])]["CONTINENT"])
    return CONTINENT_NAMES.get(name, name)


def continents_for(longitudes, latitudes) -> np.ndarray:
    """Clasifica un bloque con el mismo criterio que continent_for, sin bucles por punto."""
    countries = _natural_earth(geography_signature())
    result = np.full(len(longitudes), None, dtype=object)
    points = shapely.points(longitudes, latitudes)
    matches = countries.sindex.query(points, predicate="intersects")
    if matches.shape[1]:
        # En fronteras compartidas, elige el mismo primer país que la consulta escalar.
        order = np.lexsort((matches[1], matches[0]))
        point_indexes, country_indexes = matches[:, order]
        first = np.r_[True, point_indexes[1:] != point_indexes[:-1]]
        names = np.array([CONTINENT_NAMES.get(name, name) for name in countries["CONTINENT"]], dtype=object)
        result[point_indexes[first]] = names[country_indexes[first]]
    return result
