.. _shader-mcp:

MCP Shader Tools
================

Noisemaker provides an MCP (Model Context Protocol) server that exposes shader testing tools for VS Code Copilot coding agents. These tools enable automated compilation, rendering, and visual analysis of shader effects.

Quick Start
-----------

.. code-block:: bash

   # Install dependencies
   npm install
   cd shaders/mcp && npm install

   # Install Playwright browsers
   npx playwright install chromium

   # Test the harness
   node shaders/mcp/test-harness.js --effects synth/noise --backend webgl2

For AI vision features, create a ``.openai`` file at the project root containing your OpenAI API key.

Architecture
------------

The MCP tools follow a three-layer design:

1. **MCP Server** (``server.js``) — Thin façade exposing tools over JSON-RPC via stdio
2. **Browser Harness** (``browser-harness.js``) — Session-based browser lifecycle management
3. **Core Operations** (``core-operations.js``) — Pure library functions for shader testing

Each browser-based tool invocation:

1. Creates a fresh browser session
2. Loads the demo UI and configures the backend
3. Runs the test for each specified effect
4. Tears down the browser session
5. Returns structured results

Tools Overview
--------------

Browser-Based Tools
^^^^^^^^^^^^^^^^^^^

These tools launch a browser session for rendering:

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Tool
     - Purpose
   * - ``compileEffect``
     - Verify shader compiles cleanly
   * - ``renderEffectFrame``
     - Render frame, check for monochrome output
   * - ``runDslProgram``
     - Compile and run arbitrary DSL code, return metrics
   * - ``describeEffectFrame``
     - AI vision analysis of rendered output
   * - ``benchmarkEffectFPS``
     - Measure sustained framerate
   * - ``testUniformResponsiveness``
     - Verify uniform controls affect output
   * - ``testNoPassthrough``
     - Verify filter effects modify input
   * - ``testPixelParity``
     - Test GLSL/WGSL pixel-for-pixel equivalence

On-Disk Tools
^^^^^^^^^^^^^

These tools run without a browser:

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Tool
     - Purpose
   * - ``checkEffectStructure``
     - Detect unused files, naming issues, leaked uniforms
   * - ``checkAlgEquiv``
     - Compare GLSL/WGSL algorithmic equivalence
   * - ``analyzeBranching``
     - Identify unnecessary branching that could be flattened
   * - ``generateShaderManifest``
     - Rebuild shader manifest from disk

Tool Reference
--------------

compileEffect
^^^^^^^^^^^^^

Compile a shader effect and verify it compiles cleanly.

**Parameters:**

.. list-table::
   :header-rows: 1
   :widths: 20 15 15 50

   * - Parameter
     - Type
     - Required
     - Description
   * - ``effect_id``
     - string
     - Yes
     - Effect identifier (e.g., ``"synth/noise"``)
   * - ``backend``
     - string
     - Yes
     - ``"webgl2"`` or ``"webgpu"``

**Example Response:**

.. code-block:: json

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

renderEffectFrame
^^^^^^^^^^^^^^^^^

Render a single frame and analyze image metrics.

**Parameters:**

.. list-table::
   :header-rows: 1
   :widths: 20 15 15 50

   * - Parameter
     - Type
     - Required
     - Description
   * - ``effect_id``
     - string
     - Yes
     - Effect identifier
   * - ``backend``
     - string
     - Yes
     - ``"webgl2"`` or ``"webgpu"``
   * - ``test_case.time``
     - number
     - No
     - Time value to render at
   * - ``test_case.resolution``
     - [number, number]
     - No
     - Resolution [width, height]
   * - ``test_case.seed``
     - number
     - No
     - Random seed for reproducibility
   * - ``test_case.uniforms``
     - object
     - No
     - Uniform value overrides

**Metrics Returned:**

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Metric
     - Description
   * - ``mean_rgb``
     - Average RGB values [0-255]
   * - ``std_rgb``
     - Standard deviation of RGB values
   * - ``luma_variance``
     - Variance in luminance (higher = more contrast)
   * - ``unique_sampled_colors``
     - Number of unique colors in sampled pixels
   * - ``is_monochrome``
     - True if output appears to be a single color

runDslProgram
^^^^^^^^^^^^^

Compile and run arbitrary DSL code, returning image metrics.

**Parameters:**

