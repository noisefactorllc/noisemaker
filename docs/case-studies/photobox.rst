Photobox: parallel camera effect previews
=========================================

`Open Photobox <https://photobox.noisefactor.io/>`_

Abstract
--------

Photobox uses one camera source to show nine different effect previews. A user compares the previews, selects an effect, and captures a photo or video in a larger view. The integration repeats a small renderer contract across the preview grid. Noisemaker supplies effect processing, while the application manages camera access, view transitions, capture, and a local gallery. [P1]_ [P2]_ [P3]_

1. Use case and requirements
----------------------------

The user chooses an appearance by looking at the current camera image. The Effects and Distortions tabs provide groups of alternatives. Selecting a tile opens the capture view. Returning to the grid restores visual comparison without requiring another camera session. [P1]_ [P2]_

The workflow requires:

* Show several effects against the same live source.
* Preserve the camera's aspect ratio in small previews.
* Allocate preview work according to the visible interface.
* Capture the selected result in a browser-supported format.
* Retain captured media after the current camera session ends. [P1]_ [P2]_ [P4]_

The main integration decision follows from the first requirement. Photobox shares one camera video element across its renderers. Each renderer receives the same source but compiles a different effect program. [P2]_

2. Integration surface
----------------------

``EffectGrid`` creates nine canvases and initializes their renderers concurrently. Each effect entry supplies a visible name and DSL program. The wrapper resolves the program's effect names, loads missing bundles, and compiles the program. Switching tabs changes the programs attached to the existing tiles. [P2]_ [P3]_

The browser's video element becomes an engine texture through one upload call. This excerpt comes from the camera upload method. The surrounding method also applies image dimensions when compilation or resizing makes them change. [P3]_

.. code-block:: javascript
   :caption: Send an available camera frame to the media input

   if (!this._videoSource) return
   if (this._videoSource.readyState < 2) return
   this._renderer.updateTextureFromSource?.(
       'imageTex_step_0',
       this._videoSource,
       FLIP_Y_FALSE
   )

The method requires an available video frame. In these programs, ``media()`` occupies step zero. ``FLIP_Y_FALSE`` supplies the texture orientation option. The application retains the camera element, while the engine receives its pixels. The excerpt is part of the renderer class, not a complete camera setup. [P3]_

3. Implementation decisions
---------------------------

Grid tiles start at 320 pixels wide, with height derived from the camera's aspect ratio. This bounds each preview's rendering dimensions independently of the larger capture view. The nine effects still require nine rendering pipelines, but they share camera acquisition and decoding through the same video element. [P2]_

The grid stops its renderers when the user opens the selected effect. Returning to the grid resumes them without recompiling their existing programs. The application therefore avoids normal grid rendering behind the capture view. Lifecycle control becomes part of the interface logic instead of a decision inside each effect. [P2]_ [P3]_

The wrapper updates the media step's ``imageSize`` after compilation or resizing. It avoids repeating that parameter update for every camera frame. The capture module selects a recording format through ``MediaRecorder.isTypeSupported()``. Captured media enters an IndexedDB gallery, separate from the active rendering state. [P1]_ [P3]_ [P4]_

4. Result and product implications
----------------------------------

Photobox combines visual comparison, focused capture, camera switching, and retained output. The user works through visible previews rather than shader code or a parameter list. The same effect engine serves both the comparison and capture stages. [P1]_ [P2]_

For a developer, a new effect choice primarily adds a program and its presentation data. The camera and capture workflow can remain the same. For a product team, the pattern suits a capture experience where users must see alternatives before committing to an output. A curated catalog and simple selection interface can define the product without changing how the engine processes media. [P2]_ [P3]_

5. Operating limits
-------------------

Sharing a camera source does not remove the cost of nine shader pipelines and texture uploads. The renderer requests WebGL2, and device capacity depends on effect complexity and preview dimensions. Browser permissions and recording support constrain capture. Evaluation should cover the grid, full-size view, camera switching, and recorded playback on the intended devices. [P2]_ [P3]_ [P4]_

6. References
-------------

.. [P1] `Application features <https://github.com/noisefactorllc/photobox/blob/685ea04e6a91c65033ce22f1010914891ed48f03/README.md>`_.

.. [P2] `Parallel preview grid <https://github.com/noisefactorllc/photobox/blob/685ea04e6a91c65033ce22f1010914891ed48f03/public/js/grid.js>`_.

.. [P3] `Camera renderer integration <https://github.com/noisefactorllc/photobox/blob/685ea04e6a91c65033ce22f1010914891ed48f03/public/js/noisemaker/renderer.js>`_.

.. [P4] `Capture implementation <https://github.com/noisefactorllc/photobox/blob/685ea04e6a91c65033ce22f1010914891ed48f03/public/js/capture.js>`_.
