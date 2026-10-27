Layers: a non-destructive image and video editor
================================================

`Open Layers <https://layers.noisefactor.io/>`_

Layers is an image and video editor that runs in the browser.
Users import images and video clips, stack layers with effects and blend modes, and export an image or a video.
Layers keeps the source media and the settings of each layer, so users can change any layer at any time. [L1]_ [L4]_

How it uses Noisemaker
----------------------

Layers keeps the layer stack as plain data.
When the structure of the stack changes, Layers converts the stack into a DSL program, and Noisemaker compiles it. [L2]_
The Layers repository contains no GLSL or WGSL files.

This program is the output of ``LayersRenderer._buildDsl()`` for three layers.
The bottom layer is a photo.
The middle layer is a blur.
The top layer is noise in overlay mode at 60% opacity: [L2]_

.. code-block:: text

   search synth, mixer, filter

   solid(color: #000000, alpha: 0).write(o1)
   media().write(o2)
   read(o1).blendMode(tex: read(o2), mode: mix, mix: 100).write(o3)

   read(o3).blur(radiusX: 8, radiusY: 8).write(o1)
   read(o3).blendMode(tex: read(o1), mode: mix, mix: 100).write(o2)

   noise(scaleX: 4, scaleY: 4).write(o3)
   read(o2).blendMode(tex: read(o3), mode: overlay, mix: -40).write(o1)

   render(o1)

Each layer blends onto the result below it with the ``blendMode`` mixer effect.
Layer masks use the ``alphaMask`` mixer effect.
The engine has eight surfaces, ``o0`` to ``o7``, so Layers reuses a surface after the last instruction that reads it.
If a stack needs more than eight surfaces, Layers stops with an error. [L2]_

``LayersRenderer`` wraps one ``CanvasRenderer`` and updates it in four ways: [L2]_

.. list-table::
   :header-rows: 1
   :widths: 40 60

   * - Change
     - What Layers does
   * - The layer structure changes
     - Builds a new program and compiles it. Compiles run one at a time.
   * - A runtime parameter changes
     - Calls ``applyStepParameterValues({ step_N: params })`` on the step for that layer. No compile.
   * - A parameter declared with ``define`` changes
     - Compiles again, because the engine writes this value into the shader source.
   * - The user adds media
     - Calls ``updateTextureFromSource('imageTex_step_N', source, { flipY: false })`` and sets ``imageSize``.

After each compile, Layers reads ``pipeline.graph.passes`` to map each layer to its steps.
Then it uploads the media, mask, and text textures again. [L2]_

Preview and export
------------------

``LayersRenderer`` creates its ``CanvasRenderer`` with ``preferWebGPU: false``, so Layers renders only with WebGL2. [L2]_

The preview does not render at full size.
Layers first limits square media to 2048 × 2048.
It limits other media to a long side of 1920 and a short side of 1080.
The aspect ratio does not change.
Then it scales the preview to an area of no more than 1024 × 1024 pixels.
Layers keeps the original files and dimensions for export. [L1]_ [L2]_

Export decodes the original sources and uses a separate renderer: [L3]_

* Each side can be up to 8192 pixels, and the image can be up to 33,554,432 pixels (32 × 1024 × 1024).
* Layers estimates the GPU memory for the export and refuses the export when the estimate is above 384 MiB.
* Layers can render the export in tiles of up to 512 × 512 pixels. It does this only when each visible layer is media, a drawing, or a solid color, with no visible child effects.
* Any other effect makes Layers render the whole frame at once, which must fit the memory limit.

Work outside the engine
-----------------------

* Selection tools: rectangle, oval, lasso, polygon, and magic wand. Selection operations include expand, contract, feather, smooth, border, and color range. [L1]_
* Layers saves projects in IndexedDB. It also writes recovery checkpoints, which can be older than the latest edit. [L1]_
* Undo keeps up to 50 states within an estimated 128 MiB. [L1]_

Limits
------

* An online session connects only to other Layers sessions, and it does not support image or video layers. [L1]_
* Video clip layers use best-effort frame seeking, so exported frames can be slightly different from the live preview. [L4]_

Sources
-------

L1 to L3 point to layers revision ``a4ab4e7``.

.. [L1] `README <https://github.com/noisefactorllc/layers/blob/a4ab4e7e2b45e9ebd8a75ee5c9113d1049795853/README.md>`_.

.. [L2] `Layer renderer (renderer.js) <https://github.com/noisefactorllc/layers/blob/a4ab4e7e2b45e9ebd8a75ee5c9113d1049795853/public/js/noisemaker/renderer.js>`_.

.. [L3] `Full-resolution export (full-resolution.js) <https://github.com/noisefactorllc/layers/blob/a4ab4e7e2b45e9ebd8a75ee5c9113d1049795853/public/js/noisemaker/full-resolution.js>`_.

.. [L4] `Layers application page <https://layers.noisefactor.io/>`_ (export dialog text).
