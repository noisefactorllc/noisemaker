Engine demos: GPU composition and CPU generation
================================================

`Open the shader demo <https://noisemaker.app/demo/shaders/>`_ | `Open the Classic Composer <https://noisemaker.app/demo/js/>`_

Abstract
--------

Noisemaker's engine demos expose two different authoring models. The shader demo connects effect selection, parameter controls, and DSL to a GPU renderer. The Classic Composer evaluates procedural presets on the CPU. Both provide an inspectable starting point for a technical evaluation. Their value lies in showing the program-to-output boundary before a team designs a larger application. [D1]_ [D2]_ [D3]_

1. Use case and requirements
----------------------------

A developer evaluating a rendering engine needs to inspect representative output and understand the inputs that produce it. A decision maker needs a bounded experiment before committing to an application workflow. The demos support that first experiment through editable programs or presets, visible controls, and rendered output. [D2]_ [D3]_

The evaluation workflow requires:

* Select a known program or preset and inspect its output.
* Change parameters without replacing the surrounding demonstration interface.
* Inspect the composition or formula behind the result.
* Identify output dimensions and other inputs needed to repeat the experiment.
* Distinguish GPU composition from CPU preset generation. [D2]_ [D3]_

These demos serve as integration references as well as effect browsers. Their source connects user controls to engine calls that a developer can trace. [D2]_ [D3]_

2. Integration surface
----------------------

The shader demo uses ``CanvasRenderer`` for compilation and rendering. Its UI controller uses ``ProgramState`` to connect parsed programs with controls. Effect definitions supply the parameter metadata, and state changes determine which values reach the renderer. [D2]_

The Classic Composer imports ``Preset`` and ``render`` from the JavaScript Composer. A render call receives the preset, seed, dimensions, output context, and time-related inputs. A progress callback connects generation work to the interface. The browser page owns preset selection, output sizing, progress feedback, and errors. [D3]_

.. list-table:: Two engine entry points
   :header-rows: 1
   :widths: 25 38 37

   * - Boundary
     - Shader demo
     - Classic Composer
   * - Composition input
     - DSL program and effect parameters
     - Procedural preset and seed
   * - Execution
     - Compiled GPU effect graph
     - CPU preset evaluation and rendering
   * - Interface state
     - ProgramState and generated controls
     - Preset, seed, dimensions, and render options
   * - Useful measurement
     - Frame time for a specified program
     - Generation time for a specified preset

The similar browser presentation does not imply interchangeable program formats. Each demo exposes the contract of its own engine. [D2]_ [D3]_

3. Implementation decisions
---------------------------

The shader UI generates controls from parsed effect structure. It applies current step values to the renderer and listens for changes that require compilation. Parameters embedded at compile time trigger a rebuilt program. This separation lets the interface use effect metadata instead of a separate hand-written control panel for every effect. [D2]_

The Composer constructs a preset from the selected name and preset library. When a selected preset is an effect rather than a generator, the demo combines it with a basic generator. This gives the effect an image to process. The page also exposes the evaluated formula and seed, which help explain how the result arose. [D3]_

The demo index separately lists a CPU port for shader programs. That port is distinct from the Classic Composer described here. A team choosing CPU execution must first identify which program model its application needs. The linked port documentation covers shader-program execution outside this classic preset workflow. [D1]_

4. Result and product implications
----------------------------------

The shader demo makes the connection between effect metadata, controls, and rendering inspectable. The Composer makes the connection between presets, seeded generation, and output inspectable. Both reduce the amount of surrounding application behavior that a team must understand during an initial engine evaluation. [D2]_ [D3]_

For a developer, these are starting points for effect selectors, parameter panels, or procedural image tools. For a product team, they support a defined feasibility exercise: choose representative content, specify output dimensions, and measure the relevant execution path. The engine interface can then inform the application's design instead of remaining an unknown dependency. [D2]_ [D3]_

5. Operating limits
-------------------

The shader demo requires a supported GPU backend. The Classic Composer uses a different preset model and CPU execution path. Evaluation must record the engine, program or preset, dimensions, and device. Preset tests also need the seed and time-related inputs. Product requirements for media capture, storage, recovery, and export remain separate from these engine demonstrations. [D2]_ [D3]_

6. References
-------------

.. [D1] `Current demo index <https://demos.noisemaker.app/>`_.

.. [D2] `Shader demo UI controller <https://github.com/noisefactorllc/noisemaker/blob/135688f4cba948305ac169c60645626719dc52b8/demo/shaders/lib/demo-ui.js>`_.

.. [D3] `Classic Composer demo <https://github.com/noisefactorllc/noisemaker/blob/135688f4cba948305ac169c60645626719dc52b8/demo/js/index.html>`_.
