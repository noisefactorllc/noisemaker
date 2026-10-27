"""magic-mashup renders input frames of any size at the output size.

``value.convolve`` and ``effects.blend_layers`` index into the output shape.
Frames smaller than the output used to stop the command with a GatherNd error.
"""

import os

import numpy as np
from click.testing import CliRunner
from PIL import Image

import noisemaker.util as util
from noisemaker.scripts.noisemaker import main


def _make_frame_dirs(root, sizes, count):
    """One input dir of ``count`` random PNG frames per entry in ``sizes``."""

    rng = np.random.default_rng(1)

    for d, size in enumerate(sizes):
        path = os.path.join(root, f"seq{d}")
        os.makedirs(path)

        for i in range(count):
            pixels = rng.integers(0, 256, size=(size, size, 3), dtype=np.uint8)
            Image.fromarray(pixels, "RGB").save(os.path.join(path, f"{i:04d}.png"))


def _run_magic_mashup(tmp_path, monkeypatch, sizes):
    input_dir = tmp_path / "frames"
    saved = tmp_path / "saved"
    input_dir.mkdir()
    saved.mkdir()

    _make_frame_dirs(str(input_dir), sizes, 2)

    # Record the encoder call instead of running ffmpeg.
    encoder_calls = []
    monkeypatch.setattr(util, "check_call", lambda command: encoder_calls.append(command))

    out = str(tmp_path / "out.mp4")

    result = CliRunner().invoke(
        main,
        ["magic-mashup", "--input-dir", str(input_dir), "--seed", "1", "--frame-count", "2", "--filename", out, "--save-frames", str(saved)],
    )

    assert result.exit_code == 0, result.output + repr(result.exception)

    frames = sorted(os.listdir(saved))
    assert frames == ["0000.png", "0001.png"]

    for name in frames:
        with Image.open(saved / name) as frame:
            assert frame.size == (512, 512)

    assert len(encoder_calls) == 1
    assert encoder_calls[0][encoder_calls[0].index("-s") + 1] == "512x512"
    assert encoder_calls[0][-1] == out


def test_frames_smaller_than_the_output(tmp_path, monkeypatch):
    _run_magic_mashup(tmp_path, monkeypatch, [128, 128, 128, 128])


def test_frames_smaller_and_larger_than_the_output(tmp_path, monkeypatch):
    # Four dirs give one control frame and three layers, so the layers always
    # mix both sizes.
    _run_magic_mashup(tmp_path, monkeypatch, [128, 128, 1024, 1024])
