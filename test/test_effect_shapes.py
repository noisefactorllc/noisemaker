"""Effects return a tensor of the input shape."""

import pytest

from noisemaker import effects, generators, rng, value
from noisemaker.constants import ColorSpace, ValueMask

SEEDS = [3626764237, 1654615998, 3255389356, 3823568514, 1806341205]


def apply(effect, size, seed):
    rng.set_seed(seed)
    value.set_seed(seed)
    shape = [size, size, 3]
    return effect(generators.basic(2, shape), shape)


@pytest.mark.parametrize("seed", SEEDS)
@pytest.mark.parametrize("size", [128, 1024])
@pytest.mark.parametrize("effect", [effects.on_screen_display, effects.spooky_ticker])
def test_glyph_effect_returns_input_shape(effect, size, seed):
    assert tuple(apply(effect, size, seed).shape) == (size, size, 3)


@pytest.mark.parametrize("size", [64, 99, 100, 128])
def test_scanline_error_returns_input_shape(size):
    assert tuple(apply(effects.scanline_error, size, SEEDS[0]).shape) == (size, size, 3)


@pytest.mark.parametrize("size", [64, 128])
def test_glyph_map_zoomed_past_one_glyph_returns_input_shape(size):
    # At zoom 32 the zoomed image is narrower than one glyph.
    rng.set_seed(SEEDS[0])
    value.set_seed(SEEDS[0])
    shape = [size, size, 3]
    out = effects.glyph_map(generators.basic(2, shape), shape, mask=ValueMask.invaders_square, zoom=32)

    assert tuple(out.shape) == (size, size, 3)


def test_shadow_returns_rgba_shape():
    rng.set_seed(SEEDS[0])
    value.set_seed(SEEDS[0])
    shape = [128, 128, 4]
    tensor = generators.basic(2, shape, color_space=ColorSpace.rgb)

    assert tuple(effects.shadow(tensor, shape).shape) == (128, 128, 4)
