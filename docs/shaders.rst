Shaders
=======

Noisemaker includes an experimental collection of WebGL 2 and WebGPU shader effects that run natively in the browser. These shaders provide GPU-accelerated image processing independent of the Python and JavaScript implementations.

.. warning::
   **Experimental & Under Construction**: The shader effects are heavily under development with unoptimized and untested code. Use with caution and expect breaking changes.

.. raw:: html

   <div class="shader-viewer-container">
     <div class="shader-viewer-example">
       <div class="shader-viewer-canvas-wrapper">
         <canvas class="shader-viewer-canvas" width="384" height="384"></canvas>
         <pre class="shader-viewer-dsl-overlay"></pre>
         <button class="shader-viewer-random">Random</button>
         <div class="shader-viewer-loading">Loading...</div>
       </div>
       <div class="shader-viewer-controls">
         <div class="shader-viewer-select-wrapper">
           <label for="shader-effect-select">Effect</label>
           <select class="shader-viewer-select" id="shader-effect-select">
             <option>Loading effects...</option>
           </select>
         </div>
         <div class="shader-viewer-params-label">Parameters</div>
         <div class="shader-viewer-params">
           <!-- Dynamic controls will be inserted here -->
         </div>
       </div>
     </div>
   </div>
   <style>
   .shader-viewer-canvas-wrapper {
     position: relative;
   }
   .shader-viewer-dsl-overlay {
     position: absolute;
     top: 8px;
     left: 8px;
     right: 8px;
     margin: 0;
     padding: 0;
     background: transparent;
     font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
     font-size: 11px;
     line-height: 1.4;
     pointer-events: none;
     z-index: 10;
     overflow: visible;
     white-space: pre-wrap;
     word-wrap: break-word;
   }
   .shader-viewer-dsl-overlay span {
     background: rgba(0, 0, 0, 0.7);
     color: #fff;
     padding: 2px 4px;
     display: inline;
     box-decoration-break: clone;
     -webkit-box-decoration-break: clone;
   }
   </style>
   <script src="_static/noisemaker-shaders-core.min.js"></script>
   <script src="_static/shader-viewer.js"></script>

.. toctree::
   :maxdepth: 1
   :caption: Shader Reference

   shaders/effects
   shaders/language
   shaders/pipeline
   shaders/compiler
   shaders/demo-ui
   shaders/mcp

Project Structure
-----------------

Shader development lives under ``shaders/``:

.. code-block:: text

   shaders/
   ├── src/                      # Runtime, compiler, and backend code
   ├── effects/                  # Effect definitions
   │   ├── synth/                # 2D generators
   │   ├── filter/               # Image processors
   │   ├── mixer/                # Blend/composite effects
   │   ├── synth3d/              # 3D volumetric generators
   │   ├── filter3d/             # 3D volumetric processors
   │   ├── render/               # Points/agent rendering
   │   ├── classicNoisedeck/     # Ported complex shaders
   │   ├── classicNoisemaker/    # Python port implementations
   │   └── manifest.json         # Auto-generated effect registry
   ├── mcp/                      # MCP testing tools
   └── tests/                    # Test suites
   demo/
   └── shaders/                  # Interactive development UI

Each effect is a directory:

.. code-block:: text

   effects/filter/blur/
   ├── definition.js           # Effect definition
   ├── glsl/                    # WebGL 2 shaders
   ├── wgsl/                    # WebGPU shaders
   └── help.md                  # Optional documentation

Double Buffering
----------------

Global surfaces (``o0``-``o7``, ``geo0``-``geo7``) are double-buffered. Each has a read buffer and write buffer that swap at frame end.

**Display surfaces** (``o0``-``o7``) swap normally—previous frame's write becomes current frame's read.

**State surfaces** (textures with names containing ``xyz``, ``vel``, ``rgba``, ``trail``, or ``state``) persist their bindings for simulation continuity.

See ``shaders/src/runtime/pipeline.js``, specifically ``swapBuffers()`` and the surface creation code around line 376.

Multi-Pass Effects
------------------

Use internal textures (prefixed with ``_``) to chain passes.

**Example:** ``filter/blur`` uses ``_blurTemp`` as intermediate storage between horizontal and vertical blur passes.

**Pattern:**

1. Define internal texture in ``textures: { _temp: { ... } }``
2. Pass 1 writes to ``_temp``
3. Pass 2 reads from ``_temp``, writes to ``outputTex``

Feedback Effects
----------------

Read from previous output by copying to an internal texture each frame.

**Example:** ``filter/feedback`` uses ``_selfTex``:

1. Main pass reads ``inputTex`` + ``_selfTex``, writes to ``outputTex``
2. Copy pass copies ``outputTex`` to ``_selfTex`` for next frame

Iteration
---------

Use ``repeat: "uniformName"`` to run a pass multiple times per frame.

**Example:** ``synth/rd`` uses ``repeat: "iterations"`` on its simulate pass. The pipeline handles buffer swapping when a pass reads and writes the same texture.

Agent-Based Effects
-------------------

Shared global textures pass state between effects in a chain.

**Naming:** Textures prefixed with ``global_`` are shared across effects.

**Example chain:** ``pointsEmitter().physarum().pointsRender()``

- ``pointsEmitter`` creates ``global_xyz``, ``global_vel``, ``global_rgba``
- ``physarum`` reads and updates these textures
- ``pointsRender`` uses ``global_xyz`` to scatter points to ``global_points_trail``

**MRT (Multiple Render Targets):** Use ``drawBuffers: N`` for passes writing multiple textures.

**Points rendering:** Use ``drawMode: "points"`` and ``blend: true`` for scatter operations.

See: ``render/pointsEmitter``, ``render/pointsRender``, ``points/physarum``

Running Tests
-------------

.. code-block:: bash

   npm run test:shaders              # All shader tests
   npm run test:shaders:render       # Both backends

   # Test harness for specific effects
   node shaders/mcp/test-harness.js --effects synth/noise --backend webgl2
   node shaders/mcp/test-harness.js --effects "synth/*" --backend webgpu

Development Workflow
--------------------

.. code-block:: bash

   npx http-server -p 8000
   open http://localhost:8000/demo/shaders/

Regenerate manifest after adding/removing effects or changing texture definitions:

.. code-block:: bash

   python shaders/scripts/generate_shader_manifest.py

**When to regenerate:** The manifest must be regenerated whenever you add or remove effect files, or modify texture definitions in ``definition.js``. The manifest tracks all effects and their texture requirements for the runtime.

Bundle for distribution:

.. code-block:: bash

   npm run bundle:shaders

Downstream Integration
----------------------

Consumer projects vendor the built bundles from ``dist/``.

Effect bugs and new effects belong in this repository. UI customization belongs downstream.
