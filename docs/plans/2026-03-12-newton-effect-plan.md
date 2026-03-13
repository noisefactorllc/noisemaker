# Newton Effect Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a dedicated Newton fractal shader effect (`synth/newton`) with fractional degree, relaxation parameter, df64 deep zoom, time-driven animation, and pre-baked POI system.

**Architecture:** Single-pass fragment shader. df64 emulated double-precision for coordinate mapping, float32 for Newton iteration. Three grayscale output modes. Animation via sinusoidal parameter sweeps with golden ratio phase decoherence.

**Tech Stack:** GLSL (WebGL2), WGSL (WebGPU), JavaScript (Effect definition)

**Spec:** `docs/plans/2026-03-12-newton-effect-design.md`

---

## Chunk 1: Effect Definition and Validation

### Task 1: Create effect definition

**Files:**
- Create: `shaders/effects/synth/newton/definition.js`

- [ ] **Step 1: Write definition.js**

```javascript
import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
  name: "Newton",
  namespace: "synth",
  func: "newton",
  tags: ["geometric"],

  description: "Newton fractal explorer with fractional degree, deep zoom, and animated parameters",

  uniformLayout: {
    resolution: { slot: 0, components: 'xy' },
    time:       { slot: 0, components: 'z' },
    degree:     { slot: 0, components: 'w' },
    relaxation: { slot: 1, components: 'x' },
    iterations: { slot: 1, components: 'y' },
    tolerance:  { slot: 1, components: 'z' },
    poi:        { slot: 1, components: 'w' },
    centerHiX:  { slot: 2, components: 'x' },
    centerHiY:  { slot: 2, components: 'y' },
    centerLoX:  { slot: 2, components: 'z' },
    centerLoY:  { slot: 2, components: 'w' },
    zoomSpeed:  { slot: 3, components: 'x' },
    zoomDepth:  { slot: 3, components: 'y' },
    degreeSpeed:{ slot: 3, components: 'z' },
    degreeRange:{ slot: 3, components: 'w' },
    relaxSpeed: { slot: 4, components: 'x' },
    relaxRange: { slot: 4, components: 'y' },
    outputMode: { slot: 4, components: 'z' },
    invert:     { slot: 4, components: 'w' }
  },

  globals: {
    degree: {
      type: "float",
      default: 3.0,
      min: 3.0,
      max: 8.0,
      step: 0.01,
      uniform: "degree",
      ui: { label: "degree", control: "slider", category: "fractal", enabledBy: { param: "poi", eq: 0 } }
    },
    relaxation: {
      type: "float",
      default: 1.0,
      min: 0.5,
      max: 2.0,
      step: 0.01,
      uniform: "relaxation",
      ui: { label: "relaxation", control: "slider", category: "fractal" }
    },
    iterations: {
      type: "int",
      default: 100,
      min: 10,
      max: 500,
      uniform: "iterations",
      ui: { label: "iterations", control: "slider", category: "fractal" }
    },
    tolerance: {
      type: "float",
      default: 0.001,
      min: 0.0001,
      max: 0.01,
      step: 0.0001,
      uniform: "tolerance",
      ui: { label: "tolerance", control: "slider", category: "fractal" }
    },
    poi: {
      type: "int",
      default: 0,
      uniform: "poi",
      choices: {
        manual: 0,
        triplePoint3: 1,
        spiralJunction3: 2,
        starCenter5: 3,
        pentaSpiral5: 4,
        hexWeb6: 5,
        octoFlower8: 6
      },
      ui: { label: "point of interest", control: "dropdown", category: "zoom" }
    },
    zoomSpeed: {
      type: "float",
      default: 0.5,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      uniform: "zoomSpeed",
      ui: { label: "zoom speed", control: "slider", category: "zoom" }
    },
    zoomDepth: {
      type: "float",
      default: 10.0,
      min: 1.0,
      max: 15.0,
      step: 0.1,
      uniform: "zoomDepth",
      ui: { label: "zoom depth", control: "slider", category: "zoom" }
    },
    centerX: {
      type: "float",
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.001,
      uniform: "centerHiX",
      ui: {
        label: "center x",
        control: "slider",
        category: "zoom",
        enabledBy: { param: "poi", eq: 0 }
      }
    },
    centerY: {
      type: "float",
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.001,
      uniform: "centerHiY",
      ui: {
        label: "center y",
        control: "slider",
        category: "zoom",
        enabledBy: { param: "poi", eq: 0 }
      }
    },
    degreeSpeed: {
      type: "float",
      default: 0.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      uniform: "degreeSpeed",
      ui: { label: "degree speed", control: "slider", category: "animation", enabledBy: { param: "poi", eq: 0 } }
    },
    degreeRange: {
      type: "float",
      default: 0.0,
      min: 0.0,
      max: 3.0,
      step: 0.01,
      uniform: "degreeRange",
      ui: { label: "degree range", control: "slider", category: "animation", enabledBy: { param: "poi", eq: 0 } }
    },
    relaxSpeed: {
      type: "float",
      default: 0.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      uniform: "relaxSpeed",
      ui: { label: "relax speed", control: "slider", category: "animation" }
    },
    relaxRange: {
      type: "float",
      default: 0.0,
      min: 0.0,
      max: 0.5,
      step: 0.01,
      uniform: "relaxRange",
      ui: { label: "relax range", control: "slider", category: "animation" }
    },
    outputMode: {
      type: "int",
      default: 2,
      uniform: "outputMode",
      choices: {
        iteration: 0,
        rootIndex: 1,
        blended: 2
      },
      ui: { label: "output mode", control: "dropdown", category: "output" }
    },
    invert: {
      type: "boolean",
      default: false,
      uniform: "invert",
      ui: { label: "invert", control: "checkbox", category: "output" }
    }
  },

  openCategories: ["fractal", "zoom"],

  passes: [
    {
      name: "render",
      program: "newton",
      inputs: {},
      outputs: { fragColor: "outputTex" }
    }
  ]
})
```

