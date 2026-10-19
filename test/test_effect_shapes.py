"""Effects return a tensor of the input shape."""

import pytest

from noisemaker import effects, generators, rng, value

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
