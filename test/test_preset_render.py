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
    "glyphic",
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

# Presets that use a mask shape as freq, voronoi regions, or shadow on 4 channels
SHAPE_PRESETS = [
    "big-data-startup",
    "remember-logo",
    "writhe",
]


# Presets with scanline-error in their layers
SCANLINE_ERROR_PRESETS = [
    "bit-by-bit",
    "crt",
    "cubert",
    "deadbeef",
    "death-star-plans",
    "eat-static",
    "fargate",
    "graph-paper",
    "hearts",
    "later",
    "procedural-mask",
    "rasteroids",
    "regional",
    "remember-logo",
    "scanline-error",
    "sideways",
    "teh-matrex-haz-u",
    "the-arecibo-response",
    "time-crystal",
    "time-doughnuts",
    "trench-run",
    "trominos",
    "truchet-maze",
    "vectoroids",
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


@pytest.mark.parametrize("name", SHAPE_PRESETS)
def test_shape_preset_renders(name, tmp_path):
    assert tuple(render(name, 128, 1, tmp_path).shape[:2]) == (128, 128)


@pytest.mark.parametrize("name", SCANLINE_ERROR_PRESETS)
def test_scanline_error_preset_renders_below_100_pixels(name, tmp_path):
    assert tuple(render(name, 96, 1, tmp_path).shape[:2]) == (96, 96)


def test_galalaga_renders(tmp_path):
    # glyph_map zooms past one glyph width at this size
    assert tuple(render("galalaga", 128, 1, tmp_path).shape[:2]) == (128, 128)
