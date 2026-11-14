"""Servicios para consultar los CSV FIRMS y sus observaciones armonizadas."""

import csv
from datetime import date, datetime, time, timezone
import heapq
import math
import os
from pathlib import Path
from typing import Literal

from app.geography import continent_for
from app.schemas import Observation

APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR / "data"
CSV_FILES: dict[str, tuple[Path, ...]] = {
    "MODIS": (Path(os.getenv("MODIS_CSV", DATA_DIR / "MODIS_C6_1_Global_7d.csv")),),
    "VIIRS": (
        Path(os.getenv("VIIRS_J1_CSV", DATA_DIR / "J1_VIIRS_C2_Global_7d.csv")),
        Path(os.getenv("VIIRS_J2_CSV", DATA_DIR / "J2_VIIRS_C2_Global_7d.csv")),
    ),
}

ALIASES = {
    "latitude": ("latitude", "lat"),
    "longitude": ("longitude", "lon", "long"),
    "acq_date": ("acq_date", "date", "day"),
    "acq_time": ("acq_time", "time", "utc_time"),
    "brightness": ("brightness", "bright_ti4", "bright_t5", "bright_t31"),
    "confidence": ("confidence", "conf"),
    "frp": ("frp", "fire_radiative_power"),
    "daynight": ("daynight", "day_night"),
    "satellite": ("satellite", "platform", "instrumento"),
}


def _value(row: dict[str, str], field: str) -> str | None:
    normalized = {key.strip().lower(): value.strip() for key, value in row.items() if key}
    for alias in ALIASES[field]:
        value = normalized.get(alias)
        if value not in (None, "", "nan", "NaN"):
            return value
    return None


def _number(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except ValueError:
        return None


def _detected_at(acq_date: str, acq_time: str | None) -> datetime:
    day = date.fromisoformat(acq_date[:10])
    digits = "".join(character for character in (acq_time or "0000") if character.isdigit()).zfill(4)[-4:]
    return datetime.combine(day, time(int(digits[:2]), int(digits[2:])), tzinfo=timezone.utc)


def _row_observation(
    row: dict[str, str], source: Literal["MODIS", "VIIRS"], file_tag: str, row_number: int
) -> Observation | None:
    latitude = _number(_value(row, "latitude"))
    longitude = _number(_value(row, "longitude"))
    acq_date = _value(row, "acq_date")
    if latitude is None or longitude is None or acq_date is None:
        return None
    try:
        detected_at = _detected_at(acq_date, _value(row, "acq_time"))
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            return None
        confidence_raw = _value(row, "confidence")
        confidence: str | int | None = confidence_raw
        if confidence_raw and confidence_raw.isdigit():
            confidence = int(confidence_raw)
        daynight = (_value(row, "daynight") or "").upper()
        return Observation(
            id=f"{file_tag}-{row_number}",
            source=source,
            satellite=_value(row, "satellite"),
            latitude=latitude,
            longitude=longitude,
            detected_at=detected_at,
            brightness=_number(_value(row, "brightness")),
            confidence=confidence,
            frp=_number(_value(row, "frp")),
            daynight=daynight if daynight in {"D", "N"} else None,
        )
    except (ValueError, OverflowError):
        return None


def get_observations(
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    continent: str | None = None,
    source: Literal["MODIS", "VIIRS"] | None = None,
    limit: int = 1000,
    offset: int = 0,
) -> list[Observation]:
    """Armoniza los tres CSV y devuelve una página cronológica de resultados."""
    sources = (source,) if source else ("MODIS", "VIIRS")
    page_size = offset + limit
    earliest: list[tuple[float, str, int, Observation]] = []

    for sensor in sources:
        for path in CSV_FILES[sensor]:
            if not path.is_file():
                continue
            file_tag = path.stem
            with path.open("r", encoding="utf-8-sig", newline="") as csv_file:
                for row_number, row in enumerate(csv.DictReader(csv_file), start=2):
                    item = _row_observation(row, sensor, file_tag, row_number)
                    if item is None:
                        continue
                    if start_date and item.detected_at.date() < start_date:
                        continue
                    if end_date and item.detected_at.date() > end_date:
                        continue
                    if continent:
                        item.continent = continent_for(item.longitude, item.latitude)
                        if not item.continent or item.continent.casefold() != continent.casefold():
                            continue

                    key = (-item.detected_at.timestamp(), item.id, row_number, item)
                    if len(earliest) < page_size:
                        heapq.heappush(earliest, key)
                    elif key > earliest[0]:
                        heapq.heapreplace(earliest, key)

    page = [entry[3] for entry in earliest]
    page.sort(key=lambda item: (item.detected_at, item.id))
    page = page[offset : offset + limit]
    # Se calcula la geografía solo para los registros de la página cuando no
    # hubo filtro continental, evitando cargar Natural Earth por cada fila.
    if not continent:
        for item in page:
            item.continent = continent_for(item.longitude, item.latitude)
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