- [ ] **Step 2: Validate definition with test harness**

Run: `node -e "import('./shaders/effects/synth/newton/definition.js').then(m => { const { EffectHarness } = require('./shaders/tests/harness_effect.js'); /* ... */ })"`

Actually, use MCP to check structure:

Run: `mcp__shade__checkEffectStructure` on `synth/newton`

Expected: Passes validation (name, passes, globals all present with correct types).

- [ ] **Step 3: Commit definition**

```bash
git add shaders/effects/synth/newton/definition.js
git commit -m "feat: add synth/newton effect definition

Newton fractal effect with fractional degree, relaxation, df64 zoom,
animation parameters, and POI system. Grayscale output."
```

---

## Chunk 2: GLSL Shader

### Task 2: Write GLSL shader

**Files:**
- Create: `shaders/effects/synth/newton/glsl/newton.glsl`

- [ ] **Step 1: Write the complete GLSL shader**

```glsl
/*
 * Newton fractal explorer
 *
 * Newton-Raphson root finding for z^n - 1 with:
 * - Continuous fractional degree (3.0-8.0)
 * - Real-valued relaxation (Nova generalization)
 * - df64 emulated double-precision zoom coordinates
 * - Time-driven animation with golden ratio phase decoherence
 * - Pre-baked points of interest
 * - Three grayscale output modes
 */

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform vec2 resolution;
uniform float time;
uniform float degree;
uniform float relaxation;
uniform float iterations;
uniform float tolerance;
uniform float poi;
uniform float centerHiX;
uniform float centerHiY;
uniform float centerLoX;
uniform float centerLoY;
uniform float zoomSpeed;
uniform float zoomDepth;
uniform float degreeSpeed;
uniform float degreeRange;
uniform float relaxSpeed;
uniform float relaxRange;
uniform float outputMode;
uniform float invert;

out vec4 fragColor;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;
const float PHI = 1.6180339887;

// ============================================================================
// df64 emulated double-precision
// ============================================================================

// Knuth two-sum: exact sum of two floats as (hi, lo) pair
vec2 twoSum(float a, float b) {
    float s = a + b;
    float v = s - a;
    float e = (a - (s - v)) + (b - v);
    return vec2(s, e);
}

// df64 addition: (a.hi, a.lo) + (b.hi, b.lo)
vec2 df64Add(vec2 a, vec2 b) {
    vec2 s = twoSum(a.x, b.x);
    s.y += a.y + b.y;
    return twoSum(s.x, s.y);
}

// Dekker split for exact multiplication
vec2 dekkerSplit(float a) {
    float c = 4097.0 * a;
    float ah = c - (c - a);
    return vec2(ah, a - ah);
}

// df64 multiplication: (a.hi, a.lo) * (b.hi, b.lo)
vec2 df64Mul(vec2 a, vec2 b) {
    vec2 sa = dekkerSplit(a.x);
    vec2 sb = dekkerSplit(b.x);
    float p = a.x * b.x;
    float e = ((sa.x * sb.x - p) + sa.x * sb.y + sa.y * sb.x) + sa.y * sb.y;
    e += a.x * b.y + a.y * b.x;
    return twoSum(p, e);
}

// ============================================================================
// Complex number operations
// ============================================================================

vec2 cmul(vec2 a, vec2 b) {
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec2 cdiv(vec2 a, vec2 b) {
    float denom = dot(b, b);
    return vec2(
        (a.x * b.x + a.y * b.y) / denom,
        (a.y * b.x - a.x * b.y) / denom
    );
}

vec2 cpow(vec2 z, float n) {
    float r = length(z);
    if (r < 1e-20) return vec2(0.0);
    float theta = atan(z.y, z.x);
    float rn = pow(r, n);
    return vec2(rn * cos(n * theta), rn * sin(n * theta));
}

// ============================================================================
// Points of interest
// ============================================================================

// POI data: vec4(centerHi.x, centerHi.y, centerLo.x, centerLo.y)
// POI degree and zoom stored separately
struct POIData {
    vec4 center;   // hi.x, hi.y, lo.x, lo.y
    float degree;
    float maxZoom;
};

POIData getPOI(int idx) {
    // 0: manual (not used here)
    if (idx == 1) return POIData(vec4(0.0, 0.0, 0.0, 0.0), 3.0, 14.0);               // triplePoint3: origin
    if (idx == 2) return POIData(vec4(0.25, 0.433, 0.0, 0.0), 3.0, 12.0);             // spiralJunction3: between root 0 and 1
    if (idx == 3) return POIData(vec4(0.0, 0.0, 0.0, 0.0), 5.0, 14.0);               // starCenter5: origin
    if (idx == 4) return POIData(vec4(0.6545, 0.4755, 0.0, 0.0), 5.0, 12.0);          // pentaSpiral5: between root 0 and 1
    if (idx == 5) return POIData(vec4(0.0, 0.0, 0.0, 0.0), 6.0, 14.0);               // hexWeb6: origin
    if (idx == 6) return POIData(vec4(0.0, 0.0, 0.0, 0.0), 8.0, 14.0);               // octoFlower8: origin
    return POIData(vec4(0.0), 3.0, 10.0);
}

// ============================================================================
// Main
// ============================================================================

void main() {
    int maxIter = int(iterations);
    int poiIdx = int(poi);
    int outMode = int(outputMode);
    bool doInvert = invert > 0.5;

    // --- Effective parameters with animation ---

    float effDegree = degree;
    if (degreeSpeed > 0.0 && degreeRange > 0.0) {
        effDegree += degreeRange * sin(time * degreeSpeed * TAU);
        effDegree = clamp(effDegree, 3.0, 8.0);
    }

    float effRelax = relaxation;
    if (relaxSpeed > 0.0 && relaxRange > 0.0) {
        effRelax += relaxRange * sin(time * relaxSpeed * TAU * PHI);
        effRelax = clamp(effRelax, 0.5, 2.0);
    }

    // --- Center and zoom ---

    vec2 cHi, cLo;
    float effZoomDepth = zoomDepth;

    if (poiIdx > 0) {
        POIData p = getPOI(poiIdx);
        cHi = p.center.xy;
        cLo = p.center.zw;
        effDegree = p.degree;
        effZoomDepth = min(zoomDepth, p.maxZoom);
    } else {
        cHi = vec2(centerHiX, centerHiY);
        cLo = vec2(centerLoX, centerLoY);
    }

    float zoomExp = min(time * zoomSpeed, effZoomDepth);
    float zoom = pow(10.0, zoomExp);

    // --- df64 coordinate transform ---

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    uv *= 2.5 / zoom;

    // Add center offset in df64 precision
    vec2 xCoord = df64Add(vec2(cHi.x, cLo.x), vec2(uv.x, 0.0));
    vec2 yCoord = df64Add(vec2(cHi.y, cLo.y), vec2(uv.y, 0.0));

    // Collapse to float32 for iteration
    vec2 z = vec2(xCoord.x + xCoord.y, yCoord.x + yCoord.y);

    // --- Compute roots of z^n - 1 ---

    int numRoots = int(floor(effDegree));
    vec2 roots[8];
    for (int k = 0; k < 8; k++) {
        if (k >= numRoots) break;
        float angle = TAU * float(k) / effDegree;
        roots[k] = vec2(cos(angle), sin(angle));
    }

    // --- Newton iteration ---

    float iter = 0.0;
    int convergedRoot = -1;
    float convergeDist = 1.0;
    float bailout = 1e10 * effRelax;

    for (int n = 0; n < 500; n++) {
        if (n >= maxIter) break;

        // f(z) = z^n - 1
        vec2 zn = cpow(z, effDegree);
        vec2 fz = zn - vec2(1.0, 0.0);

        // f'(z) = n * z^(n-1)
        vec2 fpz = effDegree * cpow(z, effDegree - 1.0);

        // Degenerate derivative guard
        if (dot(fpz, fpz) < 1e-20) break;

        // Newton step: z = z - a * f(z) / f'(z)
        z = z - effRelax * cdiv(fz, fpz);

        // Divergence check
        if (dot(z, z) > bailout) break;

        // Convergence check against all roots
        for (int k = 0; k < 8; k++) {
            if (k >= numRoots) break;
            float d = length(z - roots[k]);
            if (d < tolerance) {
                convergedRoot = k;
                convergeDist = d;
                break;
            }
        }
        if (convergedRoot >= 0) break;

        iter += 1.0;
    }

    // --- Smooth iteration count ---

    float smoothIter = iter;
    if (convergedRoot >= 0 && convergeDist > 0.0 && convergeDist < tolerance) {
        smoothIter = iter - log2(log(convergeDist) / log(tolerance));
    }

    // --- Output mapping ---

    float value = 0.0;
    float maxIterF = float(maxIter);
    float numRootsF = float(numRoots);

    if (outMode == 0) {
        // Iteration count (normalized)
        value = smoothIter / maxIterF;
    } else if (outMode == 1) {
        // Root index
        if (convergedRoot >= 0) {
            value = float(convergedRoot) / numRootsF;
        }
    } else {
        // Blended: root index + iteration modulation
        if (convergedRoot >= 0) {
            value = (float(convergedRoot) + smoothIter / maxIterF) / numRootsF;
        }
    }

    if (doInvert) value = 1.0 - value;

    fragColor = vec4(vec3(value), 1.0);
}
```

