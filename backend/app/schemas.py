"""Esquema común para detecciones MODIS y VIIRS."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Observation(BaseModel):
    """Una detección con nombres y tipos independientes del CSV de origen."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(description="Identificador estable derivado del origen y la fila.")
    source: Literal["MODIS", "VIIRS"]
    satellite: str | None = None
    product: str | None = None
    version: str | None = None
    data_kind: Literal["archive", "nrt"] | None = None
    file_name: str | None = None
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    detected_at: datetime
    brightness: float | None = None
    confidence: str | int | None = None
    frp: float | None = Field(default=None, description="Potencia radiativa del fuego, MW.")
    daynight: Literal["D", "N"] | None = None
    continent: str | None = None


class DailyCount(BaseModel):
    day: date
    continent: str
    count: int = Field(ge=0)


class TimeSeriesSummary(BaseModel):
    counts: list[DailyCount]
    total: int
    unassigned: int
    first_day: date | None
    last_day: date | None
    observed_days: int
    available_days: list[date]


class MapPoint(BaseModel):
    latitude: float
    longitude: float
    count: int
    modis: int
    viirs: int
    first_detection: datetime
    last_detection: datetime
    max_frp: float | None


class MapObservations(BaseModel):
    points: list[MapPoint]
    total: int
