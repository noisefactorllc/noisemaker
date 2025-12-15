# Shader Agent Instructions

This guide is for AI coding agents working on the Noisemaker shader effects collection.

## Quick Reference

| Topic | Guideline |
|-------|-----------|
| Multi-output passes | MRT via `gl.drawBuffers()` on WebGL2 |
| Agent scatter | Use `drawMode: "points"` for deposit passes |
| Reserved surfaces | `o0`..`o7` are USER-ONLY; effects use internal textures |
| Texture channels | Always 4-channel RGBA; never count channels |
| WGSL structs | Members end with `,` (comma), not `;` |
| DOM in render loop | **FORBIDDEN** — use event-driven state updates |
| Per-frame allocations | Avoid `new Map()`, object spreads — reuse and mutate |
| One way only | **BANNED** from adding multiple ways to do the same thing |

## Critical Rules

### ONE WAY ONLY

You are **BANNED** from adding more than one way to do something. If a pattern exists, use it. Do not add aliases, alternatives, or "also supports" options.

Examples of violations:
- Adding `group:` when `category:` already exists
- Adding `colour:` when `color:` already exists
- Supporting both camelCase and snake_case for the same field

## Compute Pass Semantics

Use `type: "compute"` in pass definitions when the pass:
- Updates simulation state
- Performs agent movement/logic
- Produces multiple outputs
- Does any "compute-like" work

This is **semantically correct** regardless of backend:

```javascript
{
  id: "agent-update",
  type: "compute",  // Semantic intent: this is compute work
  outputs: ["state1", "state2"],
  shader: { glsl: agentGLSL, wgsl: agentWGSL }
}
```

### Backend Behavior

- **WebGPU (WGSL)**: Executes as native `@compute` shader
- **WebGL2 (GLSL)**: Automatically converted to render pass with GPGPU pattern

The WebGL2 backend's `convertComputeToRender()` handles:
1. Changing `type: "compute"` → `type: "render"`
2. Setting up MRT framebuffer for multi-output passes
3. Binding textures appropriately

### FORBIDDEN

- Writing separate "simplified" WebGL2 shaders
- Abandoning compute/GPGPU patterns for "simpler" approaches
- Using `type: "render"` for compute-like operations
- Hardwiring `o0`..`o7` in effect definitions

## Agent-Based Effects

Effects like `erosion_worms`, `worms`, and `physarum` use this pattern:

### Pass Structure

1. **Agent Pass** (`type: "compute"`)
   - Reads current agent state from textures
   - Computes new position, direction, velocity
   - Outputs to multiple state textures via MRT
   - GLSL: Fragment shader with `layout(location=N) out`

2. **Deposit Pass** (`type: "render"`, `drawMode: "points"`)
   - Reads agent positions from state texture
   - Renders points at agent locations (scatter operation)
   - Accumulates into trail texture
   - GLSL: Vertex shader unpacks position from texelFetch

3. **Diffuse Pass** (`type: "compute"`)
   - Reads trail texture
   - Applies blur/spread/decay
   - Outputs back to trail texture
   - GLSL: Standard fragment blur shader

4. **Blend Pass** (`type: "render"`)
   - Combines trail with input image
   - Produces final output

### Texture Management

Effects allocate internal textures for state:

```javascript
textures: {
  global_state1: { width: 512, height: 512, format: "rgba16float" },
  global_state2: { width: 512, height: 512, format: "rgba16float" },
  global_trail: { width: 1024, height: 1024, format: "rgba8unorm" }
}
```

Use `global_` prefix for textures shared across passes within the effect.

## Multiple Render Targets (MRT)

For passes with multiple outputs, use MRT:

### GLSL (WebGL2)

```glsl
layout(location = 0) out vec4 outState1;
layout(location = 1) out vec4 outState2;
layout(location = 2) out vec4 outState3;

void main() {
    // Compute new state...
    outState1 = newPos;
    outState2 = newDir;
    outState3 = newVel;
}
```

### WGSL (WebGPU)

