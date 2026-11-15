"""Instalación local de las cuatro descargas históricas de NASA FIRMS."""

import csv
from dataclasses import dataclass
import logging
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
from tempfile import TemporaryDirectory
from urllib.request import Request, urlopen
from zipfile import ZipFile

from app.firms import DATA_DIR, discover_files
from app.i18n import t

logger = logging.getLogger("uvicorn.error.firms")


@dataclass(frozen=True)
class Download:
    product: str
    request_id: str

    @property
    def directory(self) -> str:
        return f"DL_FIRE_{self.product}_{self.request_id}"

    @property
    def url(self) -> str:
        return f"https://firms.modaps.eosdis.nasa.gov/data/download/{self.directory}.zip"

    @property
    def csv_names(self) -> tuple[str, str]:
        # Estos cuatro pedidos contienen ambos archivos. FIRMS también admite
        # pedidos con un solo CSV; no son los paquetes configurados aquí.
        return tuple(f"fire_{kind}_{self.product}_{self.request_id}.csv" for kind in ("archive", "nrt"))


DOWNLOADS = (
    Download("M-C61", "848778"),
    Download("J2V-C2", "848780"),
    Download("SV-C2", "848781"),
    Download("J1V-C2", "848779"),
)


def _valid_csv(path: Path) -> bool:
    """Lee sólo el encabezado; los CSV vacíos con encabezado son válidos."""
    try:
        with path.open(encoding="utf-8-sig", newline="") as stream:
            # Un puntero Git LFS no tiene estas columnas y debe reemplazarse.
            columns = {value.strip().lower() for value in next(csv.reader(stream), [])}
        return {"latitude", "longitude", "acq_date", "acq_time"} <= columns
    except (OSError, UnicodeError, csv.Error):
        return False


def _complete(directory: Path, download: Download) -> bool:
    return (directory.joinpath("Readme.txt").is_file()
            and directory.joinpath("Readme.txt").stat().st_size > 0
            and all(_valid_csv(directory / name) for name in download.csv_names))


def _download(url: str, target: Path) -> None:
    request = Request(url, headers={"User-Agent": "NSAC-AMV/0.1"})
    with urlopen(request, timeout=60) as response, target.open("wb") as output:
        size = 0
        next_report = 64 * 1024 * 1024
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
            size += len(chunk)
            if size >= next_report:
                logger.info(t("download.progress", size=f"{size / 1024**2:.0f}", url=url))
                next_report = size + 64 * 1024 * 1024
        expected = response.headers.get("Content-Length")
        if expected is not None and size != int(expected):
            raise ValueError(t("download.incomplete", size=size, expected=expected))


def _unpack(archive: Path, destination: Path, download: Download) -> None:
    """Extrae sólo los archivos esperados, sin aceptar rutas ni enlaces externos."""
    expected = {*download.csv_names, "Readme.txt"}
    found: set[str] = set()
    with ZipFile(archive) as bundle:
        for member in bundle.infolist():
            path = PurePosixPath(member.filename.replace("\\", "/"))
            if (path.is_absolute() or ".." in path.parts or ":" in member.filename
                    or stat.S_ISLNK(member.external_attr >> 16)):
                raise ValueError(t("download.unsafe", path=member.filename))
            if member.is_dir():
                continue
            # FIRMS entrega los archivos sueltos o dentro de DL_FIRE_.../.
            if path.name not in expected:
                continue
            if len(path.parts) > 1 and path.parts[:-1] != (download.directory,):
                raise ValueError(t("download.structure", path=member.filename))
            if path.name in found:
                raise ValueError(t("download.duplicate", path=path.name))
            with bundle.open(member) as source, (destination / path.name).open("wb") as target:
                shutil.copyfileobj(source, target, length=1024 * 1024)
            found.add(path.name)
    if found != expected or not _complete(destination, download):
        raise ValueError(t("download.invalid"))


def ensure_downloads() -> None:
    """Reutiliza datos locales completos; descarga y valida los pedidos faltantes."""
    logger.warning(t("download.start", warning=t("firms.warning")))
    try:
        # Las entradas explícitas conservan la selección de datos del usuario.
        if any(os.getenv(name) for name in (
            "FIRMS_PATHS", "MODIS_CSV", "VIIRS_J1_CSV", "VIIRS_J2_CSV", "VIIRS_SNPP_CSV",
        )):
            discover_files()
            logger.info(t("download.configured"))
            return

        root = Path(os.getenv("FIRMS_DATA_DIR", DATA_DIR)).expanduser()
        root.mkdir(parents=True, exist_ok=True)
        for download in DOWNLOADS:
            directory = root / download.directory
            if _complete(directory, download):
                logger.info(t("download.local", path=directory))
                continue
            logger.info(t("download.fetching", url=download.url))
            try:
                # El staging vive fuera de data/ para que el descubrimiento de
                # CSV nunca incorpore una extracción parcial.
                with TemporaryDirectory(prefix=".firms-", dir=root.parent) as temporary:
                    staging = Path(temporary)
                    archive = staging / "download.zip"
                    _download(download.url, archive)
                    _unpack(archive, staging, download)
                    directory.mkdir(parents=True, exist_ok=True)
                    # Publicar sólo después de validar el paquete completo y
                    # verificar sus CRC al leer el ZIP. Cada reemplazo es atómico.
                    for name in (*download.csv_names, "Readme.txt"):
                        os.replace(staging / name, directory / name)
                logger.info(t("download.installed", path=directory))
            except Exception as error:
                raise RuntimeError(t("download.failed", directory=download.directory,
                                     url=download.url, error=error)) from error
        logger.info(t("download.ready"))
    finally:
        logger.warning(t("download.end", warning=t("firms.warning")))


if __name__ == "__main__":
    from logging.config import dictConfig
    from uvicorn.config import LOGGING_CONFIG

    dictConfig(LOGGING_CONFIG)
    try:
        ensure_downloads()
    except Exception as error:
        logger.error(t("download.error", error=error))
        raise SystemExit(1) from error
