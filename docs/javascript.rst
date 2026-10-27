JavaScript API
==============

Noisemaker includes a vanilla JavaScript port that runs in modern browsers. The JavaScript implementation strives to maintain visual parity with the Python version. Both share the same presets, algorithms, and RNG behavior.

Overview
--------

The JavaScript port is a complete reimplementation of Noisemaker's core library in vanilla JavaScript (ES modules). The final library runs entirely in the browser without dependencies.

Key Features
~~~~~~~~~~~~

* **Full feature parity** with Python implementation
* **Deterministic output** via controlled RNG seeding
* **Shared preset DSL** - same presets work in both Python and JS
* **Cross-language testing** - JS tests run against Python reference
* **Browser-native** - no build step required, pure ES modules

Installation
------------

For Browser Use
~~~~~~~~~~~~~~~

Include the ES modules directly in your HTML:

.. code-block:: html

    <script type="module">
      import { Preset } from './js/noisemaker/composer.js';
      import { PRESETS } from './js/noisemaker/presets.js';
      import { Context } from './js/noisemaker/context.js';

      const preset = new Preset('acid', PRESETS());
      const canvas = document.getElementById('output');
      await preset.render(42, {
        width: 512,
        height: 512,
        ctx: new Context(canvas)
      });
    </script>

Using the Prebuilt Bundle
~~~~~~~~~~~~~~~~~~~~~~~~~

For a single-file build, download ``noisemaker.bundle.js`` from the latest GitHub release.
Alternatively, build it locally with ``npm run bundle``. This build requires no import map or bundler. The script registers a ``Noisemaker`` global that mirrors the
module exports.

.. code-block:: html

    <canvas id="output" width="512" height="512"></canvas>
    <script src="./dist/noisemaker.bundle.js"></script>
    <script>
      const { Preset, PRESETS, Context } = window.Noisemaker;
      const presets = PRESETS();
      const preset = new Preset('acid', presets);

      preset.render(42, {
        width: 512,
        height: 512,
        ctx: new Context(document.getElementById('output'))
      });
    </script>

For Development/Testing
~~~~~~~~~~~~~~~~~~~~~~~

The JavaScript port includes a Node-based CLI for testing and development. Run these commands from the repository root:

.. code-block:: bash

    npm install
    npm test  # Run cross-language parity tests

Command-Line Rendering (Experimental)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The JavaScript build includes a Node-powered CLI for rendering without a browser. Run it from the repository root:

.. code-block:: bash

    npx noisemaker-js generate basic --filename output.png --width 512 --height 512 --seed 123

Additional options: ``--time``, ``--speed``, ``--with-alpha``, ``--debug-print``, ``--debug-out FILE``

Core Modules
------------

The JavaScript library uses ES modules that mirror the Python structure. Import paths in this section and in the Quick Reference are relative to the ``js/`` directory.

Tensor Operations
~~~~~~~~~~~~~~~~~

**tensor.js** - Tensor wrapper for image data

.. code-block:: javascript

    import { Tensor } from './noisemaker/tensor.js';

    // Create from array. The first argument is a Context, or null.
    const data = new Float32Array(512 * 512 * 3);
    const tensor = Tensor.fromArray(null, data, [512, 512, 3]);
    
    // Read back data
    const pixels = tensor.read();

Noise Generation
~~~~~~~~~~~~~~~~

**simplex.js** - 3D OpenSimplex noise

.. code-block:: javascript

    import { simplex } from './noisemaker/simplex.js';

    // Returns a [height, width, channels] tensor with values in [0, 1]
    const noise = simplex([256, 256, 1], { time: 0.0, seed: 42, speed: 1.0 });

**value.js** - Value noise and tensor operations

.. code-block:: javascript

    import { values } from './noisemaker/value.js';

    // values(freq, shape, options)
    const tensor = values(4, [256, 256, 3], { seed: 42 });

**generators.js** - High-level noise generation

.. code-block:: javascript

    import { basic, multires } from './noisemaker/generators.js';

    // multires(freq, shape, options)
    const result = await multires(3, [512, 512, 3], {
      seed: 42,
      time: 0.0,
      speed: 1.0
    });

Effects and Composition
~~~~~~~~~~~~~~~~~~~~~~~

**effects.js** - Image post-processing effects

