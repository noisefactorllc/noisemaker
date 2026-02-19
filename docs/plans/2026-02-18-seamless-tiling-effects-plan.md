# Seamless Tiling Effects Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add two new filter effects to noisemaker — `seamless` (edge-blend tiler) and `tile` (symmetry/kaleidoscope tiler) — that produce seamlessly tileable output from any input texture.

**Architecture:** Both are single-pass filter effects following the standard noisemaker pattern: `definition.js` + GLSL + WGSL + `help.md`. Each takes `inputTex`, manipulates UVs, and writes to `outputTex`. Both include a `repeat` parameter to optionally show the tiled result.

**Tech Stack:** GLSL (WebGL 2), WGSL (WebGPU), JavaScript (Effect class)

**Design doc:** `docs/plans/2026-02-18-seamless-tiling-effects-design.md`

---

### Task 1: Create `seamless` effect directory and definition

**Files:**
- Create: `shaders/effects/filter/seamless/definition.js`

**Step 1: Create the definition file**

```javascript
import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Seamless",
  namespace: "filter",
  func: "seamless",
  tags: ["transform"],
  description: "Edge-blend cross-fade for seamless tiling",
  globals: {
    blend: {
      type: "float",
      default: 0.25,
      min: 0.0,
      max: 0.5,
      step: 0.01,
      uniform: "blend",
      ui: {
        label: "blend",
        control: "slider"
      }
    },
    repeat: {
      type: "float",
      default: 2,
      min: 1,
      max: 10,
      step: 1,
      uniform: "repeatCount",
      ui: {
        label: "repeat",
        control: "slider"
      }
    },
    curve: {
      type: "int",
      default: 1,
      uniform: "curve",
      choices: {
        "linear": 0,
        "smooth": 1,
        "cosine": 2
      },
      ui: {
        label: "curve",
        control: "dropdown"
      }
    }
  },
  passes: [
    {
      name: "main",
      program: "seamless",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
```

**Step 2: Verify syntax**

Run: `node --check shaders/effects/filter/seamless/definition.js`
Expected: no output (clean parse)

**Step 3: Commit**

```bash
git add shaders/effects/filter/seamless/definition.js
git commit -m "feat(filter): add seamless effect definition"
```

---

### Task 2: Write `seamless` GLSL shader

**Files:**
- Create: `shaders/effects/filter/seamless/glsl/seamless.glsl`

**Step 1: Write the GLSL shader**

```glsl
#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform float blend;
uniform float repeatCount;
uniform int curve;

out vec4 fragColor;

/*
 * Blend weight function.
 * For a coordinate t in [0, 1], returns how much to blend
 * toward the wrapped sample. Weight is 1 at edges, 0 in center.
 */
float edgeWeight(float t, float width) {
    if (width <= 0.0) return 0.0;
    // Distance from nearest edge (0 at edge, 0.5 at center)
    float d = min(t, 1.0 - t);
    float w = 1.0 - clamp(d / width, 0.0, 1.0);
    // Apply curve
    if (curve == 0) {
        return w; // linear
    } else if (curve == 2) {
        return 0.5 - 0.5 * cos(w * 3.14159265); // cosine
    }
    return w * w * (3.0 - 2.0 * w); // smoothstep (default)
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);

    // Apply tiling repetition
    vec2 st = uv * repeatCount;
    st = fract(st);

    // Compute blend weights for x and y edges
    float wx = edgeWeight(st.x, blend);
    float wy = edgeWeight(st.y, blend);

    // Sample original and three wrapped positions
    vec4 c00 = texture(inputTex, st);
    vec4 c10 = texture(inputTex, fract(st + vec2(0.5, 0.0)));
    vec4 c01 = texture(inputTex, fract(st + vec2(0.0, 0.5)));
    vec4 c11 = texture(inputTex, fract(st + vec2(0.5, 0.5)));

    // Bilinear blend using edge weights
    vec4 mx0 = mix(c00, c10, wx);
    vec4 mx1 = mix(c01, c11, wx);
    vec4 result = mix(mx0, mx1, wy);

    fragColor = vec4(result.rgb, 1.0);
}
```

**Step 2: Commit**

```bash
git add shaders/effects/filter/seamless/glsl/seamless.glsl
git commit -m "feat(filter): add seamless GLSL shader"
```

---

### Task 3: Write `seamless` WGSL shader

**Files:**
- Create: `shaders/effects/filter/seamless/wgsl/seamless.wgsl`

**Step 1: Write the WGSL shader**