.. list-table::
   :header-rows: 1
   :widths: 20 15 15 50

   * - Parameter
     - Type
     - Required
     - Description
   * - ``dsl``
     - string
     - Yes
     - DSL source code (e.g., ``"noise().write(o0)"``)
   * - ``backend``
     - string
     - Yes
     - ``"webgl2"`` or ``"webgpu"``
   * - ``test_case``
     - object
     - No
     - Test configuration (same as ``renderEffectFrame``)

**Example:**

.. code-block:: json

   {
     "dsl": "noise(scale: 5).posterize(levels: 4).write(o0)",
     "backend": "webgl2"
   }

describeEffectFrame
^^^^^^^^^^^^^^^^^^^

Render a frame and get an AI vision description using GPT-4 Vision.

**Parameters:**

.. list-table::
   :header-rows: 1
   :widths: 20 15 15 50

   * - Parameter
     - Type
     - Required
     - Description
   * - ``effect_id``
     - string
     - Yes
     - Effect identifier
   * - ``backend``
     - string
     - Yes
     - ``"webgl2"`` or ``"webgpu"``
   * - ``prompt``
     - string
     - Yes
     - Vision prompt (what to analyze)
   * - ``test_case``
     - object
     - No
     - Test configuration

**Example Response:**

.. code-block:: json

   {
     "effect_id": "sim/physarum",
     "backend": "webgl2",
     "success": true,
     "description": "Organic slime mold-like trails on a dark background with gradient coloration.",
     "tags": ["organic", "trails", "gradient"],
     "notes": "No visible artifacts.",
     "console_errors": []
   }

.. note::

   Requires an OpenAI API key in the ``.openai`` file.

benchmarkEffectFPS
^^^^^^^^^^^^^^^^^^

Benchmark a shader to verify it can sustain a target framerate. Measures frame times and jitter (frame time variance).

**Parameters:**

.. list-table::
   :header-rows: 1
   :widths: 20 15 15 50

   * - Parameter
     - Type
     - Required
     - Description
   * - ``effect_id``
     - string
     - Yes
     - Effect identifier
   * - ``backend``
     - string
     - Yes
     - ``"webgl2"`` or ``"webgpu"``
   * - ``target_fps``
     - number
     - No
     - Target FPS (default: 60)
   * - ``duration_seconds``
     - number
     - No
     - Benchmark duration (default: 5)
   * - ``resolution``
     - [number, number]
     - No
     - Resolution for benchmark

**Jitter Metrics:**

The ``jitter_ms`` field reports the standard deviation of frame render times. Lower values indicate smoother animation:

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Jitter (ms)
     - Quality
   * - < 1.0
     - Excellent - very smooth
   * - 1.0 - 3.0
     - Good - minor variation
   * - 3.0 - 8.0
     - Fair - noticeable stutters
   * - > 8.0
     - Poor - jerky animation

**Example Response:**

.. code-block:: json

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

testUniformResponsiveness
^^^^^^^^^^^^^^^^^^^^^^^^^

Verify that uniform controls affect the visual output.

**Parameters:**

.. list-table::
   :header-rows: 1
   :widths: 20 15 15 50

   * - Parameter
     - Type
     - Required
     - Description
   * - ``effect_id``
     - string
     - Yes
     - Effect identifier
   * - ``backend``
     - string
     - Yes
     - ``"webgl2"`` or ``"webgpu"``

**Example Response:**

.. code-block:: json

   {
     "effect_id": "sim/physarum",
     "backend": "webgl2",
     "success": true,
     "uniforms_tested": 5,
     "responsive_uniforms": ["speed", "count", "length"],
     "unresponsive_uniforms": ["unused_param"],
     "console_errors": []
   }

testNoPassthrough
^^^^^^^^^^^^^^^^^

Test that a filter effect modifies its input (not a passthrough).

**Parameters:**

.. list-table::
   :header-rows: 1
   :widths: 20 15 15 50

   * - Parameter
     - Type
     - Required
     - Description
   * - ``effect_id``
     - string
     - Yes
     - Effect identifier
   * - ``backend``
     - string
     - Yes
     - ``"webgl2"`` or ``"webgpu"``

The test fails if input and output textures are >99% similar.

testPixelParity
^^^^^^^^^^^^^^^

Test pixel-for-pixel parity between GLSL (WebGL2) and WGSL (WebGPU) shader outputs.

**Parameters:**

.. list-table::
   :header-rows: 1
   :widths: 20 15 15 50

   * - Parameter
     - Type
     - Required
     - Description
   * - ``effect_id``
     - string
     - Yes*
     - Effect identifier
   * - ``effects``
     - string
     - Yes*
     - CSV of effect IDs or glob patterns
   * - ``epsilon``
     - number
     - No
     - Max per-channel difference allowed (default: 1)
   * - ``seed``
     - number
     - No
     - Random seed for reproducibility (default: 42)