.. code-block:: javascript

    import { basic } from './noisemaker/generators.js';
    import { posterize, bloom, aberration } from './noisemaker/effects.js';

    // Effects take (tensor, shape, time, speed, ...params)
    const shape = [512, 512, 3];
    const time = 0.0;
    const speed = 1.0;
    let tensor = await basic(4, shape, { seed: 42 });
    tensor = await posterize(tensor, shape, time, speed, 5);  // levels
    tensor = await bloom(tensor, shape, time, speed, 0.5);    // alpha

**effectsRegistry.js** - Effect metadata and registration

.. code-block:: javascript

    import { register, EFFECT_METADATA } from './noisemaker/effectsRegistry.js';
    
    function myEffect(tensor, shape, time, speed, amount = 1.0) {
      // Custom effect implementation
      return tensor;
    }
    
    register('myEffect', myEffect, { amount: 1.0 });
    console.log(EFFECT_METADATA.myEffect); // => { amount: 1.0 }

**composer.js** - Preset composition system

.. code-block:: javascript

    import { Preset } from './noisemaker/composer.js';
    import { PRESETS } from './noisemaker/presets.js';

    const preset = new Preset('acid', PRESETS());
    // render(seed, options)
    const tensor = await preset.render(42, {
      width: 512,
      height: 512,
      time: 0.0,
      speed: 1.0
    });

**presets.js** - Preset loading and DSL evaluation

.. code-block:: javascript

    import { PRESETS } from './noisemaker/presets.js';

    const allPresets = PRESETS();

Constants and Enums
~~~~~~~~~~~~~~~~~~~

**constants.js** - All enumerations from Python

.. code-block:: javascript

    import {
      DistanceMetric,
      PointDistribution,
      ValueMask,
      ColorSpace,
      InterpolationType
    } from './noisemaker/constants.js';
    
    const metric = DistanceMetric.euclidean;
    const distrib = PointDistribution.random;

**masks.js** - Predefined mask patterns

.. code-block:: javascript

    import { Masks, maskValues } from './noisemaker/masks.js';
    import { ValueMask } from './noisemaker/constants.js';

    const chessMask = Masks[ValueMask.chess]; // [[0,1],[1,0]]

**palettes.js** - Color palette definitions. This module is ``shaders/src/palettes.js``. ``js/noisemaker/index.js`` re-exports it.

.. code-block:: javascript

    import { PALETTES } from '../shaders/src/palettes.js';

    const palette = PALETTES['blueSkies'];

Utilities
~~~~~~~~~

**rng.js** - Deterministic random number generation

.. code-block:: javascript

    import * as rng from './noisemaker/rng.js';
    
    rng.setSeed(42);
    const value = rng.random();      // [0.0, 1.0)
    const int = rng.randomInt(0, 9); // [0, 9]

**util.js** - Helper functions

.. code-block:: javascript

    import { savePNG, shapeFromParams } from './noisemaker/util.js';

    // Download a tensor as a PNG file (browser only)
    await savePNG(tensor, 'noise.png');

    // Get a shape from width and height: [512, 512, 3]
    const shape = shapeFromParams(512, 512);

**oklab.js** - OKLab color space conversion

.. code-block:: javascript

    import { rgbToOklab, oklabToRgb } from './noisemaker/oklab.js';

    // Both functions take and return a 3-channel tensor
    const oklab = rgbToOklab(tensor);
    const rgb = oklabToRgb(oklab);

**points.js** - Point cloud generation

.. code-block:: javascript

    import { pointCloud, rand, squareGrid } from './noisemaker/points.js';
    import { PointDistribution } from './noisemaker/constants.js';

    const [xPoints, yPoints] = pointCloud(4, {
      distrib: PointDistribution.random,
      shape: [512, 512, 3]
    });

**glyphs.js** - Font rendering (browser Canvas API)

.. code-block:: javascript

    import { loadGlyphs } from './noisemaker/glyphs.js';
    
    const glyphs = loadGlyphs([height, width]);

Cross-Language Parity
---------------------

Testing Approach
~~~~~~~~~~~~~~~~

The JavaScript test suite runs against the Python reference implementation. Run it from the repository root:

.. code-block:: bash

    npm test

Each parity test:

1. Generates output in JavaScript with a specific seed
2. Invokes Python subprocess with identical parameters
3. Compares outputs pixel-by-pixel
4. **Any difference is a test failure** - no approximations

Some unit tests compare with JSON fixtures under ``test/fixtures/`` instead of a Python subprocess.

This ensures the JavaScript port produces **identical** output to Python.

Parity Requirements
~~~~~~~~~~~~~~~~~~~

From ``js/doc/PY_JS_PARITY_SPEC.md``:

