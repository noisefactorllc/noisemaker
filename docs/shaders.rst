Shaders
=======

Noisemaker includes an experimental collection of WebGL 2 and WebGPU shader effects that run natively in the browser. These shaders provide GPU-accelerated image processing independent of the Python and JavaScript implementations.

.. warning::
   **Experimental & Under Construction**: The shader effects are heavily under development with unoptimized and untested code. Use with caution and expect breaking changes.

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
