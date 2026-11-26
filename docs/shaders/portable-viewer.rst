.. _portable-viewer:

Portable Effect Viewer
======================

The package viewer is a development environment for testing Portable effect
packages locally. It is part of the shader demo, at
``demo/shaders/package.html``, and runs the engine from this repository's
source. The package format it loads is specified in :ref:`portable-format`.

Features
--------

- **The demo's controls:** the package's parameters, and those of the other
  effects in its program, have the demo's controls for their types: sliders
  for ``float`` and ``int``, a dropdown for parameters with ``choices``, a
  switch for ``boolean``, a color picker for ``color``, and vector pickers for
  ``vec2`` and ``vec3``.
- **Automatic reload:** the viewer checks ``definition.json`` and the shader
  files every second and loads the package again when one changes. A page
  refresh also loads it again.
- **A fresh realm for each revision:** each revision of the package loads in
  a new frame, through the public package API, and replaces the visible one
  only when it has compiled and rendered. A revision that fails leaves the
  last good one on screen, with its error in the status line.
- **Backend selection:** the viewer uses WebGL, or WebGPU with
  ``backend=wgsl``. A package with shaders in one language only runs on that
  language's backend.

Setup
-----

Start a Local Server
^^^^^^^^^^^^^^^^^^^^

The viewer needs a local HTTP server: it cannot run from a ``file://`` URL.
From the root of this repository:

.. code-block:: bash

   npm install
   npm run dev

Any static file server started from that root also works (for example,
``python -m http.server 8080``).

Open the Viewer
^^^^^^^^^^^^^^^

Navigate to ``http://localhost:8001/demo/shaders/package.html``, or the port
the server uses. With no ``package`` parameter the viewer loads the starter
example, ``shaders/portable/examples/gradient-sweep/``.

Reloading Changes
-----------------

The viewer loads the package again within a second of a saved change to
``definition.json`` or a shader file, or on a page refresh. Each time, the
viewer:

1. Reads the effect definition and the shader sources
2. Loads them in a new frame and compiles the effect
3. Shows the new frame once it renders, and keeps the previous one if it fails
4. Keeps the parameter values you changed

A newer change replaces a revision that is still loading.

How the Viewer Loads a Package
------------------------------

The viewer page reads the package's files: ``definition.json``,
``help.md``, the shader files that its ``passes`` name, and the descriptor
files of the capabilities it declares. It sends them as bytes to the demo in
package mode (``demo/shaders/index.html?package=1``), in a new frame. That
frame loads them with ``loadPortablePackage()`` and registers them with
``registerPortableEffect()`` (:ref:`portable-registration`), then compiles
the package's ``defaultProgram``. Before compiling, the demo loads the
built-in effects that the program depends on (:ref:`portable-format`,
Section 8.7). A volume starter without a default program gets a
``render3d()`` preview; volume filters provide their input program.

A ZIP archive of a package also loads, and it can carry any other file, such
as an asset under ``assets/``.

Modifying the Example
---------------------

Change Parameters
^^^^^^^^^^^^^^^^^

Edit the package's ``definition.json`` to add or modify parameters
(:doc:`portable-parameters`):

.. code-block:: json

   {
     "globals": {
       "r": { "type": "float", "default": 0.5, "min": 0, "max": 1 },
       "brightness": { "type": "float", "default": 1.0, "min": 0, "max": 2 }
     }
   }

Change Shader Logic
^^^^^^^^^^^^^^^^^^^

Edit the shader file (for example ``glsl/gradientSweep.glsl``). The shader
declares uniforms that match the parameters in ``definition.json``
(:doc:`portable-shaders`). The viewer shows the change within a second.

Creating a New Effect
---------------------

Copy the starter example to a directory of your own and change it:

1. Update ``definition.json``:

   - Change ``name``, ``func`` and ``description``.
   - Define the ``globals``.
   - Update ``passes`` to reference the shader program name.

2. Replace the shader files in ``glsl/`` and/or ``wgsl/``.
3. Make sure the shader file names match the ``program`` names in
   ``passes``.

Then open the viewer with that directory in the ``package`` parameter.

Troubleshooting
---------------

"Failed to load definition.json"
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Check that the local server is running.
- Check that the package's ``definition.json`` exists and is valid JSON.

A compile error in the status line
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Check that the shader path matches the pass's ``program`` + ``.glsl``.
- Check the browser console for GLSL syntax errors. The previous revision
  stays on screen until the error is fixed.

"No shader file for program"
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Check that at least one shader directory exists (``glsl/`` or ``wgsl/``).
- Check that the shader file names match the ``program`` names in
  ``passes``.

Effect does not update
^^^^^^^^^^^^^^^^^^^^^^

- Refresh the page.
- Clear the browser cache and reload.

WebGPU not available
^^^^^^^^^^^^^^^^^^^^

- WebGPU requires a compatible browser (Chrome 113+, Edge 113+).
- Some systems need flags enabled.

Loading Other Effects
---------------------

To load another package, pass its directory (the one that contains
``definition.json``) or its ZIP archive in the ``package`` query parameter,
as a path relative to the viewer page or a URL, and add ``backend=wgsl`` for
WebGPU:

.. code-block:: text

   http://localhost:8001/demo/shaders/package.html?package=/path/to/my-effect/
   http://localhost:8001/demo/shaders/package.html?package=../../shaders/portable/examples/portable-block-3d/&backend=wgsl

The second previews a volume package from the repository's examples.
