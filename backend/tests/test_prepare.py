"""La primera petición puede consultar datos sin iniciar tareas de preparación."""

from contextlib import ExitStack
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from api.api import app
from app.downloads import DATA_WARNING


class PreparationTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.data = self.root / "data"
        self.data.mkdir()
        header = "latitude,longitude,acq_date,acq_time,satellite,instrument,frp\n"
        (self.data / "MODIS.csv").write_text(
            header + "-20,-60,2025-11-16,0010,Terra,MODIS,10\n", encoding="utf-8")
        (self.data / "VIIRS.csv").write_text(
            header + "-20,-60,2025-11-16,0015,SNPP,VIIRS,20\n", encoding="utf-8")
        environment = patch.dict(os.environ, {
            "FIRMS_PATHS": str(self.data), "FIRMS_CACHE_DIR": str(self.root / "cache"),
            "PYTHONUTF8": "1",
        })
        environment.start()
        self.addCleanup(environment.stop)

    def assert_queries_ready(self, client):
        self.assertEqual(client.get("/api/v1/data/status").json()["state"], "ready")
        observations = client.get("/api/v1/observations")
        self.assertEqual(observations.status_code, 200)
        self.assertEqual(len(observations.json()), 2)
        points = client.get("/api/v1/map?west=-180&south=-90&east=180&north=90&zoom=2")
        self.assertEqual(points.status_code, 200)
        self.assertEqual(points.json()["total"], 2)
        daily = client.get("/api/v1/time-series")
        self.assertEqual(daily.status_code, 200)
        self.assertEqual(daily.json()["total"], 2)

    def test_cold_api_startup_prepares_all_queries_without_background_workers(self):
        with ExitStack() as stack:
            for module in ("catalog", "map_points", "time_series"):
                stack.enter_context(patch(f"app.{module}.Thread", side_effect=AssertionError("Preparación diferida")))
            with TestClient(app) as client:
                self.assert_queries_ready(client)

    def test_cli_prepares_persistent_caches_reused_by_api_in_another_process(self):
        result = subprocess.run([sys.executable, "-m", "app.prepare"],
                                capture_output=True, text=True, encoding="utf-8", timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr)
        for stage in ("Catálogo Parquet", "Índice del mapa", "Totales diarios"):
            self.assertIn(f"{stage}: 2/2 archivos (100%)", result.stderr)
        with ExitStack() as stack:
            for function in ("app.catalog._build", "app.map_points._build_map", "app.time_series._build_summary"):
                stack.enter_context(patch(function, side_effect=AssertionError("Caché no reutilizada")))
            with TestClient(app) as client:
                self.assert_queries_ready(client)

    def test_cache_failure_prevents_api_startup_and_reports_stage(self):
        with patch("app.prepare.prepare_map_files", side_effect=RuntimeError("Sin espacio")):
            with patch("app.prepare.prepare_summaries") as daily:
                with self.assertLogs("uvicorn.error.firms", level="WARNING") as logs:
                    with self.assertRaisesRegex(RuntimeError, "Índice del mapa: Sin espacio"):
                        with TestClient(app):
                            self.fail("La API no debe aceptar peticiones antes de preparar las cachés")
                daily.assert_not_called()
        self.assertIn(DATA_WARNING, logs.output[-1])

    def test_cli_returns_error_when_data_cannot_be_prepared(self):
        with patch.dict(os.environ, {"FIRMS_PATHS": str(self.root / "missing")}):
            result = subprocess.run([sys.executable, "-m", "app.prepare"],
                                    capture_output=True, text=True, encoding="utf-8", timeout=60)
        self.assertEqual(result.returncode, 1)
        self.assertIn("No se iniciarán los servidores", result.stderr)
        self.assertIn("No existe la ruta de datos FIRMS", result.stderr)


if __name__ == "__main__":
    unittest.main()
