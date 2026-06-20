Cubemaps
========

Render a 3D volume into six seamless cube faces — for skyboxes, planetary surfaces, nebulae, and stars. Works on both the WebGL2 and WebGPU backends.

.. note::

   **Work in progress — not yet ready for use.** Cubemap support is being
   landed in the engine as a foundational layer for upcoming feature
   development. The API, parameters, and output are subject to change.

How It Works
------------

A cube camera sits at the center of the volume and looks outward through a 90-degree frustum, once per face. The six faces use the axis-aligned directions, in this order:

.. code-block:: text

   index 0  +X
   index 1  -X
   index 2  +Y
   index 3  -Y
   index 4  +Z
   index 5  -Z

Each output pixel becomes a 3D view ray, and the ray marches the volume. Because adjacent faces evaluate their shared edge from the *same* 3D direction, the edges match exactly — the seams are correct by construction, not by tiling 2D textures. Continuity across every face edge is proven in ``test/cubeCamera.test.js`` (closed-cube invariant) and ``test/cubeExport.test.js`` (cross-layout adjacency).

Generating Cube Faces
---------------------

The ``renderCube`` effect is a 3D renderer: feed it a volume and it renders the current cube face. Drive it from a 3D generator such as ``noise3d``:

.. code-block:: dsl

    search synth3d, filter3d, render

    noise3d(volumeSize: x64)
      .renderCube()
      .write(o0)

    render(o0)

``volumeSize`` (on the generator) sets the volume resolution: ``x16``, ``x32``, ``x64``, or ``x128`` (16³ … 128³).

Modes
~~~~~

.. list-table::
   :header-rows: 1
   :widths: 20 80

   * - Mode
     - Description
   * - ``volumetric``
     - Front-to-back emission/absorption integration (nebula / cloud look). Default.
   * - ``isosurface``
     - SDF raymarch to a threshold crossing, refined by bisection (solid surface look).

Parameters
~~~~~~~~~~

.. list-table::
   :header-rows: 1
   :widths: 18 14 14 54

   * - Parameter
     - Type
     - Default
     - Description
   * - ``mode``
     - ``isosurface`` | ``volumetric``
     - ``volumetric``
     - Compositing mode (see above)
   * - ``density``
     - number (0–20)
     - 4
     - Volumetric: scales the field's contribution to per-step opacity
   * - ``absorption``
     - number (0–4)
     - 1
     - Volumetric: how strongly the medium attenuates along the ray
   * - ``emission``
     - number (0–4)
     - 1
     - Volumetric: how much each sample emits
   * - ``threshold``
     - number (0–1)
     - 0.5
     - Isosurface: field cutoff the surface is traced to
   * - ``invert``
     - boolean
     - false
     - Isosurface: flip the inside/outside test
   * - ``bgColor``
     - color
     - ``[0.02, 0.02, 0.02]``
     - Background behind the volume
   * - ``bgAlpha``
     - number (0–1)
     - 1
     - Background opacity

Examples
~~~~~~~~

.. code-block:: dsl

    // Dense nebula
    search synth3d, filter3d, render
    noise3d(volumeSize: x64).renderCube(density: 8, emission: 2).write(o0)
    render(o0)

    // Solid isosurface planet shell
    search synth3d, filter3d, render
    noise3d(volumeSize: x64).renderCube(mode: isosurface, threshold: 0.55).write(o0)
    render(o0)

Rendering All Six Faces
-----------------------

``renderCube`` renders one face at a time (whichever ``cubeBasis`` the driver sets). To produce all six faces, call ``renderCubemap()`` on the renderer (or pipeline). It runs the compiled graph six times — once per face — and returns six pixel buffers.

.. code-block:: javascript

    const faces = await renderer.renderCubemap({
        size: 512,            // face edge length in pixels
        mode: 'volumetric',   // 'volumetric' | 'isosurface'
        outputSurface: 'o0',  // the surface the DSL writes to
    })
    // faces: 6 × { width, height, data: Uint8Array }  (RGBA8), in +X,-X,+Y,-Y,+Z,-Z order

