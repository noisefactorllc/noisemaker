"""The CLI reports an unreadable input as one error line, not a traceback."""

from click.testing import CliRunner

from noisemaker.scripts.noisemaker import main


def _run(args):
    result = CliRunner().invoke(main, args)

    # An uncaught exception reaches CliRunner as result.exception; a usage
    # error ends in SystemExit with the message in the output.
    assert isinstance(result.exception, SystemExit), repr(result.exception)
    assert result.exit_code != 0
    assert "Traceback" not in result.output

    return result.output


def test_apply_names_a_missing_input_image(tmp_path):
    missing = str(tmp_path / "missing.png")
    output = _run(["apply", "bloom", missing, "--filename", str(tmp_path / "out.png")])

    # Click quotes the path, so a Windows path shows doubled backslashes.
    error = output.splitlines()[-1]
    assert error.startswith("Error: Invalid value for 'INPUT_FILENAME': File '")
    assert "missing.png" in error and error.endswith("' does not exist.")


def test_apply_names_an_input_that_is_not_an_image(tmp_path):
    notimg = tmp_path / "notimg.png"
    notimg.write_text("not an image")
    output = _run(["apply", "bloom", str(notimg), "--filename", str(tmp_path / "out.png")])

    assert f"Error: Invalid value for INPUT_FILENAME: {notimg} is not a .png or .jpg image" in output


def test_mashup_names_an_input_dir_with_no_image(tmp_path):
    empty = tmp_path / "empty"
    empty.mkdir()
    output = _run(["mashup", "--input-dir", str(empty), "--filename", str(tmp_path / "out.png")])

    assert f"Error: Invalid value for '--input-dir': {empty} holds no .png or .jpg image" in output


def test_generate_still_names_an_unknown_preset(tmp_path):
    result = CliRunner().invoke(main, ["generate", "nosuch", "--filename", str(tmp_path / "out.png")])

    assert result.exit_code == 2
    assert "Error: Invalid value: Unknown preset: nosuch" in result.output
