"""Render shared presets with the Python reference at a small size."""

import pytest

from noisemaker import generators, value
from noisemaker.presets import Preset

# Presets that use procedural glyph masks
GLYPH_MASK_PRESETS = [
    "2001",
    "are-you-human",
    "conference",
    "deadbeef",
    "emo",
    "later",
    "lcd",
    "mcpaint",
    "numberwang",
    "procedural-mask",
    "rasteroids",
    "shape-party",
    "splork",
    "spooky-ticker",
    "tensor-tone",
    "trominos",
    "truchet-maze",
    "zeldo",
]


def render(name, size, seed, tmp_path):
    value.set_seed(seed)
    preset = Preset(name)
    filename = str(tmp_path / "out.png")

    if preset.is_generator():
        return preset.render(seed, shape=[size, size, None], filename=filename)

    tensor = generators.basic(2, [size, size, 3])
    return preset.render(seed, tensor=tensor, shape=[size, size, 3], filename=filename)


@pytest.mark.parametrize("name", GLYPH_MASK_PRESETS)
def test_glyph_mask_preset_renders(name, tmp_path):
    assert tuple(render(name, 128, 1, tmp_path).shape[:2]) == (128, 128)
