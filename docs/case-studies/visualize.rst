Visualize: two decks and a shader mixer
=======================================

`Open Visualize <https://visualize.noisedeck.app/>`_

Visualize is a music visualizer and VJ player that runs in the browser.
It has two decks, and each deck plays its own shader program at its own speed.
A crossfader mixes the decks.
Visualize also has audio reactivity, MIDI control, scenes, an automatic VJ mode, recording, and a projector window. [V1]_

How it uses Noisemaker
----------------------

Visualize runs three Noisemaker pipelines.
Each deck owns a ``CanvasRenderer``.
``MixerRenderer`` owns a third ``CanvasRenderer``, which takes the two deck canvases as media inputs. [V1]_ [V2]_ [V4]_

The mixer program is five lines: [V2]_

.. code-block:: javascript
   :caption: Mixer program in MixerRenderer._recompile(), mixer.js

   const dsl = [
       `search synth, mixer, render`,
       `media().write(o0)`,
       `media().write(o1)`,
       `read(o0).${effectShortName(mixer.id)}(${args}).write(o2)`,
       `render(o2)`,
   ].join('\n')

The mixer pipeline does not know the deck programs.
On each mixer frame, it uploads the current deck frames with ``updateTextureFromSource()``.
With WebGL2, it reads the deck canvases.
A WebGPU canvas keeps its frame only during the task that drew it.
With WebGPU, each deck copies every frame to a 2D canvas, and the mixer reads that copy. [V2]_ [V4]_
It sets ``imageSize`` on both media steps to the mixer's output size, not to the deck buffer size. [V2]_

After each compile, the wrapper finds the step numbers in ``renderer._pipeline.graph.passes``.
A pass with an ``imageTex`` input is a media step.
The pass with both ``inputTex`` and ``tex`` inputs is the mixer step.
``_pipeline`` is not a public engine property. [V2]_

Crossfader moves do not compile anything.
Each of the six mixers names one driver parameter and a formula that maps the crossfader to it.
For example, ``mixer/blendMode`` drives ``mix`` with ``x * 200 - 100``. [V5]_
The fast path writes that one value: [V2]_

.. code-block:: javascript
   :caption: MixerRenderer._tryFastPathSetMix() in mixer.js

   _tryFastPathSetMix(xfade) {
       const mixer = this.currentMixer
       const renderer = this.renderer
       if (!renderer || !mixer) return false
       if (this._mixerStep == null) return false
       if (typeof renderer.applyStepParameterValues !== 'function') return false
       try {
           const stepKey = `step_${this._mixerStep}`
           const driver = mixer.driver
           const value = this._driverValue(mixer, xfade)
           renderer.applyStepParameterValues({ [stepKey]: { [driver]: value } })
           return true
       } catch (err) {
           console.warn('[mixer] fast-path setMix failed:', err?.message || err)
           return false
       }
   }

If the fast path returns ``false``, the wrapper compiles the mixer program again after 60 ms.
The compile path uses the same driver formula, so the output does not jump. [V2]_ [V5]_

Work outside the engine
-----------------------

``MainCompositor`` draws the final output on a 2D canvas.
It draws the mixer output after the mixer receives one frame from each deck.
Before that, it crossfades the two deck frames with the 2D canvas API.
With WebGPU, it reads the same 2D frame copies.
It also stays on this 2D crossfade when the mixer fails to start. [V2]_ [V3]_ [V6]_
Recording and the projector window both read the final canvas. [V1]_

One audio analyzer feeds the low, mid, and high bands to both decks.
Programs read the bands with the ``audio()`` automation in the DSL. [V1]_

MIDI faders use soft takeover.
A fader takes control only when its position comes within 0.02 of the software value, or crosses it.
This stops a jump after a scene recall or an automatic crossfade. [V1]_ [V7]_

Each deck has a pixel density setting from 0.1 to 1.0.
In automatic mode, Visualize uses 0.5 for programs that contain a ``points/`` effect or an effect tagged ``sim``.
The speed control sets the loop duration to the base duration divided by the speed. [V4]_ [V6]_

Limits
------

* The three render loops run independently, so the mixer can combine deck frames from different moments. [V2]_
* The 2D fallback has only the crossfade curves. It does not draw the shader mixers. [V3]_
* After the mixer receives its first frames, a failed mixer compile does not bring back the 2D fallback. [V2]_
* Recording keeps the video in memory. It warns at 15 minutes and stops at 60 minutes. [V1]_ [V8]_

Sources
-------

All links point to visualize revision ``5ba3b81``.

.. [V1] `README <https://github.com/noisefactorllc/visualize/blob/5ba3b81a0ca4317ecef833b16b9789934952940f/README.md>`_.

.. [V2] `Shader mixer (mixer.js) <https://github.com/noisefactorllc/visualize/blob/5ba3b81a0ca4317ecef833b16b9789934952940f/js/mixer.js>`_.

.. [V3] `Final compositor (compositor.js) <https://github.com/noisefactorllc/visualize/blob/5ba3b81a0ca4317ecef833b16b9789934952940f/js/compositor.js>`_.

.. [V4] `Deck renderer (deck.js) <https://github.com/noisefactorllc/visualize/blob/5ba3b81a0ca4317ecef833b16b9789934952940f/js/noisemaker/deck.js>`_.

.. [V5] `Mixer definitions (mixers.js) <https://github.com/noisefactorllc/visualize/blob/5ba3b81a0ca4317ecef833b16b9789934952940f/js/mixers.js>`_.

.. [V6] `Application setup (app.js) <https://github.com/noisefactorllc/visualize/blob/5ba3b81a0ca4317ecef833b16b9789934952940f/js/app.js>`_.

.. [V7] `MIDI soft takeover (midi.js) <https://github.com/noisefactorllc/visualize/blob/5ba3b81a0ca4317ecef833b16b9789934952940f/js/midi.js>`_.

.. [V8] `Recorder (recorder.js) <https://github.com/noisefactorllc/visualize/blob/5ba3b81a0ca4317ecef833b16b9789934952940f/js/recorder.js>`_.