Port the GLSL logic to WGSL using per-binding uniforms (matching `repeat` effect style).

```wgsl
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> resolution: vec2<f32>;
@group(0) @binding(3) var<uniform> aspect: f32;
@group(0) @binding(4) var<uniform> blend: f32;
@group(0) @binding(5) var<uniform> repeatCount: f32;
@group(0) @binding(6) var<uniform> curve: i32;

fn edgeWeight(t: f32, width: f32, c: i32) -> f32 {
    if (width <= 0.0) { return 0.0; }
    let d = min(t, 1.0 - t);
    let w = 1.0 - clamp(d / width, 0.0, 1.0);
    if (c == 0) {
        return w;
    } else if (c == 2) {
        return 0.5 - 0.5 * cos(w * 3.14159265);
    }
    return w * w * (3.0 - 2.0 * w);
}

fn fract2(v: vec2<f32>) -> vec2<f32> {
    return v - floor(v);
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = position.xy / texSize;

    let st = fract2(uv * repeatCount);

    let wx = edgeWeight(st.x, blend, curve);
    let wy = edgeWeight(st.y, blend, curve);

    let c00 = textureSample(inputTex, samp, st);
    let c10 = textureSample(inputTex, samp, fract2(st + vec2<f32>(0.5, 0.0)));
    let c01 = textureSample(inputTex, samp, fract2(st + vec2<f32>(0.0, 0.5)));
    let c11 = textureSample(inputTex, samp, fract2(st + vec2<f32>(0.5, 0.5)));

    let mx0 = mix(c00, c10, wx);
    let mx1 = mix(c01, c11, wx);
    let result = mix(mx0, mx1, wy);

    return vec4<f32>(result.rgb, 1.0);
}
```

**Step 2: Commit**

```bash
git add shaders/effects/filter/seamless/wgsl/seamless.wgsl
git commit -m "feat(filter): add seamless WGSL shader"
```

---

### Task 4: Write `seamless` help documentation

**Files:**
- Create: `shaders/effects/filter/seamless/help.md`

**Step 1: Write the help file**

```markdown
# seamless

Edge-blend cross-fade for seamless tiling. Blends opposite edges of the input texture so the output tiles without visible seams.

## Description

Applies a toroidal cross-fade: pixels near the left edge blend toward right-edge content (and vice versa), and similarly for top/bottom. The result is a texture that tiles seamlessly in both directions.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| blend | float | 0.25 | 0-0.5 | Width of the cross-fade zone as fraction of tile |
| repeat | float | 2 | 1-10 | Number of tile repetitions to display |
| curve | int | smooth | linear/smooth/cosine | Blend falloff curve |

## Notes

- Set repeat to 1 to output just the seamless tile unit (for chaining with other effects)
- Higher blend values produce smoother seams but lose more of the original edge content
- Works best when the input has some visual variation — uniform inputs don't need blending
```

**Step 2: Commit**

```bash
git add shaders/effects/filter/seamless/help.md
git commit -m "docs(filter): add seamless help"
```

---

### Task 5: Create `tile` effect directory and definition

**Files:**
- Create: `shaders/effects/filter/tile/definition.js`

**Step 1: Create the definition file**

```javascript
import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Tile",
  namespace: "filter",
  func: "tile",
  tags: ["transform"],
  description: "Symmetry-based kaleidoscope tiler",
  globals: {
    symmetry: {
      type: "int",
      default: 1,
      uniform: "symmetry",
      choices: {
        "mirror-x": 0,
        "mirror-xy": 1,
        "rotate-2": 2,
        "rotate-3": 3,
        "rotate-4": 4,
        "rotate-6": 5
      },
      ui: {
        label: "symmetry",
        control: "dropdown"
      }
    },
    scale: {
      type: "float",
      default: 1.0,
      min: 0.1,
      max: 4.0,
      step: 0.05,
      uniform: "scale",
      ui: {
        label: "scale",
        control: "slider"
      }
    },
    offsetX: {
      type: "float",
      default: 0.0,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      uniform: "offsetX",
      ui: {
        label: "offset x",
        control: "slider"
      }
    },
    offsetY: {
      type: "float",
      default: 0.0,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      uniform: "offsetY",
      ui: {
        label: "offset y",
        control: "slider"
      }
    },
    angle: {
      type: "float",
      default: 0.0,
      min: 0.0,
      max: 360.0,
      step: 1.0,
      uniform: "angle",
      ui: {
        label: "angle",
        control: "slider"
      }
    },
    repeat: {
      type: "float",
      default: 2,
      min: 1,
      max: 10,
      step: 1,
      uniform: "repeatCount",
      ui: {
        label: "repeat",
        control: "slider"
      }
    }
  },
  passes: [
    {
      name: "main",
      program: "tile",
      inputs: {
        inputTex: "inputTex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
```

