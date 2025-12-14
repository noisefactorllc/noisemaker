# Agent Workflow Guide

This guide shows how a coding agent should use the MCP shader tools during development.

## Typical Workflow

### 1. After Modifying a Shader

```
Agent: [edits shaders/effects/synth/noise/definition.js]

Agent: Let me verify the shader compiles...
→ compileEffect({ effect_id: "synth/noise", backend: "webgl2" })

Response:
{
  "effect_id": "synth/noise",
  "backend": "webgl2",
  "success": true,
  "passes": [{ "pass_id": "main", "compiled": true, "errors": [] }],
  "console_errors": []
}

Agent: Compilation successful. Let me check the visual output...
→ renderEffectFrame({ effect_id: "synth/noise", backend: "webgl2" })

Response:
{
  "effect_id": "synth/noise",
  "backend": "webgl2",
  "success": true,
  "metrics": {
    "is_monochrome": false,
    "unique_sampled_colors": 847,
    "luma_variance": 5312.4
  },
  "console_errors": []
}

Agent: The shader produces varied visual output. Done.
```

### 2. Debugging a Broken Shader

```
Agent: [edits shader, introduces syntax error]
→ compileEffect({ effect_id: "synth/noise", backend: "webgl2" })

Response:
{
  "effect_id": "synth/noise",
  "backend": "webgl2",
  "success": false,
  "passes": [{
    "pass_id": "main",
    "compiled": false,
    "errors": ["unexpected token at line 42"]
  }],
  "console_errors": []
}

Agent: Syntax error on line 42. Let me fix that...
[fixes the error]
→ compileEffect({ effect_id: "synth/noise", backend: "webgl2" })

Response:
{
  "success": true
}
```

### 3. Investigating Visual Issues

```
Agent: The shader compiles but something looks wrong...
→ describeEffectFrame({
    effect_id: "synth/noise",
    backend: "webgl2",
    prompt: "Does this look like smooth gradient noise? Are there any artifacts?"
  })

Response:
{
  "effect_id": "synth/noise",
  "backend": "webgl2",
  "success": true,
  "description": "The image shows blocky, pixelated noise rather than smooth gradients. There appear to be banding artifacts in the color transitions.",
  "tags": ["noise", "pixelated", "banding", "artifact"],
  "notes": "The noise appears to be using nearest-neighbor sampling instead of linear interpolation.",
  "console_errors": []
}

Agent: Ah, I need to fix the texture sampling mode...
```

### 4. Performance Verification

```
Agent: Let me verify performance on this complex effect...
→ benchmarkEffectFPS({
    effect_id: "classicNoisedeck/physarum",
    backend: "webgl2",
    target_fps: 60,
    duration_seconds: 3
  })

Response:
{
  "effect_id": "classicNoisedeck/physarum",
  "backend": "webgl2",
  "success": true,
  "target_fps": 60,
  "achieved_fps": 58.5,
  "meets_target": false,
  "frame_times": {
    "min_ms": 14.2,
    "max_ms": 21.3,
    "avg_ms": 17.1,
    "p95_ms": 19.2
  },
  "total_frames": 175,
  "duration_seconds": 3,
  "console_errors": []
}

Agent: Slightly below 60fps. The p95 shows some frame spikes. 
       Let me optimize the inner loop...
```

### 5. Verifying Uniform Controls Work

```
Agent: The controls don't seem to be affecting the output...
→ testUniformResponsiveness({ effect_id: "classicNoisemaker/worms", backend: "webgl2" })

Response:
{
  "effect_id": "classicNoisemaker/worms",
  "backend": "webgl2",
  "success": false,
  "uniforms_tested": 3,
  "responsive_uniforms": [],
  "unresponsive_uniforms": ["stride", "kink", "lifetime"],
  "console_errors": []
}

Agent: None of the uniforms are working. Let me check if the 
       effect definition has `uniform:` mappings in the globals...
[checks definition.js, finds missing uniform: properties]

Agent: I need to add uniform: "uniformName" to each global...
[fixes definition.js]
→ testUniformResponsiveness({ effect_id: "classicNoisemaker/worms", backend: "webgl2" })

Response:
{
  "effect_id": "classicNoisemaker/worms",
  "backend": "webgl2",
  "success": true,
  "uniforms_tested": 3,
  "responsive_uniforms": ["stride", "kink", "lifetime"],
  "unresponsive_uniforms": [],
  "console_errors": []
}

Agent: All uniforms now affect the output correctly.
```

### 6. Checking Shader Organization

```
Agent: Let me verify the effect structure follows conventions...
→ checkEffectStructure({ effect_id: "classicNoisemaker/worms" })

Response:
{
  "effect_id": "classicNoisemaker/worms",
  "success": true,
  "issues": [],
  "summary": {
    "total_issues": 0,
    "errors": 0,
    "warnings": 0
  }
}

Agent: Structure looks good - no inline shaders, proper naming, 
       no unused files.
```

