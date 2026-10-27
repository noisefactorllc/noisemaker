Polymorphic: a live-coding editor for the DSL
=============================================

`Open Polymorphic <https://polymorphic.noisedeck.app/>`_

Polymorphic is a live-coding editor for Noisemaker's DSL.
The shader fills the browser window, and the editor floats on top of it.
Users type a program and see the result as they type. [M1]_

The editor can evaluate the whole program or one block.
Alt-drag on a number changes the number live.
Snapshot history keeps the programs that compiled, so users can undo and redo them. [M1]_

How it uses Noisemaker
----------------------

``PolymorphicRenderer`` wraps one ``CanvasRenderer``.
It loads the engine and the effect bundles from ``https://shaders.noisedeck.app/1``. [M2]_

``PolymorphicRenderer.compile()`` runs these steps: [M2]_

#. If the program uses ``media(url: ...)``, remove the URL arguments. The engine does not accept them.
#. Find the effect names with ``extractEffectNamesFromDsl()``.
#. Load those effects with ``loadEffects()``.
#. Compile the program.
#. Upload a texture for each ``text()`` step.
#. Bind each image URL to its ``media()`` step.

It returns ``{ success: true }``, or ``{ success: false, error }`` with the compile error for the editor.

Text and images enter the program as textures: [M2]_

* Polymorphic draws each ``text()`` step on a canvas and uploads it as ``textTex_step_N`` with ``flipY: true``.
* For ``media(url: ...)``, Polymorphic loads image helpers from ``sharing.noisedeck.app`` at run time. The helpers upload each image as ``imageTex_step_N``.

WebGL2 is the default backend.
The ``?backend=webgpu`` URL parameter selects WebGPU.
If the browser has no WebGPU adapter, Polymorphic falls back to WebGL2. [M1]_ [M2]_

When the browser loses the WebGL context, Polymorphic stops the render loop.
When the browser restores the context, Polymorphic compiles the program again.
A lost WebGPU device does not come back, so Polymorphic disposes the old pipeline and compiles on a new device. [M2]_

The performance overlay shows the frame rate, frame time, pass count, and backend. [M1]_

Work outside the engine
-----------------------

* Live inputs: microphone, MIDI control changes and clock, webcam, and screen capture. [M1]_
* Scenes: up to 9 programs, which the number keys recall. [M1]_
* Tempo: tap tempo, or a clock from MIDI. [M1]_
* Recording: WebM video from the canvas, and PNG or JPG stills. [M1]_
* Output picker: preview and select one of the eight surfaces, ``o0`` to ``o7``. [M1]_
* Performance mode hides all controls for projection. [M1]_
* Polymorphic can import custom effects in the Portable Effects Format. [M1]_

The Book of Polymorphic DSL
---------------------------

The book at `polymorphic.noisedeck.app/book <https://polymorphic.noisedeck.app/book/>`_ has one page for each included effect.
A script imports the shipped effect bundles and makes each page's program from the effect's default values.
The book leaves out effects that need a camera, a microphone, or a MIDI keyboard.
It also leaves out effects that show nothing useful on their own, such as a blur on a field with no edges.
Each page explains the effect and links to further reading.
Readers can edit the program on the page or open it in Polymorphic. [M1]_

Limits
------

* The editor loads the shaders, the interface library, and the fonts from Noise Factor servers. A self-hosted copy still needs internet access. [M1]_
* Sharing, Noisedeck handoff, community feeds, and Seance use Noise Factor services. Image URLs in a program also need ``sharing.noisedeck.app``. [M1]_ [M2]_
* Sync input and output need a local Sync installation. [M1]_
* Camera, microphone, and screen capture need browser permission, and HTTPS on any host other than localhost. [M1]_

Sources
-------

All links point to polymorphic revision ``0dd6991``.

.. [M1] `README <https://github.com/noisefactorllc/polymorphic/blob/0dd69913441baf1d4c3a0d72fd28ea669dc5187d/README.md>`_.

.. [M2] `Renderer wrapper (renderer.js) <https://github.com/noisefactorllc/polymorphic/blob/0dd69913441baf1d4c3a0d72fd28ea669dc5187d/public/js/noisemaker/renderer.js>`_.