\*Either ``effect_id`` or ``effects`` must be provided.

**Behavior:**

1. Renders effect at time=0 with paused engine on WebGL2
2. Captures canvas pixels
3. Renders same effect at time=0 on WebGPU
4. Captures canvas pixels
5. Compares pixel arrays, allowing Y-flip compensation
6. Reports mismatch statistics

**Sim Effects:**

Effects with feedback loops (e.g., ``physarum``, ``worms``) are automatically skipped since their output depends on accumulated state.

**Example Response:**

.. code-block:: json

   {
     "effects_tested": 1,
     "epsilon": 1,
     "seed": 42,
     "results": {
       "synth/noise": {
         "status": "ok",
         "maxDiff": 0,
         "meanDiff": 0,
         "mismatchCount": 0,
         "mismatchPercent": "0.0000",
         "resolution": [1024, 1024],
         "isYFlipped": true,
         "details": "GLSL ↔ WGSL pixel parity: maxDiff=0 [WGSL Y-FLIPPED]"
       }
     }
   }

checkEffectStructure
^^^^^^^^^^^^^^^^^^^^

Analyze an effect's file structure for common issues. No browser required.

**Parameters:**

.. list-table::
   :header-rows: 1
   :widths: 20 15 15 50

   * - Parameter
     - Type
     - Required
     - Description
   * - ``effect_id``
     - string
     - Yes
     - Effect identifier
   * - ``backend``
     - string
     - Yes
     - ``"webgl2"`` or ``"webgpu"``

**Issue Types:**

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Type
     - Description
   * - ``unused_file``
     - Shader file not referenced in definition
   * - ``missing_file``
     - Referenced shader file doesn't exist
   * - ``naming_violation``
     - File or uniform doesn't follow conventions
   * - ``leaked_uniform``
     - Uniform in shader but not in definition
   * - ``undefined_uniform``
     - Uniform in definition but not in shader

checkAlgEquiv
^^^^^^^^^^^^^

Compare GLSL and WGSL implementations for algorithmic equivalence using AI. No browser required.

**Parameters:**

.. list-table::
   :header-rows: 1
   :widths: 20 15 15 50

   * - Parameter
     - Type
     - Required
     - Description
   * - ``effect_id``
     - string
     - Yes
     - Effect identifier

Only flags truly divergent algorithms, not language-specific syntax differences.

.. note::

   Requires an OpenAI API key in the ``.openai`` file.

analyzeBranching
^^^^^^^^^^^^^^^^

Analyze shader code for unnecessary branching that could be flattened. No browser required.

**Parameters:**

.. list-table::
   :header-rows: 1
   :widths: 20 15 15 50

   * - Parameter
     - Type
     - Required
     - Description
   * - ``effect_id``
     - string
     - Yes
     - Effect identifier
   * - ``backend``
     - string
     - Yes
     - ``"webgl2"`` or ``"webgpu"``

**What It Flags:**

- ``if``/``else`` branches that select between simple arithmetic operations
- Boolean uniform checks that guard trivial operations
- Switch statements over uniform enums that could use lookup tables

**What It Accepts:**

- Early-out conditions for performance (discard, return)
- Branches that select fundamentally different algorithms
- Loop control flow based on uniforms
- Complex feature toggles

**Severity Levels:**

.. list-table::
   :header-rows: 1
   :widths: 20 80

   * - Severity
     - Meaning
   * - ``high``
     - Hot inner loops with avoidable branching, significant GPU thread divergence
   * - ``medium``
     - Per-fragment branches that could be flattened with math
   * - ``low``
     - Minor opportunities, negligible performance impact

**Example Response:**

.. code-block:: json

   {
     "backend": "webgl2",
     "effects_tested": 1,
     "results": {
       "synth/noise": {
         "status": "warning",
         "shaders": [
           {
             "file": "noise.glsl",
             "opportunities": [
               {
                 "location": "line 302, inside multires()",
                 "description": "Boolean check for 'ridges' uniform guards a simple abs() call. Can flatten with: color = mix(color, 1.0 - abs(color * 2.0 - 1.0), float(ridges))",
                 "severity": "medium"
               }
             ],
             "notes": "Overall well-optimized shader with minimal unnecessary branching."
           }
         ],
         "summary": "synth/noise (webgl2): 1 shader(s) analyzed, 1 opportunity/ies (1 medium)"
       }
     }
   }

