from pathlib import Path

from noisemaker.dsl.tokenizer import tokenize
from noisemaker.dsl.parser import parse, PRESET_KEYS


def test_presets_dsl_parses():
    path = Path(__file__).resolve().parent.parent / "share" / "dsl" / "presets.dsl"
    text = path.read_text()
    ast = parse(tokenize(text), enforce_preset_keys=False)
    presets = ast["body"]["properties"]
    for prop in presets:
        value = prop["value"]
        assert value["type"] == "ObjectExpr"
        keys = {p["key"] for p in value["properties"]}
        assert keys.issubset(PRESET_KEYS)


def test_presets_dsl_leading_dot_numbers_are_fractions():
    path = Path(__file__).resolve().parent.parent / "share" / "dsl" / "presets.dsl"
    ast = parse(tokenize(path.read_text()), enforce_preset_keys=False)
    by_name = {p["key"]: p["value"] for p in ast["body"]["properties"]}
    for name, key, effect, arg, expected in [
        ("convolution-feedback", "post", "conv_feedback", "alpha", 0.5),
        ("corrupt", "post", "warp", "displacement", 0.025),
        ("degauss", "final", "degauss", "displacement", 0.06),
    ]:
        calls = next(p["value"]["elements"] for p in by_name[name]["properties"] if p["key"] == key)
        node = next(c for c in calls if c["callee"]["name"] == effect)["args"]["named"][arg]
        while node["type"] == "BinaryExpr":
            node = node["left"]
        assert node["value"] == expected, f"{name} {effect}({arg}:)"
