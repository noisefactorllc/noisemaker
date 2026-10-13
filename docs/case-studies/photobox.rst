Photobox: nine live camera previews
===================================

`Open Photobox <https://photobox.noisefactor.io/>`_

Photobox is a photo booth that runs in the browser.
It shows the camera feed in a 3 × 3 grid of live previews.
The Effects and Distortions tabs each hold 8 effects around a center tile that shows the camera with no effect.
When the user selects a tile, Photobox opens a full-size view of that effect.
In that view, the user takes a photo or records a video. [P1]_ [P2]_ [P5]_

How it uses Noisemaker
----------------------

Each effect is a short DSL program that reads the camera through ``media()``: [P5]_

.. code-block:: text
   :caption: Three of the 16 effect programs in effects.js

   media().grade(saturation: 0.3, exposure: 0.1).write(o0)
   media().celShading(mix: 0.75, edgeThreshold: 0.25).write(o0)
   media().grade(preset: noir).write(o0)

Each program also has a ``search`` line and ends with ``render(o0)``.

The grid creates nine ``PhotoboxRenderer`` objects, and each one wraps its own ``CanvasRenderer``.
All nine read the same ``<video>`` element.
A tenth renderer draws the full-size view at the camera's resolution. [P2]_ [P6]_

Each renderer uploads the current video frame on every animation frame:

.. code-block:: javascript
   :caption: PhotoboxRenderer._uploadVideoTexture() in renderer.js

   _uploadVideoTexture() {
       if (!this._videoSource) return
       if (this._videoSource.readyState < 2) return // HAVE_CURRENT_DATA
       // Texture ID must match compiled step: media() is always step 0
       this._renderer.updateTextureFromSource?.('imageTex_step_0', this._videoSource, FLIP_Y_FALSE)
       // imageSize must match canvas resolution (shader maps gl_FragCoord.xy /
       // imageSize). It's constant between resize/compile, and applying it walks
       // every pipeline pass, so apply only when it actually changed.
       if (this._imageSizeDirty) {
           this._renderer.applyStepParameterValues?.({ step_0: { imageSize: [this.width, this.height] } })
           this._imageSizeDirty = false
       }
   }

``FLIP_Y_FALSE`` is one shared ``{ flipY: false }`` object, so the loop does not make a new object on each frame.
The renderer sets the dirty flag after each compile and each ``resize()``.
``imageSize`` is the canvas resolution, not the camera resolution. [P3]_

Grid tiles render at 320 pixels wide.
The tile height is 320 × camera height ÷ camera width, rounded.
For a 1280 × 720 camera, each tile renders at 320 × 180. [P2]_

A tab change stops all nine renderers and compiles the nine new programs in parallel. [P2]_
When the user opens the full-size view, the grid stops its renderers.
When the user returns, the grid starts them again without a new compile. [P2]_ [P6]_

Work outside the engine
-----------------------

* A photo is a PNG from ``canvas.toBlob()``, after a 3-2-1 countdown. [P4]_
* A video uses ``canvas.captureStream(30)`` and ``MediaRecorder``, with the first supported format from WebM with VP9, WebM with VP8, WebM, and MP4. [P4]_
* Photobox stores each capture in an IndexedDB gallery and also downloads it. [P1]_ [P6]_
* Users can switch between the front and rear cameras. [P1]_

Limits
------

* The renderer sets ``preferWebGPU: false``, so Photobox renders only with WebGL2. [P3]_
* In the grid view, nine renderers each upload the video frame on every animation frame. The shared ``<video>`` element does not remove that cost. [P2]_ [P3]_
* Photobox calculates the tile size once. A camera switch does not change the tile size, even when the new camera has a different aspect ratio. [P2]_ [P6]_
* Camera access needs browser permission. [P6]_

Sources
-------

All links point to photobox revision ``685ea04``.

.. [P1] `README <https://github.com/noisefactorllc/photobox/blob/685ea04e6a91c65033ce22f1010914891ed48f03/README.md>`_.

.. [P2] `Preview grid (grid.js) <https://github.com/noisefactorllc/photobox/blob/685ea04e6a91c65033ce22f1010914891ed48f03/public/js/grid.js>`_.

.. [P3] `Renderer wrapper (renderer.js) <https://github.com/noisefactorllc/photobox/blob/685ea04e6a91c65033ce22f1010914891ed48f03/public/js/noisemaker/renderer.js>`_.

.. [P4] `Capture (capture.js) <https://github.com/noisefactorllc/photobox/blob/685ea04e6a91c65033ce22f1010914891ed48f03/public/js/capture.js>`_.

.. [P5] `Effect programs (effects.js) <https://github.com/noisefactorllc/photobox/blob/685ea04e6a91c65033ce22f1010914891ed48f03/public/js/effects.js>`_.

.. [P6] `Application controller (app.js) <https://github.com/noisefactorllc/photobox/blob/685ea04e6a91c65033ce22f1010914891ed48f03/public/js/app.js>`_.
