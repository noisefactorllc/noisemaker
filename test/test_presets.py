import pytest

from noisemaker import value
from noisemaker.composer import Preset
from noisemaker.presets import PRESETS


def test_presets():
    problems = []

    presets = PRESETS()

    for preset_name in presets:
        try:
            preset = Preset(preset_name, presets)
        except Exception as e:
            problems.append(f"{preset_name} has an error: {e}")

    if problems:
        raise Exception("Some presets have errors:\n    " + "\n    ".join(problems))


@pytest.mark.parametrize("preset_name", sorted(PRESETS().keys()))
def test_preset_renders(preset_name, tmp_path):
    # Seed in the order of the Python CLI: value.set_seed, PRESETS(), then the
    # noisemaker.presets.Preset factory, which calls PRESETS() again.
    value.set_seed(1)
    PRESETS()
    preset = Preset(preset_name, PRESETS())
    preset.render(1, shape=[128, 128, None], filename=str(tmp_path / "render.png"))