- [ ] **Step 2: Compile GLSL with MCP**

Run: `mcp__shade__compileEffect` for `synth/newton` backend `webgl2`

Expected: Compiles without errors.

- [ ] **Step 3: Commit GLSL shader**

```bash
git add shaders/effects/synth/newton/glsl/newton.glsl
git commit -m "feat: add Newton effect GLSL shader

df64 deep zoom, fractional degree Newton-Raphson iteration,
relaxation parameter, animated parameter sweeps, 3 output modes."
```

---

## Chunk 3: WGSL Shader

### Task 3: Write WGSL shader

**Files:**
- Create: `shaders/effects/synth/newton/wgsl/newton.wgsl`

- [ ] **Step 1: Write the complete WGSL shader**

```wgsl
/*
 * Newton fractal explorer (WGSL)
 *
 * Newton-Raphson root finding for z^n - 1 with:
 * - Continuous fractional degree (3.0-8.0)
 * - Real-valued relaxation (Nova generalization)
 * - df64 emulated double-precision zoom coordinates
 * - Time-driven animation with golden ratio phase decoherence
 * - Pre-baked points of interest
 * - Three grayscale output modes
 */

struct Uniforms {
    data: array<vec4<f32>, 5>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;
const PHI: f32 = 1.6180339887;

// ============================================================================
// df64 emulated double-precision
// ============================================================================

fn twoSum(a: f32, b: f32) -> vec2<f32> {
    let s = a + b;
    let v = s - a;
    let e = (a - (s - v)) + (b - v);
    return vec2<f32>(s, e);
}

fn df64Add(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    var s = twoSum(a.x, b.x);
    s.y = s.y + a.y + b.y;
    return twoSum(s.x, s.y);
}

fn dekkerSplit(a: f32) -> vec2<f32> {
    let c = 4097.0 * a;
    let ah = c - (c - a);
    return vec2<f32>(ah, a - ah);
}

fn df64Mul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    let sa = dekkerSplit(a.x);
    let sb = dekkerSplit(b.x);
    let p = a.x * b.x;
    var e = ((sa.x * sb.x - p) + sa.x * sb.y + sa.y * sb.x) + sa.y * sb.y;
    e = e + a.x * b.y + a.y * b.x;
    return twoSum(p, e);
}

// ============================================================================
// Complex number operations
// ============================================================================

fn cmul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

fn cdiv(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    let denom = dot(b, b);
    return vec2<f32>(
        (a.x * b.x + a.y * b.y) / denom,
        (a.y * b.x - a.x * b.y) / denom,
    );
}

fn cpow(z: vec2<f32>, n: f32) -> vec2<f32> {
    let r = length(z);
    if (r < 1e-20) { return vec2<f32>(0.0, 0.0); }
    let theta = atan2(z.y, z.x);
    let rn = pow(r, n);
    return vec2<f32>(rn * cos(n * theta), rn * sin(n * theta));
}

// ============================================================================
// Points of interest
// ============================================================================

struct POIData {
    center: vec4<f32>,
    degree: f32,
    maxZoom: f32,
}

fn getPOI(idx: i32) -> POIData {
    if (idx == 1) { return POIData(vec4<f32>(0.0, 0.0, 0.0, 0.0), 3.0, 14.0); }
    if (idx == 2) { return POIData(vec4<f32>(0.25, 0.433, 0.0, 0.0), 3.0, 12.0); }
    if (idx == 3) { return POIData(vec4<f32>(0.0, 0.0, 0.0, 0.0), 5.0, 14.0); }
    if (idx == 4) { return POIData(vec4<f32>(0.6545, 0.4755, 0.0, 0.0), 5.0, 12.0); }
    if (idx == 5) { return POIData(vec4<f32>(0.0, 0.0, 0.0, 0.0), 6.0, 14.0); }
    if (idx == 6) { return POIData(vec4<f32>(0.0, 0.0, 0.0, 0.0), 8.0, 14.0); }
    return POIData(vec4<f32>(0.0, 0.0, 0.0, 0.0), 3.0, 10.0);
}

// ============================================================================
// Main
// ============================================================================

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    // Unpack uniforms
    let resolution = uniforms.data[0].xy;
    let time = uniforms.data[0].z;
    let degree = uniforms.data[0].w;

    let relaxation = uniforms.data[1].x;
    let iterations = uniforms.data[1].y;
    let toleranceU = uniforms.data[1].z;
    let poiU = uniforms.data[1].w;

    let centerHiX = uniforms.data[2].x;
    let centerHiY = uniforms.data[2].y;
    let centerLoX = uniforms.data[2].z;
    let centerLoY = uniforms.data[2].w;

    let zoomSpeed = uniforms.data[3].x;
    let zoomDepth = uniforms.data[3].y;
    let degreeSpeed = uniforms.data[3].z;
    let degreeRangeU = uniforms.data[3].w;

    let relaxSpeed = uniforms.data[4].x;
    let relaxRangeU = uniforms.data[4].y;
    let outputMode = uniforms.data[4].z;
    let invertU = uniforms.data[4].w;

    let maxIter = i32(iterations);
    let poiIdx = i32(poiU);
    let outMode = i32(outputMode);
    let doInvert = invertU > 0.5;

    // --- Effective parameters with animation ---

    var effDegree = degree;
    if (degreeSpeed > 0.0 && degreeRangeU > 0.0) {
        effDegree = effDegree + degreeRangeU * sin(time * degreeSpeed * TAU);
        effDegree = clamp(effDegree, 3.0, 8.0);
    }

    var effRelax = relaxation;
    if (relaxSpeed > 0.0 && relaxRangeU > 0.0) {
        effRelax = effRelax + relaxRangeU * sin(time * relaxSpeed * TAU * PHI);
        effRelax = clamp(effRelax, 0.5, 2.0);
    }

    // --- Center and zoom ---

    var cHi = vec2<f32>(centerHiX, centerHiY);
    var cLo = vec2<f32>(centerLoX, centerLoY);
    var effZoomDepth = zoomDepth;

    if (poiIdx > 0) {
        let p = getPOI(poiIdx);
        cHi = p.center.xy;
        cLo = p.center.zw;
        effDegree = p.degree;
        effZoomDepth = min(zoomDepth, p.maxZoom);
    }

    let zoomExp = min(time * zoomSpeed, effZoomDepth);
    let zoom = pow(10.0, zoomExp);

    // --- df64 coordinate transform ---

    var uv = (pos.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    uv = uv * (2.5 / zoom);

    let xCoord = df64Add(vec2<f32>(cHi.x, cLo.x), vec2<f32>(uv.x, 0.0));
    let yCoord = df64Add(vec2<f32>(cHi.y, cLo.y), vec2<f32>(uv.y, 0.0));

    var z = vec2<f32>(xCoord.x + xCoord.y, yCoord.x + yCoord.y);

    // --- Compute roots of z^n - 1 ---

    let numRoots = i32(floor(effDegree));
    var roots: array<vec2<f32>, 8>;
    for (var k: i32 = 0; k < 8; k = k + 1) {
        if (k >= numRoots) { break; }
        let angle = TAU * f32(k) / effDegree;
        roots[k] = vec2<f32>(cos(angle), sin(angle));
    }

    // --- Newton iteration ---

    var iter: f32 = 0.0;
    var convergedRoot: i32 = -1;
    var convergeDist: f32 = 1.0;
    let bailout = 1e10 * effRelax;

    for (var n: i32 = 0; n < 500; n = n + 1) {
        if (n >= maxIter) { break; }

        let zn = cpow(z, effDegree);
        let fz = zn - vec2<f32>(1.0, 0.0);
        let fpz = effDegree * cpow(z, effDegree - 1.0);

        if (dot(fpz, fpz) < 1e-20) { break; }

        z = z - effRelax * cdiv(fz, fpz);

        if (dot(z, z) > bailout) { break; }

        for (var k: i32 = 0; k < 8; k = k + 1) {
            if (k >= numRoots) { break; }
            let d = length(z - roots[k]);
            if (d < toleranceU) {
                convergedRoot = k;
                convergeDist = d;
                break;
            }
        }
        if (convergedRoot >= 0) { break; }

        iter = iter + 1.0;
    }

    // --- Smooth iteration count ---

    var smoothIter = iter;
    if (convergedRoot >= 0 && convergeDist > 0.0 && convergeDist < toleranceU) {
        smoothIter = iter - log2(log(convergeDist) / log(toleranceU));
    }

    // --- Output mapping ---

    var value: f32 = 0.0;
    let maxIterF = f32(maxIter);
    let numRootsF = f32(numRoots);

    if (outMode == 0) {
        value = smoothIter / maxIterF;
    } else if (outMode == 1) {
        if (convergedRoot >= 0) {
            value = f32(convergedRoot) / numRootsF;
        }
    } else {
        if (convergedRoot >= 0) {
            value = (f32(convergedRoot) + smoothIter / maxIterF) / numRootsF;
        }
    }

    if (doInvert) { value = 1.0 - value; }

    return vec4<f32>(vec3<f32>(value), 1.0);
}
```