```wgsl
struct Outputs {
    @location(0) state1: vec4f,
    @location(1) state2: vec4f,
    @location(2) state3: vec4f,
}

@fragment
fn main() -> Outputs {
    // Compute new state...
    return Outputs(newPos, newDir, newVel);
}
```

## Testing Workflow

**MANDATORY**: Use the `noisemaker-shader-tools` MCP Server for all shader testing.

After modifying a shader effect:

1. **Compile check**: `compile_effect({ effect_id: "nm/erosion_worms" })`
2. **Render check**: `render_effect_frame({ effect_id: "nm/erosion_worms" })`
   - Verify `is_monochrome: false`
   - Verify `unique_sampled_colors > 100` for complex effects
3. **Uniform check**: `testUniformResponsiveness({ effect_id: "nm/erosion_worms" })`
4. **Structure check**: `checkEffectStructure({ effect_id: "nm/erosion_worms" })`
5. **Vision check** (if needed): `describe_effect_frame({ ... })`

Additional validation tools:
- `check_alg_equiv`: Verify GLSL/WGSL produce equivalent results
- `analyze_branching`: Identify unnecessary branching that could be flattened
- `test_no_passthrough`: Verify filter effects modify their input
- `benchmark_effect_fps`: Check performance meets target FPS
- `run_dsl_program`: Compile and run arbitrary DSL code for ad-hoc testing

Resolve *all* console errors before returning a solution.

## Common Issues

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Monochrome output | Agent state not initialized | Add init logic to detect zero state |
| `textureLoad` error | WGSL syntax in GLSL | Use `texelFetch()` for GLSL |
| Uniforms not working | Missing `uniform:` mapping | Add `uniform: "name"` to globals |
| No agent movement | Wrong texture binding | Check input/output texture names |
| All black output | MRT not set up | Verify `gl.drawBuffers()` called |

## File Organization

```
shaders/effects/nm/erosion_worms/
├── definition.js          # Effect definition (globals, passes)
├── glsl/                   # WebGL2 shaders
│   ├── agent.glsl
│   ├── deposit.vert
│   ├── deposit.frag
│   └── ...
├── wgsl/                   # WebGPU shaders
│   ├── agent.wgsl
│   ├── deposit.wgsl
│   └── ...
└── README.md              # Effect documentation (optional)
```

All shaders are stored as separate files in `glsl/` and `wgsl/` subdirectories. One shader per file.

## Performance Architecture

### CRITICAL: No DOM Polling in Render Paths

The render loop must **never** read from the DOM. All UI control values flow through state objects.

| Layer | Data Flow | Forbidden |
|-------|-----------|-----------|
| UI Controls | Event listeners (`change`, `input`) → state object | Per-frame `.value` reads |
| State Object | `pass.uniforms`, `globalUniforms` | Direct DOM access |
| Render Loop | Reads only from state objects | `getElementById`, `.value`, `.checked` |

### Event-Driven Control Updates

```javascript
// CORRECT: Event-driven
slider.addEventListener('input', (e) => {
    state.uniforms.radius = e.target.value;  // Write to state
});

// FORBIDDEN: Polling
function render() {
    state.uniforms.radius = slider.value;  // DOM read in hot path!
}
```

### Uniform Binding

Uniforms are rebound every frame (standard practice). GPU drivers optimize for this pattern.

For new code:
- Controls write to `pass.uniforms` or `globalUniforms` on user interaction
- Render loop reads from these objects, never from DOM
- Dirty tracking is optional—allocation avoidance is more impactful

### Allocation Avoidance in Hot Paths

The render loop must minimize per-frame allocations:

| Pattern | Avoid | Prefer |
|---------|-------|--------|
| Maps | `new Map()` each frame | `.clear()` and reuse |
| Objects | `{ ...spread }` | In-place mutation |
| Arrays | `array.slice()` | Reuse pre-allocated arrays |
| Logging | `console.log()` in loops | Remove or guard with flag |

## References

- [README-SHADERS.md](README-SHADERS.md): Pipeline architecture and philosophy
- [shaders/mcp/README.md](mcp/README.md): MCP tools for testing
- [shaders/mcp/docs/AGENT_WORKFLOW.md](mcp/docs/AGENT_WORKFLOW.md): Testing workflow guide
