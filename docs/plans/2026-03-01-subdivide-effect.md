# Subdivide Effect Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a `synth/subdivide` effect that recursively subdivides a grid into cells of varying sizes, filling each with grayscale shapes. Supports optional texture input for mosaic/fragmentation effects.

**Architecture:** Single-pass synth effect. The subdivision is computed per-pixel via a loop (not actual recursion) — at each depth level, hash the current cell to decide whether to split and which direction. After finding the leaf cell, draw the assigned shape. Optional texture input follows the `rd` pattern (`type: "surface"`, `default: "none"`).

**Tech Stack:** GLSL (ES 3.0), WGSL, JS (Effect definition)

---

## Design

### Algorithm

For each pixel:

1. Start with cell bounds = (0,0) to (1,1)
2. Loop from level 0 to maxDepth:
   a. Hash(cellMin, seed, level) → random value
   b. If random < density: subdivide
      - **Binary mode:** hash decides horizontal or vertical split, halve the cell along that axis
      - **Quad mode:** split both axes (quadtree)
   c. Determine which sub-cell the pixel falls in, update cell bounds
   d. Check if pixel is near the split line → flag as outline
3. At the leaf cell:
   a. Hash cell position → pick one of 4 gray shades (0.1, 0.4, 0.7, 1.0)
   b. Compute cell-local UV (0-1 within cell)
   c. Draw selected shape using cell-local coords
   d. If outline flagged and outline width > 0, draw black outline
4. If inputMix > 0 and texture connected: blend with texture sample

### Parameters (9 total)

| Param | Uniform | Type | Default | Range | Description |
|-------|---------|------|---------|-------|-------------|
| mode | mode | int | 0 | binary(0)/quad(1) | Subdivision type |
| depth | depth | int | 4 | 1-6 | Max subdivision levels |
| density | density | float | 50 | 0-100 | Subdivision probability |
| seed | seed | int | 1 | 1-100 | Random seed |
| fill | fill | int | 0 | solid(0)/circle(1)/diamond(2)/square(3)/triangle(4)/arc(5)/mixed(6) | Cell fill shape |
| outline | outline | float | 0 | 0-10 | Grid line width in pixels (0 = off) |
| inputMix | inputMix | float | 0 | 0-100 | Blend with input texture |
| tex | - | surface | none | - | Optional texture input |

Gray shades are fixed at 0.1, 0.4, 0.7, 1.0 — designed for downstream palette mapping.

### Hash Function

PCG PRNG for cross-platform determinism (same as glitch effect):
```glsl
uvec3 pcg(uvec3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
    return v;
}
vec3 prng(vec3 p) {
    return vec3(pcg(uvec3(p))) / float(0xffffffffu);
}
```

Use different z-channel values for independent random streams: `prng(vec3(cellKey, seed))` for split decision, `prng(vec3(cellKey, seed + 1))` for split direction, `prng(vec3(cellKey, seed + 2))` for shade, etc.

### Shapes

All shapes computed in cell-local UV space (0-1). The cell's screen-space aspect ratio is computed to keep circles circular:

```glsl
float cellAspect = (cellSize.x * resolution.x) / (cellSize.y * resolution.y);
vec2 centered = cellUv - 0.5;
centered.x *= cellAspect;
```

- **solid** — entire cell filled with assigned gray
- **circle** — `length(centered) < 0.4`
- **diamond** — `abs(centered.x) + abs(centered.y) < 0.4`
- **square** — `max(abs(centered.x), abs(centered.y)) < 0.35`
- **triangle** — equilateral triangle pointing up, centered
- **arc** — quarter circle in a corner (corner chosen by cell hash)
- **mixed** — hash picks one of the above per cell

Shape pixels get the cell's assigned gray. Background pixels get 0.0 (black).

### Outline

At each level of the subdivision loop, check distance from pixel to the split line. If within `outline` pixels (converted to UV space via resolution), flag as outline. Outline pixels are drawn as black (0.0), overriding cell fill. This naturally draws outlines at all depth levels.

---

## Task 1: Create directory structure and definition.js

