Noisedeck: a shader video synthesizer
=====================================

`Open Noisedeck <https://noisedeck.app/>`_

Noisedeck is Noise Factor's shader-based video synthesizer for animated art. [N1]_

Noisedeck stores every composition as a program in Noisemaker's DSL. [N4]_
Noisedeck renders that program with the engine and adds editing, saved programs, randomization, automation, custom effects, and export. [N1]_

Two composition modes
---------------------

* **Classic** is the default mode. It has a fixed effect pipeline, like the original Noisedeck.
* **Free-form** lets users chain effects in the visual editor or in the DSL editor, and control the whole effect graph.

The Program menu converts a classic composition to free-form.
3D effects and points effects are available only in free-form mode. [N1]_

In free-form mode, the visual editor and the DSL editor show the same program.
A change in one editor appears at once in the other. [N1]_

Effects come from the engine's catalog: generators, filters, mixers, 3D generators and filters, render utilities, and points simulations. [N1]_
Users can select the WebGL2 or WebGPU backend in the app settings. [N1]_

Custom effects
--------------

Noisedeck imports custom effects in the Portable Effects Format. [N2]_
A minimal package has a ``definition.json`` file and a GLSL shader.
A full package also has a WGSL shader for WebGPU and a ``help.md`` file. [N2]_
Imported effects go into the ``user`` namespace, and programs use them like built-in effects. [N2]_

Version 1.1 of the format adds 3D volume effects: packages can make or process 3D volumes, or render volumes into images. [N6]_
The Noisedeck importer reads the 3D fields of these packages. [N7]_

Export
------

Noisedeck has three kinds of export:

* **Image and video**: files from the canvas. [N1]_
* **Print**: images up to 16384 × 16384 pixels, for subscribers. Print export renders the program in tiles that overlap by 1024 pixels on each side, and then joins the tiles. If the program has any effect that cannot render in tiles, the whole export becomes a bilinear upscale of the current canvas. [N3]_
* **Shader pipeline**: a zip with a project for another engine, for subscribers. [N4]_

A shader-pipeline export always contains: [N4]_

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - File
     - Contents
   * - ``README.md``
     - Setup instructions for the target platform
   * - ``program.dsl``
     - The program source, as Noisedeck stores it
   * - ``noisedeck-export.json``
     - Export time, contents, and the engine build
   * - ``LICENSES/``
     - Licenses for the exported dependencies

Targets include a standalone web page, Three.js, Babylon.js, cables.gl, Godot, Qt, TouchDesigner, Blender, Unity, and CPU-only packages.
Two options add the effect shader source and the engine runtime.
Before the export, the dialog lists the effects that the target cannot render. [N4]_

License
-------

Noisemaker uses the MIT license.
Noisedeck is a separate product with its own license agreement.
That agreement does not allow users to copy, change, or distribute the Noisedeck software without written consent from Noise Factor.
Users can freely use and distribute the content that they make with Noisedeck. [N5]_

Sources
-------

.. [N1] `Noisedeck user guide <https://noisedeck.app/docs/Home.md>`_.

.. [N2] `Adding your own shaders <https://noisedeck.app/docs/Custom-Shaders.md>`_.

.. [N3] `Export for print <https://noisedeck.app/docs/Print-Export.md>`_.

.. [N4] `Export shader pipeline <https://noisedeck.app/docs/Shader-Pipeline-Export.md>`_.

.. [N5] `Noisedeck license agreement <https://noisedeck.app/docs/legal/Noisedeck_EULA.md>`_.

.. [N6] `Portable Effects Format specification, version 1.1 <https://github.com/noisefactorllc/portable/blob/291a89ca491dda72052a98681122eca2e26bfd4c/docs/FORMAT.md>`_.

.. [N7] `Noisedeck effect importer (userEffects.js) <https://noisedeck.app/js/features/userEffects.js>`_, as served by noisedeck.app.