- [ ] **Step 2: Compile WGSL with MCP**

Run: `mcp__shade__compileEffect` for `synth/newton` backend `webgpu`

Expected: Compiles without errors.

- [ ] **Step 3: Commit WGSL shader**

```bash
git add shaders/effects/synth/newton/wgsl/newton.wgsl
git commit -m "feat: add Newton effect WGSL shader

Matching WGSL implementation with packed uniform struct."
```

---

## Chunk 4: Validation, Testing, and Ship

### Task 4: Compile-check both backends

- [ ] **Step 1: Compile GLSL (webgl2)**

Run: `mcp__shade__compileEffect` for `synth/newton` backend `webgl2`

Expected: No errors.

- [ ] **Step 2: Compile WGSL (webgpu)**

Run: `mcp__shade__compileEffect` for `synth/newton` backend `webgpu`

Expected: No errors.

- [ ] **Step 3: Fix any compilation errors**

If errors found, fix in both shaders to maintain parity. Re-compile until both pass.

### Task 5: Render test

- [ ] **Step 1: Render a frame with default parameters**

Run: `mcp__shade__renderEffectFrame` for `synth/newton` with defaults (degree 3, blended output)

Expected: Non-black, non-white frame with visible fractal structure. Grayscale values distributed across 0-1 range.

