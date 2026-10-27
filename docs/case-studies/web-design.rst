Web Design: shader canvases in web pages
========================================

`Open Noise Factor <https://noisefactor.io/>`_ | `Open alex.ayars.info <https://alex.ayars.info/>`_

Two websites use Noisemaker canvases as page graphics.
The Noise Factor site header has a shader background.
alex.ayars.info has a shader panel with a code editor, where visitors can change the program.
Both sites use a helper module, ``shader-renderer.js``, that exports ``createBackgroundShader()``. [W1]_ [W2]_

The helper
----------

``createBackgroundShader(canvas, program, size)`` runs these steps: [W1]_

#. Import ``CanvasRenderer`` from ``https://shaders.noisedeck.app/1/noisemaker-shaders-core.esm.js``.
#. Create a ``CanvasRenderer`` with ``preferWebGPU: false``.
#. Load the effect manifest.
#. Load the effects that the program names.
#. Compile the program and start rendering.

It returns the renderer, or ``null`` if a step fails.
Each site has its own copy of ``shader-renderer.js``, and the two copies are different. [W1]_ [W2]_

The Noise Factor header
-----------------------

``<nf-header>`` is a custom element that noisefactor.io, downloads.noisefactor.io, and forum.noisefactor.io use.
It contains a canvas, a logo link, and a ``<nav aria-label="Site">`` element.
The canvas has ``aria-hidden="true"`` and ``pointer-events: none``, so it does not affect the links. [W4]_ [W5]_

This is the header program: [W4]_

.. code-block:: text
   :caption: HEADER_SHADER_PROGRAM in nf-header.js

   search synth, filter, mixer

   cell(
     shape: triangle,
     scale: 100,
     cellScale: 100,
     variation: 100,
     speed: 1
   )
     .write(o0)

   solid(color: #aad604ff)
     .blendMode(
       tex: read(o0),
       mode: overlay,
       mix: -10.59
     )
     .lighting(
       normalStrength: 5,
       smoothing: 1.6,
       specularIntensity: 1.68,
       shininess: 94,
       ambientColor: #000000ff,
       lightDirection: vec3(0.733, 0.367, 0.573),
       reflection: 27,
       refraction: 37,
       aberration: 27.8
     )
     .write(o1)

   render(o1)

The header starts the shader like this: [W4]_

.. code-block:: javascript
   :caption: NFHeader.startHeaderShader() in nf-header.js

   async startHeaderShader(canvas) {
     try {
       const size = sizeCanvasToHeader(canvas);
       const renderer = await createBackgroundShader(canvas, HEADER_SHADER_PROGRAM, size);
       // The lime .nf-header background is the no-WebGL fallback; if the
       // shader failed to compile there is nothing to keep in resize step.
       if (!renderer) return;
       window.addEventListener('resize', () => {
         const next = sizeCanvasToHeader(canvas);
         renderer.resize(next.width, next.height);
       });
     } catch (e) {
       console.error('Shader init failed:', e);
     }
   }

``sizeCanvasToHeader()`` multiplies the header size by the device pixel ratio.
The canvas is at least 160 × 30 pixels. [W4]_
If the shader does not start, the header shows its CSS background, a lime color close to the shader output. [W5]_

The alex.ayars.info shader panel
--------------------------------

The page shows the program in a code editor on top of the canvas.
The canvas renders at half the device pixel ratio. [W3]_

The editor uses the personal site's ``BackgroundShaderRenderer.apply(program)``.
This method loads the effects that the program names and compiles it.
It returns ``{ ok, error }`` and keeps the new program only after a successful compile. [W2]_

The page adds these rules around ``apply()``: [W3]_

* It waits until 500 ms pass with no typing, and then compiles.
* Cmd+Enter or Ctrl+Enter compiles at once.
* It ignores the result of a compile if the user made a newer edit during that compile.
* It shows a compile error only when the program still fails 1500 ms later. The error stays until the program compiles again.

Limits
------

* Both sites resize the canvas only on the window ``resize`` event. [W3]_ [W4]_
* The header element is hidden until its script defines it, so a page without JavaScript has no header. [W5]_
* On alex.ayars.info, the editor is hidden on screens 768 pixels wide or less. Edits are not saved. [W3]_
* Neither the header nor the alex.ayars.info page checks ``prefers-reduced-motion``. [W3]_ [W4]_ [W5]_

Sources
-------

These are the files that the two sites serve. The source repositories are private.

.. [W1] `Noise Factor helper (shader-renderer.js) <https://noisefactor.io/js/shader-renderer.js>`_.

.. [W2] `alex.ayars.info helper (shader-renderer.js) <https://alex.ayars.info/js/shader-renderer.js>`_.

.. [W3] `alex.ayars.info page <https://alex.ayars.info/>`_.

.. [W4] `Header component (nf-header.js) <https://noisefactor.io/js/nf-header.js>`_.

.. [W5] `Header styles (nf-header.css) <https://noisefactor.io/css/nf-header.css>`_.
