"""The CLI accepts each noisemaker command that the Colab notebook runs."""

import json
import shlex
from pathlib import Path

from noisemaker.scripts.noisemaker import main

ROOT = Path(__file__).resolve().parent.parent


def test_notebook_commands_parse(tmp_path, monkeypatch):
    notebook = json.loads((ROOT / "py_noisemaker.ipynb").read_text())
    lines = [line.strip() for cell in notebook["cells"] if cell["cell_type"] == "code" for line in cell["source"]]
    commands = [shlex.split(line[1:])[1:] for line in lines if line.startswith("!noisemaker ")]
    assert len(commands) == 2

    # The apply cell reads the image that the generate cell writes.
    monkeypatch.chdir(tmp_path)
    (tmp_path / "art.png").write_bytes(b"")

    for name, *rest in commands:
        assert name in main.commands, f"noisemaker has no {name} command"
        main.commands[name].make_context(name, rest)
