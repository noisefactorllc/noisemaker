import pytest

from noisemaker import rng
from noisemaker.composer import Preset
from noisemaker.presets import PRESETS

from .utils import js_preset_settings

PRESET_NAMES = sorted(PRESETS().keys())

# Presets whose layer lists call the RNG (random_member, random_int). Their
# layers and every later setting depend on the seed, so they get more seeds.
RANDOM_LAYER_PRESETS = ["density-wave", "paintball-party"]


def _assert_settings_match(name, seed):
    rng.set_seed(seed)
    preset = Preset(name, PRESETS())
    py_settings = {k: getattr(v, 'value', v) for k, v in preset.settings.items()}
    js_settings = js_preset_settings(name, seed)
    assert py_settings == js_settings

    rng.set_seed(seed)
    dsl_preset = Preset(name, PRESETS())
    dsl_settings = {k: getattr(v, 'value', v) for k, v in dsl_preset.settings.items()}
    assert dsl_settings == py_settings


@pytest.mark.parametrize("name", PRESET_NAMES)
def test_preset_settings(name):
    _assert_settings_match(name, 1)


@pytest.mark.parametrize("seed", [2, 3])
@pytest.mark.parametrize("name", RANDOM_LAYER_PRESETS)
def test_random_layer_preset_settings(name, seed):
    _assert_settings_match(name, seed)