.. note::

   Requires an OpenAI API key in the ``.openai`` file. Returns ``"warning"`` status when 2 or more opportunities are found.

generateShaderManifest
^^^^^^^^^^^^^^^^^^^^^^

Rebuild the shader manifest from disk. No browser required, no parameters needed.

CLI Usage
---------

The test harness provides a command-line interface:

.. code-block:: bash

   node shaders/mcp/test-harness.js --effects <patterns> --backend <backend> [flags]

Backend Flags
^^^^^^^^^^^^^

.. code-block:: bash

   --backend webgl2    # Specify WebGL2 backend
   --backend webgpu    # Specify WebGPU backend
   --webgl2            # Shortcut for --backend webgl2
   --webgpu            # Shortcut for --backend webgpu
   --glsl              # Alias for --webgl2
   --wgsl              # Alias for --webgpu

Test Selection Flags
^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

   --all           # Run ALL optional tests
   --benchmark     # Run FPS test
   --uniforms      # Test uniform responsiveness
   --structure     # Check naming, unused files, leaked uniforms
   --alg-equiv     # Check GLSL/WGSL algorithmic equivalence (requires --with-ai)
   --branching     # Analyze shaders for unnecessary branching (requires --with-ai)
   --passthrough   # Check filter effects don't pass through input
   --pixel-parity  # Test GLSL/WGSL pixel-for-pixel equivalence
   --with-ai       # Enable AI-based tests (alg-equiv, branching, vision)
   --no-vision     # Skip AI vision validation (even with --with-ai)

Examples
^^^^^^^^

.. code-block:: bash

   # Basic compile + render (no AI)
   node test-harness.js --effects synth/noise --backend webgl2

   # Multiple effects with glob pattern
   node test-harness.js --effects "synth/*" --webgl2 --benchmark

   # All tests on WebGPU with AI analysis
   node test-harness.js --effects "sim/*" --webgpu --all --with-ai

   # Structure check (no browser)
   node test-harness.js --effects "sim/physarum" --webgl2 --structure

   # Branching analysis with AI
   node test-harness.js --effects synth/noise --webgl2 --branching --with-ai

Agent Workflow
--------------

Typical Testing Sequence
^^^^^^^^^^^^^^^^^^^^^^^^

After modifying a shader effect:

1. **Compile check**: Verify the shader compiles cleanly

   .. code-block:: text

      → compileEffect({ effect_id: "synth/noise", backend: "webgl2" })

2. **Render check**: Verify non-monochrome output

   .. code-block:: text

      → renderEffectFrame({ effect_id: "synth/noise", backend: "webgl2" })

3. **Structure check**: Catch unused files or leaked uniforms

   .. code-block:: text

      → checkEffectStructure({ effect_id: "synth/noise", backend: "webgl2" })

4. **Uniform check**: Verify controls affect output

   .. code-block:: text

      → testUniformResponsiveness({ effect_id: "synth/noise", backend: "webgl2" })

5. **Branching analysis** (identify optimization opportunities):

   .. code-block:: text

      → analyzeBranching({ effect_id: "synth/noise", backend: "webgl2" })

6. **Vision check** (if debugging visual issues):

   .. code-block:: text

      → describeEffectFrame({
          effect_id: "synth/noise",
          backend: "webgl2",
          prompt: "Describe the pattern and any artifacts"
        })

Interpreting Results
^^^^^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 30 35 35

   * - Metric
     - Good Value
     - Bad Value
   * - ``is_monochrome``
     - ``false``
     - ``true``
   * - ``unique_sampled_colors``
     - > 100
     - < 10
   * - ``luma_variance``
     - > 1000
     - < 100
   * - ``achieved_fps``
     - ≥ ``target_fps``
     - < ``target_fps``
   * - ``similarity_percent``
     - < 90
     - > 99

Common Issues
^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 30 30 40

   * - Symptom
     - Tool to Use
     - What to Check
   * - Black/white output
     - ``renderEffectFrame``
     - ``is_monochrome``, ``mean_rgb``
   * - Uniforms not working
     - ``testUniformResponsiveness``
     - ``unresponsive_uniforms``
   * - Shader won't compile
     - ``compileEffect``
     - ``passes[].errors``
   * - Filter does nothing
     - ``testNoPassthrough``
     - ``is_passthrough``
   * - GLSL/WGSL mismatch
     - ``checkAlgEquiv``
     - ``divergent_pairs``
