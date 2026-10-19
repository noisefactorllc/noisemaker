# Execution Graphs

This table gives the canonical effect order and RNG call counts for key presets rendered with seed 1 at 8x8 resolution. These values support Python/JS parity checks. See `js/doc/PY_JS_PARITY_SPEC.md` section 5 for details.

To regenerate these values, call `rng.set_seed(1)` and then `Preset(name, PRESETS()).render(1, shape=[8, 8, 3], debug=True)` in Python (`noisemaker.composer.Preset`). In JavaScript, call `setSeed(1)` and then `new Preset(name, PRESETS()).render(1, { width: 8, height: 8, collectDebug: true })`. Both return the same values.

| Preset  | Effect sequence      | RNG calls |
|---------|---------------------|-----------|
| basic   | *(none)*            | 1536      |
| worms   | worms -> fxaa       | 17186     |
| voronoi | voronoi             | 1874      |
