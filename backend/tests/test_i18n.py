"""System locale detection and translated output of real CLI entry points."""

from contextlib import redirect_stderr
from io import StringIO
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from app.i18n import ArgumentParser, system_language, t


class LanguageTests(unittest.TestCase):
    def test_system_locales_and_fallback(self):
        for locale_name, expected in (("es_AR", "es"), ("es-ES.UTF-8", "es"),
                                      ("en_GB", "en"), ("fr_FR", "en")):
            with self.subTest(locale=locale_name):
                self.assertEqual(system_language({}, locale_name), expected)
        with patch("app.i18n._system_locale", return_value="es_AR"):
            self.assertEqual(system_language({}), "es")

    def test_environment_precedence(self):
        for environment, expected in (
            ({"LANG": "es_AR.UTF-8"}, "es"),
            ({"LANGUAGE": "fr:es:en", "LANG": "en_US.UTF-8"}, "es"),
            ({"LC_MESSAGES": "en_GB", "LANG": "es_AR"}, "en"),
            ({"LC_ALL": "C", "LANG": "es_AR"}, "en"),
            ({"NSAC_LANGUAGE": "es", "LC_ALL": "en_US.UTF-8"}, "es"),
        ):
            with self.subTest(environment=environment):
                self.assertEqual(system_language(environment, "en_US"), expected)

    def test_argparse_help_and_native_errors_follow_language(self):
        for language, usage, options, invalid in (
            ("en", "usage: ", "options:", "invalid int value"),
            ("es", "uso: ", "opciones:", "valor entero inválido"),
        ):
            with self.subTest(language=language), patch.dict(os.environ, {"NSAC_LANGUAGE": language}):
                parser = ArgumentParser(prog="example")
                parser.add_argument("--lote", type=int)
                self.assertTrue(parser.format_help().startswith(usage))
                self.assertIn(options, parser.format_help())
                output = StringIO()
                with redirect_stderr(output), self.assertRaises(SystemExit) as error:
                    parser.parse_args(["--lote", "abc"])
                self.assertEqual(error.exception.code, 2)
                self.assertIn(invalid, output.getvalue())

    def test_prepare_failure_is_translated_in_a_separate_process(self):
        with TemporaryDirectory() as temporary:
            for language, error, missing in (
                ("en", "Servers will not start", "FIRMS data path does not exist"),
                ("es", "No se iniciarán los servidores", "No existe la ruta de datos FIRMS"),
            ):
                with self.subTest(language=language):
                    result = subprocess.run(
                        [sys.executable, "-m", "app.prepare"], capture_output=True,
                        text=True, encoding="utf-8", timeout=60,
                        env={**os.environ, "NSAC_LANGUAGE": language, "PYTHONIOENCODING": "utf-8",
                             "FIRMS_PATHS": str(Path(temporary) / "missing")},
                    )
                    self.assertEqual(result.returncode, 1, result.stderr)
                    self.assertIn(error, result.stderr)
                    self.assertIn(missing, result.stderr)
                    self.assertIn(t("firms.warning", language=language), result.stderr)


if __name__ == "__main__":
    unittest.main()
