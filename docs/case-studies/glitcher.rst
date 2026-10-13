glitchin' out: a configurable media effect stack
================================================

`Open glitchin' out <https://glitcher.noisefactor.io/>`_

Abstract
--------

glitchin' out turns a camera or image into an editable sequence of glitch effects. Its central design decision separates effect selection from effect implementation. The application describes a composition through Noisemaker's domain-specific language, or DSL. Noisemaker compiles and renders that composition. An ordered stack, intensity controls, randomization, capture, and a local gallery turn this engine interface into a focused creative tool. [G1]_ [G2]_ [G3]_

1. Use case and requirements
----------------------------

The workflow starts with a source and a visual experiment. A user selects the camera or an image, adds effects, changes their order, and adjusts their intensity. A useful result can become a photo or video in the local gallery. The user can also explore starter chains or generate a new combination with GLITCHIFY. [G1]_

This workflow places four requirements on the integration:

* Preserve the order of effects, because each effect changes the input to the next.
* Let an intensity control change the current appearance without selecting a new random result.
* Use the same effect controls for camera frames and still images.
* Keep capture and saved media independent of the current stack. [G1]_ [G2]_

The distinction between intensity and randomization matters. Each slot retains a randomized parameter snapshot. Intensity interpolates between the effect's defaults and that snapshot. A separate action generates another snapshot. This gives a simple control a repeatable meaning during an editing session. [G2]_

2. Integration surface
----------------------

The stack model contains an effect identifier, intensity, and randomized values for each slot. It emits a DSL chain that starts with ``media()`` and ends at a named output. Adding, removing, replacing, or reordering a slot changes this chain. The renderer resolves effect names through the manifest, loads missing effect bundles, and compiles the program. [G2]_ [G3]_

Intensity changes take a narrower path. The stack builds a map of parameter values, and the renderer passes it to ``applyStepParameterValues()``. The application does not need to generate shader source for each slider movement. In this application's linear program, the media source occupies step zero and effect slots follow it. [G2]_ [G3]_

The following JavaScript excerpt shows the complete mapping method. It runs inside ``EffectStack`` and uses the existing interpolation helper. [G2]_

.. code-block:: javascript
   :caption: Map stack controls to rendering steps

   buildLiveParams() {
       const out = {}
       this._slots.forEach((slot, i) => {
           const params = this._computeLerp(slot)
           if (Object.keys(params).length === 0) return
           out[`step_${i + 1}`] = params
       })
       return out
   }

This step rule belongs to the generated stack format. An application with branches or multiple media inputs must derive the corresponding mappings for its own program.

3. Implementation decisions
---------------------------

``GlitcherRenderer`` accepts an image, video, or canvas as its source. It uploads that source through ``updateTextureFromSource()``. The wrapper updates ``imageSize`` when dimensions change and reapplies it after compilation. It starts and stops the upload loop alongside rendering. Source handling therefore remains separate from effect selection. [G3]_

Randomization uses the same model as manual editing. A slot can receive a new snapshot while retaining its position and effect. GLITCHIFY replaces the stack with a short random combination. Starter chains provide an initial composition that users can edit through the same controls. These paths share the renderer instead of requiring separate graphics implementations. [G1]_ [G2]_

The application supplies the surrounding media workflow. It selects the camera, accepts an uploaded image, captures output, and stores gallery media in IndexedDB. These responsibilities use browser media and storage facilities. They do not change the engine's effect contract. [G1]_

4. Result and product implications
----------------------------------

The result is a media tool with both guided and exploratory use. A user can adjust a known chain or search for another appearance through controlled randomization. The gallery gives this exploration a retained output. [G1]_

The integration concentrates product decisions in the stack model and interface. A developer can curate another effect selection or change the controls while retaining the renderer. A product team can use this pattern for a focused image tool or branded capture experience. Its distinctive behavior comes from the chosen controls and workflow, while Noisemaker supplies the underlying effects. [G2]_ [G3]_

5. Operating limits
-------------------

The renderer requests WebGL2. Camera access requires permission, and video formats depend on browser recording support. Increasing stack depth adds rendering work even when parameter updates avoid compilation. Device evaluation should use the intended source dimensions and representative stacks. Gallery media remains local to the browser. [G1]_ [G3]_

6. References
-------------

.. [G1] `Application features <https://github.com/noisefactorllc/glitcher/blob/cc59756708e9693bfb377c9d99809411c22e9e48/README.md>`_.

.. [G2] `Effect stack model <https://github.com/noisefactorllc/glitcher/blob/cc59756708e9693bfb377c9d99809411c22e9e48/public/js/stack.js>`_.

.. [G3] `Renderer integration <https://github.com/noisefactorllc/glitcher/blob/cc59756708e9693bfb377c9d99809411c22e9e48/public/js/noisemaker/renderer.js>`_.