### 7. Verifying GLSL/WGSL Equivalence

```
Agent: Let me verify GLSL and WGSL produce equivalent results...
→ checkAlgEquiv({ effect_id: "classicNoisemaker/worms" })

Response:
{
  "effect_id": "classicNoisemaker/worms",
  "success": true,
  "pairs_checked": 2,
  "equivalent_pairs": 2,
  "divergent_pairs": [],
  "notes": "All shader pairs implement equivalent algorithms"
}

Agent: Both GLSL and WGSL implementations are algorithmically equivalent.
```

### 8. Verifying Filter Effects Modify Input

```
Agent: Let me verify this filter actually modifies its input...
→ testNoPassthrough({ effect_id: "classicNoisemaker/sobel", backend: "webgl2" })

Response:
{
  "effect_id": "classicNoisemaker/sobel",
  "backend": "webgl2",
  "success": true,
  "is_passthrough": false,
  "similarity_percent": 23.4,
  "console_errors": []
}

Agent: Good - the filter produces 76% difference from input.
```

## Decision Tree

```
Start: Agent modifies a shader file
          │
          ▼
    ┌─────────────┐
    │ compile     │───── error ────▶ Fix syntax/semantic errors
    │ Effect      │                         │
    └─────────────┘                         │
          │ ok                              │
          ▼                                 │
    ┌─────────────┐                         │
    │ render      │───── monochrome ──▶ Fix rendering logic
    │ EffectFrame │                         │
    └─────────────┘                         │
          │ varied output                   │
          ▼                                 │
    ┌─────────────┐                         │
    │ Visual      │───── issues ──────▶ describeEffectFrame
    │ OK?         │                    then fix based on feedback
    └─────────────┘                         │
          │ yes                             │
          ▼                                 │
    ┌─────────────┐                         │
    │ Performance │───── too slow ────▶ Optimize, then
    │ critical?   │                    benchmarkEffectFPS
    └─────────────┘                         │
          │ no/ok                           │
          ▼                                 │
        Done ◀───────────────────────────────
```

## Tool Selection Guide

| Situation | Tool to Use |
|-----------|-------------|
| Just edited shader code | `compileEffect` |
| Shader compiles, need to verify output | `renderEffectFrame` |
| Output looks wrong, need diagnosis | `describeEffectFrame` |
| Complex effect, need perf check | `benchmarkEffectFPS` |
| Controls not affecting output | `testUniformResponsiveness` |
| Check file organization & naming | `checkEffectStructure` |
| Verify GLSL/WGSL produce same results | `checkAlgEquiv` |
| Verify filter modifies input | `testNoPassthrough` |
| Rebuild shader manifest | `generateShaderManifest` |
| Run ALL validation tests | Test harness with `--all` flag |
| Quick sanity check | `compileEffect` only |

## Best Practices

1. **Always compile first** - Don't render if it won't compile
2. **Check metrics** - `is_monochrome: true` usually means a bug
3. **Use vision sparingly** - It's slower and costs API credits
4. **Benchmark at the end** - Only after correctness is verified
5. **Trust the numbers** - `unique_sampled_colors < 10` is suspicious
6. **Always specify backend** - Every browser-based tool requires it

## When to Use Vision

The `describeEffectFrame` tool calls OpenAI's GPT-4o vision model. Use it when:

- **Metrics look OK but you're unsure about quality** - "Is this actually noise or just random garbage?"
- **Debugging subtle visual bugs** - "Are there banding artifacts in the gradients?"
- **Verifying expected patterns** - "Does this look like a Voronoi diagram?"
- **Checking for regressions** - "Does this match what the effect should produce?"

**Don't use it for:**
- Compilation errors (use `compileEffect`)
- Blank/monochrome detection (use `renderEffectFrame` metrics)
- Performance issues (use `benchmarkEffectFPS`)

**Cost consideration:** Each vision call costs ~$0.01-0.03 depending on image size. The tool is conditional on having an API key in `.openai` file.

## Effect ID Format

Effect IDs match the directory structure under `shaders/effects/`:

```
synth/noise      → shaders/effects/synth/noise/
filter/solid      → shaders/effects/filter/solid/
nd/physarum       → shaders/effects/nd/physarum/
nm/worms          → shaders/effects/nm/worms/
```

## CLI Examples

```bash
# Basic compile + render + vision check
node test-harness.js --effects synth/noise --backend webgl2

# Multiple effects with glob pattern
node test-harness.js --effects "synth/*" --webgl2 --benchmark

# All tests on WebGPU
node test-harness.js --effects "classicNoisemaker/*" --webgpu --all

# Structure check (on-disk, no browser)
node test-harness.js --effects "classicNoisemaker/worms" --structure
```
