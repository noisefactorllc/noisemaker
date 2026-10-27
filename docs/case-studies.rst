Case Studies
============

These pages show how real applications use the Noisemaker shader engine.
Each page shows the engine calls that the application makes and the work that the application does itself.
Each page lists its sources.
Links to public repositories point to the revision that we checked on 13 October 2026.

How the applications start the engine
-------------------------------------

The nine web integrations on these pages start the engine in the same way:

#. Create a ``CanvasRenderer`` for a canvas.
#. Load the effect manifest with ``loadManifest()``.
#. Find the effects that the DSL program names. Most applications use ``extractEffectNamesFromDsl()``. Layers uses its own parser.
#. Load those effects with ``loadEffects()``.
#. Compile the program with ``compile()`` and start rendering with ``start()``.

After that, the applications use three calls:

* ``updateTextureFromSource('imageTex_step_N', source, options)`` sends a camera frame, an image, a video frame, or a canvas to a ``media()`` step.
* ``applyStepParameterValues({ step_N: { ... } })`` changes parameter values with no compile.
* ``resize(width, height)`` changes the render size.

The HD4 page shows the complete start sequence in one method.

Example apps
------------

These are the six example apps on `demos.noisemaker.app <https://demos.noisemaker.app/>`_.

.. toctree::
   :maxdepth: 1

   case-studies/glitcher
   case-studies/hd4
   case-studies/layers
   case-studies/photobox
   case-studies/polymorphic
   case-studies/visualize

Noisedeck and the engine demos
------------------------------

.. toctree::
   :maxdepth: 1

   case-studies/noisedeck
   case-studies/engine-demos

Other integrations
------------------

.. toctree::
   :maxdepth: 1

   case-studies/shuffleset
   case-studies/web-design
