"""Each console command that pyproject.toml declares starts, and the Docker
image copies exactly those commands."""

import importlib
import re
from pathlib import Path

from click.testing import CliRunner

ROOT = Path(__file__).resolve().parent.parent


def _declared_scripts():
    """The [project.scripts] table of pyproject.toml, as {command: "module:function"}."""

    text = (ROOT / "pyproject.toml").read_text()
    table = re.search(r"^\[project\.scripts\]\n(.*?)(?=^\[|\Z)", text, re.M | re.S).group(1)

    return dict(re.findall(r'^([\w-]+)\s*=\s*"([^"]+)"', table, re.M))


def test_each_declared_command_shows_its_help():
    scripts = _declared_scripts()
    assert "noisemaker" in scripts

    for command, target in scripts.items():
        module_name, function_name = target.split(":")
        entry = getattr(importlib.import_module(module_name), function_name)
        result = CliRunner().invoke(entry, ["--help"])

        assert result.exit_code == 0, f"{command} --help: {result.output}{result.exception!r}"


def test_docker_image_copies_the_declared_commands():
    dockerfile = (ROOT / "Dockerfile").read_text()
    copied = re.findall(r"^COPY --from=builder /usr/local/bin/([\w-]+) /usr/local/bin/\1$", dockerfile, re.M)

    assert sorted(copied) == sorted(_declared_scripts())
