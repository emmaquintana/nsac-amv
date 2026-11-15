"""Detalle espacial progresivo sobre todos los registros del área visible."""

from datetime import date, timezone
from hashlib import sha256
import json
import logging
from math import asinh, pi, radians, tan
from pathlib import Path
from threading import Lock, Thread
from tempfile import TemporaryDirectory
from uuid import uuid4

import numpy as np

from app.catalog import cache_path, catalog_status, connect, prepare_files
from app.firms import FirmsFile, discover_files
from app.geography import continents_for, geography_signature
from app.schemas import MapObservations, MapPoint

logger = logging.getLogger(__name__)
_build_lock = Lock()
_state_lock = Lock()
_worker: Thread | None = None
_signature: tuple[str, ...] = ()
_state: dict = {}


def map_path(dataset: FirmsFile) -> Path:
    fingerprint = json.dumps([1, str(cache_path(dataset)), *geography_signature()])
    return cache_path(dataset).parent / "map" / f"{sha256(fingerprint.encode()).hexdigest()}.parquet"


def _build_map(dataset: FirmsFile, target: Path) -> None:
    """Clasifica una sola vez, por bloques, sin mantener el archivo en memoria."""
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f"{target.stem}.{uuid4().hex}.tmp")
    try:
        with TemporaryDirectory(dir=target.parent) as chunks_dir, connect() as reader, connect() as writer:
            reader.execute("SELECT latitude, longitude, detected_at, source, frp FROM read_parquet(?)",
                           [str(cache_path(dataset))])
            chunks = []
            while True:
                block = reader.fetch_df_chunk(32)
                if block.empty:
                    break
                block["continent"] = continents_for(block.longitude.to_numpy(), block.latitude.to_numpy())
                block["x"] = (block.longitude + 180) / 360
                latitudes = np.radians(np.clip(block.latitude.to_numpy(), -85.05112878, 85.05112878))
                block["y"] = (1 - np.arcsinh(np.tan(latitudes)) / pi) / 2
                writer.register("block", block)
                chunk = str(Path(chunks_dir) / f"{len(chunks)}.parquet")
                writer.sql("SELECT * FROM block").write_parquet(chunk, compression="zstd")
                chunks.append(chunk)
                writer.unregister("block")
            if chunks:
                writer.read_parquet(chunks).order("x, y").write_parquet(str(temporary), compression="zstd")
            else:
                writer.sql("""SELECT NULL::DOUBLE AS latitude, NULL::DOUBLE AS longitude,
                    NULL::TIMESTAMP AS detected_at, NULL::VARCHAR AS source, NULL::DOUBLE AS frp,
                    NULL::VARCHAR AS continent, NULL::DOUBLE AS x, NULL::DOUBLE AS y WHERE false""").write_parquet(
                        str(temporary), compression="zstd")
        if map_path(dataset) != target:
            raise ValueError(f"Los datos cambiaron durante la preparación del mapa: {dataset.path.name}")
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)


def prepare_map_files(files: list[FirmsFile], progress=None) -> list[Path]:
    prepare_files(files)
    with _build_lock:
        paths = []
        for index, dataset in enumerate(files):
            if progress:
                progress(index, dataset)
            target = map_path(dataset)
            if not target.is_file():
                _build_map(dataset, target)
            paths.append(target)
        if progress and files:
            progress(len(files), files[-1])
        return paths


def map_status() -> dict:
    """Prepara el índice espacial en segundo plano y comunica su progreso."""
    global _worker, _signature, _state
    files = discover_files()
    catalog = catalog_status(files)
    if catalog["state"] != "ready":
        return {**catalog, "stage": "catalog"}
    paths = [map_path(dataset) for dataset in files]
    signature = tuple(str(path) for path in paths)
    completed = sum(path.is_file() for path in paths)
    ready = {"state": "ready", "completed": completed, "total": len(files), "progress": 100,
             "current_file": None, "error": None, "stage": "map"}
    if completed == len(files):
        return ready
    with _state_lock:
        if _signature == signature and _state.get("state") == "error":
            return dict(_state)
        if _worker is not None and _worker.is_alive():
            return dict(_state)
        _signature = signature
        _state = {**ready, "state": "preparing", "completed": completed,
                  "progress": round(100 * completed / len(files))}

        def progress(index: int, dataset: FirmsFile) -> None:
            with _state_lock:
                count = sum(path.is_file() for path in paths)
                _state.update(completed=count, progress=round(100 * count / len(files)),
                              current_file=dataset.path.name if index < len(files) else None)

        def work() -> None:
            try:
                prepare_map_files(files, progress)
                with _state_lock:
                    _state.update(ready)
            except Exception as error:
                logger.exception("No se pudo preparar el mapa FIRMS")
                with _state_lock:
                    _state.update(state="error", error=str(error))

        _worker = Thread(target=work, name="firms-map", daemon=True)
        _worker.start()
        return dict(_state)


def _mercator_y(latitude: float) -> float:
    return (1 - asinh(tan(radians(max(-85.05112878, min(85.05112878, latitude))))) / pi) / 2


def get_map_observations(*, west: float, south: float, east: float, north: float, zoom: int,
                         start_date: date | None = None, end_date: date | None = None,
                         continents: list[str] | None = None) -> MapObservations:
    paths = prepare_map_files(discover_files())
    # Celdas en Web Mercator: menos superposición al alejarse y más detalle al acercarse.
    # El límite por extensión protege también las consultas con zoom/extensión incoherentes.
    width = (east - west) % 360 if west > east else east - west
    pixel_size = 56 if zoom <= 3 else 36 if zoom <= 6 else 24 if zoom <= 10 else 12
    cell_size = max(pixel_size / (256 * 2 ** zoom), width / 360 / 80,
                    abs(_mercator_y(south) - _mercator_y(north)) / 80, 1e-12)
    conditions = ["latitude BETWEEN ? AND ?"]
    parameters: list = [[str(path) for path in paths], south, north]
    if west > east:  # Ventana que cruza el antimeridiano.
        conditions.append("(longitude >= ? OR longitude <= ?)")
    else:
        conditions.append("longitude BETWEEN ? AND ?")
    parameters.extend([west, east])
    if start_date:
        conditions.append("detected_at::DATE >= ?")
        parameters.append(start_date)
    if end_date:
        conditions.append("detected_at::DATE <= ?")
        parameters.append(end_date)
    if continents is not None:
        conditions.append("continent IN (SELECT unnest(?))")
        parameters.append(continents)
    query = """WITH visible AS (
        SELECT *, floor(x / ?) AS cell_x, floor(y / ?) AS cell_y
        FROM read_parquet(?) WHERE """ + " AND ".join(conditions) + """
        ) SELECT avg(latitude), avg(longitude), count(*),
        count(*) FILTER (WHERE source = 'MODIS'), count(*) FILTER (WHERE source = 'VIIRS'),
        min(detected_at), max(detected_at), max(frp)
        FROM visible GROUP BY cell_x, cell_y ORDER BY cell_x, cell_y"""
    with connect() as connection:
        rows = connection.execute(query, [cell_size, cell_size] + parameters).fetchall()
    points = [MapPoint(latitude=lat, longitude=lon, count=count, modis=modis, viirs=viirs,
                       first_detection=first.replace(tzinfo=timezone.utc),
                       last_detection=last.replace(tzinfo=timezone.utc), max_frp=frp)
              for lat, lon, count, modis, viirs, first, last, frp in rows]
    return MapObservations(points=points, total=sum(point.count for point in points))
