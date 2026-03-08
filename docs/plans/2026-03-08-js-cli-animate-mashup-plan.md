# JS CLI animate + mashup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `animate`, `mashup`, and `magic-mashup` commands to the JS CLI (`js/bin/noisemaker-js`), matching the Python CLI's functionality.

**Architecture:** All three commands are added to the existing CLI file. Shared helpers (ffmpeg encoding, option parsing) are defined once and reused. The `magic-mashup` command composes `mashup` blending logic inside the `animate` frame loop. No new npm dependencies — just `node:child_process` for ffmpeg and `node:os` for tmpdir.

**Tech Stack:** Node.js, existing JS noisemaker modules (effects, value, generators), ffmpeg (external)

---

### Task 1: Add ffmpeg helper and tmpdir utilities

**Files:**
- Modify: `js/bin/noisemaker-js` (add imports and helpers near top, after existing imports)

**Step 1: Add imports**

Add `node:child_process` and `node:os` imports at the top of the file, after the existing imports:

```javascript
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { readdir } from 'node:fs/promises';
```

**Step 2: Add ffmpeg encoding helper**

Add after the `writeImage` function (~line 354):

```javascript
async function encodeVideo(tmpDir, filename, width, height, frameCount, targetDuration) {
  if (filename.endsWith('.gif')) {
    // Two-pass GIF with palette for quality
    const palettePath = path.join(tmpDir, 'palette.png');
    const inputPattern = path.join(tmpDir, '%04d.png');

    execFileSync('ffmpeg', [
      '-y', '-framerate', '20',
      '-i', inputPattern,
      '-vf', 'scale=flags=lanczos,palettegen',
      palettePath,
    ], { stdio: 'pipe' });

    execFileSync('ffmpeg', [
      '-y', '-framerate', '20',
      '-i', inputPattern,
      '-i', palettePath,
      '-lavfi', 'scale=flags=lanczos[x];[x][1:v]paletteuse',
      filename,
    ], { stdio: 'pipe' });
    return;
  }

  // MP4 encoding
  const inputPattern = path.join(tmpDir, '%04d.png');
  const args = [
    '-y', '-framerate', '30',
    '-i', inputPattern,
    '-s', `${width}x${height}`,
  ];

  if (targetDuration != null) {
    // Copy first frame as last for seamless loop, then minterpolate
    const { copyFileSync } = await import('node:fs');
    const first = path.join(tmpDir, '0000.png');
    const last = path.join(tmpDir, `${String(frameCount).padStart(4, '0')}.png`);
    copyFileSync(first, last);

    const factor = 30 * targetDuration / frameCount;
    args.push('-vf', `setpts=${factor}*PTS,minterpolate=mi_mode=mci:mc_mode=aobmc:vsbmc=1:fps=30`);
  }

  args.push(
    '-c:v', 'libx264',
    '-preset', 'veryslow',
    '-crf', '15',
    '-pix_fmt', 'yuv420p',
    '-b:v', '8000k',
    '-bufsize', '16000k',
    filename,
  );

  execFileSync('ffmpeg', args, { stdio: 'pipe' });
}
```

**Step 3: Add makeTmpDir helper**

```javascript
async function makeTmpDir() {
  const prefix = path.join(tmpdir(), 'noisemaker-');
  const { mkdtemp } = await import('node:fs/promises');
  return mkdtemp(prefix);
}

async function removeTmpDir(dir) {
  const { rm } = await import('node:fs/promises');
  await rm(dir, { recursive: true, force: true });
}
```

**Step 4: Verify manually**

Run: `node js/bin/noisemaker-js --help`
Expected: No errors, existing help output unchanged.

**Step 5: Commit**

```
feat(cli): add ffmpeg encoding and tmpdir helpers
```

---

### Task 2: Add `animate` command — option parsing and help

**Files:**
- Modify: `js/bin/noisemaker-js`

**Step 1: Add animate help string**

Add after the `APPLY` help/format function block:

```javascript
const ANIMATE_HELP = `Usage: noisemaker-js animate [OPTIONS] PRESET_NAME

  Generate an animation from preset