**Files:**
- Create: `shaders/effects/synth/subdivide/definition.js`
- Create: `shaders/effects/synth/subdivide/glsl/` (directory)
- Create: `shaders/effects/synth/subdivide/wgsl/` (directory)

**Step 1:** Create directories:
```bash
mkdir -p shaders/effects/synth/subdivide/glsl shaders/effects/synth/subdivide/wgsl
```

**Step 2:** Write definition.js following the `rd` pattern for optional texture input:

```js
import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Subdivide",
  namespace: "synth",
  func: "subdivide",
  tags: ["geometric", "pattern"],

  description: "Recursive grid subdivision with shapes",
  globals: {
    tex: {
      type: "surface",
      default: "none",
      ui: {
        label: "texture",
        category: "input"
      }
    },
    mode: {
      type: "int",
      default: 0,
      uniform: "mode",
      choices: {
        binary: 0,
        quad: 1
      },
      ui: {
        label: "mode",
        control: "dropdown"
      }
    },
    depth: {
      type: "int",
      default: 4,
      uniform: "depth",
      min: 1,
      max: 6,
      ui: {
        label: "depth",
        control: "slider"
      }
    },
    density: {
      type: "float",
      default: 50,
      uniform: "density",
      min: 0,
      max: 100,
      ui: {
        label: "density",
        control: "slider"
      }
    },
    seed: {
      type: "int",
      default: 1,
      uniform: "seed",
      min: 1,
      max: 100,
      ui: {
        label: "seed",
        control: "slider"
      }
    },
    fill: {
      type: "int",
      default: 0,
      uniform: "fill",
      choices: {
        solid: 0,
        circle: 1,
        diamond: 2,
        square: 3,
        triangle: 4,
        arc: 5,
        mixed: 6
      },
      ui: {
        label: "fill",
        control: "dropdown"
      }
    },
    outline: {
      type: "float",
      default: 0,
      uniform: "outline",
      min: 0,
      max: 10,
      ui: {
        label: "outline",
        control: "slider"
      }
    },
    inputMix: {
      type: "float",
      default: 0,
      uniform: "inputMix",
      min: 0,
      max: 100,
      ui: {
        label: "input mix",
        control: "slider",
        category: "input",
        enabledBy: { param: "tex", neq: "none" }
      }
    }
  },
  passes: [
    {
      name: "render",
      program: "subdivide",
      inputs: {
        inputTex: "tex"
      },
      outputs: {
        fragColor: "outputTex"
      }
    }
  ]
})
```

**Step 3:** Syntax check:
```bash
node --check shaders/effects/synth/subdivide/definition.js
```

---

## Task 2: Write GLSL shader

**Files:**
- Create: `shaders/effects/synth/subdivide/glsl/subdivide.glsl`

**Step 1:** Write the complete shader:

```glsl
/*
 * Recursive grid subdivision with shapes
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float mode;
uniform float depth;
uniform float density;
uniform float seed;
uniform float fill;
uniform float outline;
uniform float inputMix;

out vec4 fragColor;

const float PI = 3.14159265359;

float hash(vec2 p, float s) {
    return fract(sin(dot(p + s, vec2(127.1, 311.7))) * 43758.5453);
}

float hash2(vec2 p, float s) {
    return fract(sin(dot(p + s, vec2(269.5, 183.3))) * 43758.5453);
}

// Shape SDF-style functions (return 1.0 inside shape, 0.0 outside)
float circleShape(vec2 centered) {
    return step(length(centered), 0.4);
}

float diamondShape(vec2 centered) {
    return step(abs(centered.x) + abs(centered.y), 0.4);
}

float squareShape(vec2 centered) {
    return step(max(abs(centered.x), abs(centered.y)), 0.35);
}

float triangleShape(vec2 centered) {
    // Equilateral triangle pointing up
    vec2 p = centered;
    p.y -= 0.15;
    float d = max(abs(p.x) * 0.866 + p.y * 0.5, -p.y);
    return step(d, 0.3);
}

float arcShape(vec2 cellUv, float h) {
    // Quarter circle in a corner chosen by hash
    int corner = int(h * 4.0);
    vec2 origin;
    if (corner == 0) origin = vec2(0.0, 0.0);
    else if (corner == 1) origin = vec2(1.0, 0.0);
    else if (corner == 2) origin = vec2(0.0, 1.0);
    else origin = vec2(1.0, 1.0);
    float dist = length(cellUv - origin);
    return step(dist, 0.7) * (1.0 - step(dist, 0.5));
}

float drawShape(int shapeType, vec2 cellUv, vec2 centered, float h) {
    if (shapeType == 0) return 1.0;  // solid
    if (shapeType == 1) return circleShape(centered);
    if (shapeType == 2) return diamondShape(centered);
    if (shapeType == 3) return squareShape(centered);
    if (shapeType == 4) return triangleShape(centered);
    if (shapeType == 5) return arcShape(cellUv, h);
    return 1.0;
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 resolution = vec2(texSize);
    vec2 st = gl_FragCoord.xy / resolution;

    int maxDepth = int(depth);
    float dens = density / 100.0;
    float seedF = float(int(seed));
    int fillType = int(fill);
    int modeType = int(mode);
    float outlineWidth = outline / resolution.y;  // in UV space

    // Subdivision loop
    vec2 cellMin = vec2(0.0);
    vec2 cellMax = vec2(1.0);
    bool isOutline = false;

    for (int level = 0; level < 6; level++) {
        if (level >= maxDepth) break;

        float h = hash(cellMin * 100.0 + float(level), seedF);

        if (h < dens) {
            if (modeType == 0) {
                // Binary: pick horizontal or vertical
                float dir = hash2(cellMin * 100.0 + float(level), seedF);

                if (dir < 0.5) {
                    // Horizontal split
                    float mid = (cellMin.y + cellMax.y) * 0.5;
                    float distToSplit = abs(st.y - mid);
                    if (distToSplit < outlineWidth) isOutline = true;

                    if (st.y < mid) cellMax.y = mid;
                    else cellMin.y = mid;
                } else {
                    // Vertical split
                    float mid = (cellMin.x + cellMax.x) * 0.5;
                    float distToSplit = abs(st.x - mid);
                    if (distToSplit < outlineWidth) isOutline = true;

                    if (st.x < mid) cellMax.x = mid;
                    else cellMin.x = mid;
                }
            } else {
                // Quad: split both axes
                vec2 mid = (cellMin + cellMax) * 0.5;
                float distX = abs(st.x - mid.x);
                float distY = abs(st.y - mid.y);
                if (distX < outlineWidth || distY < outlineWidth) isOutline = true;

                if (st.x < mid.x) cellMax.x = mid.x;
                else cellMin.x = mid.x;
                if (st.y < mid.y) cellMax.y = mid.y;
                else cellMin.y = mid.y;
            }
        }
    }

    // Compute cell properties
    vec2 cellSize = cellMax - cellMin;
    vec2 cellUv = (st - cellMin) / cellSize;

    // Aspect-correct for shapes
    float cellAspect = (cellSize.x * resolution.x) / (cellSize.y * resolution.y);
    vec2 centered = cellUv - 0.5;
    centered.x *= cellAspect;

    // Pick gray shade (4 levels)
    float shadeHash = hash(cellMin * 100.0, seedF + 17.0);
    int shadeIdx = int(shadeHash * 4.0);
    float shade;
    if (shadeIdx == 0) shade = 0.1;
    else if (shadeIdx == 1) shade = 0.4;
    else if (shadeIdx == 2) shade = 0.7;
    else shade = 1.0;

    // Pick shape (for mixed mode)
    int shapeType = fillType;
    if (fillType == 6) {
        float shapeHash = hash(cellMin * 100.0, seedF + 31.0);
        shapeType = int(shapeHash * 6.0);  // 0-5
    }

    // Draw shape
    float cornerHash = hash2(cellMin * 100.0, seedF + 43.0);
    float shapeMask = drawShape(shapeType, cellUv, centered, cornerHash);
    float color = shade * shapeMask;

    // Outline
    if (isOutline && outline > 0.0) {
        color = 0.0;
    }

    vec3 result = vec3(color);

    // Input texture blend
    float blend = inputMix / 100.0;
    if (blend > 0.0) {
        vec2 inputUv = st;
        inputUv.y = 1.0 - inputUv.y;
        vec3 inputColor = texture(inputTex, inputUv).rgb;
        result = mix(result, inputColor, blend);
    }

    fragColor = vec4(result, 1.0);
}
```

