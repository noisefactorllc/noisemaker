Noisedeck: visual and code-based composition editing
====================================================

`Open Noisedeck <https://noisedeck.app/>`_

Abstract
--------

Noisedeck presents Noisemaker through visual controls and a synchronized DSL editor. Classic mode offers a guided composition, while free-form mode exposes the effect graph. Program management, randomization, automation, custom effects, and export surround this shared representation. The case demonstrates how an engine can support a complete creative product without requiring every user to write code. [N1]_ [N2]_

1. Use case and requirements
----------------------------

A user starts with visual controls, selects effects, and adjusts a composition against a live preview. When the composition needs more control, the user can edit its DSL. Saved programs and undo preserve the editing workflow. Rendered media and exported shader projects provide different ways to use the result outside the editor. [N1]_ [N5]_

This workflow requires:

* Keep visual controls and source code consistent after edits.
* Offer a guided starting point without excluding more complex compositions.
* Preserve programs as editable compositions rather than only rendered images.
* Allow custom effects to participate in the existing program model.
* Distinguish rendered output from an executable project for another runtime. [N1]_ [N3]_ [N5]_

The shared program representation connects these requirements. Both editing modes describe a composition for the same engine. The application chooses how much structure and detail the interface exposes. [N1]_ [N2]_

2. Integration surface
----------------------

Classic mode provides a fixed composition workflow. Free-form mode lets users add, remove, reorder, and connect effects. Visual and DSL edits describe the same composition, and changes appear in both editors. Subchains group effects into reusable parts of a program. [N1]_

.. list-table:: Composition contracts
   :header-rows: 1
   :widths: 30 35 35

   * - Contract
     - Engine contribution
     - Application contribution
   * - Program and effect parameters
     - Compile and render the composition.
     - Present controls and keep code synchronized.
   * - Effect definition
     - Define parameters and rendering passes.
     - Import the effect and expose its controls.
   * - Rendered canvas
     - Produce the visual result.
     - Capture images or video.
   * - Exported program
     - Supply executable composition semantics.
     - Package the program, runtime, and target instructions.

This is a set of shared data contracts rather than a separate rendering implementation for each editor. Noisedeck manages user actions and retained state. Noisemaker supplies generators, filters, mixers, volume processing, and point simulations through the program model. [N1]_ [N2]_

3. Implementation decisions
---------------------------

Custom effects use the Portable Effects Format. A minimal package contains ``definition.json`` and a GLSL shader. The definition declares the name, controls, and render passes. A WGSL shader supports the other browser backend, and a help document supplies effect documentation. Imported effects enter the ``user`` namespace and participate in compositions through the existing DSL. [N3]_

Export separates visual delivery from executable delivery. Image and video exports produce media. Shader-pipeline export produces a project containing ``program.dsl``, setup instructions, an export manifest, and dependency licenses. The manifest records the engine version and build. Options include shader sources and engine code, with details that depend on the target. [N1]_ [N5]_

Print export uses another policy. Compatible programs render as tiles with overlap before the application assembles the image. If any effect is incompatible, the whole export uses a bilinear enlargement of the current canvas. This distinction makes the program's effects part of the output decision, not merely its appearance. [N4]_

4. Result and product implications
----------------------------------

The product gives visual editing and code editing access to one composition model. Custom effects extend that model, and export can preserve it as an executable program. Users can progress from a guided composition to a more specialized graph without adopting another rendering language. [N1]_ [N3]_ [N5]_

For a developer, the case demonstrates reuse through programs and effect metadata. A product team can select the interface, catalog, and delivery workflows appropriate to its audience. The engine supplies the graphics vocabulary, while the application supplies discoverability, retained work, and output choices. These boundaries explain how a common engine can support both introductory controls and advanced authoring. [N1]_ [N2]_

5. Operating limits
-------------------

Portable imports currently support 2D generators and filters. Other effect categories need different integration paths. Print export supports dimensions up to 16384 by 16384 pixels, with subscription and effect-compatibility constraints. Shader export support varies by target. Each output workflow therefore needs qualification for the intended program and destination. [N3]_ [N4]_ [N5]_

Noisedeck has its own license and subscription features. Noisemaker's open source license does not grant permission to redistribute the Noisedeck application. [N6]_

6. References
-------------

.. [N1] `Noisedeck user documentation <https://noisedeck.app/docs/Home.md>`_.

.. [N2] `Noisemaker pipeline integration <https://docs.noisemaker.app/shaders/integration/>`_.

.. [N3] `Custom shader workflow <https://noisedeck.app/docs/Custom-Shaders.md>`_.

.. [N4] `Print export workflow <https://noisedeck.app/docs/Print-Export.md>`_.

.. [N5] `Shader-pipeline export workflow <https://noisedeck.app/docs/Shader-Pipeline-Export.md>`_.

.. [N6] `Noisedeck license agreement <https://noisedeck.app/docs/legal/Noisedeck_EULA.md>`_.
