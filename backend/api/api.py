"""Controladores HTTP de la API."""

from datetime import date
from typing import Literal

from fastapi import FastAPI, HTTPException, Query

from app.schemas import Observation
from app.services import get_continents, get_harmonized_pairs, get_observations

app = FastAPI(
    title="NSAC AMV API",
    description="API para consultar detecciones de incendios MODIS y VIIRS armonizadas.",
    version="0.1.0",
)


@app.get("/api/v1/health", tags=["health"])
def health() -> dict[str, str]:
    """Indica que el proceso de la API está disponible."""
    return {"status": "ok"}


@app.get("/api/v1/observations", response_model=list[Observation], tags=["observations"])
def observations(
    start_date: date | None = Query(default=None, description="Fecha inicial inclusiva (UTC)."),
    end_date: date | None = Query(default=None, description="Fecha final inclusiva (UTC)."),
    continent: str | None = Query(default=None, description="Continente en español."),
    source: Literal["MODIS", "VIIRS"] | None = Query(default=None),
    limit: int = Query(default=1000, ge=1, le=5000),
    offset: int = Query(default=0, ge=0, le=1_000_000),
) -> list[Observation]:
    """Valida filtros y delega la consulta al servicio de observaciones."""
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date debe ser anterior o igual a end_date")
    return get_observations(
        start_date=start_date,
        end_date=end_date,
        continent=continent,
        source=source,
        limit=limit,
        offset=offset,
    )


@app.get("/api/v1/harmonization/pairs", tags=["harmonization"])
def harmonized_pairs(
    limit: int = Query(default=1000, ge=1, le=5000),
    offset: int = Query(default=0, ge=0, le=1_000_000),
) -> list[dict[str, str]]:
    """Devuelve coincidencias calculadas por el script CLI, si ya existen."""
    return get_harmonized_pairs(limit=limit, offset=offset)


@app.get("/api/v1/continents", response_model=list[str], tags=["geography"])
def continents() -> list[str]:
    """Devuelve los continentes soportados por la clasificación geográfica."""
    return get_continents()