- [ ] **Step 2: Render with degree 5**

Run: `mcp__shade__renderEffectFrame` for `synth/newton` with `degree=5`

Expected: Five-fold symmetric structure, different from degree 3.

- [ ] **Step 3: Render with relaxation != 1**

Run: `mcp__shade__renderEffectFrame` for `synth/newton` with `relaxation=1.5`

Expected: Modified basin structure, visibly different from relaxation=1.

- [ ] **Step 4: Test each output mode**

Run `mcp__shade__renderEffectFrame` three times with `outputMode=0`, `outputMode=1`, `outputMode=2`.

Expected: Three visually distinct outputs. Mode 0 (iteration) shows gradients at boundaries. Mode 1 (rootIndex) shows flat value bands. Mode 2 (blended) combines both.

### Task 6: Backend parity check

- [ ] **Step 1: Run pixel parity test**

Run: `mcp__shade__testPixelParity` for `synth/newton`

Expected: WebGL2 and WebGPU produce matching output (within floating-point tolerance).

- [ ] **Step 2: Fix any parity issues**

If parity fails, compare shader logic between GLSL and WGSL. Common issues: operator precedence, function argument order, float literal precision.

### Task 7: Generate manifest and run tests

- [ ] **Step 1: Generate shader manifest**

Run: `node shaders/scripts/generate-shader-manifest.mjs`