**Step 2:** Review shader for correctness — verify hash produces different values per cell, shapes render within cells, outlines appear at all levels.

---

## Task 3: Write WGSL shader

**Files:**
- Create: `shaders/effects/synth/subdivide/wgsl/subdivide.wgsl`

**Step 1:** Write the WGSL shader. Same logic as GLSL, adapted to WGSL syntax:

```wgsl
/*
 * Recursive grid subdivision with shapes
 */

struct Uniforms {
    mode: f32,
    depth: f32,
    density: f32,
    seed: f32,
    fill: f32,
    outline: f32,
    inputMix: f32,
    _pad0: f32,
}

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u: Uniforms;

const PI: f32 = 3.14159265359;

fn hash(p: vec2<f32>, s: f32) -> f32 {
    return fract(sin(dot(p + s, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn hash2(p: vec2<f32>, s: f32) -> f32 {
    return fract(sin(dot(p + s, vec2<f32>(269.5, 183.3))) * 43758.5453);
}

fn circleShape(centered: vec2<f32>) -> f32 {
    return step(length(centered), 0.4);
}

fn diamondShape(centered: vec2<f32>) -> f32 {
    return step(abs(centered.x) + abs(centered.y), 0.4);
}

fn squareShape(centered: vec2<f32>) -> f32 {
    return step(max(abs(centered.x), abs(centered.y)), 0.35);
}

fn triangleShape(centered: vec2<f32>) -> f32 {
    var p = centered;
    p.y = p.y - 0.15;
    let d = max(abs(p.x) * 0.866 + p.y * 0.5, -p.y);
    return step(d, 0.3);
}

fn arcShape(cellUv: vec2<f32>, h: f32) -> f32 {
    let corner = i32(h * 4.0);
    var origin: vec2<f32>;
    if (corner == 0) { origin = vec2<f32>(0.0, 0.0); }
    else if (corner == 1) { origin = vec2<f32>(1.0, 0.0); }
    else if (corner == 2) { origin = vec2<f32>(0.0, 1.0); }
    else { origin = vec2<f32>(1.0, 1.0); }
    let dist = length(cellUv - origin);
    return step(dist, 0.7) * (1.0 - step(dist, 0.5));
}

fn drawShape(shapeType: i32, cellUv: vec2<f32>, centered: vec2<f32>, h: f32) -> f32 {
    if (shapeType == 0) { return 1.0; }
    if (shapeType == 1) { return circleShape(centered); }
    if (shapeType == 2) { return diamondShape(centered); }
    if (shapeType == 3) { return squareShape(centered); }
    if (shapeType == 4) { return triangleShape(centered); }
    if (shapeType == 5) { return arcShape(cellUv, h); }
    return 1.0;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let resolution = texSize;
    let st = pos.xy / resolution;

    let maxDepth = i32(u.depth);
    let dens = u.density / 100.0;
    let seedF = f32(i32(u.seed));
    let fillType = i32(u.fill);
    let modeType = i32(u.mode);
    let outlineWidth = u.outline / resolution.y;

    // Subdivision loop
    var cellMin = vec2<f32>(0.0);
    var cellMax = vec2<f32>(1.0);
    var isOutline = false;

    for (var level = 0; level < 6; level = level + 1) {
        if (level >= maxDepth) { break; }

        let h = hash(cellMin * 100.0 + f32(level), seedF);

        if (h < dens) {
            if (modeType == 0) {
                // Binary: pick horizontal or vertical
                let dir = hash2(cellMin * 100.0 + f32(level), seedF);

                if (dir < 0.5) {
                    // Horizontal split
                    let mid = (cellMin.y + cellMax.y) * 0.5;
                    let distToSplit = abs(st.y - mid);
                    if (distToSplit < outlineWidth) { isOutline = true; }

                    if (st.y < mid) { cellMax.y = mid; }
                    else { cellMin.y = mid; }
                } else {
                    // Vertical split
                    let mid = (cellMin.x + cellMax.x) * 0.5;
                    let distToSplit = abs(st.x - mid);
                    if (distToSplit < outlineWidth) { isOutline = true; }

                    if (st.x < mid) { cellMax.x = mid; }
                    else { cellMin.x = mid; }
                }
            } else {
                // Quad: split both axes
                let mid = (cellMin + cellMax) * 0.5;
                let distX = abs(st.x - mid.x);
                let distY = abs(st.y - mid.y);
                if (distX < outlineWidth || distY < outlineWidth) { isOutline = true; }

                if (st.x < mid.x) { cellMax.x = mid.x; }
                else { cellMin.x = mid.x; }
                if (st.y < mid.y) { cellMax.y = mid.y; }
                else { cellMin.y = mid.y; }
            }
        }
    }

    // Compute cell properties
    let cellSize = cellMax - cellMin;
    let cellUv = (st - cellMin) / cellSize;

    // Aspect-correct for shapes
    let cellAspect = (cellSize.x * resolution.x) / (cellSize.y * resolution.y);
    var centered = cellUv - 0.5;
    centered.x = centered.x * cellAspect;

    // Pick gray shade (4 levels)
    let shadeHash = hash(cellMin * 100.0, seedF + 17.0);
    let shadeIdx = i32(shadeHash * 4.0);
    var shade: f32;
    if (shadeIdx == 0) { shade = 0.1; }
    else if (shadeIdx == 1) { shade = 0.4; }
    else if (shadeIdx == 2) { shade = 0.7; }
    else { shade = 1.0; }

    // Pick shape (for mixed mode)
    var shapeType = fillType;
    if (fillType == 6) {
        let shapeHash = hash(cellMin * 100.0, seedF + 31.0);
        shapeType = i32(shapeHash * 6.0);
    }

    // Draw shape
    let cornerHash = hash2(cellMin * 100.0, seedF + 43.0);
    let shapeMask = drawShape(shapeType, cellUv, centered, cornerHash);
    var color = shade * shapeMask;

    // Outline
    if (isOutline && u.outline > 0.0) {
        color = 0.0;
    }

    var result = vec3<f32>(color);

    // Input texture blend
    let blend = u.inputMix / 100.0;
    if (blend > 0.0) {
        var inputUv = st;
        inputUv.y = 1.0 - inputUv.y;
        let inputColor = textureSample(inputTex, samp, inputUv).rgb;
        result = mix(result, inputColor, blend);
    }

    return vec4<f32>(result, 1.0);
}
```