* **RNG behavior must match exactly** - same seed produces same random sequence
* **Never simulate weighted randomness** by repeating values. Use explicit probability checks.
* **Float precision differences** are not acceptable - results must be bit-identical where possible
* **Do not modify Python reference** to make JS tests pass
* **Do not skip or weaken tests** to hide parity issues

Shared Preset DSL
~~~~~~~~~~~~~~~~~

Both implementations use the same preset file:

.. code-block:: text

    /share/dsl/presets.dsl  # Shared by Python and JavaScript

This ensures presets behave identically across languages.

Development Guidelines
----------------------

From ``js/doc/VANILLA_JS_PORT_SPEC.md``:

When In Doubt
~~~~~~~~~~~~~

**Follow the Python implementation.** The Python version is the baseline reference implementation.

Code Style
~~~~~~~~~~

* Use ES modules (``import``/``export``)
* Document functions with JSDoc where helpful
* Match Python naming conventions (snake_case for functions)
* Use ``async``/``await`` for asynchronous operations

Testing
~~~~~~~

* Run ``npm test`` before committing
* Add parity tests for new features
* Never modify Python to make JS pass

API Differences from Python
----------------------------

The JavaScript API maintains functional parity but has some necessary differences:

Async Operations
~~~~~~~~~~~~~~~~

Some operations in JavaScript are asynchronous:

.. code-block:: javascript

    // Python (synchronous)
    tensor = preset.render(seed=42, shape=[512, 512, 3])

    // JavaScript (asynchronous)
    const tensor = await preset.render(42, { width: 512, height: 512 });

Object vs. Keyword Arguments
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

JavaScript uses object destructuring instead of Python's kwargs:

.. code-block:: javascript

    // Python
    result = multires(preset, seed=42, shape=[512, 512, 3], time=0.0, speed=1.0)
    
    // JavaScript
    const result = await multires(3, [512, 512, 3], {
      seed: 42,
      time: 0.0,
      speed: 1.0
    });

Canvas Output
~~~~~~~~~~~~~

JavaScript renders directly to HTML5 Canvas:

.. code-block:: javascript

    const canvas = document.getElementById('output');
    await preset.render(42, { width: 512, height: 512, ctx: new Context(canvas) });

Quick Reference: Python ↔ JavaScript
-------------------------------------

Core Functions
~~~~~~~~~~~~~~

.. list-table::
   :header-rows: 1
   :widths: 40 60

   * - Python
     - JavaScript
   * - ``from noisemaker.presets import Preset``
     - ``import { Preset } from './noisemaker/composer.js';``
       ``import { PRESETS } from './noisemaker/presets.js';``
   * - ``preset = Preset('acid')``
     - ``const preset = new Preset('acid', PRESETS());``
   * - ``tensor = preset.render(seed=42, shape=[512, 512, 3])``
     - ``const tensor = await preset.render(42, { width: 512, height: 512 });``
   * - ``from noisemaker.generators import multires``
     - ``import { multires } from './noisemaker/generators.js';``
   * - ``tensor = multires(preset, seed=42, shape=[512, 512, 3])``
     - ``const tensor = await multires(3, [512, 512, 3], { seed: 42 });``
   * - ``from noisemaker.effects import bloom, posterize``
     - ``import { bloom, posterize } from './noisemaker/effects.js';``
   * - ``tensor = bloom(tensor, shape, alpha=0.5)``
     - ``tensor = await bloom(tensor, shape, time, speed, 0.5);``

Random Number Generation
~~~~~~~~~~~~~~~~~~~~~~~~~

.. list-table::
   :header-rows: 1
   :widths: 40 60

   * - Python
     - JavaScript
   * - ``import noisemaker.rng as rng``
     - ``import * as rng from './noisemaker/rng.js';``
   * - ``rng.set_seed(42)``
     - ``rng.setSeed(42);``
   * - ``value = rng.random()``
     - ``const value = rng.random();``
   * - ``value = rng.random_int(0, 9)``
     - ``const value = rng.randomInt(0, 9);``
   * - ``item = rng.choice([1, 2, 3])``
     - ``const item = rng.choice([1, 2, 3]);``

Constants and Enums
~~~~~~~~~~~~~~~~~~~

