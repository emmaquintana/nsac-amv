"""Prepara descargas y todas las cachés antes de iniciar la interfaz web."""

import logging

from app.catalog import prepare_files
from app.downloads import DATA_WARNING, ensure_downloads
from app.firms import discover_files
from app.map_points import prepare_map_files
from app.time_series import prepare_summaries

logger = logging.getLogger("uvicorn.error.firms")


def prepare_data() -> None:
    """Espera la preparación completa; propaga errores para impedir el arranque."""
    stage = "descargas FIRMS"
    try:
        ensure_downloads()
        files = discover_files()
        total = len(files)
        for stage, prepare in (
            ("Catálogo Parquet", prepare_files),
            ("Índice del mapa", prepare_map_files),
            ("Totales diarios", prepare_summaries),
        ):
            logger.info("Comprobando y preparando %s", stage)

            def progress(index, dataset):
                logger.info("%s: %d/%d archivos (%d%%)%s", stage, index, total,
                            round(100 * index / total),
                            f" · {dataset.path.name}" if index < total else "")

            prepare(files, progress)
        logger.info("Datos, catálogo, mapa y totales diarios listos. Se puede iniciar el frontend.")
    except Exception as error:
        raise RuntimeError(f"Falló la preparación de {stage}: {error}") from error
    finally:
        logger.warning("Fin de preparación de datos y cachés. %s", DATA_WARNING)


if __name__ == "__main__":
    from logging.config import dictConfig
    from uvicorn.config import LOGGING_CONFIG

    dictConfig(LOGGING_CONFIG)
    try:
        prepare_data()
    except Exception as error:
        logger.error("No se iniciarán los servidores: %s", error)
        raise SystemExit(1) from error
