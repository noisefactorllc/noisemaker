Polymorphic: an editor for live shader composition
==================================================

`Open Polymorphic <https://polymorphic.noisedeck.app/>`_

Abstract
--------

Polymorphic turns Noisemaker's composition language into a live visual instrument. Users edit programs over a full-window canvas, connect live inputs, recall scenes, and record output. An illustrated effect book provides executable starting points. The application extends the engine through an authoring interface and source adapters while retaining DSL as the common program representation. [M1]_ [M2]_

1. Use case and requirements
----------------------------

The authoring workflow starts with a program and its visible result. A user changes code or scrubs a numeric literal, evaluates the program, and observes the output. Successful programs enter snapshot history. During performance, scene recall, tempo controls, live inputs, and a hidden interface turn the same editor into a visual instrument. [M1]_

The implementation addresses these requirements:

* Evaluate complete programs or selected blocks within the current session.
* Distinguish editable text from successfully compiled programs.
* Connect camera, screen, image, and text sources to effect programs.
* Recall compositions and select among eight named output surfaces.
* Reuse examples from the effect reference as editable application programs. [M1]_ [M2]_

The central product choice is to expose composition code directly. Users combine existing effects through DSL instead of implementing every graphics pass in GLSL or WGSL. The application can therefore focus on editing and performance interactions. [M1]_

2. Integration surface
----------------------

``PolymorphicRenderer`` wraps ``CanvasRenderer``. It resolves effect names through the manifest, loads the required bundles, and submits the engine program to ``compile()``. Its result reports success or a compilation error to the editor. Application modules provide the surrounding controls and history. [M1]_ [M2]_

.. list-table:: Authoring features and engine inputs
   :header-rows: 1
   :widths: 30 35 35

   * - Authoring feature
     - Application work
     - Engine boundary
   * - Edited composition
     - Manage text, evaluation, and history.
     - Compile DSL and report errors.
   * - Image source
     - Resolve the media and retain its dimensions.
     - Upload pixels to the corresponding media step.
   * - Text source
     - Load fonts and rasterize text.
     - Supply the resulting texture.
   * - Session inspection
     - Show the performance overlay.
     - Read frame timing, pass count, and active backend.

This boundary also distinguishes application conveniences from engine syntax. The wrapper extracts media URL arguments before passing the program to the engine. It then binds the corresponding images as textures. Resource lookup remains an application concern rather than an implicit operation inside every shader. [M2]_

3. Implementation decisions
---------------------------

Text follows the same principle. The application rasterizes text and uploads the result to the appropriate rendering step. Text controls can require a new texture even when the graph does not require compilation. The wrapper provides a refresh path for those edits and retains decoded image dimensions when controls apply their values. [M2]_

The interface supports up to nine scenes, tempo control, microphone and MIDI input, camera and screen capture, and still or video recording. Performance mode hides the controls. The output picker selects among surfaces ``o0`` through ``o7``. These features operate around the program and canvas rather than defining another effect format. [M1]_

The Book of Polymorphic DSL derives its example programs from shipped engine bundles. It excludes examples that require unavailable inputs or produce no useful standalone demonstration. Each included effect receives an explanation and further-reading links. A reader can edit the page's program or open it in Polymorphic. The reference and application therefore share executable source material. [M1]_

4. Result and product implications
----------------------------------

Polymorphic combines experimentation, reference material, and performance in one program workflow. A composition can start as an effect example, become an edited sketch, and enter a scene or recording. The application preserves the same DSL representation through these uses. [M1]_

For a developer, this case shows how a language-based interface can expose an existing graphics engine without creating a new effect system. For a product team, editable examples connect technical education directly to product use. The application adds value through the authoring workflow, while the engine supplies compilation and effect execution. [M1]_ [M2]_

5. Operating limits
-------------------

The self-hosted editor loads engine, interface, and font assets from external services. Sharing and collaboration use separate services, and optional native inputs and outputs require local software. Camera, microphone, and screen access depend on browser permissions. Device evaluation should use the actual backend, representative programs, and required media sources. [M1]_

6. References
-------------

.. [M1] `Editor features, hosting, and effect-book methods <https://github.com/noisefactorllc/polymorphic/blob/0dd69913441baf1d4c3a0d72fd28ea669dc5187d/README.md>`_.

.. [M2] `Renderer wrapper <https://github.com/noisefactorllc/polymorphic/blob/0dd69913441baf1d4c3a0d72fd28ea669dc5187d/public/js/noisemaker/renderer.js>`_.
