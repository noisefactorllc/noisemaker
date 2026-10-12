Persistent Graph Surfaces
=========================

Set ``persistent: true`` on a 2D global texture when a later frame must read its latest write and the pipeline would otherwise swap its bindings. Recognized state surfaces and graph feedback surfaces retain their final bindings without this flag. A graph feedback surface is a global surface that a pass reads before any pass writes it in the same frame. A pass in that frame also writes the surface.

A conditional pass can skip its update. A retained surface still exposes its latest write to the next frame. An unmarked, non-state global surface uses the normal frame-end swap if a pass writes it before any pass reads it during that frame.

The flag also preserves 2D texture contents after an allocation-size change. The pipeline resamples the old contents into the new texture. This resize behavior is separate from frame binding retention.

Use ``persistent`` only in a 2D texture specification. The validator rejects it in ``textures3d`` specifications.

See :doc:`pipeline` for binding order. See :doc:`effects` for texture specification fields.
