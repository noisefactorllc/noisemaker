The 3D Pipeline
===============

The 3D pipeline generates, filters, and renders volumetric fields on WebGL2
and WebGPU. It is the 3D counterpart to the 2D synth/filter/render chain.

A 3D chain follows the same sequence as a 2D chain:

1. A generator produces a field.
2. Zero or more filters transform it.
3. A renderer converts it to pixels.

Each intermediate value is a volume rather than an image.

.. code-block:: dsl

    search synth3d, filter3d, render

    noise3d(volumeSize: x64)
      .palette3d(index: palette.brushedMetal)
      .render3d()
      .write(o0)

    render(o0)

``volumeSize`` (on the generator) sets the volume resolution: ``x16``,
``x32``, ``x64``, or ``x128`` (16³ … 128³). Downstream effects inherit it
automatically. The runtime stores a volume in a 2D slice atlas whose dimensions
are ``volumeSize × volumeSize²``. The requested atlas can exceed the device's maximum texture dimension.
In that case, the runtime reduces the whole chain to the largest supported
power-of-two size. For example, a device limited to 8192-pixel
textures renders a requested ``x128`` chain at ``x64`` instead of producing an
incomplete volume.

Generators (synth3d)
--------------------

Volume generators live in the ``synth3d`` namespace: ``noise3d``, ``cell3d``,
``fractal3d``, ``shape3d``, ``cellularAutomata3d``, ``reactionDiffusion3d``,
``flythrough3d``, and ``heightmap3d``. The Effect Reference documents each
generator's parameters.

``heightmap3d`` differs from the others: instead of generating a volume
procedurally, it bakes two ordinary 2D surfaces into one — a height map
(luminance sets each XZ column's fill height) and a diffuse map (color
stored at every voxel in that column) — producing a voxel heightfield
volume from arbitrary 2D input. It is the generator half of a landscape
chain; see ``renderLandscape3d`` below.

Volumetric filters (filter3d)
-----------------------------

Filters in the ``filter3d`` namespace transform a volume and pass it on:

- ``palette3d`` — recolors the field per voxel with the same 55 cosine
  palettes and RGB/HSV/OkLab colorspace modes as the 2D ``palette`` filter.
- ``flow3d`` — an agent-based 3D flow field that deposits trails through the
  volume.

Recoloring filters change a voxel's color and preserve its shape (geometry).
Every downstream renderer therefore sees the same surface.

Renderers
---------

A renderer consumes the volume and produces the frame:

.. list-table::
   :header-rows: 1
   :widths: 34 66

   * - Renderer
     - Output
   * - ``render3d``
     - Universal raymarcher: smooth ``isosurface`` mode (trilinear
       interpolation with bisection refinement) or ``voxel`` mode (DDA
       traversal with flat face shading)
   * - ``renderLit3d``
     - Lit variant of ``render3d``
   * - ``renderCubemapSurface`` / ``renderCubemap3d``
     - Six seamless cube faces for skyboxes and planetary surfaces — see the
       Cubemaps guide
   * - ``renderLandscape3d``
     - Isometric or perspective raymarcher for ``heightmap3d`` volumes: smooth
       ``isosurface`` mode or flat-face ``voxel`` mode, with lighting. The
       perspective camera (``viewMode: perspective``) shares its projection
       with ``pointsRender`` / ``pointsBillboardRender``, so a landscape and a
       particle system (see the SMRTicles guide's ``heightGrid`` behavior) can
       share one camera
