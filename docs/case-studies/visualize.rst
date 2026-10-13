Visualize: independent decks with shader-based mixing
=====================================================

`Open Visualize <https://visualize.noisedeck.app/>`_

Abstract
--------

Visualize combines two independently rendered compositions through a third Noisemaker pipeline. Each deck retains its own program and speed. A shader mixer receives the deck canvases, and a final canvas supplies recording and projection. Audio analysis, MIDI control, scenes, and automatic transitions surround this rendering structure. The case demonstrates composition through ordinary canvas inputs and a small parameter-update contract. [V1]_ [V2]_ [V3]_

1. Use case and requirements
----------------------------

A performer selects the next visual on the inactive deck while the current deck remains visible. The crossfader transfers the output between them. Audio or MIDI can control the composition, and Auto-VJ can prepare and transition between programs automatically. A separate window supplies projector output. [V1]_

This workflow requires:

* Keep the two programs independent during preparation and playback.
* Change the crossfade without rebuilding both deck programs.
* Use a common audio analysis source for reactive parameters.
* Give manual controls predictable behavior after scene recall or automatic changes.
* Supply recording and projection from the same final composition. [V1]_ [V2]_ [V3]_

The deck, mixer, and output stages address these requirements separately. A change in one deck does not require the application to describe the other deck's internal effect chain to the mixer. [V2]_

2. Integration surface
----------------------

Each deck owns a ``CanvasRenderer``. ``MixerRenderer`` owns another renderer and binds the deck canvases as two media inputs. Its generated program reads those inputs and applies the selected mixer effect. After compilation, it locates the media and mixer steps in the compiled graph. [V1]_ [V2]_

Crossfader movement normally updates one parameter on the mixer step. The following excerpt shows the successful update path after the wrapper checks the renderer and step mapping. [V2]_

.. code-block:: javascript
   :caption: Update the mixer without recompiling the decks

   const stepKey = `step_${this._mixerStep}`
   const driver = mixer.driver
   const value = this._driverValue(mixer, xfade)
   renderer.applyStepParameterValues({
       [stepKey]: { [driver]: value }
   })

Each mixer defines the parameter that drives its transition and the formula that maps the crossfader into that parameter. The compilation path uses the same formula. If the direct update path is unavailable, the wrapper schedules a new mixer compilation. The two deck programs remain separate in either path. [V2]_

3. Implementation decisions
---------------------------

The mixer samples deck canvases as textures. Its readiness check requires an uploaded frame before the final compositor uses its output. Before that point, ``MainCompositor`` blends the deck canvases directly through a 2D canvas. It also uses this fallback when the shader mixer fails. Recording and projection consume the final canvas through either path. [V2]_ [V3]_

A shared audio analyzer supplies frequency information to deck audio states. Programs map audio bands to parameters through DSL automation. MIDI soft takeover waits for a physical control to reach the software value before changing it. This prevents a stale hardware position from immediately replacing a value selected by a scene or automatic transition. [V1]_

Auto-VJ loads a new program into the inactive deck and fades to it according to the selected timing and curve. Named scenes retain performance settings, while session recovery restores the live set after a reload. The deck wrapper also permits a lower internal rendering resolution through its pixel-density setting. These policies belong to the application around the common renderer. [V1]_ [V4]_

4. Result and product implications
----------------------------------

The result supports both direct performance and scheduled visual changes. Programs, mixer effects, input mappings, and output features remain separate parts of the application. A new mixer can change the transition without replacing either source composition. [V1]_ [V2]_

For a developer, the key reuse is recursive: a rendered composition can become media input to another composition. A product team can use this structure for installations or visual playback with a curated program library. Selection rules, schedules, and controls can specialize the experience while the same engine renders and combines the visuals. [V1]_ [V2]_

5. Operating limits
-------------------

The normal path runs three pipelines and uploads both deck outputs to the mixer. Independent loops do not guarantee identical input timestamps. The 2D fallback does not reproduce every shader mixer. Workload evaluation must include the chosen deck programs, transition, and output dimensions. Recording warns at 15 minutes and stops at 60 minutes to constrain browser memory. [V1]_ [V2]_ [V3]_

6. References
-------------

.. [V1] `Features and architecture <https://github.com/noisefactorllc/visualize/blob/1c1bfedb56f86ced0220b8254bb93e0f903a05ae/README.md>`_.

.. [V2] `Shader mixer pipeline <https://github.com/noisefactorllc/visualize/blob/1c1bfedb56f86ced0220b8254bb93e0f903a05ae/js/mixer.js>`_.

.. [V3] `Final output compositor <https://github.com/noisefactorllc/visualize/blob/1c1bfedb56f86ced0220b8254bb93e0f903a05ae/js/compositor.js>`_.

.. [V4] `Deck lifecycle and rendering dimensions <https://github.com/noisefactorllc/visualize/blob/1c1bfedb56f86ced0220b8254bb93e0f903a05ae/js/noisemaker/deck.js>`_.
