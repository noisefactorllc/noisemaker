"""--seed 0 is a seed like any other: generate and apply repeat their output."""

import random

import numpy as np
from click.testing import CliRunner
from PIL import Image

from noisemaker.scripts.noisemaker import MAX_SEED_VALUE, main


def _invoke(args):
    result = CliRunner().invoke(main, args)
    assert result.exit_code == 0, result.output + repr(result.exception)


def test_generate_repeats_seed_zero(tmp_path):
    outputs = [tmp_path / f"{i}.png" for i in range(2)]
    for out in outputs:
        _invoke(["generate", "basic", "--seed", "0", "--width", "64", "--height", "64", "--filename", str(out)])

    assert outputs[0].read_bytes() == outputs[1].read_bytes()


def test_apply_repeats_seed_zero(tmp_path):
    source = tmp_path / "in.png"
    pixels = np.random.default_rng(1).integers(0, 256, size=(32, 32, 3), dtype=np.uint8)
    Image.fromarray(pixels, "RGB").save(source)

    outputs = [tmp_path / f"{i}.png" for i in range(2)]
    for out in outputs:
        _invoke(["apply", "posterize", str(source), "--seed", "0", "--no-resize", "--filename", str(out)])

    assert outputs[0].read_bytes() == outputs[1].read_bytes()


def test_an_absent_seed_is_random(tmp_path, monkeypatch):
    drawn = []
    real_randint = random.randint
    monkeypatch.setattr(random, "randint", lambda a, b: drawn.append((a, b)) or real_randint(a, b))

    _invoke(["generate", "basic", "--width", "16", "--height", "16", "--filename", str(tmp_path / "a.png")])
    _invoke(["generate", "basic", "--seed", "0", "--width", "16", "--height", "16", "--filename", str(tmp_path / "b.png")])

    # Only the run without --seed draws a seed.
    assert drawn.count((1, MAX_SEED_VALUE)) == 1
