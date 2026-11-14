"""Esquema común para detecciones MODIS y VIIRS."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Observation(BaseModel):
    """Una detección con nombres y tipos independientes del CSV de origen."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(description="Identificador estable derivado del origen y la fila.")
    source: Literal["MODIS", "VIIRS"]
    satellite: str | None = None
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    detected_at: datetime
    brightness: float | None = None
    confidence: str | int | None = None
    frp: float | None = Field(default=None, description="Potencia radiativa del fuego, MW.")
    daynight: Literal["D", "N"] | None = None
    continent: str | None = None
