Parallax
========

Pseudo-3D perspective shift from a height map, via ray-marched parallax
occlusion mapping.

``filter/parallax`` re-projects its input as if the height map extruded it
into relief viewed from an angle:

1. The height map's luminosity gives each pixel a height from 0 to 1.
2. For every output pixel, a view ray angled by ``direction`` is marched
   through the height field until it hits the surface.
3. The input is sampled where the ray landed — tall features lean away from
   the viewer and cover what is behind them.

.. code-block:: dsl

    search filter, synth

    noise(ridges: true)
      .parallax()
      .write(o0)

With the default ``heightMap`` the input acts as its own height map
(bright = tall). Wire a different surface to displace one image by another's
relief.

Parameters
----------

.. list-table::
   :header-rows: 1
   :widths: 22 18 18 42

   * - Parameter
     - Type
     - Default
     - Description
   * - ``heightMap``
     - surface
     - ``inputTex``
     - Height source; its luminosity is the height field
   * - ``direction``
     - vec3
     - ``[0.5, 0.5, 1]``
     - Viewer angle: straight down ``(0,0,1)`` means no shift; glancing
       angles maximize it
   * - ``pivot``
     - number (0–1)
     - 0
     - The height plane that stays anchored: 0 locks the ground so features
       rise out of it; 1 locks the peaks so valleys sink inward

Related
-------

- ``filter/lighting`` accepts the same kind of height map through its
  ``heightMap`` input, for lit shading of a relief.
- During large-format tiled rendering the parallax shift is clamped so
  displaced samples stay within the tile overlap, keeping very large prints
  seam-free.
