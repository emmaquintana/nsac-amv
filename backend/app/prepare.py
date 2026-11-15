"""Prepara descargas y todas las cachés antes de iniciar la interfaz web."""

import logging

from app.catalog import prepare_files
from app.downloads import ensure_downloads
from app.i18n import t
from app.firms import discover_files
from app.map_points import prepare_map_files
from app.time_series import prepare_summaries

logger = logging.getLogger("uvicorn.error.firms")


def prepare_data() -> None:
    """Espera la preparación completa; propaga errores para impedir el arranque."""
    stage = t("prepare.downloads")
    try:
        ensure_downloads()
        files = discover_files()
        total = len(files)
        for stage, prepare in (
            (t("prepare.catalog"), prepare_files),
            (t("prepare.map"), prepare_map_files),
            (t("prepare.daily"), prepare_summaries),
        ):
            logger.info(t("prepare.stage", stage=stage))

            def progress(index, dataset):
                logger.info(t("prepare.progress", stage=stage, index=index, total=total,
                              percent=round(100 * index / total),
                              file=f" · {dataset.path.name}" if index < total else ""))

            prepare(files, progress)
        logger.info(t("prepare.ready"))
    except Exception as error:
        raise RuntimeError(t("prepare.failed", stage=stage, error=error)) from error
    finally:
        logger.warning(t("prepare.end", warning=t("firms.warning")))


if __name__ == "__main__":
    from logging.config import dictConfig
    from uvicorn.config import LOGGING_CONFIG

    dictConfig(LOGGING_CONFIG)
    try:
        prepare_data()
    except Exception as error:
        logger.error(t("prepare.error", error=error))
        raise SystemExit(1) from error
