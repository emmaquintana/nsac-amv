"""System-language messages shared by the Python and Node command-line tools."""

import argparse
import json
import locale
import os
from pathlib import Path
import re
import sys

_MESSAGES = {
    language: json.loads((Path(__file__).parent / "locales" / f"{language}.json").read_text(encoding="utf-8"))
    for language in ("en", "es")
}


def _system_locale() -> str:
    if os.name == "nt":
        import ctypes
        return locale.windows_locale.get(ctypes.windll.kernel32.GetUserDefaultUILanguage(), "en")
    try:
        return locale.getlocale()[0] or "en"
    except (ValueError, TypeError):
        return "en"


def system_language(environ=None, system_locale=None) -> str:
    environment = os.environ if environ is None else environ
    configured = next((environment.get(key) for key in
                       ("NSAC_LANGUAGE", "LC_ALL", "LC_MESSAGES", "LANGUAGE", "LANG")
                       if environment.get(key)), None)
    candidates = configured.split(":") if configured else [system_locale or _system_locale()]
    for candidate in candidates:
        language = re.split(r"[-_.@]", candidate.lower())[0]
        if language in _MESSAGES:
            return language
    return "en"


def t(key: str, *, language=None, **values) -> str:
    return _MESSAGES[language or system_language()][key].format(**values)


def format_count(value) -> str:
    text = f"{value:,}"
    return text.replace(",", ".") if system_language() == "es" else text


class _HelpFormatter(argparse.HelpFormatter):
    def add_usage(self, usage, actions, groups, prefix=None):
        super().add_usage(usage, actions, groups, prefix or t("cli.usage"))


class ArgumentParser(argparse.ArgumentParser):
    """Translate help and validation output without modifying argparse globals."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs, add_help=False, formatter_class=_HelpFormatter)
        self._positionals.title = t("cli.positionals")
        self._optionals.title = t("cli.options")
        self.add_argument("-h", "--help", action="help", help=t("cli.help"))

    def error(self, message):
        if system_language() == "es":
            # These are argparse's built-in errors for the supported CLI types.
            replacements = (
                (r"^argument (.+?): (.+)$", r"argumento \1: \2"),
                (r"invalid int value: (.+)", r"valor entero inválido: \1"),
                (r"invalid float value: (.+)", r"valor decimal inválido: \1"),
                (r"expected one argument", "se esperaba un argumento"),
                (r"expected at least one argument", "se esperaba al menos un argumento"),
                (r"^unrecognized arguments: (.+)", r"argumentos no reconocidos: \1"),
                (r"^the following arguments are required: (.+)", r"se requieren los siguientes argumentos: \1"),
                (r"ignored explicit argument (.+)", r"argumento explícito no permitido: \1"),
                (r"^ambiguous option: (.+) could match (.+)", r"opción ambigua: \1 puede coincidir con \2"),
            )
            for pattern, replacement in replacements:
                message = re.sub(pattern, replacement, message)
        self.print_usage(sys.stderr)
        self.exit(2, t("cli.error", program=self.prog, message=message) + "\n")
