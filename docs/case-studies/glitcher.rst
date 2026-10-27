glitchin' out: a stack of glitch effects
========================================

`Open glitchin' out <https://glitcher.noisefactor.io/>`_

glitchin' out applies a stack of glitch effects to a camera feed or an image.
Users add, remove, and reorder effects, and set an intensity for each effect.
The GLITCHIFY button makes a random stack of 2 to 4 effects.
Users can save a photo or a video to a gallery in the browser. [G1]_

How it uses Noisemaker
----------------------

The effect stack writes one DSL program.
The program starts with ``media()``, adds one call for each effect, and writes the result to ``o0``.
An empty stack renders the source with no effects. [G2]_

.. code-block:: text
   :caption: Program for the Datamosh starter chain, with line breaks added

   search synth, filter, classicNoisedeck

   media().corrupt(intensity: 41.0, bandHeight: 6.0, sort: 0.0, shift: 0.0, channelShift: 0.0, melt: 0.0, scatter: 7.0, bits: 0.0, speed: 3)
     .lensDistortion(shape: cosine, distortion: 0.0, mode: chromaticRgb, aberration: 28.15, hueRotation: 85.079, hueRange: 36.85, saturation: 10.45, passthru: 53.6, vignetteAmt: 0.0, speed: 0.0)
     .write(o0)

   render(o0)

The parameter values come from a random snapshot, so they change each time.

``GlitcherRenderer`` wraps one ``CanvasRenderer``.
To compile a program, it finds the effect names, loads the effects that are not yet registered, and calls ``compile()``.
When the user adds, removes, or moves an effect, the app builds a new program and compiles it. [G3]_ [G7]_

An intensity change does not compile anything.
Each slot keeps a random parameter snapshot.
Intensity moves each parameter between the effect's default value and the snapshot value.
``EffectStack.buildLiveParams()`` collects these values into one map, with one entry for each step: [G2]_

.. code-block:: javascript
   :caption: EffectStack.buildLiveParams() in stack.js

   buildLiveParams() {
       const out = {}
       this._slots.forEach((slot, i) => {
           const params = this._computeLerp(slot)
           if (Object.keys(params).length === 0) return
           out[`step_${i + 1}`] = params
       })
       return out
   }

``media()`` is step 0, so slot ``i`` is step ``i + 1``.
The renderer merges the map into its stored values and passes them to ``applyStepParameterValues()``.
It applies the stored values again after each compile. [G3]_

Numeric and vector parameters move in a straight line and stay between the parameter's minimum and maximum.
The app rounds integer parameters.
A choice parameter keeps its default value at intensity 0 and changes to the snapshot value at any intensity above 0. [G4]_

The source can be an image, a video, or a canvas.
On every animation frame, the renderer uploads the source with ``updateTextureFromSource('imageTex_step_0', source, { flipY: false })``.
It uploads still images on every frame too.
It sets ``imageSize`` on step 0 only when the canvas size changes or after a compile. [G3]_

Work outside the engine
-----------------------

The app selects the camera, accepts image uploads, and records photos and videos.
For video, it uses the first format that ``MediaRecorder.isTypeSupported()`` accepts, in this order: WebM with VP9, WebM with VP8, WebM, MP4. [G5]_
The gallery keeps captures in IndexedDB. [G1]_

The app saves the current stack in ``localStorage``, so a reload restores it.
A share link carries the stack in the URL hash as ``#s=`` followed by URL-safe base64. [G6]_

Limits
------

* The renderer sets ``preferWebGPU: false``, so the app renders only with WebGL2. [G3]_
* Camera access needs browser permission. [G1]_
* Gallery captures stay in the browser. [G1]_

Sources
-------

All links point to glitcher revision ``cc59756``.

.. [G1] `README <https://github.com/noisefactorllc/glitcher/blob/cc59756708e9693bfb377c9d99809411c22e9e48/README.md>`_.

.. [G2] `Effect stack (stack.js) <https://github.com/noisefactorllc/glitcher/blob/cc59756708e9693bfb377c9d99809411c22e9e48/public/js/stack.js>`_.

.. [G3] `Renderer wrapper (renderer.js) <https://github.com/noisefactorllc/glitcher/blob/cc59756708e9693bfb377c9d99809411c22e9e48/public/js/noisemaker/renderer.js>`_.

.. [G4] `Parameter interpolation (effects.js) <https://github.com/noisefactorllc/glitcher/blob/cc59756708e9693bfb377c9d99809411c22e9e48/public/js/effects.js>`_.

.. [G5] `Capture (capture.js) <https://github.com/noisefactorllc/glitcher/blob/cc59756708e9693bfb377c9d99809411c22e9e48/public/js/capture.js>`_.

.. [G6] `Stack persistence (persistence.js) <https://github.com/noisefactorllc/glitcher/blob/cc59756708e9693bfb377c9d99809411c22e9e48/public/js/persistence.js>`_.

.. [G7] `Application controller (app.js) <https://github.com/noisefactorllc/glitcher/blob/cc59756708e9693bfb377c9d99809411c22e9e48/public/js/app.js>`_.
