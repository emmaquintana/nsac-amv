"""Totales diarios completos, independientes de la paginación del planisferio."""

from collections import Counter
from datetime import date
from hashlib import sha256
import json
import logging
from pathlib import Path
from threading import Lock, Thread
from uuid import uuid4

import pandas as pd

from app.catalog import cache_path, catalog_status, connect, prepare_files
from app.firms import FirmsFile, discover_files
from app.geography import continents_for, geography_signature
from app.schemas import DailyCount, TimeSeriesSummary

SUMMARY_VERSION = 1
logger = logging.getLogger(__name__)
_build_lock = Lock()
_state_lock = Lock()
_worker: Thread | None = None
_signature: tuple[str, ...] = ()
_state: dict = {}


def summary_path(dataset: FirmsFile) -> Path:
    fingerprint = json.dumps([SUMMARY_VERSION, str(cache_path(dataset)), *geography_signature()])
    key = sha256(fingerprint.encode()).hexdigest()
    return cache_path(dataset).parent / "daily" / f"{key}.parquet"


def _build_summary(dataset: FirmsFile, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f"{target.stem}.{uuid4().hex}.tmp")
    totals = Counter()
    try:
        with connect() as connection:
            reader = connection.execute(
                "SELECT detected_at::DATE AS day, longitude, latitude FROM read_parquet(?)",
                [str(cache_path(dataset))],
            )
            while True:
                # Memoria acotada incluso para descargas con decenas de millones de filas.
                block = reader.fetch_df_chunk(32)
                if block.empty:
                    break
                block["continent"] = continents_for(block["longitude"].to_numpy(), block["latitude"].to_numpy())
                counts = block.groupby(["day", "continent"], dropna=False).size()
                for (day, continent), count in counts.items():
                    totals[(day.date(), None if pd.isna(continent) else continent)] += int(count)
            daily = pd.DataFrame([(day, continent, count) for (day, continent), count in totals.items()],
                                 columns=["day", "continent", "count"])
            connection.register("daily", daily)
            connection.sql("SELECT day::DATE AS day, continent::VARCHAR AS continent, count::BIGINT AS count FROM daily").write_parquet(
                str(temporary), compression="zstd")
        if summary_path(dataset) != target:
            raise ValueError(f"Los datos cambiaron durante el cálculo: {dataset.path.name}. Vuelve a intentar.")
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)


def prepare_summaries(files: list[FirmsFile], progress=None) -> list[Path]:
    prepare_files(files)
    with _build_lock:
        paths = []
        for index, dataset in enumerate(files):
            if progress:
                progress(index, dataset)
            target = summary_path(dataset)
            if not target.is_file():
                logger.info("Calculando totales diarios de %s", dataset.path.name)
                _build_summary(dataset, target)
            paths.append(target)
        if progress and files:
            progress(len(files), files[-1])
        return paths


def time_series_status() -> dict:
    """Prepara los agregados en segundo plano; nunca devuelve conteos incompletos."""
    global _worker, _signature, _state
    files = discover_files()
    catalog = catalog_status(files)
    if catalog["state"] != "ready":
        return {**catalog, "stage": "catalog"}
    paths = [summary_path(dataset) for dataset in files]
    signature = tuple(str(path) for path in paths)
    completed = sum(path.is_file() for path in paths)
    ready = {"state": "ready", "completed": completed, "total": len(files), "progress": 100,
             "current_file": None, "error": None, "stage": "summary"}
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
                prepare_summaries(files, progress)
                with _state_lock:
                    _state.update(ready)
            except Exception as error:
                logger.exception("No se pudieron calcular los totales diarios FIRMS")
                with _state_lock:
                    _state.update(state="error", error=str(error))

        _worker = Thread(target=work, name="firms-daily-summary", daemon=True)
        _worker.start()
        return dict(_state)


def get_time_series(*, start_date: date | None = None, end_date: date | None = None,
                    continents: list[str] | None = None) -> TimeSeriesSummary:
    paths = prepare_summaries(discover_files())
    conditions, parameters = [], [[str(path) for path in paths]]
    if start_date:
        conditions.append("day >= ?")
        parameters.append(start_date)
    if end_date:
        conditions.append("day <= ?")
        parameters.append(end_date)
    where = " WHERE " + " AND ".join(conditions) if conditions else ""
    with connect() as connection:
        rows = connection.execute(
            "SELECT day, continent, sum(count)::BIGINT FROM read_parquet(?)" + where
            + " GROUP BY day, continent ORDER BY day, continent", parameters).fetchall()
    selected = set(continents) if continents is not None else None
    daily = [DailyCount(day=day, continent=continent, count=count)
             for day, continent, count in rows
             if continent is not None and (selected is None or continent in selected)]
    available_days = sorted({day for day, _, _ in rows})
    return TimeSeriesSummary(
        counts=daily, total=sum(item.count for item in daily),
        unassigned=sum(count for _, continent, count in rows if continent is None),
        first_day=available_days[0] if available_days else None,
        last_day=available_days[-1] if available_days else None,
        observed_days=len(available_days),
        available_days=available_days,
    )


if __name__ == "__main__":
    prepare_summaries(discover_files(), lambda index, item: print(f"{index}: {item.path.name}", flush=True))
    print("Totales diarios FIRMS listos", flush=True)
