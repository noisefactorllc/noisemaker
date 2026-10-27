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

# Presets whose settings carry a speed other than 1. Python's Preset.render()
# does not read that setting: without a speed argument, it renders at 1.0.
# These presets render without a speed in both languages. Presets whose
# Python render calls tf.image.random_hue with a seed are not in the list:
# in one process, a repeated seed gives a different hue, so their Python
# pixels depend on the test order.
SPEED_SETTING_PRESETS = [
    "blotto",
    "broken",
    "celebrate",
    "crime-scene",
    "dexter",
    "different",
    "eat-static",
    "fargate",
    "fractal-forms",
    "fractal-seed",
    "fractal-smoke",
    "glacial",
    "globules",
    "molten-glass",
    "noise-blaster",
    "octave-warp-post",
    "oldschool",
    "pink-diamond",
    "puzzler",
    "serene",
    "teh-matrex-haz-u",
    "time-doughnuts",
    "turbulence",
]

SEEDS = [1, 2]

WIDTH = 128
HEIGHT = 128

# The speed of the Python CLI (noisemaker generate --speed default). Both
# languages get it, as the CLI passes it to every render.
SPEED = 0.25

TOLERANCE = 1 / 255


def _new_preset(name, seed):
    # Seed in the order of the Python CLI: value.set_seed, PRESETS(), Preset(name).
    value.set_seed(seed)
    PRESETS()
    return Preset(name)


def _assert_same_render(name, seed, py, js):
    assert py.shape == js.shape, f"{name} seed={seed}: Python shape {py.shape}, JavaScript shape {js.shape}"

    error = np.abs(py - js)
    mean_error = float(np.mean(error))
    max_error = float(np.max(error))
    print(f"{name} seed={seed}: mean error {mean_error:.6g}, max error {max_error:.6g}")

    assert max_error <= TOLERANCE, (
        f"{name} seed={seed}: mean error {mean_error:.6g}, max error {max_error:.6g} "
        f"exceeds {TOLERANCE:.6g} in {int(np.count_nonzero(~(error <= TOLERANCE)))} of {error.size} values"
    )


@pytest.mark.parametrize("seed", SEEDS)
@pytest.mark.parametrize("name", CANONICAL_PRESETS)
def test_render(name, seed, tmp_path):
    preset = _new_preset(name, seed)
    py = np.asarray(
        preset.render(seed, shape=[HEIGHT, WIDTH, None], speed=SPEED, filename=str(tmp_path / "py.png")),
        dtype=np.float32,
    )

    js = js_render(name, seed, WIDTH, HEIGHT, SPEED)

    _assert_same_render(name, seed, py, js)


@pytest.mark.parametrize("seed", SEEDS)
@pytest.mark.parametrize("name", SPEED_SETTING_PRESETS)
def test_render_without_speed(name, seed, tmp_path):
    preset = _new_preset(name, seed)
    assert preset.settings.get("speed", 1) != 1, f"{name} has no speed setting other than 1"

    py = np.asarray(
        preset.render(seed, shape=[HEIGHT, WIDTH, None], filename=str(tmp_path / "py.png")),
        dtype=np.float32,
    )

    js = js_render(name, seed, WIDTH, HEIGHT, None)

    _assert_same_render(name, seed, py, js)