.. list-table::
   :header-rows: 1
   :widths: 18 14 14 54

   * - Option
     - Type
     - Default
     - Description
   * - ``size``
     - number
     - 512
     - Face edge length in pixels (the graph is rendered at ``size`` × ``size``)
   * - ``mode``
     - string
     - ``volumetric``
     - ``isosurface`` or ``volumetric``
   * - ``outputSurface``
     - string
     - ``o0``
     - The user surface (``o0``–``o7``) the DSL writes its ``renderCube`` result to
   * - ``time``
     - number
     - 0
     - Time value passed to the render (for animated volumes)

The graph must terminate in ``renderCube`` writing to ``outputSurface``. ``outputSurface`` must name a real surface the DSL wrote to; an unknown name throws. A flat 2D chain (no ``renderCube``) would render the same image six times.

Exporting
---------

The six faces use these canonical names, in face order:

.. code-block:: text

   px.png  nx.png  py.png  ny.png  pz.png  nz.png   (= +X,-X,+Y,-Y,+Z,-Z)

Two pure helpers live in ``shaders/src/renderer/cubeExport.js``:

- ``faceFileNames()`` → the six ``.png`` names above.
- ``crossLayout(faces)`` → a single ``{ width, height, data }`` RGBA8 buffer arranging the faces into a seam-continuous horizontal cross (4×3).

.. note::

   ``cubeExport.js`` helpers are not part of the core bundle (like the UI
   components). Import them from source, or assemble/name the faces yourself
   using the face order above. PNG encoding happens at the call site.

Host Integration
----------------

For application developers saving the six faces. See :doc:`integration` for renderer setup; the cubemap-specific flow is:

.. code-block:: javascript

    // 1. Compile a graph that ends in renderCube, then pause the render loop so the
    //    driver owns the per-face camera while it bakes.
    await renderer.loadEffects(['synth3d/noise3d', 'render/renderCube'])
    await renderer.compile(`
        search synth3d, filter3d, render
        noise3d(volumeSize: x64).renderCube().write(o0)
        render(o0)
    `)
    renderer.stop()

    // 2. Render all six faces.
    const faces = await renderer.renderCubemap({ size: 1024, mode: 'volumetric' })

    // 3. Encode each face to a PNG blob in the browser.
    async function faceToPng(face) {
        const canvas = new OffscreenCanvas(face.width, face.height)
        const ctx = canvas.getContext('2d')
        ctx.putImageData(new ImageData(new Uint8ClampedArray(face.data), face.width, face.height), 0, 0)
        return canvas.convertToBlob({ type: 'image/png' })
    }
    const names = ['px', 'nx', 'py', 'ny', 'pz', 'nz']
    const blobs = await Promise.all(faces.map(faceToPng))
    // → save blobs[i] as `${names[i]}.png`, or zip them, or upload.

    renderer.start()  // resume the live preview

The returned array and its buffers are reused on the next ``renderCubemap()`` call — copy a face's ``data`` if you need to retain it across calls.

Technical Notes
---------------

- **Face order is fixed**: ``+X, -X, +Y, -Y, +Z, -Z`` (indices 0–5), consistent across the camera, driver, export names, and cross layout.
- **Readback works on both backends.** ``renderCubemap`` reads the offscreen output surface directly (via ``copyTextureToBuffer`` on WebGPU), which sidesteps the canvas IOSurface readback race that affects on-screen captures.
- **Pixel rows are top-down** (``readPixels`` flips WebGL2's bottom-up rows to match WebGPU). The exported PNGs and the cross are in standard top-down image orientation.
- **Volume size limits**: ``x16``–``x128`` (128³ is the current ceiling).
- ``outputSurface`` defaults to ``o0`` and must match the surface the DSL writes to.