Options:
  --presets FILE          Path to a custom presets DSL file
  --width INTEGER         Output width, in pixels  [default: 512]
  --height INTEGER        Output height, in pixels  [default: 512]
  --frame-count INTEGER   How many frames total  [default: 50]
  --seed INTEGER          Random seed
  --effect-preset TEXT    Apply an effect preset to each frame
  --filename FILE         Output filename (.mp4 or .gif)  [default: animation.mp4]
  --save-frames DIR       Save individual frames to this directory
  --with-supersample      Apply x2 supersample anti-aliasing
  --with-fxaa             Apply FXAA anti-aliasing
  --target-duration FLOAT Stretch to duration (seconds) via interpolation
  --help-presets          Show available generator presets and exit.
  -h, --help              Show this message and exit.
`;
```

**Step 2: Add `parseAnimateOptions` function**

Follow the pattern of `parseGenerateOptions`. Options:

```javascript
function parseAnimateOptions(tokens) {
  const options = {
    filename: 'animation.mp4',
    width: 512,
    height: 512,
    frameCount: 50,
    seed: null,
    effectPreset: null,
    saveFrames: null,
    withSupersample: false,
    withFxaa: false,
    targetDuration: null,
    helpPresets: false,
    presets: null,
  };

  const flagOptions = new Set(['with-supersample', 'with-fxaa', 'help-presets']);

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === '-h' || token === '--help') {
      options.help = true;
      continue;
    }

    if (!token.startsWith('-')) {
      throw new Error(`Unrecognized argument "${token}"`);
    }

    if (token.startsWith('-') && !token.startsWith('--')) {
      throw new Error(`Unknown option "${token}"`);
    }

    let key;
    let value = null;
    const eqIndex = token.indexOf('=');
    if (eqIndex !== -1) {
      key = token.slice(2, eqIndex);
      value = token.slice(eqIndex + 1);
    } else {
      key = token.slice(2);
    }

    if (flagOptions.has(key)) {
      if (value !== null) {
        throw new Error(`Option "--${key}" does not accept a value`);
      }
      if (key === 'with-supersample') options.withSupersample = true;
      else if (key === 'with-fxaa') options.withFxaa = true;
      else if (key === 'help-presets') options.helpPresets = true;
      continue;
    }

    if (value === null) {
      const next = tokens[++i];
      if (next === undefined) {
        throw new Error(`Option "--${key}" requires a value`);
      }
      value = next;
    }

    switch (key) {
      case 'presets': options.presets = value; break;
      case 'filename': options.filename = value; break;
      case 'width': options.width = Number.parseInt(value, 10); break;
      case 'height': options.height = Number.parseInt(value, 10); break;
      case 'frame-count': options.frameCount = Number.parseInt(value, 10); break;
      case 'seed': options.seed = Number.parseInt(value, 10); break;
      case 'effect-preset': options.effectPreset = value; break;
      case 'save-frames': options.saveFrames = value; break;
      case 'target-duration': options.targetDuration = Number.parseFloat(value); break;
      default: throw new Error(`Unknown option "--${key}"`);
    }
  }

  if (Number.isNaN(options.width) || options.width <= 0) throw new Error('Width must be a positive integer');
  if (Number.isNaN(options.height) || options.height <= 0) throw new Error('Height must be a positive integer');
  if (Number.isNaN(options.frameCount) || options.frameCount <= 0) throw new Error('Frame count must be a positive integer');
  if (options.seed !== null && Number.isNaN(options.seed)) throw new Error('Seed must be a number');
  if (options.targetDuration !== null && (Number.isNaN(options.targetDuration) || options.targetDuration <= 0)) {
    throw new Error('Target duration must be a positive number');
  }

  return options;
}
```

**Step 3: Add `splitAnimateArgs`**

Follow the `splitGenerateArgs` pattern — same as generate (one positional: PRESET_NAME), with the animate flag set:

