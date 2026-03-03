Web Design
==========

`noisefactor.io <https://noisefactor.io/>`_ · `alex.ayars.info <https://alex.ayars.info/>`_

We use Noisemaker shaders as design elements on our websites. A real-time GPU shader loads almost instantly from the CDN and runs as a background canvas. The integration is a ``<canvas>`` element and a few lines of setup:

.. code-block:: html

    <canvas id="shader-canvas"></canvas>

    <script type="module">
        import { createBackgroundShader } from './js/shader-renderer.js'

        const SHADER_PROGRAM = `
            search synth, filter
            curl(scale: 75)
              .lighting(normalStrength: 5, shininess: 94)
              .write(o0)
            render(o0)
        `

        const canvas = document.getElementById('shader-canvas')
        const renderer = await createBackgroundShader(canvas, SHADER_PROGRAM, {
            width: canvas.width,
            height: canvas.height
        })
    </script>

The ``createBackgroundShader`` helper is about 30 lines. It imports ``CanvasRenderer`` from the CDN, loads the effect manifest, compiles the DSL program, and starts the render loop. The shader runs at full frame rate with no visible loading state.

On noisefactor.io, we swap between two DSL programs at a responsive breakpoint (different ``curl`` scales for mobile vs desktop). On alex.ayars.info, a more complex program with feedback loops and prismatic aberration runs as a 50/50 split panel. Both sites use the same helper module. Neither has a build step.