**Step 2: Verify syntax**

Run: `node --check shaders/effects/filter/tile/definition.js`
Expected: no output (clean parse)

**Step 3: Commit**

```bash
git add shaders/effects/filter/tile/definition.js
git commit -m "feat(filter): add tile effect definition"
```

---

### Task 6: Write `tile` GLSL shader

**Files:**
- Create: `shaders/effects/filter/tile/glsl/tile.glsl`

**Step 1: Write the GLSL shader**

```glsl
#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform int symmetry;
uniform float scale;
uniform float offsetX;
uniform float offsetY;
uniform float angle;
uniform float repeatCount;

out vec4 fragColor;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

/*
 * Rotate a 2D point by radians.
 */
vec2 rot(vec2 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

/*
 * Mirror fold: maps [0,1] so that 0 and 1 have the same value.
 */
float mirrorFold(float t) {
    return 1.0 - abs(2.0 * fract(t * 0.5) - 1.0);
}

/*
 * Fold UV into a sector of angle 2*PI/n using polar coordinates.
 * The folded UV always lands in the first sector [0, PI/n].
 */
vec2 rotationalFold(vec2 uv, int n) {
    float fn = float(n);
    float sectorAngle = TAU / fn;

    // Center on origin
    vec2 p = uv - 0.5;

    // Convert to polar
    float a = atan(p.y, p.x);
    float r = length(p);

    // Fold angle into first sector
    a = mod(a + TAU, sectorAngle);

    // Mirror within sector for seamless edges
    if (a > sectorAngle * 0.5) {
        a = sectorAngle - a;
    }

    // Back to cartesian, re-center
    return vec2(r * cos(a), r * sin(a)) + 0.5;
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);

    // Apply tiling repetition
    vec2 st = uv * repeatCount;
    st = fract(st);

    // Apply source region transforms: offset, scale, rotation
    st = (st - 0.5) / scale;
    st = rot(st, angle * PI / 180.0);
    st += 0.5 + vec2(offsetX, offsetY);

    // Apply symmetry
    if (symmetry == 0) {
        // mirror-x
        st.x = mirrorFold(st.x);
        st.y = fract(st.y);
    } else if (symmetry == 1) {
        // mirror-xy
        st.x = mirrorFold(st.x);
        st.y = mirrorFold(st.y);
    } else if (symmetry == 2) {
        // rotate-2
        st = rotationalFold(fract(st), 2);
    } else if (symmetry == 3) {
        // rotate-3
        st = rotationalFold(fract(st), 3);
    } else if (symmetry == 4) {
        // rotate-4
        st = rotationalFold(fract(st), 4);
    } else {
        // rotate-6
        st = rotationalFold(fract(st), 6);
    }

    // Clamp to valid texture range
    st = clamp(st, 0.0, 1.0);

    fragColor = vec4(texture(inputTex, st).rgb, 1.0);
}
```

**Step 2: Commit**

```bash
git add shaders/effects/filter/tile/glsl/tile.glsl
git commit -m "feat(filter): add tile GLSL shader"
```

---

### Task 7: Write `tile` WGSL shader

**Files:**
- Create: `shaders/effects/filter/tile/wgsl/tile.wgsl`

**Step 1: Write the WGSL shader**

Port the GLSL logic to WGSL.

