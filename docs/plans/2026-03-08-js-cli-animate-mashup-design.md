# JS CLI: animate + mashup commands

## Summary

Add three commands to `js/bin/noisemaker-js` that exist in the Python CLI but are missing from the JS port: `animate`, `mashup`, and `magic-mashup`.

All required effect functions (`blendLayers`, `toValueMap`, `bloom`, `shadow`, `convolve`, `basic`) already exist in the JS port. This is purely CLI wiring and ffmpeg integration.

## Commands

### `animate`

```
noisemaker-js animate [OPTIONS] PRESET_NAME
```

Options:
- `--width`, `--height` (default 512)
- `--frame-count` (default 50)
- `--filename` (default `animation.mp4`, supports `.gif`)
- `--seed`
- `--effect-preset` (optional effect applied per frame)
- `--save-frames` (directory to keep individual PNGs)
- `--with-supersample`, `--with-fxaa`
- `--target-duration` (seconds, enables motion-compensated interpolation)

Flow:
1. Loop `time` from 0 to 1 across `frame_count` frames
2. Render each frame via `Preset.render()` with `time = i / frame_count`
3. Optionally apply effect preset to each frame
4. Write PNGs to temp directory
5. Call ffmpeg to encode to MP4 or GIF
6. With `--target-duration`: add minterpolate filter chain

Speed normalization: `speed * (frame_count / 50.0)` to match Python behavior.

ffmpeg settings (matching Python):
- H.264, preset veryslow, CRF 15, bitrate 8000k, buffer 16000k, yuv420p
- GIF: palette-based encoding
- With target-duration: `setpts={factor}*PTS,minterpolate=mi_mode=mci:mc_mode=aobmc:vsbmc=1:fps=30`

### `mashup`

```
noisemaker-js mashup [OPTIONS] --input-dir DIR
```

Options:
- `--input-dir` (required)
- `--filename` (default `mashup.png`)
- `--seed`
- `--time` (default 0), `--speed` (default 0.25)
- `--control-filename` (optional, otherwise randomly picked)

Flow:
1. Collect PNG/JPG files from input directory
2. Randomly select 4-6 images as layers, one as control
3. Generate base noise via `basic()` with random freq/hue
4. Create grayscale control via `toValueMap`, smooth with `convolve`
5. Blend layers via `blendLayers(control, shape, feather, ...layers)`
6. Apply bloom + shadow
7. Write output

### `magic-mashup`

```
noisemaker-js magic-mashup [OPTIONS] --input-dir DIR
```

Options: Same as `animate` plus `--input-dir` (required).

Input dir contains subdirectories of frame sequences.

Flow: `mashup` inside the `animate` frame loop. For each frame, load frame `i` from each selected subdirectory, run the mashup blend, write PNG, then encode with ffmpeg.

## Dependencies

- ffmpeg (external, must be installed)
- No new npm dependencies — `pngjs` and `jpeg-js` already present

## Existing JS functions used

| Function | Module | Purpose |
|----------|--------|---------|
| `blendLayers` | effects.js | Layer blending with control map |
| `toValueMap` | value.js | Grayscale luminance extraction |
| `bloom` | effects.js | Bloom post-effect |
| `shadow` | effects.js | Shadow post-effect |
| `convolve` | effects.js | Control map smoothing |
| `basic` | generators.js | Base noise layer generation |
| `loadInputTensor` | CLI | PNG/JPG loading |
| `squareCropAndResize` | CLI | Image resizing |
