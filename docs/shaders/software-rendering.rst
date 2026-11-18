Software Rendering
==================

Software rasterizers run WebGL2 on the CPU. Their frame times can make a continuous animation loop impractical. ``CanvasRenderer`` can detect a software rasterizer and render one frame at a time.

Select a Mode
-------------

Set ``softwareRendering`` when you construct ``CanvasRenderer``:

.. list-table::
   :header-rows: 1
   :widths: 18 82

   * - Value
     - Behavior
   * - ``off``
     - The default. It skips detection and leaves the renderer unchanged.
   * - ``auto``
     - It enables the mode when detection reports software rendering.
   * - ``on``
     - It enables the mode without detection.

Any other value selects ``off``. The ``softwareRendering`` getter returns
``mode``, ``active``, and a detection ``report``. In ``off`` mode, the report
is ``null``.

Detection
---------

Detection probes WebGL2 on temporary canvases. It does not touch the renderer
canvas. The detector recognizes SwiftShader, llvmpipe, softpipe, Microsoft
Basic Render Driver, and Apple Software Renderer. A named hardware renderer
does not activate the mode, even when the performance-caveat probe fails. If
the browser masks or omits its renderer name, the probe result decides.

Render Frames
-------------

An active mode uses WebGL2, not WebGPU. ``preferWebGPU`` does not change this
choice while the mode is active. ``switchBackend('wgsl')`` also leaves the
renderer on WebGL2.

In software mode, ``start()`` renders the current frame once. It does not
start an animation loop. Call ``stepFrame()`` when no animation loop runs.
The method advances normalized time by
``1 / (60 * loopDuration)`` and wraps at ``1``. By default, it uses
``lastTime`` as the starting time. The method returns the new normalized time.
It returns ``null`` when the loop runs, the pipeline is missing, or the WebGL
context is lost. ``stepFrame()`` also works on hardware renderers when no
animation loop runs.

After compilation, use the getter to choose between continuous rendering and
single-frame rendering:

.. code-block:: javascript

   if (renderer.softwareRendering.active) {
       renderer.start()      // Render the current frame
       renderer.stepFrame()  // Render the next frame
   } else {
       renderer.start()      // Start the animation loop
   }

See :doc:`integration` for ``CanvasRenderer`` setup and API details.