```wgsl
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> resolution: vec2<f32>;
@group(0) @binding(3) var<uniform> aspect: f32;
@group(0) @binding(4) var<uniform> symmetry: i32;
@group(0) @binding(5) var<uniform> scale: f32;
@group(0) @binding(6) var<uniform> offsetX: f32;
@group(0) @binding(7) var<uniform> offsetY: f32;
@group(0) @binding(8) var<uniform> angle: f32;
@group(0) @binding(9) var<uniform> repeatCount: f32;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn rot(p: vec2<f32>, a: f32) -> vec2<f32> {
    let c = cos(a);
    let s = sin(a);
    return vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
}

fn mirrorFold(t: f32) -> f32 {
    return 1.0 - abs(2.0 * fract(t * 0.5) - 1.0);
}

fn fract2(v: vec2<f32>) -> vec2<f32> {
    return v - floor(v);
}

fn rotationalFold(uv: vec2<f32>, n: i32) -> vec2<f32> {
    let fn_val = f32(n);
    let sectorAngle = TAU / fn_val;

    let p = uv - 0.5;
    var a = atan2(p.y, p.x);
    let r = length(p);

    a = (a + TAU) % sectorAngle;
    if (a > sectorAngle * 0.5) {
        a = sectorAngle - a;
    }

    return vec2<f32>(r * cos(a), r * sin(a)) + 0.5;
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = position.xy / texSize;

    var st = fract2(uv * repeatCount);

    st = (st - 0.5) / scale;
    st = rot(st, angle * PI / 180.0);
    st = st + 0.5 + vec2<f32>(offsetX, offsetY);

    if (symmetry == 0) {
        st.x = mirrorFold(st.x);
        st.y = fract(st.y);
    } else if (symmetry == 1) {
        st.x = mirrorFold(st.x);
        st.y = mirrorFold(st.y);
    } else if (symmetry == 2) {
        st = rotationalFold(fract2(st), 2);
    } else if (symmetry == 3) {
        st = rotationalFold(fract2(st), 3);
    } else if (symmetry == 4) {
        st = rotationalFold(fract2(st), 4);
    } else {
        st = rotationalFold(fract2(st), 6);
    }

    st = clamp(st, vec2<f32>(0.0), vec2<f32>(1.0));

    return vec4<f32>(textureSample(inputTex, samp, st).rgb, 1.0);
}
```

**Step 2: Commit**

```bash
git add shaders/effects/filter/tile/wgsl/tile.wgsl
git commit -m "feat(filter): add tile WGSL shader"
```

---

### Task 8: Write `tile` help documentation

**Files:**
- Create: `shaders/effects/filter/tile/help.md`

**Step 1: Write the help file**

```markdown
# tile

Symmetry-based kaleidoscope tiler. Applies wallpaper-group symmetry operations to produce seamlessly tileable patterns from any input.

## Description

Selects a region of the input and folds it using mirror or rotational symmetry. The output tiles seamlessly when repeated. Inspired by Terrazzo-style pattern generation.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| symmetry | int | mirror-xy | mirror-x/mirror-xy/rotate-2/rotate-3/rotate-4/rotate-6 | Symmetry group |
| scale | float | 1.0 | 0.1-4.0 | Scale of source sampling region |
| offset x | float | 0 | -1 to 1 | Pan source region horizontally |
| offset y | float | 0 | -1 to 1 | Pan source region vertically |
| angle | float | 0 | 0-360 | Rotate source sampling region |
| repeat | float | 2 | 1-10 | Number of tile repetitions to display |

## Notes

- mirror-x produces Rorschach-like bilateral symmetry
- mirror-xy reflects both axes for a four-quadrant pattern
- rotate-3 and rotate-6 produce hexagonal/triangular patterns
- Adjust offset and angle to explore different regions of the input
- Set repeat to 1 to output just the tile unit
```

**Step 2: Commit**

```bash
git add shaders/effects/filter/tile/help.md
git commit -m "docs(filter): add tile help"
```

---

### Task 9: Regenerate manifest and test in noisedeck

**Step 1: Regenerate the shader manifest**

Run: `python3 shaders/scripts/generate_shader_manifest.py`
Expected: Script completes, manifest.json updated with `filter/seamless` and `filter/tile` entries

**Step 2: Verify manifest entries**

Run: `grep -A2 '"filter/seamless"' shaders/effects/manifest.json`
Expected: Entry with description and tags

Run: `grep -A2 '"filter/tile"' shaders/effects/manifest.json`
Expected: Entry with description and tags

**Step 3: Copy updated bundle to noisedeck**

Follow the standard vendor bundle copy process to get the updated manifest and effects into `noisedeck/app/js/noisemaker/vendor/`.

**Step 4: Test in browser**

1. Open noisedeck in browser
2. In the DSL editor, test `seamless`:
   ```
   search filter

   noise().seamless(blend=0.3, repeat=3).write(o0)
   ```
3. Verify: output should show 3x3 tiled noise with smooth edges
4. Test `tile`:
   ```
   search filter

   noise().tile(symmetry=5, repeat=3, scale=0.5).write(o0)
   ```
5. Verify: output should show hexagonal kaleidoscope pattern
6. Test with repeat=1 to verify single tile output
7. Adjust parameters and verify all controls respond

**Step 5: Commit manifest**

```bash
git add shaders/effects/manifest.json
git commit -m "chore: regenerate manifest with seamless and tile effects"
```
