"""Fonts come from one directory, and a missing font stops with one error that names it."""

import os
import re

import pytest
import tensorflow as tf
from click.testing import CliRunner

from noisemaker import util
from noisemaker.effects import glyph_map
from noisemaker.glyphs import load_fonts
from noisemaker.scripts import mood
from noisemaker.scripts.noisemaker import main


@pytest.fixture
def empty_noisemaker_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("NOISEMAKER_DIR", str(tmp_path))
    return tmp_path


def test_glyph_map_names_the_font_dir_when_it_has_no_font(empty_noisemaker_dir):
    shape = [16, 16, 3]

    with pytest.raises(ValueError, match=re.escape(f"glyph_map found no .ttf font in {empty_noisemaker_dir / 'fonts'}")):
        glyph_map(tf.ones(shape), shape)


def test_watermark_names_its_missing_font_before_rendering(empty_noisemaker_dir):
    out = empty_noisemaker_dir / "wm.mp4"
    result = CliRunner().invoke(
        main, ["animate", "basic", "--width", "32", "--height", "32", "--frame-count", "2", "--seed", "3", "--watermark", "hello", "--filename", str(out)]
    )

    assert result.exit_code == 2
    assert isinstance(result.exception, SystemExit)
    assert "Traceback" not in result.output
    font_dir = empty_noisemaker_dir / "fonts"
    assert f"Error: Invalid value for '--watermark': the font {util.WATERMARK_FONT}.ttf is not in {font_dir}" in result.output
    assert not out.exists()


def test_mood_names_its_missing_font(empty_noisemaker_dir):
    result = CliRunner().invoke(mood.main, ["--filename", str(empty_noisemaker_dir / "in.png"), "--text", "hello", "--font", "NoSuchFont"])

    assert result.exit_code == 1
    assert result.output == f"Error: the font NoSuchFont.ttf is not in {empty_noisemaker_dir / 'fonts'}\n"


def test_mood_and_glyphs_read_the_same_font_dir(empty_noisemaker_dir):
    fonts = empty_noisemaker_dir / "fonts"
    fonts.mkdir()
    (fonts / "Some-Font.ttf").write_bytes(b"")

    assert load_fonts() == [str(fonts / "Some-Font.ttf")]
    assert mood.font_path("Some-Font") == os.path.join(str(fonts), "Some-Font.ttf")
