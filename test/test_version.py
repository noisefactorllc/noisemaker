"""Every version string that version-bump writes agrees with pyproject.toml,
and noisemaker --version prints it."""

import json
import re
from pathlib import Path

from click.testing import CliRunner

import noisemaker
from noisemaker.scripts.noisemaker import main

ROOT = Path(__file__).resolve().parent.parent


def _pyproject_version():
    return re.search(r'(?m)^version = "([^"]+)"', (ROOT / "pyproject.toml").read_text()).group(1)


def test_cli_prints_the_package_version():
    result = CliRunner().invoke(main, ["--version"])

    assert result.exit_code == 0
    assert result.output == f"noisemaker, version {_pyproject_version()}\n"


def test_version_strings_agree():
    version = _pyproject_version()
    js_cli = (ROOT / "js" / "bin" / "noisemaker-js").read_text()

    assert noisemaker.__version__ == version
    assert re.search(r"(?m)^const VERSION = '([^']+)';", js_cli).group(1) == version
    assert json.loads((ROOT / "package.json").read_text())["version"] == version
