# Tool Reference

Complete API documentation for the Noisemaker shader MCP tools.

## Overview

The tools are organized into two categories:

### Browser-Based Tools

These tools launch a fresh browser session for each invocation:

| Tool | Purpose |
|------|---------|
| `compileEffect` | Verify shader compiles cleanly |
| `renderEffectFrame` | Render frame, check for monochrome output |
| `runDslProgram` | Compile and run arbitrary DSL code, return metrics |
| `describeEffectFrame` | AI vision analysis of rendered output |
| `benchmarkEffectFPS` | Measure sustained framerate |
| `testUniformResponsiveness` | Verify uniform controls affect output |
| `testNoPassthrough` | Verify filter effects modify input |

### On-Disk Tools

These tools run without a browser:

| Tool | Purpose |
|------|---------|
| `checkEffectStructure` | Detect unused files, naming issues, leaked uniforms |
| `checkAlgEquiv` | Compare GLSL/WGSL algorithmic equivalence |
| `generateShaderManifest` | Rebuild shader manifest from disk |

---

## compileEffect

Compile a shader effect and verify it compiles cleanly. Returns detailed pass-level diagnostics.

### Input Schema

```json
{
  "effect_id": "string (required)",
  "backend": "string (required): 'webgl2' | 'webgpu'"
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `effect_id` | string | Yes | Effect identifier (e.g., `"synth/noise"`, `"classicNoisemaker/worms"`) |
| `backend` | string | Yes | Rendering backend: `"webgl2"` or `"webgpu"` |

### Output Schema

```json
{
  "effect_id": "string",
  "backend": "string",
  "success": "boolean",
  "passes": [
    {
      "pass_id": "string",
      "compiled": "boolean",
      "errors": ["string"]
    }
  ],
  "console_errors": ["string"]
}
```

### Example

**Request:**
```json
{
  "effect_id": "synth/noise",
  "backend": "webgl2"
}
```

**Response:**
```json
{
  "effect_id": "synth/noise",
  "backend": "webgl2",
  "success": true,
  "passes": [
    {
      "pass_id": "main",
      "compiled": true,
      "errors": []
    }
  ],
  "console_errors": []
}
```

---

## renderEffectFrame

Render a single frame of a shader effect and analyze if the output is monochrome/blank. Returns image metrics and a captured frame.

### Input Schema

```json
{
  "effect_id": "string (required)",
  "backend": "string (required): 'webgl2' | 'webgpu'",
  "test_case": {
    "time": "number (optional)",
    "resolution": "[number, number] (optional)",
    "seed": "number (optional)",
    "uniforms": "object (optional)"
  }
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `effect_id` | string | Yes | Effect identifier |
| `backend` | string | Yes | Rendering backend: `"webgl2"` or `"webgpu"` |
| `test_case` | object | No | Test configuration |
| `test_case.time` | number | No | Time value to render at |
| `test_case.resolution` | [number, number] | No | Resolution [width, height] |
| `test_case.seed` | number | No | Random seed for reproducibility |
| `test_case.uniforms` | object | No | Uniform value overrides |

### Output Schema

```json
{
  "effect_id": "string",
  "backend": "string",
  "success": "boolean",
  "metrics": {
    "mean_rgb": "[number, number, number]",
    "std_rgb": "[number, number, number]",
    "luma_variance": "number",
    "unique_sampled_colors": "number",
    "is_monochrome": "boolean"
  },
  "console_errors": ["string"],
  "frame_base64": "string (PNG image)"
}
```

### Metrics Explained

| Metric | Description |
|--------|-------------|
| `mean_rgb` | Average RGB values [0-255] across the image |
| `std_rgb` | Standard deviation of RGB values |
| `luma_variance` | Variance in luminance (higher = more contrast) |
| `unique_sampled_colors` | Number of unique colors in sampled pixels |
| `is_monochrome` | True if output appears to be a single color |

### Example

**Request:**
```json
{
  "effect_id": "synth/noise",
  "backend": "webgl2",
  "test_case": {
    "time": 1.0,
    "resolution": [512, 512]
  }
}
```

**Response:**
```json
{
  "effect_id": "synth/noise",
  "backend": "webgl2",
  "success": true,
  "metrics": {
    "mean_rgb": [127.3, 127.8, 128.1],
    "std_rgb": [73.2, 73.5, 73.1],
    "luma_variance": 5312.4,
    "unique_sampled_colors": 847,
    "is_monochrome": false
  },
  "console_errors": [],
  "frame_base64": "iVBORw0KGgo..."
}
```

---

## runDslProgram

Compile and run an arbitrary DSL program, rendering a single frame and returning image metrics. Use this to test custom DSL compositions without pre-defined effects.

### Input Schema

```json
{
  "dsl": "string (required)",
  "backend": "string (required): 'webgl2' | 'webgpu'",
  "test_case": {
    "time": "number (optional)",
    "resolution": "[number, number] (optional)",
    "seed": "number (optional)",
    "uniforms": "object (optional)"
  }
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dsl` | string | Yes | DSL source code to compile and run (e.g., `"noise().write(o0)"`) |
| `backend` | string | Yes | Rendering backend: `"webgl2"` or `"webgpu"` |
| `test_case` | object | No | Test configuration |
| `test_case.time` | number | No | Time value to render at |
| `test_case.resolution` | [number, number] | No | Resolution [width, height] |
| `test_case.seed` | number | No | Random seed for reproducibility |
| `test_case.uniforms` | object | No | Uniform value overrides |

### Output Schema

```json
{
  "dsl": "string",
  "backend": "string",
  "status": "'ok' | 'error'",
  "frame": {
    "width": "number",
    "height": "number"
  },
  "metrics": {
    "mean_rgb": "[number, number, number]",
    "std_rgb": "[number, number, number]",
    "luma_variance": "number",
    "unique_sampled_colors": "number",
    "is_monochrome": "boolean",
    "is_essentially_blank": "boolean"
  },
  "passes": [
    {
      "id": "string",
      "status": "'ok' | 'error'"
    }
  ],
  "console_errors": ["string"],
  "error": "string (if status is 'error')"
}
```

### Example

**Request:**
```json
{
  "dsl": "noise(scale: 5).posterize(levels: 4).write(o0)",
  "backend": "webgl2"
}
```

**Response:**
```json
{
  "dsl": "noise(scale: 5).posterize(levels: 4).write(o0)",
  "backend": "webgl2",
  "status": "ok",
  "frame": {
    "width": 1280,
    "height": 720
  },
  "metrics": {
    "mean_rgb": [0.45, 0.52, 0.48],
    "std_rgb": [0.28, 0.31, 0.29],
    "luma_variance": 0.082,
    "unique_sampled_colors": 16,
    "is_monochrome": false,
    "is_essentially_blank": false
  },
  "passes": [
    { "id": "node_0_pass_0", "status": "ok" },
    { "id": "node_1_pass_0", "status": "ok" }
  ],
  "console_errors": []
}
```

### Use Cases

- **Testing compositions**: Verify that chained effects work together correctly
- **Debugging**: Test specific DSL code snippets without creating effect definitions
- **Validating DSL syntax**: Quick syntax and compilation checks for DSL code
- **Ad-hoc experiments**: Run custom shader pipelines for exploration

---

## describeEffectFrame

Render a frame and get an AI vision description. Uses OpenAI GPT-4 Vision to analyze the rendered output.

### Input Schema

```json
{
  "effect_id": "string (required)",
  "backend": "string (required): 'webgl2' | 'webgpu'",
  "prompt": "string (required)",
  "test_case": {
    "time": "number (optional)",
    "resolution": "[number, number] (optional)",
    "seed": "number (optional)",
    "uniforms": "object (optional)"
  }
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `effect_id` | string | Yes | Effect identifier |
| `backend` | string | Yes | Rendering backend: `"webgl2"` or `"webgpu"` |
| `prompt` | string | Yes | Vision prompt - what to analyze or look for |
| `test_case` | object | No | Test configuration (same as `renderEffectFrame`) |

### Output Schema

```json
{
  "effect_id": "string",
  "backend": "string",
  "success": "boolean",
  "description": "string",
  "tags": ["string"],
  "notes": "string",
  "console_errors": ["string"]
}
```

### Example

**Request:**
```json
{
  "effect_id": "classicNoisemaker/worms",
  "backend": "webgl2",
  "prompt": "Describe the visual pattern and any motion artifacts"
}
```

**Response:**
```json
{
  "effect_id": "classicNoisemaker/worms",
  "backend": "webgl2",
  "success": true,
  "description": "The image shows organic worm-like trails meandering across a dark background. The trails have a gradient coloration from warm yellows to cool blues, creating a bioluminescent effect.",
  "tags": ["organic", "trails", "gradient", "motion"],
  "notes": "No visible artifacts. Pattern appears procedurally generated with smooth curves.",
  "console_errors": []
}
```

### Prerequisites

Requires an OpenAI API key in the `.openai` file at the project root.

---

## benchmarkEffectFPS

Benchmark a shader effect to verify it can sustain a target framerate. Runs the effect for a specified duration and measures frame times, including jitter (frame time variance).

### Input Schema

```json
{
  "effect_id": "string (required)",
  "backend": "string (required): 'webgl2' | 'webgpu'",
  "target_fps": "number (default: 60)",
  "duration_seconds": "number (default: 5)",
  "resolution": "[number, number] (optional)"
}
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `effect_id` | string | Yes | - | Effect identifier |
| `backend` | string | Yes | - | Rendering backend |
| `target_fps` | number | No | 60 | Target FPS to achieve |
| `duration_seconds` | number | No | 5 | Duration of benchmark |
| `resolution` | [number, number] | No | [1024, 1024] | Resolution for benchmark |

### Output Schema

```json
{
  "effect_id": "string",
  "backend": "string",
  "success": "boolean",
  "target_fps": "number",
  "achieved_fps": "number",
  "meets_target": "boolean",
  "stats": {
    "frame_count": "number",
    "avg_frame_time_ms": "number",
    "jitter_ms": "number",
    "min_frame_time_ms": "number",
    "max_frame_time_ms": "number"
  },
  "console_errors": ["string"]
}
```

### Jitter Metrics

The `jitter_ms` field reports the standard deviation of frame render times. Lower values indicate smoother animation:

| Jitter (ms) | Quality |
|-------------|---------|
| < 1.0 | Excellent - very smooth |
| 1.0 - 3.0 | Good - minor variation |
| 3.0 - 8.0 | Fair - noticeable stutters |
| > 8.0 | Poor - jerky animation |

### Example

**Request:**
```json
{
  "effect_id": "synth/noise",
  "backend": "webgl2",
  "target_fps": 60,
  "duration_seconds": 3
}
```

**Response:**
```json
{
  "effect_id": "synth/noise",
  "backend": "webgl2",
  "success": true,
  "target_fps": 60,
  "achieved_fps": 59.88,
  "meets_target": true,
  "stats": {
    "frame_count": 180,
    "avg_frame_time_ms": 16.7,
    "jitter_ms": 0.94,
    "min_frame_time_ms": 0.1,
    "max_frame_time_ms": 2.3
  },
  "console_errors": []
}
```

---

## testUniformResponsiveness

Verify that uniform controls affect the visual output. Tests each uniform by rendering at different values and checking for visual differences.

### Input Schema

```json
{
  "effect_id": "string (required)",
  "backend": "string (required): 'webgl2' | 'webgpu'"
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `effect_id` | string | Yes | Effect identifier |
| `backend` | string | Yes | Rendering backend |

### Output Schema

```json
{
  "effect_id": "string",
  "backend": "string",
  "success": "boolean",
  "uniforms_tested": "number",
  "responsive_uniforms": ["string"],
  "unresponsive_uniforms": ["string"],
  "console_errors": ["string"]
}
```

### Example

**Response:**
```json
{
  "effect_id": "classicNoisemaker/worms",
  "backend": "webgl2",
  "success": true,
  "uniforms_tested": 5,
  "responsive_uniforms": ["speed", "count", "length", "thickness"],
  "unresponsive_uniforms": ["unused_param"],
  "console_errors": []
}
```

---

## testNoPassthrough

Test that a filter effect does NOT pass through its input unchanged. Passthrough/no-op/placeholder shaders are strictly forbidden. This test captures both input and output textures on the same frame and computes their similarity.

### Input Schema

```json
{
  "effect_id": "string (required)",
  "backend": "string (required): 'webgl2' | 'webgpu'"
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `effect_id` | string | Yes | Effect identifier |
| `backend` | string | Yes | Rendering backend |

### Output Schema

```json
{
  "effect_id": "string",
  "backend": "string",
  "success": "boolean",
  "is_passthrough": "boolean",
  "similarity_percent": "number",
  "console_errors": ["string"]
}
```

### Behavior

- Fails if textures are >99% similar (indicating passthrough)
- Returns `is_passthrough: true` for effects that don't modify input
- Only meaningful for filter effects (not generators)

### Example

**Response (Passing):**
```json
{
  "effect_id": "classicNoisemaker/sobel",
  "backend": "webgl2",
  "success": true,
  "is_passthrough": false,
  "similarity_percent": 23.4,
  "console_errors": []
}
```

**Response (Failing):**
```json
{
  "effect_id": "classicNoisemaker/broken_filter",
  "backend": "webgl2",
  "success": false,
  "is_passthrough": true,
  "similarity_percent": 99.8,
  "console_errors": []
}
```

---

## checkEffectStructure

Analyze an effect's file structure for common issues: unused shader files, naming convention violations, and leaked/undefined uniforms.

This is an **on-disk tool** - no browser session is required.

### Input Schema

```json
{
  "effect_id": "string (required)"
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `effect_id` | string | Yes | Effect identifier |

### Output Schema

```json
{
  "effect_id": "string",
  "success": "boolean",
  "issues": [
    {
      "type": "string",
      "severity": "string",
      "message": "string",
      "file": "string (optional)"
    }
  ],
  "summary": {
    "total_issues": "number",
    "errors": "number",
    "warnings": "number"
  }
}
```

### Issue Types

| Type | Description |
|------|-------------|
| `unused_file` | Shader file not referenced in definition |
| `missing_file` | Referenced shader file doesn't exist |
| `naming_violation` | File or uniform doesn't follow conventions |
| `leaked_uniform` | Uniform in shader but not in definition |
| `undefined_uniform` | Uniform in definition but not in shader |
| `missing_description` | Effect definition lacks a description field |

### Example

**Response:**
```json
{
  "effect_id": "classicNoisemaker/worms",
  "success": true,
  "issues": [
    {
      "type": "unused_file",
      "severity": "warning",
      "message": "Shader file not referenced in definition",
      "file": "glsl/old_agent.glsl"
    }
  ],
  "summary": {
    "total_issues": 1,
    "errors": 0,
    "warnings": 1
  }
}
```

---

## checkAlgEquiv

Check algorithmic equivalence between GLSL and WGSL shader implementations. Uses AI to compare shader pairs and flag divergent implementations.

This is an **on-disk tool** - no browser session is required.

### Input Schema

```json
{
  "effect_id": "string (required)"
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `effect_id` | string | Yes | Effect identifier |

### Output Schema

```json
{
  "effect_id": "string",
  "success": "boolean",
  "pairs_checked": "number",
  "equivalent_pairs": "number",
  "divergent_pairs": [
    {
      "glsl_file": "string",
      "wgsl_file": "string",
      "differences": "string"
    }
  ],
  "notes": "string"
}
```

### Behavior

- Compares paired GLSL and WGSL shader files
- Only flags truly divergent algorithms, not language-specific syntax
- Uses OpenAI GPT-4 for semantic comparison

### Example

**Response:**
```json
{
  "effect_id": "classicNoisemaker/worms",
  "success": true,
  "pairs_checked": 4,
  "equivalent_pairs": 4,
  "divergent_pairs": [],
  "notes": "All shader pairs implement equivalent algorithms"
}
```

### Prerequisites

Requires an OpenAI API key in the `.openai` file at the project root.

---

## generateShaderManifest

Rebuild the shader manifest file from disk. Scans the effects directory and regenerates the manifest.

This is an **on-disk tool** - no browser session is required.

### Input Schema

```json
{}
```

No parameters required.

### Output Schema

```json
{
  "success": "boolean",
  "manifest_path": "string",
  "effects_found": "number",
  "message": "string"
}
```

### Example

**Response:**
```json
{
  "success": true,
  "manifest_path": "shaders/src/shaderManifest.js",
  "effects_found": 42,
  "message": "Manifest regenerated successfully"
}
```

---

## Error Responses

All tools return errors in a consistent format:

```json
{
  "success": false,
  "error": "string",
  "error_type": "string"
}
```

### Error Types

| Type | Description |
|------|-------------|
| `not_found` | Effect ID doesn't exist |
| `compile_error` | Shader failed to compile |
| `runtime_error` | Error during rendering |
| `timeout` | Operation exceeded time limit |
| `api_error` | External API (OpenAI) error |
| `io_error` | File system error |

---

## CLI Usage

The test harness provides a command-line interface for running tests.

### Required Flags

```bash
# Backend is always required
--backend webgl2    # or --backend webgpu
--webgl2            # shortcut for --backend webgl2
--webgpu            # shortcut for --backend webgpu
--glsl              # alias for --webgl2
--wgsl              # alias for --webgpu
```

### Effect Selection

```bash
--effects <patterns>   # CSV of effect IDs or glob patterns
```

### Test Selection Flags

```bash
--all           # Run ALL optional tests
--benchmark     # Run FPS test
--uniforms      # Test uniform responsiveness
--structure     # Check naming, unused files, leaked uniforms
--alg-equiv     # Check GLSL/WGSL algorithmic equivalence
--passthrough   # Check filter effects don't pass through input
--no-vision     # Skip AI vision validation
```

### Examples

```bash
# Basic compile + render + vision check
node test-harness.js --effects synth/noise --backend webgl2

# Multiple effects with glob pattern
node test-harness.js --effects "synth/*" --webgl2 --benchmark

# All tests on WebGPU
node test-harness.js --effects "classicNoisemaker/*" --webgpu --all

# Multiple specific effects
node test-harness.js --effects "synth/noise,nm/worms" --glsl --uniforms

# Structure check (on-disk, no browser)
node test-harness.js --effects "classicNoisemaker/worms" --structure

# Algorithm equivalence check
node test-harness.js --effects "classicNoisemaker/*" --alg-equiv
```

---

## Best Practices

### For Agents

1. **Always compile first**: Run `compileEffect` before other tests
2. **Check for monochrome**: After rendering, verify `is_monochrome: false`
3. **Use vision sparingly**: `describeEffectFrame` is slow; use for debugging
4. **Run structure checks**: `checkEffectStructure` catches common issues
5. **Test both backends**: Run tests on both `webgl2` and `webgpu`

### Interpreting Results

| Metric | Good Value | Bad Value |
|--------|------------|-----------|
| `is_monochrome` | `false` | `true` |
| `unique_sampled_colors` | > 100 | < 10 |
| `luma_variance` | > 1000 | < 100 |
| `achieved_fps` | ≥ `target_fps` | < `target_fps` |
| `similarity_percent` | < 90 | > 99 |

### Common Issues

| Symptom | Tool to Use | What to Check |
|---------|-------------|---------------|
| Black/white output | `renderEffectFrame` | `is_monochrome`, `mean_rgb` |
| Uniforms not working | `testUniformResponsiveness` | `unresponsive_uniforms` |
| Shader won't compile | `compileEffect` | `passes[].errors` |
| Filter does nothing | `testNoPassthrough` | `is_passthrough` |
| GLSL/WGSL mismatch | `checkAlgEquiv` | `divergent_pairs` |