**Step 2:** Verify uniform struct matches definition.js order, check alignment (7 params + 1 pad = 32 bytes).

---

## Task 4: Write help.md

**Files:**
- Create: `shaders/effects/synth/subdivide/help.md`

```markdown
# subdivide

Recursive grid subdivision with shapes

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | - | Optional texture input |
| mode | int | binary | binary/quad | Subdivision type |
| depth | int | 4 | 1-6 | Max subdivision levels |
| density | float | 50 | 0-100 | Subdivision probability |
| seed | int | 1 | 1-100 | Random seed |
| fill | int | solid | solid/circle/diamond/square/triangle/arc/mixed | Cell fill shape |
| outline | float | 0 | 0-10 | Grid line width in pixels |
| inputMix | float | 0 | 0-100 | Blend with input texture |
```

---

## Task 5: Verify

**Step 1:** Syntax check:
```bash
node --check shaders/effects/synth/subdivide/definition.js
```

**Step 2:** Verify consistency:
- Uniform names in definition.js match GLSL uniform declarations and WGSL struct fields
- All fill types (0-6) handled in drawShape in both shaders
- Both mode types (0-1) handled in subdivision loop
- Hash function produces different values for: split decision, split direction, shade, shape, arc corner
- Outline check happens at every subdivision level
- Input texture sampling flips Y coordinate (matching rd pattern)
- WGSL struct alignment: 8 fields × 4 bytes = 32 bytes (16-byte aligned, no extra padding needed)
