Shuffleset: an audio visualizer in a media player
=================================================

`Open Shuffleset <https://shuffleset.stream/>`_

Shuffleset is a media streaming site.
Its audio player shows cover art and a track list, and plays sets in order or shuffled.
A Noisemaker visualizer fills the area behind the cover art and the track list. [S1]_

How it uses Noisemaker
----------------------

The visualizer is one DSL program, stored as a constant in the player module: [S1]_

.. code-block:: text
   :caption: VISUALIZER_DSL in audio-view.js

   search synth, filter, render

   scope(
     color: #ffffffff,
     thickness: 3,
     gain: 1
   )
     .subchain(name: "feedback loop with waves", id: "ny2d") {
       .loopBegin(alpha: 85)
       .warp(
         strength: 3.49,
         scale: -0.45,
         speed: 5
       )
       .feedback(
         blendMode: lighten,
         mix: 42.31,
         scaleAmt: 112.6
       )
       .loopEnd()
     }
     .subchain(name: "lens effects", id: "01h4") {
       .chromaticAberration(aberration: 25)
       .bloom(taps: 15)
       .lens(displacement: -0.91)
       .vignette()
     }
     .write(o0)

   render(o0)

In this program, only ``scope()`` reads audio.
It draws the waveform from the ``audioWaveform`` uniform, which holds 128 samples. [S4]_

``NoisemakerRenderer`` wraps one ``CanvasRenderer`` with ``preferWebGPU: false``, so the visualizer renders with WebGL2.
It loads the effect manifest, loads the effects that the program names, and compiles the program. [S2]_

``connectAudio()`` connects the player's ``<audio>`` element to the engine:

#. Create an ``AudioContext`` and an ``AnalyserNode`` with ``fftSize = 256``.
#. Connect the audio element to the analyser with ``createMediaElementSource()``, and connect the analyser to the audio output.
#. Get the engine's audio state with ``setAudioState()``.
#. Start the update loop. [S2]_

The update loop runs on each animation frame:

.. code-block:: javascript
   :caption: NoisemakerRenderer._audioUpdate() in renderer.js

   _audioUpdate() {
       if (!this._audioEnabled) return
       this._audioState.updateFromAnalyser(this._audioAnalyser, 8)
       this._audioAnalyser.getByteFrequencyData(this._fftData)
       this._audioState.setSpectrum(this._fftData)
       this._audioAnalyser.getByteTimeDomainData(this._timeDomainData)
       this._audioState.setWaveform(this._timeDomainData)
       this._audioAnimId = requestAnimationFrame(() => this._audioUpdate())
   }

``updateFromAnalyser()`` calculates the low, mid, and high bands.
Its second argument is the number of frames in the rolling average, from 1 to 10.
``setSpectrum()`` and ``setWaveform()`` keep the first 128 values of each array. [S2]_ [S3]_

Work outside the engine
-----------------------

The player connects the audio on the first play request, not when the view opens.
The goal is to create the ``AudioContext`` during a user action, because Safari otherwise creates it suspended. [S1]_

After ``createMediaElementSource()``, all sound goes through the ``AudioContext``.
If the browser suspends the context, the player is silent.
The wrapper tries to resume the context, and it adds a one-time resume on the next click, touch, or key press. [S2]_

If the visualizer fails to start, the player disposes the renderer and hides the canvas.
It never creates an ``AudioContext``, so the audio element plays directly. [S1]_

When the view closes, ``dispose()`` stops the update loop, disconnects the source, closes the ``AudioContext``, and resets the audio state.
Then it disposes the ``CanvasRenderer`` with ``{ loseContext: true, resetCanvas: true }``. [S2]_

Limits
------

* A suspended ``AudioContext`` silences playback, not only the visualizer. [S2]_
* The visualizer program is part of the player module. A new visual means a change to that module. [S1]_
* The canvas matches the CSS pixel size of its area and ignores the device pixel ratio. [S1]_

Sources
-------

S1 and S2 are the files that shuffleset.stream serves. Shuffleset's source repository is private.
S3 and S4 point to noisemaker revision ``d54a808``.

.. [S1] `Audio player view (audio-view.js) <https://shuffleset.stream/js/audio-view.js>`_.

.. [S2] `Renderer and audio adapter (renderer.js) <https://shuffleset.stream/js/noisemaker/renderer.js>`_.

.. [S3] `Engine audio state (external-input.js) <https://github.com/noisefactorllc/noisemaker/blob/d54a808b0feac4cc33df716c46b748cd026d2259/shaders/src/runtime/external-input.js>`_.

.. [S4] `Scope effect shader (scope.glsl) <https://github.com/noisefactorllc/noisemaker/blob/d54a808b0feac4cc33df716c46b748cd026d2259/shaders/effects/synth/scope/glsl/scope.glsl>`_.
