"""Servicios para consultar los CSV FIRMS y sus observaciones armonizadas."""

import csv
from datetime import date, datetime, time, timezone
import os
from pathlib import Path
from typing import Literal

from app.firms import DATA_DIR as DEFAULT_DATA_DIR, discover_files
from app.catalog import connect, prepare_files
from app.geography import continent_bounds, continent_for
from app.schemas import Observation

DATA_DIR = Path(os.getenv("FIRMS_DATA_DIR", DEFAULT_DATA_DIR)).expanduser()


def get_observations(
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    continent: str | None = None,
    source: Literal["MODIS", "VIIRS"] | None = None,
    limit: int = 1000,
    offset: int = 0,
) -> list[Observation]:
    """Consulta la caché persistente; nunca recorre los CSV para paginar."""
    datasets = [dataset for dataset in discover_files() if not source or dataset.source == source]
    if not datasets:
        return []
    paths = [str(path) for path in prepare_files(datasets)]
    conditions = []
    parameters: list = [paths]
    if start_date:
        conditions.append("detected_at >= ?")
        parameters.append(datetime.combine(start_date, time.min))
    if end_date:
        conditions.append("detected_at::DATE <= ?")
        parameters.append(end_date)
    if continent:
        bounds = continent_bounds(continent)
        if bounds is None:
            return []
        west, south, east, north = bounds
        conditions.extend(["longitude BETWEEN ? AND ?", "latitude BETWEEN ? AND ?"])
        parameters.extend([west, east, south, north])
    where = " WHERE " + " AND ".join(conditions) if conditions else ""
    select = "SELECT * FROM read_parquet(?)"
    page: list[Observation] = []

    def observation(row: dict) -> Observation:
        confidence = row["confidence"]
        if confidence and confidence.isdigit():
            row["confidence"] = int(confidence)
        row["detected_at"] = row["detected_at"].replace(tzinfo=timezone.utc)
        return Observation(**row)

    with connect() as connection:
        if not continent:
            result = connection.execute(select + where + " ORDER BY detected_at, id LIMIT ? OFFSET ?",
                                        parameters + [limit, offset])
            names = [entry[0] for entry in result.description]
            for record in result.fetchall():
                item = observation(dict(zip(names, record)))
                item.continent = continent_for(item.longitude, item.latitude)
                page.append(item)
            return page

        # El bbox reduce candidatos; el polígono filtra ANTES de paginar.
        # Se avanza por clave para evitar ordenar/traer el año completo a Python.
        seen = 0
        cursor = None
        while len(page) < limit:
            extra = [] if cursor is None else [
                "(detected_at > ? OR (detected_at = ? AND id > ?))"
            ]
            query_where = " WHERE " + " AND ".join(conditions + extra)
            args = parameters + ([] if cursor is None else [cursor[0], cursor[0], cursor[1]])
            result = connection.execute(select + query_where + " ORDER BY detected_at, id LIMIT 10000", args)
            names = [entry[0] for entry in result.description]
            records = result.fetchall()
            if not records:
                break
            for record in records:
                row = dict(zip(names, record))
                cursor = row["detected_at"], row["id"]
                name = continent_for(row["longitude"], row["latitude"])
                if name is None or name.casefold() != continent.casefold():
                    continue
                if seen >= offset:
                    item = observation(row)
                    item.continent = name
                    page.append(item)
                    if len(page) == limit:
                        break
                seen += 1
    return page


def get_harmonized_pairs(*, limit: int = 1000, offset: int = 0) -> list[dict[str, str]]:
    """Lee una página de coincidencias producidas por el script de armonización."""
    pairs_file = DATA_DIR / "resultados_armonizacion" / "coincidencias_modis_viirs.csv"
    if not pairs_file.is_file():
        return []
    with pairs_file.open("r", encoding="utf-8-sig", newline="") as csv_file:
        rows = csv.DictReader(csv_file)
        for _ in range(offset):
            next(rows, None)
        page: list[dict[str, str]] = []
        for _ in range(limit):
            row = next(rows, None)
            if row is None:
                break
            page.append(row)
        return page


def get_continents() -> list[str]:
    """Lista alineada con los continentes poblados del dataset de Natural Earth."""
    return ["Sudamérica", "África", "Asia", "Europa", "Norteamérica", "Oceanía"]
