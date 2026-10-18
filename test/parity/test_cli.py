"""Cross-language parity test for the generate command.

``noisemaker generate`` and ``noisemaker-js generate`` must render the same
image for one preset and seed, within 1/255 per channel.
"""

import subprocess
from pathlib import Path

import numpy as np
import pytest
from click.testing import CliRunner
from PIL import Image

from noisemaker.scripts.noisemaker import main

JS_CLI = Path(__file__).resolve().parents[2] / "js" / "bin" / "noisemaker-js"


def _rgb(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.int16)


@pytest.mark.parametrize("seed", [1, 2])
def test_generate_matches_python_cli(tmp_path, seed):
    args = ["generate", "basic", "--seed", str(seed), "--width", "32", "--height", "32"]
    py_path = tmp_path / "python.png"
    js_path = tmp_path / "javascript.png"

    result = CliRunner().invoke(main, [*args, "--filename", str(py_path)])
    assert result.exit_code == 0, result.output

    subprocess.run(["node", str(JS_CLI), *args, "--filename", str(js_path)], check=True, capture_output=True, text=True)

    py = _rgb(py_path)
    js = _rgb(js_path)
    assert py.shape == js.shape
    assert np.abs(py - js).max() <= 1
