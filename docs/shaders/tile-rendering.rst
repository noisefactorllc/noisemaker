Tiled Rendering
===============

The pipeline can render a large output as smaller tiles. Set a tile region before each tile render. The shader receives the tile offset and full output resolution. These values let an effect use coordinates from the complete image.

Setting a Tile Region
---------------------

Call ``CanvasRenderer.setTileRegion`` before rendering each tile. The ``offset`` value gives the tile's pixel offset in the output image. The ``fullResolution`` value gives the output width and height. The optional ``renderScale`` value gives the scale factor relative to the original canvas. It defaults to ``1``.

.. code-block:: javascript

   renderer.setTileRegion({
       offset: [tileX, tileY],
       fullResolution: [outputWidth, outputHeight],
       renderScale: outputScale,
   })
   renderer.render(time)
   renderer.clearTileRegion()

Set the region again with the next tile's offset. Call ``CanvasRenderer.clearTileRegion`` after the final tile. The canvas size remains local to one rendered tile.

When you do not set a tile region, the pipeline uses ``[0, 0]`` for ``tileOffset``. The ``fullResolution`` value matches the canvas resolution. The pipeline uses ``1`` for ``renderScale``.

An origin tile also has a zero offset. Do not detect tiling from ``tileOffset`` alone. Compare ``fullResolution`` with local ``resolution`` instead.

Effect Support
--------------

These effects use full-image coordinates during tiled rendering on WebGL2 and WebGPU:

* ``classicNoisedeck/effects`` keeps sample coordinates and effect patterns aligned across tile joins. The tiled shader test covers each named effect mode.
* ``filter/glyphMap`` keeps its glyph grid aligned, including on the origin tile.

The ``cga``, ``subpixel``, and glyph-cell patterns use ``renderScale``. Tile support depends on each effect's shader. Runtime uniforms do not make every effect tile-aware. Check each effect's shader before you use it for tile rendering.