Expected: `synth/newton` appears in manifest with description and tags.

- [ ] **Step 2: Run JS test suite**

Run: `node scripts/run-js-tests.js --skip-parity`

Expected: All tests pass, including newton effect validation.

- [ ] **Step 3: Final commit**

```bash
git add -A shaders/effects/synth/newton/ shaders/effects/manifest.json
git commit -m "feat: ship synth/newton effect

Newton fractal explorer with fractional degree (3-8), real-valued
relaxation (Nova), df64 deep zoom, time-driven animation, pre-baked
POI, and three grayscale output modes."
```

### Task 8: POI coordinate refinement (deferred)

- [ ] **Step 1: Render at each POI's degree and manually identify interesting zoom targets**

Use `mcp__shade__renderEffectFrame` at different center coordinates to find visually striking boundary locations. Update the POI coordinates in both GLSL and WGSL shaders.

- [ ] **Step 2: Verify POI auto-zoom works**

Render multiple frames with increasing time values and a POI selected to confirm the zoom animation converges on the POI coordinates.

- [ ] **Step 3: Commit refined POIs**

```bash
git add shaders/effects/synth/newton/glsl/newton.glsl shaders/effects/synth/newton/wgsl/newton.wgsl
git commit -m "refine: update Newton POI coordinates from visual testing"
```
