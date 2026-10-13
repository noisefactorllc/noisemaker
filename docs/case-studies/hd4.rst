HD4: a four-channel video mixer
===============================

`Open HD4 <https://hd4.noisefactor.io/>`_

HD4 is a four-channel video and audio mixer that runs in the browser.
Each channel can show a camera, a video file, an image, or a Noisemaker shader.
The operator prepares a channel on the preview monitor and takes it to the program output with CUT, MIX, or WIPE.
HD4 also has PinP, SPLIT, QUAD, and KEY compositions, an audio mixer, MIDI control, and recording. [H1]_

How it uses Noisemaker
----------------------

Each channel has a ``ChannelRenderer``, and each ``ChannelRenderer`` owns one ``CanvasRenderer``.
No other HD4 module creates a ``CanvasRenderer``. [H2]_

A shader channel compiles its own DSL program.
A camera, video, or image channel compiles this program: [H5]_

.. code-block:: text

   search synth
   media().write(o0)
   render(o0)

``ChannelRenderer.compile()`` shows the load order.
It loads the effect manifest once, loads the effects that the program names, and then compiles: [H2]_

.. code-block:: javascript
   :caption: ChannelRenderer.compile() in channelRenderer.js

   async compile(dsl) {
       if (!this._initialized) await this.init()
       try {
           const ids = extractEffectNamesFromDsl(dsl, this._renderer.manifest || {})
               .map((e) => e.effectId)
           if (ids.length) await this._renderer.loadEffects(ids)
           await this._renderer.compile(dsl)
           this._currentDsl = dsl
           this._mediaStep = this._discoverMediaStep(dsl)
           this._lastSize = null
           if (!this._renderer.isRunning) this._renderer.start()
           return { success: true }
       } catch (err) {
           const msg = typeof err === 'string' ? err : err?.message || err?.error || 'compile error'
           this.onError(msg)
           return { success: false, error: msg }
       }
   }

If the compile fails, the wrapper passes the message to ``onError`` and returns it to the caller. [H2]_

The wrapper finds the ``media()`` step in the program text.
It does not assume that ``media()`` is step 0. [H2]_

For each media frame, the wrapper first fits the source into a buffer with the channel's aspect ratio.
The ``cover`` fit fills the frame and crops the overflow.
The ``contain`` fit shows the whole source on a black background.
The wrapper then uploads the buffer with ``updateTextureFromSource('imageTex_step_N', buffer, { flipY: false })``.
It sets ``imageSize`` only when the buffer size changes. [H2]_

Work outside the engine
-----------------------

``ProgramCompositor`` owns the program output, which is a 2D canvas.
It reads each channel canvas with ``drawImage()``.
It draws the transitions, the PinP, SPLIT, and QUAD layouts, the KEY overlay, the output effects, and the output fade. [H3]_

The audio mixer does not use Noisemaker.
It has per-channel EQ, gate, compressor, pan, delay, and AUX and reverb sends.
It can switch audio when the video changes, or switch video when the audio changes. [H1]_

Recording captures the program canvas at 30 frames per second with ``captureStream(30)``.
It adds the audio tracks from the main bus or the AUX bus, and ``MediaRecorder`` writes the file. [H1]_ [H4]_

Sizes and limits
----------------

* Each channel renders at 960 × 540. The program output is 1280 × 720 by default. [H4]_
* The output resolution setting resizes only the program canvas. No code calls ``ChannelRenderer.resize()``. [H4]_
* Four ``CanvasRenderer`` objects run at the same time, one for each channel. [H4]_
* The KEY overlay reads and writes every output pixel on the CPU in each frame, with ``getImageData()`` and ``putImageData()``. [H3]_

Sources
-------

All links point to hd4 revision ``90afc97``.

.. [H1] `README <https://github.com/noisefactorllc/hd4/blob/90afc9759d34bf11c762f9b383514350d6830f6a/README.md>`_.

.. [H2] `Channel renderer (channelRenderer.js) <https://github.com/noisefactorllc/hd4/blob/90afc9759d34bf11c762f9b383514350d6830f6a/js/channelRenderer.js>`_.

.. [H3] `Program compositor (programCompositor.js) <https://github.com/noisefactorllc/hd4/blob/90afc9759d34bf11c762f9b383514350d6830f6a/js/programCompositor.js>`_.

.. [H4] `Application setup (app.js) <https://github.com/noisefactorllc/hd4/blob/90afc9759d34bf11c762f9b383514350d6830f6a/js/app.js>`_.

.. [H5] `Media source driver (mediaSource.js) <https://github.com/noisefactorllc/hd4/blob/90afc9759d34bf11c762f9b383514350d6830f6a/js/sources/mediaSource.js>`_.
