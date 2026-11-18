Context Recovery
================

CanvasRenderer stops its render loop when it detects a lost WebGL context or WebGPU device. It calls ``onContextLost`` and starts recovery.

Recover a Lost Backend
----------------------

When the browser restores a WebGL context, the renderer creates a fresh canvas. It rebuilds the current pipeline unless the loss occurred during its first frame.

If the browser does not restore the context, the renderer attempts to rebuild on a fresh canvas. It does not rebuild a program automatically after a first-frame loss.

A lost WebGPU device cannot be restored. The renderer uses a fresh canvas to rebuild the pipeline.

After a successful rebuild, the renderer resumes the loop if it ran before the loss. The ``onContextRestored`` callback runs after the browser restores WebGL or the renderer rebuilds on a fresh canvas. It has no arguments.

The renderer can replace the canvas during recovery. Read ``renderer.canvas`` after recovery to get the current canvas.

Retry a First-Frame Failure
---------------------------

If a backend is lost while the program draws its first frame, the renderer does not rebuild that program automatically. Call ``compile()`` again with a DSL string to retry it.

See :doc:`integration` for ``CanvasRenderer`` setup and callback options.
