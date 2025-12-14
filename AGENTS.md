You're working on Noisemaker, a procedural noise generation algorithm playground, written in Python. Read the README.md.

## Critical Rules

### ONE WAY ONLY

You are **BANNED** from adding more than one way to do something. If a pattern exists, use it. Do not add aliases, alternatives, or "also supports" options.

Examples of violations:
- Adding `group:` when `category:` already exists
- Adding `colour:` when `color:` already exists  
- Supporting both camelCase and snake_case for the same field

## Bootstrapping the Python environment

**Note:** Noisemaker requires Python 3.10+. Modern build system using pyproject.toml.

1. Create a virtual environment and activate it:

   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

2. Install dependencies and set up the local package:

   ```bash
   pip install -e ".[dev]"
   ```

3. (Optional) Install pre-commit hooks for automated code quality:

   ```bash
   pre-commit install
   ```

4. Verify the installation by running the CLI:

   ```bash
   noisemaker --help
   ```

5. Run the test suite before submitting changes (only if modifying Python code):

   ```bash
   pytest
   ```

6. (Optional) Run linting and type checking:

   ```bash
   black noisemaker
   ruff check noisemaker
   mypy noisemaker
   ```

## Code Quality

- Use modern Python 3.10+ syntax: `list[int]` not `List[int]`, `str | None` not `Optional[str]`
- Add type hints to new functions using PEP 484/585/604 standards
- Use Google-style docstrings with proper Args/Returns sections
- Run black before committing
- Address ruff linting issues

## Docs

readthedocs content is for the *Python version only*

## Presets

Presets are located at /share/dsl/presets.dsl. This same file is used by both the Python and JS implementations. *Do not* invent new locations or modify presets unless explicitly requested.

## Javascript

JS port is under js/

*NO NODE* allowed except for tests.

Read and follow to the letter:
    - js/doc/VANILLA_JS_PORT_SPEC.md porting document
    - js/doc/PY_JS_PARITY_SPEC.md cross-language parity requirements

Never simulate weighted randomness by repeating values in collections passed to
`random_member`; use explicit probability checks instead (e.g., `random() < p`).

## Javascript/Python Parity Testing

- When the focus is JS, you may not change the reference python implementation.
- You may not disable, remove, or hobble tests.
- Do not mask, cover, or attempt to obscure actual problems.
- Always fix forward.
- Be an honest developer.

## Shaders

Shaders implementation is under shaders/

**CRITICAL - Surface Architecture**: Surfaces `o0`..`o7` are reserved for **USER USE ONLY**. Effects requiring internal feedback or temporary storage MUST allocate their own surfaces (e.g., `_feedbackBuffer`, `_temp0`) in the effect's `textures` property. NEVER hardwire `o0`..`o7` within effect definitions as this corrupts the user's composition graph. Use `inputTex` as the default for effect source parameters.

### Compute Pass Semantics

Use `type: "compute"` for passes that update state, run simulations, or produce multiple outputs. This is **semantically correct** even for WebGL2 targets:

- **WebGPU**: Native compute shaders execute directly
- **WebGL2**: Runtime automatically converts to GPGPU render passes

The WebGL2 backend handles compute-to-render conversion transparently:
- Fragment shaders perform the compute work
- Multiple Render Targets (MRT) handle multi-output passes
- Points draw mode enables scatter operations (agent deposit)

**Never** write separate "simplified" shaders for WebGL2. Use `type: "compute"` for semantic clarity and let the backend handle the conversion.

### Agent-Based Effects Pattern

Effects like `erosion_worms` and `physarum` follow this structure:
1. **Agent pass** (`type: "compute"`): Update agent state (position, direction, etc.) with MRT for multiple state textures
2. **Deposit pass** (`drawMode: "points"`): Agents scatter trails to accumulation texture
3. **Diffuse pass** (`type: "compute"`): Blur/spread accumulated trails
4. **Blend pass** (`type: "render"`): Combine with input for final output

### Shader MCP Tools

When working on shaders, you have access to MCP tools for testing effects:

- **`compile_effect`**: Verify a shader compiles cleanly
  - Input: `{ effect_id: "synth/noise", backend?: "webgl2" | "webgpu" }`
  - Returns compilation status and pass-level diagnostics

- **`render_effect_frame`**: Render a frame and check for visual issues
  - Input: `{ effect_id: "synth/noise", test_case?: { time?, resolution?, uniforms? } }`
  - Returns image metrics (mean/std RGB, luma variance, unique colors, is_monochrome)

- **`describe_effect_frame`**: Get AI vision analysis of rendered output
  - Input: `{ effect_id: "synth/noise", prompt: "Describe the pattern" }`
  - Returns vision description, tags, and notes

- **`benchmark_effect_fps`**: Verify shader can sustain target framerate
  - Input: `{ effect_id: "synth/noise", target_fps: 60, duration_seconds?: 5 }`
  - Returns achieved FPS, meets_target boolean, and frame timing stats

**Workflow**: After modifying a shader effect:
1. Call `compile_effect` to verify it compiles
2. Call `render_effect_frame` to check it produces non-monochrome output
3. If debugging visual issues, use `describe_effect_frame` for AI analysis
4. For performance-sensitive effects, use `benchmark_effect_fps`

See `shaders/mcp/README.md` for full documentation.