.. list-table::
   :header-rows: 1
   :widths: 40 60

   * - Python
     - JavaScript
   * - ``from noisemaker.constants import DistanceMetric``
     - ``import { DistanceMetric } from './noisemaker/constants.js';``
   * - ``metric = DistanceMetric.euclidean``
     - ``const metric = DistanceMetric.euclidean;``
   * - ``from noisemaker.masks import Masks``
     - ``import { Masks } from './noisemaker/masks.js';``
   * - ``mask = Masks[ValueMask.chess]``
     - ``const mask = Masks[ValueMask.chess];``
   * - ``from noisemaker.palettes import PALETTES``
     - ``import { PALETTES } from '../shaders/src/palettes.js';``

Noise Functions
~~~~~~~~~~~~~~~

.. list-table::
   :header-rows: 1
   :widths: 40 60

   * - Python
     - JavaScript
   * - ``from noisemaker.simplex import simplex``
     - ``import { simplex } from './noisemaker/simplex.js';``
   * - ``tensor = simplex([256, 256, 1], time=0.0, seed=42)``
     - ``const tensor = simplex([256, 256, 1], { time: 0.0, seed: 42 });``
   * - ``from noisemaker.generators import basic``
     - ``import { basic } from './noisemaker/generators.js';``
   * - ``tensor = basic(4, [256, 256, 3])``
     - ``const tensor = await basic(4, [256, 256, 3]);``

Color Spaces
~~~~~~~~~~~~

.. list-table::
   :header-rows: 1
   :widths: 40 60

   * - Python
     - JavaScript
   * - ``from noisemaker.oklab import rgb_to_oklab``
     - ``import { rgbToOklab } from './noisemaker/oklab.js';``
   * - ``oklab = rgb_to_oklab(tensor)``
     - ``const oklab = rgbToOklab(tensor);``
   * - ``from noisemaker.oklab import oklab_to_rgb``
     - ``import { oklabToRgb } from './noisemaker/oklab.js';``
   * - ``rgb = oklab_to_rgb(oklab)``
     - ``const rgb = oklabToRgb(oklab);``

Examples
--------

Basic Noise Generation
~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: javascript

    import { Preset } from './js/noisemaker/composer.js';
    import { PRESETS } from './js/noisemaker/presets.js';
    import { Context } from './js/noisemaker/context.js';

    async function generate() {
      const preset = new Preset('basic', PRESETS());
      const canvas = document.getElementById('canvas');

      await preset.render(Date.now(), {
        width: 512,
        height: 512,
        ctx: new Context(canvas)
      });
    }

Animated Noise
~~~~~~~~~~~~~~

.. code-block:: javascript

    import { Preset } from './js/noisemaker/composer.js';
    import { PRESETS } from './js/noisemaker/presets.js';
    import { Context } from './js/noisemaker/context.js';

    async function animate() {
      const preset = new Preset('funky-glyphs', PRESETS());
      const ctx = new Context(document.getElementById('canvas'));
      let time = 0;

      function frame() {
        preset.render(42, {
          width: 512,
          height: 512,
          time: time,
          speed: 0.05,
          ctx: ctx
        }).then(() => {
          time += 0.016; // ~60fps
          requestAnimationFrame(frame);
        });
      }
      
      requestAnimationFrame(frame);
    }

Custom Effect Pipeline
~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: javascript

    import { multires } from './js/noisemaker/generators.js';
    import { posterize, bloom, aberration } from './js/noisemaker/effects.js';
    import { savePNG } from './js/noisemaker/util.js';

    async function customPipeline() {
      const shape = [512, 512, 3];

      // Generate base noise: multires(freq, shape, options)
      let tensor = await multires(4, shape, {
        seed: 42,
        octaves: 8
      });

      // Apply effects: (tensor, shape, time, speed, ...params)
      tensor = await posterize(tensor, shape, 0, 1, 5);      // levels
      tensor = await bloom(tensor, shape, 0, 1, 0.5);        // alpha
      tensor = await aberration(tensor, shape, 0, 1, 0.05);  // displacement

      // Download as a PNG file
      await savePNG(tensor, 'pipeline.png');
    }

Further Reading
---------------

* `JavaScript README <https://github.com/noisefactorllc/noisemaker/blob/main/js/README-JS.md>`_
* `Vanilla JS Port Specification <https://github.com/noisefactorllc/noisemaker/blob/main/js/doc/VANILLA_JS_PORT_SPEC.md>`_
* `Python/JS Parity Requirements <https://github.com/noisefactorllc/noisemaker/blob/main/js/doc/PY_JS_PARITY_SPEC.md>`_
* `Browser Demos <https://github.com/noisefactorllc/noisemaker/tree/main/demo>`_
