"""Clasificación de puntos usando polígonos Admin 0 de Natural Earth."""

from functools import lru_cache
import os
from pathlib import Path

import geopandas as gpd
from shapely.geometry import Point

NATURAL_EARTH_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
    "geojson/ne_110m_admin_0_countries.geojson"
)
CONTINENT_NAMES = {
    "South America": "Sudamérica",
    "North America": "Norteamérica",
    "Africa": "África",
    "Asia": "Asia",
    "Europe": "Europa",
    "Oceania": "Oceanía",
    "Antarctica": "Antártida",
}


@lru_cache(maxsize=1)
def _natural_earth() -> gpd.GeoDataFrame:
    local_path = os.getenv("NATURAL_EARTH_GEOJSON")
    source = Path(local_path) if local_path else NATURAL_EARTH_URL
    countries = gpd.read_file(source)
    if "CONTINENT" not in countries.columns:
        raise ValueError("El dataset Natural Earth debe incluir la columna CONTINENT")
    return countries[["CONTINENT", "geometry"]].to_crs("EPSG:4326")


def continent_for(longitude: float, latitude: float) -> str | None:
    """Devuelve el continente de Natural Earth que contiene la coordenada."""
    point = Point(longitude, latitude)
    countries = _natural_earth()
    candidate_indexes = countries.sindex.query(point, predicate="intersects")
    matches = [index for index in candidate_indexes if countries.geometry.iloc[index].covers(point)]
    if len(matches) == 0:
        return None
    name = str(countries.iloc[int(matches[0])]["CONTINENT"])
    return CONTINENT_NAMES.get(name, name)
