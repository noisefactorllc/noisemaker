Web Design: procedural graphics in content pages
================================================

`Open Noise Factor <https://noisefactor.io/>`_ | `Open alex.ayars.info <https://alex.ayars.info/>`_

Abstract
--------

The Noise Factor website and alex.ayars.info place Noisemaker canvases within conventional content pages. Noise Factor uses a procedural composition in its shared header. The personal site exposes an editable shader panel. Both connect a canvas, dimensions, and a program to a renderer wrapper. Their integration shows how a visual feature can evolve without replacing the page's content and navigation structure. [W1]_ [W2]_ [W3]_ [W4]_

1. Use case and requirements
----------------------------

The two sites use procedural graphics for different interactions. Noise Factor presents a selected visual treatment within a reusable header. The personal site lets visitors inspect and edit the program behind its shader panel. In both cases, links and text remain ordinary HTML elements. [W3]_ [W4]_

The shared requirements are:

* Attach a visual program to a specific region of the page.
* Keep text and navigation independent of canvas pixels.
* Match rendering dimensions to the page component as it changes size.
* Load the effects that the selected program requires.
* Report invalid edits when the page exposes a program editor. [W1]_ [W2]_ [W3]_ [W4]_

These requirements define a component-level integration. The host page controls where the canvas appears and how visitors interact with it. Noisemaker supplies the changing image inside that surface. [W1]_ [W4]_

2. Integration surface
----------------------

The renderer wrapper imports the engine, creates ``CanvasRenderer``, and loads the effect manifest. It resolves the program's effect identifiers, loads their bundles, and compiles the program. A helper starts rendering after successful initialization. Resize calls update the output dimensions. [W1]_ [W2]_

The header component uses that helper through a short call sequence. This excerpt shows the successful initialization and resize path. The surrounding method handles initialization errors, and the component retains a CSS background as its fallback. [W4]_

.. code-block:: javascript
   :caption: Attach a program to the shared header

   const size = sizeCanvasToHeader(canvas);
   const renderer = await createBackgroundShader(
     canvas, HEADER_SHADER_PROGRAM, size
   );
   if (!renderer) return;
   window.addEventListener('resize', () => {
     const next = sizeCanvasToHeader(canvas);
     renderer.resize(next.width, next.height);
   });

``sizeCanvasToHeader()`` measures the header and accounts for device pixel ratio. ``HEADER_SHADER_PROGRAM`` contains the visual composition. The helper encapsulates engine setup, so the component handles layout through canvas dimensions and renderer resize calls. [W4]_

3. Implementation decisions
---------------------------

The shared header creates a decorative canvas, a logo link, and navigation elements. It marks the canvas as hidden from accessibility APIs because the image carries no navigation information. The links retain their HTML semantics. This separates the visual treatment from the controls that visitors use to move through the site. [W4]_

The personal site extends the same rendering pattern with a code editor. ``BackgroundShaderRenderer.apply()`` resolves effects for the new program and attempts compilation. It returns a success or error result to the caller. The wrapper updates its stored program only after successful compilation, so incomplete text does not become the accepted program state. [W2]_ [W3]_

The two uses demonstrate different amounts of application behavior around the same core contract. A fixed header needs initialization and resizing. An editable panel adds text input, evaluation timing, and error feedback. Neither use requires a separate graphics implementation for each visual composition. [W1]_ [W2]_ [W3]_ [W4]_

4. Result and product implications
----------------------------------

The current integration supports a shared visual component and an interactive authoring surface. Page content remains in HTML, while the DSL program acts as an editable visual asset. Changes to that program can change appearance without changing the navigation model. [W3]_ [W4]_

For an individual developer, the pattern suits a portfolio or technical demonstration with programmable visuals. For a product team, it provides a component that can carry a selected visual treatment across content pages. Exposing the program is an additional interface decision, as the personal site demonstrates. The renderer contract remains canvas, program, dimensions, and lifecycle. [W1]_ [W2]_ [W4]_

5. Operating limits
-------------------

The visual layer depends on engine assets and browser graphics support. Device pixel ratio can increase rendering dimensions and workload. A page must define suitable motion, loading, and failure behavior for its audience. The header's semantic links and CSS fallback address specific concerns, but complete accessibility and mobile performance still require page-level evaluation. [W1]_ [W4]_

6. References
-------------

.. [W1] `Noise Factor public renderer module <https://noisefactor.io/js/shader-renderer.js>`_.

.. [W2] `Personal-site public renderer module <https://alex.ayars.info/js/shader-renderer.js>`_.

.. [W3] `Personal site and editable shader panel <https://alex.ayars.info/>`_.

.. [W4] `Shared header and canvas integration <https://noisefactor.io/js/nf-header.js>`_.
