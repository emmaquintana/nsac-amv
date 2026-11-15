"""El arranque descarga sólo paquetes faltantes y nunca publica ZIP inválidos."""

from io import BytesIO
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from zipfile import ZipFile

from fastapi.testclient import TestClient

from app.downloads import DOWNLOADS, _download, ensure_downloads
from app.i18n import t

CSV = "latitude,longitude,acq_date,acq_time\n"


class DownloadTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "data"
        self.root.mkdir()
        environment = {key: value for key, value in os.environ.items() if key not in {
            "FIRMS_PATHS", "MODIS_CSV", "VIIRS_J1_CSV", "VIIRS_J2_CSV", "VIIRS_SNPP_CSV",
        }}
        environment["FIRMS_DATA_DIR"] = str(self.root)
        environment["NSAC_LANGUAGE"] = "es"
        self.env = patch.dict(os.environ, environment, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)

    def install(self, download):
        folder = self.root / download.directory
        folder.mkdir(exist_ok=True)
        for name in download.csv_names:
            (folder / name).write_text(CSV, encoding="utf-8-sig")
        (folder / "Readme.txt").write_text("NASA FIRMS")
        return folder

    def zip_download(self, url, target, *, nested=False, missing=False, unsafe=False):
        download = next(item for item in DOWNLOADS if item.url == url)
        prefix = f"{download.directory}/" if nested else ""
        with ZipFile(target, "w") as archive:
            for name in download.csv_names[:1] if missing else download.csv_names:
                archive.writestr(prefix + name, CSV)
            archive.writestr(prefix + "Readme.txt", "NASA FIRMS")
            if unsafe:
                archive.writestr("../outside.csv", CSV)

    def test_downloads_all_missing_packages_and_reuses_them_without_network(self):
        def response(request, timeout):
            self.assertEqual(timeout, 60)
            stream = BytesIO()
            self.zip_download(request.full_url, stream)
            stream.headers = {"Content-Length": str(stream.tell())}
            stream.seek(0)
            return stream

        with patch("app.downloads.urlopen", side_effect=response) as fetch:
            with self.assertLogs("uvicorn.error.firms", level="WARNING") as logs:
                ensure_downloads()
            self.assertEqual(fetch.call_count, 4)
        for download in DOWNLOADS:
            for name in download.csv_names:
                self.assertEqual((self.root / download.directory / name).read_text(encoding="utf-8-sig"), CSV)
        self.assertIn("Inicio de preparación", logs.output[0])
        self.assertIn("Fin de preparación", logs.output[-1])
        for message in logs.output:
            for value in ("2026-11-14", "45 días", "2026-12-29", "2025-11-16", "demasiadas solicitudes"):
                self.assertIn(value, message)
        with patch("app.downloads._download", side_effect=AssertionError("Sin red")):
            ensure_downloads()
        self.assertEqual(list(self.root.parent.glob(".firms-*")), [])

    def test_partial_package_and_lfs_pointers_are_replaced(self):
        for download in DOWNLOADS:
            self.install(download)
        first, second = DOWNLOADS[:2]
        (self.root / first.directory / first.csv_names[1]).unlink()
        (self.root / second.directory / second.csv_names[0]).write_text(
            "version https://git-lfs.github.com/spec/v1\noid sha256:123\nsize 123\n")
        with patch("app.downloads._download", side_effect=lambda url, target: self.zip_download(url, target, nested=True)) as fetch:
            ensure_downloads()
        self.assertEqual([call.args[0] for call in fetch.call_args_list], [first.url, second.url])

    def test_invalid_zip_missing_csv_and_path_traversal_are_not_installed(self):
        for case in ("html", "missing", "unsafe"):
            with self.subTest(case=case):
                def fetch(url, target):
                    if case == "html":
                        target.write_text("<html>Download expired</html>")
                    else:
                        self.zip_download(url, target, missing=case == "missing", unsafe=case == "unsafe")

                with patch("app.downloads._download", side_effect=fetch):
                    with self.assertLogs("uvicorn.error.firms", level="WARNING") as logs:
                        with self.assertRaisesRegex(RuntimeError, "No se iniciará el frontend"):
                            ensure_downloads()
                self.assertIn("Fin de preparación", logs.output[-1])
                self.assertFalse((self.root / DOWNLOADS[0].directory).exists())
                self.assertFalse((self.root.parent / "outside.csv").exists())
                self.assertEqual(list(self.root.parent.glob(".firms-*")), [])

    def test_http_expiration_preserves_local_data_and_reports_how_to_recover(self):
        download = DOWNLOADS[0]
        folder = self.install(download)
        missing = folder / download.csv_names[1]
        missing.unlink()
        original = folder / download.csv_names[0]
        with patch("app.downloads.urlopen", side_effect=HTTPError(download.url, 404, "Expired", {}, None)):
            with self.assertRaisesRegex(RuntimeError, "2026-12-29.*nuevo ZIP CSV"):
                ensure_downloads()
        self.assertEqual(original.read_text(encoding="utf-8-sig"), CSV)
        self.assertFalse(missing.exists())

    def test_rejects_csv_pointer_inside_zip_before_replacing_any_local_file(self):
        download = DOWNLOADS[0]
        folder = self.install(download)
        (folder / download.csv_names[1]).unlink()

        def fetch(url, target):
            self.zip_download(url, target)
            with ZipFile(target) as archive:
                members = {name: archive.read(name) for name in archive.namelist()}
            members[download.csv_names[1]] = b"version https://git-lfs.github.com/spec/v1\n"
            with ZipFile(target, "w") as archive:
                for name, contents in members.items():
                    archive.writestr(name, contents)

        before = (folder / download.csv_names[0]).read_bytes()
        with patch("app.downloads._download", side_effect=fetch):
            with self.assertRaises(RuntimeError):
                ensure_downloads()
        self.assertEqual((folder / download.csv_names[0]).read_bytes(), before)

    def test_truncated_http_body_is_rejected(self):
        response = BytesIO(b"partial")
        response.headers = {"Content-Length": "100"}
        with patch("app.downloads.urlopen", return_value=response):
            with self.assertRaisesRegex(ValueError, "Descarga incompleta"):
                _download(DOWNLOADS[0].url, self.root / "download.zip")

    def test_explicit_inputs_do_not_trigger_historical_downloads(self):
        folder = self.install(DOWNLOADS[0])
        with patch.dict(os.environ, {"FIRMS_PATHS": str(folder)}):
            with patch("app.downloads._download", side_effect=AssertionError("Sin red")):
                ensure_downloads()

    def test_fastapi_startup_waits_for_data_and_shutdown_repeats_warning(self):
        from api.api import app

        with patch("api.api.prepare_data") as prepare:
            with self.assertLogs("uvicorn.error.firms", level="WARNING") as logs:
                with TestClient(app) as client:
                    prepare.assert_called_once_with()
                    self.assertEqual(client.get("/api/v1/health").json(), {"status": "ok"})
            self.assertIn(t("firms.warning"), logs.output[-1])
        with patch("api.api.prepare_data", side_effect=RuntimeError("Descarga fallida")):
            with self.assertRaisesRegex(RuntimeError, "Descarga fallida"):
                with TestClient(app):
                    self.fail("El servidor no debe aceptar peticiones")


if __name__ == "__main__":
    unittest.main()
