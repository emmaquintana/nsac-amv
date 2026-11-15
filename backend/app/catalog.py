"""Caché Parquet persistente: los CSV se preparan una sola vez por versión."""

import csv
from hashlib import sha256
import json
import logging
import os
from pathlib import Path
from threading import Lock, Thread
from typing import Callable
from uuid import uuid4

import duckdb

from app.firms import FirmsFile, discover_files
from app.i18n import t

CACHE_VERSION = 1
logger = logging.getLogger(__name__)
_build_lock = Lock()
_state_lock = Lock()
_worker: Thread | None = None
_signature: tuple[str, ...] = ()
_state: dict = {}


def cache_path(dataset: FirmsFile) -> Path:
    stat = dataset.path.stat()
    fingerprint = json.dumps([CACHE_VERSION, str(dataset.path), stat.st_size, stat.st_mtime_ns,
                              dataset.source, dataset.product, dataset.data_kind])
    key = sha256(fingerprint.encode()).hexdigest()
    directory = Path(os.getenv("FIRMS_CACHE_DIR", Path(__file__).resolve().parents[1] / ".cache" / "firms"))
    return directory / f"{key}.parquet"


def connect() -> duckdb.DuckDBPyConnection:
    # Cada consulta tiene su conexión y un límite de memoria independiente.
    return duckdb.connect(config={"threads": 2, "memory_limit": "512MB"})


def _literal(value: str | None) -> str:
    return "NULL::VARCHAR" if value is None else "'" + value.replace("'", "''") + "'"


def _build(dataset: FirmsFile, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f"{target.stem}.{uuid4().hex}.tmp")
    with dataset.path.open(encoding="utf-8-sig", newline="") as stream:
        columns = next(csv.reader(stream))
    names = {column.strip().lower(): column for column in columns}

    def field(*aliases: str) -> str:
        expressions = []
        for alias in aliases:
            if alias in names:
                quoted = '"' + names[alias].replace('"', '""') + '"'
                expressions.append(f"NULLIF(trim({quoted}), '')")
        return "coalesce(" + ", ".join(expressions + ["NULL::VARCHAR"]) + ")"

    def number(*aliases: str) -> str:
        value = f"try_cast({field(*aliases)} AS DOUBLE)"
        return f"CASE WHEN isfinite({value}) THEN {value} END"

    date = field("acq_date")
    time = f"lpad(coalesce({field('acq_time')}, '0000'), 4, '0')"
    sql = f"""
        WITH numbered AS (SELECT row_number() OVER () + 1 AS csv_row, * FROM raw),
        normalized AS (
            SELECT {_literal(dataset.tag)} || '-' || csv_row::VARCHAR AS id,
                {_literal(dataset.source)} AS source,
                coalesce({field('satellite', 'platform', 'instrumento')}, {_literal(dataset.satellite)}) AS satellite,
                {_literal(dataset.product)} AS product, {field('version', 'collection')} AS version,
                {_literal(dataset.data_kind)} AS data_kind, {_literal(dataset.path.name)} AS file_name,
                {number('latitude', 'lat')} AS latitude, {number('longitude', 'lon', 'long')} AS longitude,
                try_strptime(substr({date}, 1, 10) || ' ' || {time}, '%Y-%m-%d %H%M') AS detected_at,
                {number('brightness', 'bright_ti4', 'bright_t5', 'bright_t31')} AS brightness,
                {field('confidence', 'conf')} AS confidence,
                {number('frp', 'fire_radiative_power')} AS frp,
                CASE WHEN upper({field('daynight', 'day_night')}) IN ('D', 'N')
                     THEN upper({field('daynight', 'day_night')}) END AS daynight
            FROM numbered
        )
        SELECT * FROM normalized WHERE latitude BETWEEN -90 AND 90
            AND longitude BETWEEN -180 AND 180 AND detected_at IS NOT NULL
    """
    try:
        with connect() as connection:
            # Un lector secuencial conserva la numeración de filas usada por el CLI.
            connection.read_csv(str(dataset.path), header=True, all_varchar=True,
                                parallel=False).create_view("raw")
            connection.sql(sql).write_parquet(str(temporary), compression="zstd")
        if cache_path(dataset) != target:
            raise ValueError(t("catalog.changed", file=dataset.path.name))
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)


def prepare_files(files: list[FirmsFile], progress: Callable[[int, FirmsFile], None] | None = None) -> list[Path]:
    """Construye cada entrada atómicamente y reutiliza las que no cambiaron."""
    paths = []
    with _build_lock:
        for index, dataset in enumerate(files):
            if progress:
                progress(index, dataset)
            target = cache_path(dataset)
            if not target.is_file():
                logger.info(t("catalog.preparing", file=dataset.path.name))
                _build(dataset, target)
            paths.append(target)
        if progress and files:
            progress(len(files), files[-1])
    return paths


def catalog_status(files: list[FirmsFile] | None = None) -> dict:
    """Inicia la preparación en segundo plano; nunca espera a convertir los CSV."""
    global _worker, _signature, _state
    if files is None:
        files = discover_files()
    paths = [cache_path(dataset) for dataset in files]
    signature = tuple(str(path) for path in paths)
    completed = sum(path.is_file() for path in paths)
    ready = {"state": "ready", "completed": completed, "total": len(files),
             "progress": 100, "current_file": None, "error": None}
    if completed == len(files):
        return ready
    with _state_lock:
        if _signature == signature and _state.get("state") == "error":
            return dict(_state)
        if _worker is not None and _worker.is_alive():
            return dict(_state)
        _signature = signature
        _state = {**ready, "state": "preparing", "completed": completed,
                  "progress": round(100 * completed / len(files)), "current_file": None}

        def progress(index: int, dataset: FirmsFile) -> None:
            with _state_lock:
                count = sum(path.is_file() for path in paths)
                _state.update(completed=count, progress=round(100 * count / len(files)),
                              current_file=dataset.path.name if index < len(files) else None)

        def work() -> None:
            try:
                prepare_files(files, progress)
                with _state_lock:
                    _state.update(ready)
            except Exception as error:
                logger.exception(t("catalog.failed"))
                with _state_lock:
                    _state.update(state="error", error=str(error))

        _worker = Thread(target=work, name="firms-cache", daemon=True)
        _worker.start()
        return dict(_state)


if __name__ == "__main__":
    files = discover_files()
    prepare_files(files, lambda index, item: print(f"{index}/{len(files)}: {item.path.name}", flush=True))
    print(t("catalog.ready"), flush=True)
