# Noisemaker

Browser-based shader effect platform. WebGL2 and WebGPU backends.

## MCP

Use the **shade** MCP server for all shader development tasks: compiling, rendering, testing, structure analysis, effect search, and manifest generation. Prefer MCP tools over manual shell commands whenever a shade tool covers the task.

## Rules

- **NEVER push to the repo** without explicit user instruction
- **NEVER run build commands** (`npm run build`, `npx rollup`, etc.) — dist/ bundles are built externally
- **ONE WAY ONLY**: Do not add aliases, alternatives, or "also supports" options. If a pattern exists, use it.
- Do not produce documentation unless requested

## Project Structure

- Effects: `shaders/effects/{namespace}/{effectName}/definition.js`
- Backends: `shaders/src/runtime/backends/webgl2.js` and `webgpu.js`
- Canvas orchestrator: `shaders/src/renderer/canvas.js`
- Presets: `share/dsl/presets.dsl` (shared by Python and JS — do not move or duplicate)
- Python core: `noisemaker/` (TensorFlow-based)
- JS port: `js/` (strict parity with Python, see `js/doc/VANILLA_JS_PORT_SPEC.md`)

## Shader Conventions

- Surfaces `o0`..`o7` are **USER-ONLY**. Effects must allocate internal textures for feedback/temp storage. Never hardwire `o0`..`o7` in effect definitions.
- Use `type: "compute"` for state updates, simulations, and multi-output passes. The WebGL2 backend converts these to GPGPU render passes automatically. Never write separate "simplified" WebGL2 shaders.
- All textures are 4-channel RGBA.
- WGSL struct members end with `,` (comma), not `;`.
- Never read DOM in render paths. UI controls use event listeners writing to state objects. The render loop reads only from state objects.
- Avoid per-frame allocations (`new Map()`, object spreads, `console.log()`) in render loops.

## Agent-Based Effects Pattern

1. **Agent pass** (`type: "compute"`): Update agent state with MRT for multiple state textures
2. **Deposit pass** (`drawMode: "points"`): Agents scatter trails to accumulation texture
3. **Diffuse pass** (`type: "compute"`): Blur/spread accumulated trails
4. **Blend pass** (`type: "render"`): Combine with input for final output

## Testing

- JS tests: `node scripts/run-js-tests.js --skip-parity`
- Visual test: `node shaders/tests/test_visual_playwright.js` (requires system Chrome)
- Python: `pytest` (only when modifying Python code)
- Resolve all console errors before returning a solution

## JS/Python Parity

- When the focus is JS, do not change the reference Python implementation
- Do not disable, remove, or hobble tests
- Never simulate weighted randomness by repeating values — use explicit probability checks
- Node is allowed only for tests; production JS is vanilla browser-only