```javascript
function splitAnimateArgs(args) {
  let helpRequested = false;
  let presetName = null;
  const optionTokens = [];
  let parsingOptions = true;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (parsingOptions && (arg === '--help' || arg === '-h')) {
      helpRequested = true;
      continue;
    }

    if (parsingOptions && arg === '--') {
      parsingOptions = false;
      continue;
    }

    if (parsingOptions && arg.startsWith('-') && arg !== '-') {
      optionTokens.push(arg);
      const needsValue =
        arg.startsWith('--') &&
        !arg.includes('=') &&
        !['--with-supersample', '--with-fxaa', '--help-presets', '--help', '-h'].includes(arg);
      if (needsValue) {
        const value = args[i + 1];
        if (value === undefined) throw new Error(`Option "${arg}" requires a value`);
        optionTokens.push(value);
        i += 1;
      }
      continue;
    }

    if (presetName === null) {
      presetName = arg;
      continue;
    }

    throw new Error(`Unexpected argument "${arg}"`);
  }

  return { helpRequested, presetName, optionTokens };
}
```

**Step 4: Verify**

Run: `node js/bin/noisemaker-js --help`
Expected: No errors (new functions exist but aren't wired up yet).

**Step 5: Commit**

```
feat(cli): add animate command option parsing
```

---

### Task 3: Add `animate` command — handler and routing

**Files:**
- Modify: `js/bin/noisemaker-js`

**Step 1: Add `_useReasonableSpeed` helper**

```javascript
function _useReasonableSpeed(preset, frameCount) {
  const speed = preset.settings?.speed ?? 0.25;
  return speed * (frameCount / 50.0);
}
```

**Step 2: Add `handleAnimate` function**

```javascript
async function handleAnimate(args) {
  const { helpRequested, presetName, optionTokens } = splitAnimateArgs(args);
  const options = parseAnimateOptions(optionTokens);

  if (options.presets) {
    await setPresetsPath(options.presets);
    clearPresetCaches();
  }

  if (helpRequested || options.help) {
    console.log(ANIMATE_HELP);
    return 0;
  }

  if (options.helpPresets) {
    const generatorNames = getGeneratorPresetNames();
    printPresetList('Available generator presets:', ['random', ...generatorNames]);
    return 0;
  }

  if (!presetName) {
    throw new Error("Error: Missing argument 'PRESET_NAME'.");
  }

  const presets = PRESETS();
  let resolvedName = presetName;

  if (presetName === 'random') {
    const generatorNames = getGeneratorPresetNames();
    if (!generatorNames.length) throw new Error('No generator presets are available.');
    resolvedName = generatorNames[Math.floor(Math.random() * generatorNames.length)];
  } else if (!Object.prototype.hasOwnProperty.call(presets, resolvedName)) {
    throw new Error(`Unknown preset: ${resolvedName}`);
  }

  let resolvedEffectName = null;
  if (options.effectPreset) {
    if (options.effectPreset === 'random') {
      const effectNames = getEffectPresetNames();
      if (!effectNames.length) throw new Error('No effect presets are available.');
      resolvedEffectName = effectNames[Math.floor(Math.random() * effectNames.length)];
    } else {
      const effectNames = getEffectPresetNames();
      if (!effectNames.includes(options.effectPreset)) {
        throw new Error(`Effect preset "${options.effectPreset}" not found.`);
      }
      resolvedEffectName = options.effectPreset;
    }
  }

  let seed = options.seed;
  if (!Number.isFinite(seed) || seed === null || seed === 0) {
    seed = Math.floor(Math.random() * MAX_SEED_VALUE) + 1;
  }

  setUtilSeed(seed);
  setValueSeed(seed);

  const generator = instantiatePreset(resolvedName, presets, seed);

  if (resolvedEffectName) {
    console.log(`${generator.name} vs. ${resolvedEffectName}`);
  } else {
    console.log(generator.name);
  }

  const { frameCount } = options;
  const tmpDir = await makeTmpDir();

  try {
    for (let i = 0; i < frameCount; i += 1) {
      const framePath = path.join(tmpDir, `${String(i).padStart(4, '0')}.png`);
      const timeFrac = i / frameCount;
      const genSpeed = _useReasonableSpeed(generator, frameCount);

      const ctx = new Context(null, false);
      const tensor = await generator.render(seed, {
        ctx,
        width: options.width,
        height: options.height,
        time: timeFrac,
        speed: genSpeed,
        withAlpha: false,
        withSupersample: options.withSupersample,
        withFxaa: options.withFxaa,
      });

      if (resolvedEffectName) {
        const effect = instantiatePreset(resolvedEffectName, presets, seed);
        const effectCtx = new Context(null, false);
        const effectResult = await effect.render(seed, {
          ctx: effectCtx,
          tensor,
          width: options.width,
          height: options.height,
          withFxaa: options.withFxaa,
          time: timeFrac,
          speed: _useReasonableSpeed(effect, frameCount),
        });
        await writeImage(effectResult, framePath);
      } else {
        await writeImage(tensor, framePath);
      }

      if (options.saveFrames) {
        const { copyFileSync } = await import('node:fs');
        copyFileSync(framePath, path.join(options.saveFrames, path.basename(framePath)));
      }
    }

    const outputPath = path.resolve(process.cwd(), options.filename);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await encodeVideo(tmpDir, outputPath, options.width, options.height, frameCount, options.targetDuration);
  } finally {
    await removeTmpDir(tmpDir);
  }

  return 0;
}
```

**Step 3: Wire into main routing**

In the `main` function, add before the `throw new Error` for unknown commands:

```javascript
  if (command === 'animate') {
    return handleAnimate(rest.length ? rest : []);
  }
```

**Step 4: Update MAIN_HELP**

Add `animate` to the Commands section:

```
Commands:
  generate     Generate a .png or .jpg from preset
  apply        Apply an effect to a .png or .jpg image
  animate      Generate an animation from preset
```

**Step 5: Test manually**

Run: `node js/bin/noisemaker-js animate --help`
Expected: Prints animate help text.

Run: `node js/bin/noisemaker-js animate --frame-count 3 --width 128 --height 128 --filename /tmp/test-animate.mp4 random`
Expected: Renders 3 frames and encodes to MP4 (requires ffmpeg).

**Step 6: Commit**

```
feat(cli): add animate command with ffmpeg encoding
```

---

### Task 4: Add `mashup` command

**Files:**
- Modify: `js/bin/noisemaker-js`

**Step 1: Add mashup imports**

Add to the imports from effects.js:

```javascript
import { squareCropAndResize, blendLayers, bloom, shadow, convolve, adjustBrightness, adjustContrast, ValueMask } from '../noisemaker/effects.js';
```

And from value.js:

```javascript
import { toValueMap, blend as valueBlend } from '../noisemaker/value.js';
```

Note: Check the actual export names. `ValueMask` may need to be imported from value.js instead. Verify with: `grep 'export.*ValueMask' js/noisemaker/effects.js js/noisemaker/value.js`

Also import `basic` from generators:

```javascript
import { basic as basicGenerator } from '../noisemaker/generators.js';
```

**Step 2: Add mashup help, option parser, and arg splitter**

```javascript
const MASHUP_HELP = `Usage: noisemaker-js mashup [OPTIONS]

  Blend a directory of .png or .jpg images

Options:
  --presets FILE           Path to a custom presets DSL file
  --input-dir DIR          Directory of images to blend (required)
  --filename FILE          Output filename  [default: mashup.png]
  --control-filename FILE  Control image filename (optional)
  --seed INTEGER           Random seed
  --time FLOAT             Time value  [default: 0]
  --speed FLOAT            Animation speed  [default: 0.25]
  -h, --help               Show this message and exit.
`;

function parseMashupOptions(tokens) {
  const options = {
    inputDir: null,
    filename: 'mashup.png',
    controlFilename: null,
    seed: null,
    time: 0,
    speed: 0.25,
    presets: null,
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === '-h' || token === '--help') {
      options.help = true;
      continue;
    }

    if (!token.startsWith('--')) {
      throw new Error(`Unrecognized argument "${token}"`);
    }

    let key;
    let value = null;
    const eqIndex = token.indexOf('=');
    if (eqIndex !== -1) {
      key = token.slice(2, eqIndex);
      value = token.slice(eqIndex + 1);
    } else {
      key = token.slice(2);
    }

    if (value === null) {
      const next = tokens[++i];
      if (next === undefined) throw new Error(`Option "--${key}" requires a value`);
      value = next;
    }

    switch (key) {
      case 'presets': options.presets = value; break;
      case 'input-dir': options.inputDir = value; break;
      case 'filename': options.filename = value; break;
      case 'control-filename': options.controlFilename = value; break;
      case 'seed': options.seed = Number.parseInt(value, 10); break;
      case 'time': options.time = Number.parseFloat(value); break;
      case 'speed': options.speed = Number.parseFloat(value); break;
      default: throw new Error(`Unknown option "--${key}"`);
    }
  }

  return options;
}

function splitMashupArgs(args) {
  let helpRequested = false;
  const optionTokens = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      helpRequested = true;
      continue;
    }

    if (arg.startsWith('--')) {
      optionTokens.push(arg);
      if (!arg.includes('=')) {
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          optionTokens.push(next);
          i += 1;
        }
      }
      continue;
    }

    throw new Error(`Unexpected argument "${arg}"`);
  }

  return { helpRequested, optionTokens };
}
```

**Step 3: Add `collectImages` helper**

```javascript
async function collectImages(inputDir) {
  const entries = [];
  const walk = async (dir) => {
    const items = await readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        await walk(full);
      } else if (/\.(png|jpe?g)$/i.test(item.name)) {
        entries.push(full);
      }
    }
  };
  await walk(inputDir);
  return entries;
}
```

**Step 4: Add `mashupBlend` core function**

This is the shared blending logic used by both `mashup` and `magic-mashup`:

```javascript
async function mashupBlend(images, controlTensor, shape, seed, time, speed) {
  setValueSeed(seed);

  const freq = 2 + Math.floor(Math.random() * 3);
  const hueRange = Math.random();
  const base = await basicGenerator(freq, shape, { hueRange, time, speed });

  let control = toValueMap(controlTensor);
  const controlShape = [shape[0], shape[1], 1];
  control = convolve(control, controlShape, 0, 0, ValueMask.conv2d_blur);

  let tensor = blendLayers(control, shape, Math.random() * 0.5, ...images);
  tensor = valueBlend(tensor, base, 0.125 + Math.random() * 0.125);
  tensor = await bloom(tensor, shape, time, speed, 0.25 + Math.random() * 0.125);
  tensor = await shadow(tensor, shape, time, speed, 0.25 + Math.random() * 0.125);
  tensor = await adjustBrightness(tensor, shape, 0, 0, 0.1);
  tensor = await adjustContrast(tensor, shape, 0, 0, 1.5);

  return tensor;
}
```

Note: The `convolve` and `shadow` signatures in JS may differ from Python. Verify the actual JS function signatures before implementing. The Python `shadow` takes `reference=control` — check if JS shadow supports that parameter.

**Step 5: Add `handleMashup` function**

```javascript
async function handleMashup(args) {
  const { helpRequested, optionTokens } = splitMashupArgs(args);
  const options = parseMashupOptions(optionTokens);

  if (options.presets) {
    await setPresetsPath(options.presets);
    clearPresetCaches();
  }

  if (helpRequested || options.help) {
    console.log(MASHUP_HELP);
    return 0;
  }

  if (!options.inputDir) {
    throw new Error("Error: Missing required option '--input-dir'.");
  }

  let seed = options.seed;
  if (!Number.isFinite(seed) || seed === null || seed === 0) {
    seed = Math.floor(Math.random() * MAX_SEED_VALUE) + 1;
  }

  setUtilSeed(seed);
  setValueSeed(seed);

  const filenames = await collectImages(options.inputDir);
  if (filenames.length < 2) {
    throw new Error(`Need at least 2 images in "${options.inputDir}", found ${filenames.length}.`);
  }

  const collageCount = Math.min(4 + Math.floor(Math.random() * 3), filenames.length);

  // Randomly select images (with replacement, matching Python)
  const collageImages = [];
  for (let j = 0; j < collageCount + 1; j += 1) {
    const src = filenames[Math.floor(Math.random() * filenames.length)];
    const { tensor } = await loadInputTensor(src);
    collageImages.push(tensor);
  }

  let controlTensor;
  if (options.controlFilename) {
    const { tensor } = await loadInputTensor(options.controlFilename);
    controlTensor = tensor;
  } else {
    controlTensor = collageImages.pop();
  }

  const shape = controlTensor.shape.slice();
  const result = await mashupBlend(collageImages, controlTensor, shape, seed, options.time, options.speed);

  await writeImage(result, options.filename);
  console.log('mashup');
  return 0;
}
```

**Step 6: Wire into main routing and update MAIN_HELP**

```javascript
  if (command === 'mashup') {
    return handleMashup(rest.length ? rest : []);
  }
```

Update MAIN_HELP Commands:
```
  mashup       Blend a directory of images
```

**Step 7: Test manually**

Create a test directory with a few PNG files, then:

Run: `node js/bin/noisemaker-js mashup --input-dir /tmp/test-images --filename /tmp/mashup-test.png`
Expected: Produces a blended output image.

**Step 8: Commit**

```
feat(cli): add mashup command for image blending
```

---

### Task 5: Add `magic-mashup` command

**Files:**
- Modify: `js/bin/noisemaker-js`

**Step 1: Add magic-mashup help, option parser, and arg splitter**

The magic-mashup options combine animate options (frame-count, save-frames, target-duration, etc.) with --input-dir. Follow the same pattern as animate parsing but add `--input-dir` and `--effect-preset`, remove `--with-supersample`.

```javascript
const MAGIC_MASHUP_HELP = `Usage: noisemaker-js magic-mashup [OPTIONS]

  Animated collage from a directory of directories of frames

Options:
  --presets FILE          Path to a custom presets DSL file
  --input-dir DIR         Directory of frame subdirectories (required)
  --width INTEGER         Output width  [default: 512]
  --height INTEGER        Output height  [default: 512]
  --frame-count INTEGER   How many frames total  [default: 50]
  --seed INTEGER          Random seed
  --effect-preset TEXT    Apply an effect preset to each frame
  --filename FILE         Output filename (.mp4 or .gif)  [default: mashup.mp4]
  --save-frames DIR       Save individual frames to this directory
  --target-duration FLOAT Stretch to duration (seconds) via interpolation
  -h, --help              Show this message and exit.
`;
```

Option parser: similar to animate but with `--input-dir` and without `--with-supersample`/`--with-fxaa`.

**Step 2: Add `handleMagicMashup` function**

```javascript
async function handleMagicMashup(args) {
  // Parse options (similar pattern)
  // ...

  // Scan input-dir for subdirectories
  const items = await readdir(options.inputDir, { withFileTypes: true });
  const dirnames = items.filter(d => d.isDirectory()).map(d => d.name);
  if (!dirnames.length) {
    throw new Error(`No subdirectories found in "${options.inputDir}".`);
  }

  const collageCount = Math.min(4 + Math.floor(Math.random() * 3), dirnames.length);
  const selectedDirs = [];
  const available = [...dirnames];
  for (let j = 0; j < collageCount; j += 1) {
    const idx = Math.floor(Math.random() * available.length);
    selectedDirs.push(available.splice(idx, 1)[0]);
  }

  const tmpDir = await makeTmpDir();
  try {
    for (let i = 0; i < frameCount; i += 1) {
      const framePath = path.join(tmpDir, `${String(i).padStart(4, '0')}.png`);
      const shape = [options.height, options.width, 3];

      // Load frame i from each selected subdirectory
      const collageImages = [];
      for (const dirname of selectedDirs) {
        const srcDir = path.join(options.inputDir, dirname);
        const files = (await readdir(srcDir)).filter(f => f.endsWith('.png')).sort();
        if (i >= files.length) continue;
        const { tensor } = await loadInputTensor(path.join(srcDir, files[i]));
        collageImages.push(tensor);
      }

      if (!collageImages.length) {
        throw new Error(`No frames available at index ${i}.`);
      }

      setValueSeed(seed);
      const controlTensor = collageImages.pop();
      const result = await mashupBlend(
        collageImages, controlTensor, shape, seed,
        i / frameCount, 0.125,
      );

      // Optionally apply effect
      if (resolvedEffectName) {
        const effect = instantiatePreset(resolvedEffectName, presets, seed);
        const effectCtx = new Context(null, false);
        const effectResult = await effect.render(seed, {
          ctx: effectCtx,
          tensor: result,
          width: options.width,
          height: options.height,
          time: i / frameCount,
          speed: _useReasonableSpeed(effect, frameCount),
        });
        await writeImage(effectResult, framePath);
      } else {
        await writeImage(result, framePath);
      }

      if (options.saveFrames) {
        const { copyFileSync } = await import('node:fs');
        copyFileSync(framePath, path.join(options.saveFrames, path.basename(framePath)));
      }
    }

    const outputPath = path.resolve(process.cwd(), options.filename);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await encodeVideo(tmpDir, outputPath, options.width, options.height, frameCount, options.targetDuration);
  } finally {
    await removeTmpDir(tmpDir);
  }

  return 0;
}
```

**Step 3: Wire into main routing and update MAIN_HELP**

```javascript
  if (command === 'magic-mashup') {
    return handleMagicMashup(rest.length ? rest : []);
  }
```

```
  magic-mashup Animated collage from frame directories
```

**Step 4: Test manually**

This requires a directory of subdirectories containing frame PNGs. Generate test data first using `animate --save-frames`:

```bash
mkdir -p /tmp/mm-test/a /tmp/mm-test/b
node js/bin/noisemaker-js animate --frame-count 5 --width 128 --height 128 --save-frames /tmp/mm-test/a random
node js/bin/noisemaker-js animate --frame-count 5 --width 128 --height 128 --save-frames /tmp/mm-test/b random
node js/bin/noisemaker-js magic-mashup --input-dir /tmp/mm-test --frame-count 5 --width 128 --height 128 --filename /tmp/mm-test.mp4
```

**Step 5: Commit**

```
feat(cli): add magic-mashup command composing mashup + animate
```

---

### Task 6: Verify all commands and function signatures

**Files:**
- Read-only verification of: `js/noisemaker/effects.js`, `js/noisemaker/value.js`, `js/noisemaker/generators.js`

**Step 1: Verify function signatures match usage**

Before final testing, verify that the JS function signatures for `convolve`, `shadow`, `bloom`, `adjustBrightness`, `adjustContrast`, `blendLayers`, `toValueMap`, `blend`, and `basic` match how they're called in the plan. In particular:

- `convolve(tensor, shape, time, speed, kernel, ...)` — check parameter order
- `shadow(tensor, shape, time, speed, alpha)` — Python uses `reference=control`, check if JS has that
- `ValueMask` — check where it's exported from
- `adjustBrightness` / `adjustContrast` — check parameter signatures

Fix any mismatches before testing.

**Step 2: Run existing tests**

Run: `node scripts/run-js-tests.js --skip-parity`
Expected: All existing tests pass (no regressions).

**Step 3: End-to-end test of all three commands**

```bash
# animate
node js/bin/noisemaker-js animate --frame-count 3 --width 128 --height 128 --filename /tmp/e2e-animate.mp4 random

# mashup (need test images first)
node js/bin/noisemaker-js generate --width 128 --height 128 --filename /tmp/mashup-src/a.png random
node js/bin/noisemaker-js generate --width 128 --height 128 --filename /tmp/mashup-src/b.png random
node js/bin/noisemaker-js generate --width 128 --height 128 --filename /tmp/mashup-src/c.png random
node js/bin/noisemaker-js generate --width 128 --height 128 --filename /tmp/mashup-src/d.png random
node js/bin/noisemaker-js generate --width 128 --height 128 --filename /tmp/mashup-src/e.png random
node js/bin/noisemaker-js mashup --input-dir /tmp/mashup-src --filename /tmp/e2e-mashup.png

# magic-mashup (use animate --save-frames to generate frame dirs)
mkdir -p /tmp/mm-src/a /tmp/mm-src/b
node js/bin/noisemaker-js animate --frame-count 3 --width 128 --height 128 --save-frames /tmp/mm-src/a random
node js/bin/noisemaker-js animate --frame-count 3 --width 128 --height 128 --save-frames /tmp/mm-src/b random
node js/bin/noisemaker-js magic-mashup --input-dir /tmp/mm-src --frame-count 3 --width 128 --height 128 --filename /tmp/e2e-mashup.mp4
```

**Step 4: Final commit**

```
fix(cli): adjust function signatures after integration testing
```

(Only if fixes were needed.)
