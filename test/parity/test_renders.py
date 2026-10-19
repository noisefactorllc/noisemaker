"""Render whole presets in Python and JavaScript and compare the pixels.

PY_JS_PARITY_SPEC.md section 6: the canonical presets render in both
languages at runtime, and the two tensors agree to within 1/255 per channel.
"""

import numpy as np
import pytest

from noisemaker import value
from noisemaker.presets import PRESETS, Preset

from .utils import js_render

CANONICAL_PRESETS = [
    "basic",
    "multires",
    "voronoi",
    "worms",
    "acid",
    "2d-chess",
    "fractal-smoke",
    "dla",
    "timeworms",
    "multires-low",
]

SEEDS = [1, 2]

WIDTH = 128
HEIGHT = 128

# The speed of the Python CLI (noisemaker generate --speed default). Both
# languages get it, as the CLI passes it to every render.
SPEED = 0.25

TOLERANCE = 1 / 255


@pytest.mark.parametrize("seed", SEEDS)
@pytest.mark.parametrize("name", CANONICAL_PRESETS)
def test_render(name, seed, tmp_path):
    # Seed in the order of the Python CLI: value.set_seed, PRESETS(), Preset(name).
    value.set_seed(seed)
    PRESETS()
    preset = Preset(name)
    py = np.asarray(
        preset.render(seed, shape=[HEIGHT, WIDTH, None], speed=SPEED, filename=str(tmp_path / "py.png")),
        dtype=np.float32,
    )

    js = js_render(name, seed, WIDTH, HEIGHT, SPEED)

    assert py.shape == js.shape, f"{name} seed={seed}: Python shape {py.shape}, JavaScript shape {js.shape}"

    error = np.abs(py - js)
    mean_error = float(np.mean(error))
    max_error = float(np.max(error))
    print(f"{name} seed={seed}: mean error {mean_error:.6g}, max error {max_error:.6g}")

    assert max_error <= TOLERANCE, (
        f"{name} seed={seed}: mean error {mean_error:.6g}, max error {max_error:.6g} "
        f"exceeds {TOLERANCE:.6g} in {int(np.count_nonzero(~(error <= TOLERANCE)))} of {error.size} values"
    )
