Mashup
======

Route up to eight sources through one grayscale control — posterize the
control's luminance into bands and show a different surface in each band.

``mixer/mashup`` reads the luminance of its ``source`` input and divides the
0…1 range into ``layers`` equal bands. Each band displays a different engine
surface: the darkest band shows the first layer, the brightest shows the
last. ``smoothness`` feathers each band boundary so adjacent sources
cross-fade instead of meeting at a hard edge.

It is the luminance-driven cousin of ``synth/remap``: where Remap routes
surfaces to polygon zones, Mashup routes them to gray-level bands. Like
Remap, every input — including the control — is an explicit slot wired in
DSL with ``read(oN)``.

.. code-block:: dsl

    search synth, mixer

    noise(ridges: true).write(o0)
    solid(color: #ee3322).write(o1)
    solid(color: #2266cc).write(o2)
    gradient().write(o3)

    mashup(layers: 3, source: read(o3), layer0_tex: read(o0), layer1_tex: read(o1), layer2_tex: read(o2))
      .write(o4)

Notes
-----

- The control input is only sampled for its luminance — its color never
  shows directly unless a band's layer source is unwired, in which case that
  band falls back to showing the control input.
- Bands are assigned darkest → brightest, so re-ordering the wired sources
  re-orders which luminance range each occupies.
