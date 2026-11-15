"""Controladores HTTP de la API."""

from contextlib import asynccontextmanager
from datetime import date
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse

from app.catalog import catalog_status
from app.downloads import DATA_WARNING, logger
from app.prepare import prepare_data
from app.schemas import MapObservations, Observation, TimeSeriesSummary
from app.map_points import get_map_observations, map_status
from app.services import get_continents, get_harmonized_pairs, get_observations
from app.time_series import get_time_series, time_series_status


@asynccontextmanager
async def lifespan(app: FastAPI):
    prepare_data()
    try:
        yield
    finally:
        logger.warning("Fin del servidor. %s", DATA_WARNING)


app = FastAPI(
    title="NSAC AMV API",
    description="API para consultar detecciones de incendios MODIS y VIIRS armonizadas.",
    version="0.1.0",
    lifespan=lifespan,
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
) -> list[Observation] | JSONResponse:
    """Valida filtros y delega la consulta al servicio de observaciones."""
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date debe ser anterior o igual a end_date")
    try:
        status = catalog_status()
        if status["state"] == "error":
            raise HTTPException(status_code=503, detail=status["error"])
        if status["state"] != "ready":
            return JSONResponse(status_code=202, content=status, headers={"Retry-After": "2"})
        return get_observations(
            start_date=start_date,
            end_date=end_date,
            continent=continent,
            source=source,
            limit=limit,
            offset=offset,
        )
    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/api/v1/data/status", tags=["observations"])
def data_status() -> dict:
    """Informa el avance de la preparación inicial sin bloquear la petición."""
    try:
        return catalog_status()
    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/api/v1/map", response_model=MapObservations, tags=["observations"])
def map_observations(
    west: float = Query(ge=-180, le=180),
    south: float = Query(ge=-90, le=90),
    east: float = Query(ge=-180, le=180),
    north: float = Query(ge=-90, le=90),
    zoom: int = Query(ge=0, le=19),
    start_date: date | None = None,
    end_date: date | None = None,
    continent: list[str] | None = Query(default=None),
) -> MapObservations | JSONResponse:
    """Agrupa todo el período en celdas que se subdividen al acercar el mapa."""
    if south > north:
        raise HTTPException(status_code=422, detail="south debe ser menor o igual a north")
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date debe ser anterior o igual a end_date")
    if continent and any(region not in get_continents() for region in continent):
        raise HTTPException(status_code=422, detail="Continente no reconocido")
    try:
        status = map_status()
        if status["state"] == "error":
            raise HTTPException(status_code=503, detail=status["error"])
        if status["state"] != "ready":
            return JSONResponse(status_code=202, content=status, headers={"Retry-After": "2"})
        return get_map_observations(west=west, south=south, east=east, north=north, zoom=zoom,
                                    start_date=start_date, end_date=end_date, continents=continent)
    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/api/v1/time-series", response_model=TimeSeriesSummary, tags=["observations"])
def time_series(
    start_date: date | None = Query(default=None, description="Fecha inicial inclusiva (UTC)."),
    end_date: date | None = Query(default=None, description="Fecha final inclusiva (UTC)."),
    continent: list[str] | None = Query(default=None, description="Continentes en español; repetir para seleccionar varios."),
) -> TimeSeriesSummary | JSONResponse:
    """Cuenta todo el período por día y región; no aplica paginación ni muestreo."""
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date debe ser anterior o igual a end_date")
    if continent and any(region not in get_continents() for region in continent):
        raise HTTPException(status_code=422, detail="Continente no reconocido")
    try:
        status = time_series_status()
        if status["state"] == "error":
            raise HTTPException(status_code=503, detail=status["error"])
        if status["state"] != "ready":
            return JSONResponse(status_code=202, content=status, headers={"Retry-After": "2"})
        return get_time_series(start_date=start_date, end_date=end_date, continents=continent)
    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


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
