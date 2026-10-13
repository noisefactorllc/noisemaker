Layers: non-destructive media composition
=========================================

`Open Layers <https://layers.noisefactor.io/>`_

Abstract
--------

Layers converts an editable document into a Noisemaker program. The document retains layer order, media, effects, and composition settings. Noisemaker supplies the rendering pipeline, while Layers supplies selections, masks, project storage, recovery, and export. The integration centers on a document-to-program translation rather than a separate graphics implementation for every editing tool. [L1]_ [L2]_

1. Use case and requirements
----------------------------

A user imports an image, adds layers and effects, adjusts the composition, and exports the result. The user must remain able to revise earlier choices without replacing the original media. A working preview must also remain useful when the final image requires a larger resolution. [L1]_

The current editor addresses these requirements:

* Retain source media and editable layer properties separately from rendered pixels.
* Preserve layer order, visibility, opacity, blend modes, and effect parameters.
* Apply selections and masks within the document workflow.
* Restore saved projects and retain recent edits through recovery checkpoints.
* Produce output under an explicit resolution and memory policy. [L1]_ [L2]_ [L3]_

These requirements distinguish an editor from a filter demonstration. The application must preserve editing intent as well as produce an image. The layer model provides that retained intent. [L1]_ [L2]_

2. Integration surface
----------------------

The renderer translates the layer model into DSL. It creates media and effect chains, then combines their outputs through Noisemaker mixer effects. Layer-to-step mappings connect document controls to the compiled graph. The document remains the application model, and the generated program becomes the rendering instruction. [L2]_

.. list-table:: Document operations and engine updates
   :header-rows: 1
   :widths: 35 65

   * - Document operation
     - Rendering response
   * - Change layer structure
     - Generate and compile the corresponding DSL.
   * - Change eligible runtime parameters
     - Apply values to mapped steps without rebuilding the graph.
   * - Change a compile-time parameter
     - Recompile using the new value in the program.
   * - Supply image or video pixels
     - Bind media to the corresponding texture inputs.
   * - Export at another size
     - Render under the export path's resolution policy.

This distinction keeps routine control changes focused. The wrapper examines effect metadata to identify parameters that the engine embeds during compilation. Such parameters require a rebuild even when the visible action resembles an ordinary slider change. [L2]_

3. Implementation decisions
---------------------------

Layers serializes compilation and reconnects media to the resulting pipeline. It retains mappings between application layer identifiers and rendering steps. Some operations inspect the compiled graph to locate the correct passes. The adapter therefore includes document-specific coordination beyond a basic canvas wrapper. The engine still supplies the effect implementations and their execution. [L2]_

The application manages the editing tools around this boundary. Rectangle, oval, lasso, polygon, and color-based selections support different source material. Feathering and expansion refine selections. Projects use IndexedDB, and asynchronous recovery checkpoints retain recent state. A checkpoint can lag an edit, so explicit saving remains part of the workflow. [L1]_

Original image files and dimensions remain available while the editor uses a bounded preview. During export, supported layer combinations render in tiles. Effects that need the whole frame must fit the available GPU resources. This policy separates interactive work from final output without treating every shader as tile-compatible. [L1]_ [L3]_

4. Result and product implications
----------------------------------

The current implementation supports a complete document workflow: import, non-destructive composition, local storage, recovery, and image or video export. The rendering integration serves that workflow through generated programs, texture inputs, and parameter updates. [L1]_ [L2]_

For a developer, the reusable idea is the translation from domain data to an executable composition. A specialized editor can expose only the layer types and controls its audience needs. For a product team, this places product-specific editing rules in the application and shader behavior in the engine. Preview and export can use the same document while applying different resource policies. [L2]_ [L3]_

5. Operating limits
-------------------

Documented exports permit up to 8192 pixels per side and 33,554,432 pixels total, subject to GPU limits. The undo history has a separate estimated memory budget. Neither limit defines total application memory. Tile compatibility and full-frame effects need evaluation with representative documents. [L1]_ [L3]_

Online collaboration currently excludes image and video layers and supports Layers sessions only. Video export uses best-effort frame seeking, so output can differ slightly from the live preview. These constraints matter when selecting shared editing or frame-accurate video workflows. [L1]_ [L4]_

6. References
-------------

.. [L1] `Current editor features and limits <https://github.com/noisefactorllc/layers/blob/a4ab4e7e2b45e9ebd8a75ee5c9113d1049795853/README.md>`_.

.. [L2] `Layer-to-DSL renderer <https://github.com/noisefactorllc/layers/blob/a4ab4e7e2b45e9ebd8a75ee5c9113d1049795853/public/js/noisemaker/renderer.js>`_.

.. [L3] `Full-resolution export implementation <https://github.com/noisefactorllc/layers/blob/a4ab4e7e2b45e9ebd8a75ee5c9113d1049795853/public/js/noisemaker/full-resolution.js>`_.

.. [L4] `Live export interface <https://layers.noisefactor.io/>`_.
