Engine demos: the shader demo and the Classic Composer
======================================================

`Open the shader demo <https://noisemaker.app/demo/shaders/>`_ | `Open the Classic Composer <https://noisemaker.app/demo/js/>`_

noisemaker.app has two engine demos.
They use different engines and different program formats:

* The **shader demo** is an effect browser and DSL editor. It compiles DSL programs and renders them on the GPU.
* The **Classic Composer** renders the classic Noisemaker presets on the CPU, with the JavaScript port of the Python Composer.

Shader programs use the Polymorphic DSL.
Classic presets come from ``presets.dsl``, which the Python and JavaScript Composers share.
A program for one demo does not run in the other. [D1]_ [D2]_ [D3]_

The shader demo
---------------

The demo uses ``CanvasRenderer`` to compile and render programs.
Its ``UIController`` uses ``ProgramState`` to connect the parsed program to the controls. [D2]_

The demo makes the controls from each effect's parameter definitions, so no effect needs a hand-written control panel.
When a control changes, the demo sends all step values to the renderer with ``applyStepParameterValues(programState.getAllStepValues())``. [D2]_

Some parameters are compile-time defines, which the engine writes into the shader source.
When one of them changes, ``ProgramState`` emits ``recompileNeeded``.
The demo then updates the DSL and compiles again, at most once for each user action. [D2]_

The demo starts on WebGL2.
The ``glsl`` and ``wgsl`` tabs switch between the WebGL2 and WebGPU backends.
An FPS counter shows the frame rate. [D4]_

The Classic Composer
--------------------

The Composer imports ``Preset`` and ``render`` from the JavaScript Composer. [D3]_
For each render, it builds a ``Preset`` from the selected name and seed.
It calls ``render()`` with the preset and the seed.
The options give the canvas size, a drawing context, a time value, a frame index, and a progress callback. [D3]_

If the selected preset is an effect and not a generator, the Composer adds it to the ``basic`` generator preset.
This gives the effect an image to change. [D3]_

After each render, the page shows:

* the preset's source text from ``presets.dsl``, in the Formula tab,
* the evaluated preset, in the Evaluated tab,
* the mode, the preset evaluation time, the render time, and the seed, in the status line. [D3]_

Other CPU options
-----------------

The demo index also lists Noisemaker for CPU.
That port runs shader programs without a GPU, in JavaScript, Python, Ruby, or Rust.
It is a different engine from the Classic Composer. [D1]_

Limits
------

* The Composer renders into a 1024 × 1024 canvas. Its script reads size, frame-rate, duration, and animation inputs that the page does not contain. [D3]_
* The Composer hides presets whose names start with ``maybe-``. [D3]_
* Neither demo exports images or video. [D2]_ [D3]_ [D4]_

Sources
-------

D2 and D3 point to noisemaker revision ``135688f``.

.. [D1] `Noisemaker demo index <https://demos.noisemaker.app/>`_.

.. [D2] `Shader demo UI controller (demo-ui.js) <https://github.com/noisefactorllc/noisemaker/blob/135688f4cba948305ac169c60645626719dc52b8/demo/shaders/lib/demo-ui.js>`_.

.. [D3] `Classic Composer page (index.html) <https://github.com/noisefactorllc/noisemaker/blob/135688f4cba948305ac169c60645626719dc52b8/demo/js/index.html>`_.

.. [D4] `Live shader demo page <https://noisemaker.app/demo/shaders/>`_.
