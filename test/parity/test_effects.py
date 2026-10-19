"""Pixel-to-pixel parity tests for image effects against the JavaScript
implementation.

Each test invokes the corresponding JavaScript effect in a subprocess and
compares the raw tensor output directly with the Python version. This ensures
we are always testing parity with the current JS code base without relying on
cached fixtures.
"""

import numpy as np
import pytest
from noisemaker import effects, generators, rng, value

from .seeds import PARITY_SEEDS
from .utils import js_effect


# Five randomly chosen 32-bit seeds shared across parity tests.
SEEDS = PARITY_SEEDS

EFFECTS = [
    ("adjust_hue", effects.adjust_hue),
    ("adjust_saturation", effects.adjust_saturation),
    ("adjust_brightness", effects.adjust_brightness),
    ("adjust_contrast", effects.adjust_contrast),
    ("posterize", effects.posterize),
    ("blur", effects.blur),
    ("bloom", effects.bloom),
    ("vignette", effects.vignette),
    ("vaseline", effects.vaseline),
    ("shadow", effects.shadow),
    ("outline", effects.outline),
    ("glowing_edges", effects.glowing_edges),
    ("derivative", effects.derivative),
    ("sobel", effects.sobel_operator),
    ("normalize", effects.normalize),
    ("ridge", effects.ridge),
    ("palette", effects.palette),
    ("color_map", effects.color_map),
    ("false_color", effects.false_color),
    ("warp", effects.warp),
    ("ripple", effects.ripple),
    ("sine", effects.sine),
    ("rotate", effects.rotate),
    ("wobble", effects.wobble),
    ("reverb", effects.reverb),
    ("tint", effects.tint),
    ("aberration", effects.aberration),
    ("scanline_error", effects.scanline_error),
    ("light_leak", effects.light_leak),
    ("crt", effects.crt),
    ("lens_warp", effects.lens_warp),
    ("lens_distortion", effects.lens_distortion),
    ("vhs", effects.vhs),
    ("grain", effects.grain),
    ("fxaa", value.fxaa),
    ("snow", effects.snow),
    ("smoothstep", value.smoothstep),
    ("reindex", effects.reindex),
    ("voronoi", value.voronoi),
    ("clouds", effects.clouds),
    ("conv_feedback", effects.conv_feedback),
    ("convolve", value.convolve),
    ("degauss", effects.degauss),
    ("density_map", effects.density_map),
    ("dla", effects.dla),
    ("erosion_worms", effects.erosion_worms),
    ("fibers", effects.fibers),
    ("frame", effects.frame),
    ("glyph_map", effects.glyph_map),
    ("grime", effects.grime),
    ("jpeg_decimate", effects.jpeg_decimate),
    ("kaleido", effects.kaleido),
    ("lowpoly", effects.lowpoly),
    ("nebula", effects.nebula),
    ("normal_map", effects.normal_map),
    ("on_screen_display", effects.on_screen_display),
    ("pixel_sort", effects.pixel_sort),
    ("refract", value.refract),
    ("scratches", effects.scratches),
    ("simple_frame", effects.simple_frame),
    ("sketch", effects.sketch),
    ("spatter", effects.spatter),
    ("spooky_ticker", effects.spooky_ticker),
    ("stray_hair", effects.stray_hair),
    ("texture", effects.texture),
    ("value_refract", effects.value_refract),
    ("vortex", effects.vortex),
    ("wormhole", effects.wormhole),
    ("worms", effects.worms),
]

# js/doc/PY_JS_PARITY_SPEC.md allows at most 1/255 per channel when
# floating-point differences appear. No tolerance may exceed it.
SPEC_BOUND = 1.0 / 255.0

# Keep tolerances as tight as observed parity gaps allow.
ATOL = {
    "default": 1e-4,
    "derivative": 5.5e-5,
    "glowing_edges": 1e-5,
    "outline": 2.5e-5,
    "sobel": 4e-5,
    "ripple": 4e-6,
}


@pytest.mark.parametrize("effect_name,fn", EFFECTS)
@pytest.mark.parametrize("seed", SEEDS)
def test_effect_parity(effect_name, fn, seed):
    rng.set_seed(seed)
    value.set_seed(seed)
    tensor = generators.basic(2, [128, 128, 3], hue_rotation=0)
    shape = [128, 128, 3]
    if effect_name == "color_map":
        clut = value.values(freq=[4, 4], shape=shape)
        tensor = fn(tensor, shape, clut=clut)
    else:
        tensor = fn(tensor, shape)
    assert tensor.shape == (128, 128, 3)
    js = js_effect(effect_name, seed)
    atol = ATOL.get(effect_name, ATOL["default"])
    assert atol <= SPEC_BOUND
    diff = np.abs(tensor.numpy().astype(np.float64) - js.astype(np.float64))
    report = f"{effect_name} seed={seed}: mean error {diff.mean():.3g}, max error {diff.max():.3g}, tolerance {atol:.3g}"
    print(report)
    assert np.allclose(tensor.numpy(), js, atol=atol), report


# With y_from_offset, value.refract takes the Y reference from the X reference
# offset by half the image, and also moves its sample coordinates by half the
# image. Compare both modes through the registered JavaScript effect.
@pytest.mark.parametrize("y_from_offset", [True, False])
@pytest.mark.parametrize("seed", SEEDS)
def test_refract_y_from_offset_parity(seed, y_from_offset):
    rng.set_seed(seed)
    value.set_seed(seed)
    shape = [128, 128, 3]
    tensor = generators.basic(2, shape, hue_rotation=0)
    tensor = value.refract(tensor, shape, y_from_offset=y_from_offset)
    assert tensor.shape == (128, 128, 3)
    js = js_effect("refract", seed, y_from_offset=y_from_offset)
    atol = ATOL["default"]
    assert atol <= SPEC_BOUND
    diff = np.abs(tensor.numpy().astype(np.float64) - js.astype(np.float64))
    report = f"refract y_from_offset={y_from_offset} seed={seed}: mean error {diff.mean():.3g}, max error {diff.max():.3g}, tolerance {atol:.3g}"
    print(report)
    assert np.allclose(tensor.numpy(), js, atol=atol), report
