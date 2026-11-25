.. _portable-viewer:

Portable Effect Viewer
======================

The effect viewer is a development environment for testing Portable effect
packages locally. It is part of the `Portable repository
<https://github.com/noisefactorllc/portable/tree/486543b4a993f56f1f57d691dc11124c70c3db12>`_,
in ``viewer/index.html``. The package format it loads is specified in
:ref:`portable-format`.

Features
--------

- **Full-page canvas:** the effect renders at full viewport resolution.
- **Parameter controls:** type-appropriate controls for every effect global:
  sliders for ``float`` and ``int`` (one per component for ``vec2`` and
  ``vec3``), a dropdown for ``int`` parameters with ``choices``, a checkbox
  for ``boolean``, and a color picker for ``color``.
- **Automatic reload:** the viewer checks ``definition.json`` and the shader
  files every second and reloads when one changes. **Reload Effect** or a
  page refresh forces a reload.
- **Resize handling:** the canvas adapts to window size changes.
- **Backend auto-detection:** the viewer selects WebGL or WebGPU from the
  available shader files.
- **Backend toggle:** switch between WebGL and WebGPU when both shader types
  are available.

Setup
-----

Start a Local Server
^^^^^^^^^^^^^^^^^^^^

The viewer loads the Noisemaker runtime from ``shaders.noisedeck.app``. No
local vendor setup is needed, but the viewer needs a local HTTP server: it
cannot run from a ``file://`` URL.

From the root of the Portable repository:

.. code-block:: bash

   npm install
   npm run dev

Any static file server started from that root also works (for example,
``python -m http.server 8080``).

Open the Viewer
^^^^^^^^^^^^^^^

Navigate to ``http://localhost:2999/viewer/``, or the port the server uses.

Reloading Changes
-----------------

The viewer reloads within a second of a saved change to ``definition.json``
or a shader file. To force a reload, click **Reload Effect** or refresh the
page. Either way, the viewer:

1. Reloads the effect definition
2. Reloads the shader source
3. Recompiles the effect
4. Preserves the current parameter values

Viewer Structure
----------------

.. code-block:: text

   viewer/
   └── index.html              # Main viewer page

The viewer loads the Noisemaker runtime directly from the CDN at
``shaders.noisedeck.app/<version>/``. It loads the effect from
``/effect/definition.json`` and its shaders from ``/effect/glsl/`` and/or
``/effect/wgsl/``.

Before compiling, the viewer loads the built-in effects that the
``defaultProgram`` depends on (:ref:`portable-format`, Section 8.7). A volume
starter without a default program gets a ``render3d()`` preview; volume
filters provide their input program.

Modifying the Example
---------------------

Change Parameters
^^^^^^^^^^^^^^^^^

Edit ``effect/definition.json`` to add or modify parameters
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

Edit the shader file (for example ``effect/glsl/gradientSweep.glsl``). The
shader declares uniforms that match the parameters in ``definition.json``
(:doc:`portable-shaders`).

Click the **Reload Effect** button in the viewer to see the changes.

Creating a New Effect
---------------------

The viewer loads from the ``effect/`` directory by default. To create a new
effect, replace the files in place:

1. Update ``effect/definition.json``:

   - Change ``name``, ``func`` and ``description``.
   - Define the ``globals``.
   - Update ``passes`` to reference the shader program name.

2. Replace the shader files in ``effect/glsl/`` and/or ``effect/wgsl/``.
3. Make sure the shader file names match the ``program`` names in
   ``passes``.

Troubleshooting
---------------

"Failed to load effect definition"
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Check that the local server is running.
- Check that ``effect/definition.json`` exists and is valid JSON.

"Failed to load GLSL shader"
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Check that the shader path matches ``passes[0].program`` + ``.glsl``.
- Check the browser console for GLSL syntax errors.

Effect does not update
^^^^^^^^^^^^^^^^^^^^^^

- Click the **Reload Effect** button.
- Clear the browser cache and reload.

"No shader found for program"
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Check that at least one shader directory exists (``glsl/`` or ``wgsl/``).
- Check that the shader file names match the ``program`` names in
  ``passes``.

WebGPU not available
^^^^^^^^^^^^^^^^^^^^

- WebGPU requires a compatible browser (Chrome 113+, Edge 113+).
- Some systems need flags enabled.
- The viewer falls back to WebGL automatically if GLSL shaders are available.

Loading Other Effects
---------------------

By default the viewer loads ``../effect/``, relative to the viewer page. To
load another effect, pass its directory (the one that contains
``definition.json``) in the ``effect`` query parameter, as a path relative to
the viewer page or a URL:

.. code-block:: text

   http://localhost:2999/viewer/?effect=../my-other-effect/

For example, ``?effect=../examples/portableBlock3d/`` previews a volume
package from the repository's examples.
