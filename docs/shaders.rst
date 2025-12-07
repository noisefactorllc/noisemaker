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
   shaders/mcp

Layout
------

The repository layout for shader development lives under ``shaders/``:

* ``shaders/src`` – Runtime, compiler helpers, and backend integrations.
* ``shaders/effects`` – Effect definitions with paired GLSL/WGSL shader sources.
* ``demo/shaders`` – Interactive viewer for hot-reloading effects during development.
* ``shaders/tests`` – Playwright regression suites that exercise the demo harness.
