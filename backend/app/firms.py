"""Descubrimiento común de descargas CSV NASA FIRMS (NRT y archivo)."""

import csv
from dataclasses import dataclass
from hashlib import sha256
import logging
import os
from pathlib import Path
import re
from typing import Iterable, Literal

DATA_DIR = Path(__file__).resolve().parent / "data"
logger = logging.getLogger(__name__)
Source = Literal["MODIS", "VIIRS"]
PRODUCTS = {
    "M-C61": ("MODIS", None),
    "J1V-C2": ("VIIRS", "N20"),
    "J2V-C2": ("VIIRS", "N21"),
    "SV-C2": ("VIIRS", "SNPP"),
}


@dataclass(frozen=True)
class FirmsFile:
    path: Path
    source: Source
    satellite: str | None
    product: str | None
    data_kind: Literal["archive", "nrt"] | None

    @property
    def tag(self) -> str:
        # Los nombres pueden repetirse en distintas carpetas/descargas.
        digest = sha256(str(self.path.resolve()).encode()).hexdigest()[:16]
        return f"{self.path.stem}-{digest}"


def configured_inputs() -> tuple[Path, ...]:
    """FIRMS_PATHS usa el separador de rutas del SO; admite archivos o carpetas."""
    if paths := os.getenv("FIRMS_PATHS"):
        return tuple(Path(value).expanduser() for value in paths.split(os.pathsep) if value)
    legacy = [os.getenv(name) for name in ("MODIS_CSV", "VIIRS_J1_CSV", "VIIRS_J2_CSV", "VIIRS_SNPP_CSV")]
    return tuple(Path(value).expanduser() for value in legacy if value) or (
        Path(os.getenv("FIRMS_DATA_DIR", DATA_DIR)).expanduser(),
    )


def _describe(path: Path) -> FirmsFile | None:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        columns = {name.strip().lower() for name in (reader.fieldnames or [])}
        # Excluye resultados del análisis y otros CSV ajenos a FIRMS.
        if columns & {"id_observacion", "id_modis", "id_viirs"}:
            return None
        if not {"latitude", "longitude", "acq_date", "acq_time"} <= columns:
            return None
        row = {key.strip().lower(): (value or "").strip().upper()
               for key, value in (next(reader, {}) or {}).items() if key}
    name = str(path).upper()
    product = next((code for code in PRODUCTS if re.search(rf"(?<![A-Z0-9]){code}(?![A-Z0-9])", name)), None)
    source, satellite = PRODUCTS[product] if product else (None, None)
    instrument = row.get("instrument", "")
    platform = row.get("satellite", "")
    if instrument == "MODIS" or platform in {"AQUA", "TERRA", "A", "T"}:
        source = "MODIS"
    elif instrument in {"VIIRS", "SNPP"} or platform in {"N20", "N21", "SNPP", "N", "NOAA-20", "NOAA-21", "S-NPP"}:
        source = "VIIRS"
    elif "MODIS" in path.name.upper():
        source = "MODIS"
    elif "VIIRS" in path.name.upper() or "bright_ti4" in columns:
        source = "VIIRS"
    if source is None:
        logger.warning("CSV FIRMS sin sensor MODIS/VIIRS reconocible: %s", path)
        return None
    kind = re.search(r"fire_(archive|nrt)_", path.name, re.IGNORECASE)
    return FirmsFile(path, source, satellite, product, kind.group(1).lower() if kind else None)


def discover_files(inputs: Iterable[Path] | None = None) -> list[FirmsFile]:
    """Busca recursivamente sin depender del ID de descarga ni del nombre del CSV."""
    paths: set[Path] = set()
    for entry in configured_inputs() if inputs is None else inputs:
        entry = Path(entry).expanduser().resolve()
        if not entry.exists():
            raise FileNotFoundError(f"No existe la ruta de datos FIRMS: {entry}")
        candidates = entry.rglob("*") if entry.is_dir() else (entry,)
        paths.update(path.resolve() for path in candidates if path.is_file() and path.suffix.lower() == ".csv")
    result = [item for path in sorted(paths) if (item := _describe(path)) is not None]
    if not result:
        raise ValueError("No se encontraron CSV FIRMS MODIS/VIIRS en las rutas indicadas")
    return result
