Demo UI
=======

The Noisemaker Shader Demo is an interactive browser-based playground for exploring GPU shader effects. It provides real-time rendering with live parameter controls, a DSL code editor, and support for both WebGL 2 and WebGPU backends.

A hosted demo can be viewed at https://noisemaker.app/demo/shaders/

What the Demo Does
------------------

The shader demo provides:

- **Effect browser** with categorized presets (synth, filter, nm, etc.)
- **Live parameter controls** generated automatically from effect definitions
- **DSL code editor** for composing effect chains programmatically
- **Backend switching** between GLSL (WebGL 2) and WGSL (WebGPU)
- **Bidirectional sync** between controls and DSL text

Quick Start
-----------

**Running locally:**

.. code-block:: bash

   # Start a local server
   cd /path/to/noisemaker
   npx http-server -p 8000

   # Open in browser
   open http://localhost:8000/demo/shaders/

**Embedding in your project:**

.. code-block:: html

   <!DOCTYPE html>
   <html>
   <head>
       <script type="module">
           import { CanvasRenderer, UIController } from './lib/demo-ui.js';

           const canvas = document.getElementById('canvas');
           const renderer = new CanvasRenderer({
               canvas,
               width: 512,
               height: 512,
               basePath: '../../shaders'
           });

           await renderer.loadManifest();
           await renderer.loadEffect('synth/noise');
           await renderer.compile('search synth\nnoise().write(o0)\nrender(o0)');
           renderer.start();
       </script>
   </head>
   <body>
       <canvas id="canvas" width="512" height="512"></canvas>
   </body>
   </html>

Components
----------

CanvasRenderer
~~~~~~~~~~~~~~

The core rendering engine that manages the GPU pipeline:

.. code-block:: javascript

   import { CanvasRenderer } from './shaders/src/renderer/canvas.js';

   const renderer = new CanvasRenderer({
       canvas: HTMLCanvasElement,     // Target canvas
       width: 1024,                   // Render resolution
       height: 1024,
       basePath: '../../shaders',     // Path to shader assets
       preferWebGPU: false,           // Use WebGPU if available
       useBundles: false,             // Use pre-built effect bundles
       bundlePath: '../../dist/effects',
       onFPS: (fps) => { },           // FPS callback
       onError: (err) => { }          // Error callback
   });

   // Load effect manifest, fetch the bundles you'll use, then compile
   await renderer.loadManifest();
   await renderer.loadEffect('synth/noise');
   await renderer.compile('search synth\nnoise().write(o0)\nrender(o0)');

   renderer.start();

   // Control playback
   renderer.pause();
   renderer.resume();
   renderer.stop();

UIController
~~~~~~~~~~~~

Manages the demo UI — effect selection, controls, DSL editing:

.. code-block:: javascript

   import { UIController } from './lib/demo-ui.js';

   const ui = new UIController(renderer, {
       effectSelect: document.getElementById('effect-select'),
       dslEditor: document.getElementById('dsl-editor'),
       controlsContainer: document.getElementById('controls'),
       statusEl: document.getElementById('status'),
       fpsCounterEl: document.getElementById('fps'),
       onControlChange: () => { /* handle control changes */ },
       onRequestRecompile: () => { /* handle recompile requests */ }
   });

   // Load an effect
   await ui.loadEffect('synth/noise');

   // Get current DSL
   const dsl = ui.getDsl();

DSL Language
~~~~~~~~~~~~

Effects are composed using a chainable DSL:

.. code-block:: text

   // Basic noise
   search synth
   noise().write(o0)
   render(o0)

   // Chained effects
   search synth, filter
   noise(octaves: 4, scale: 2.0)
     .posterize(levels: 8)
     .bloom(radius: 0.5)
     .write(o0)
   render(o0)

   // Multiple surfaces
   search synth, mixer
   noise().write(o0)
   noise(seed: 42).write(o1)
   blend(tex: read(o1), amount: 0.5).write(o0)
   render(o0)

See :doc:`language` for full DSL specification.

Bundling for Distribution
-------------------------

For production deployments, shader effects can be bundled into standalone JavaScript modules.

Building Bundles
~~~~~~~~~~~~~~~~

.. code-block:: bash

   npm run bundle:shaders

This produces:

- ``dist/shaders/noisemaker-shaders-core.esm.js`` — Core runtime + UI (ESM)
- ``dist/shaders/noisemaker-shaders-core.min.js`` — Minified IIFE variant
- ``dist/effects/{namespace}/{effect}.js`` — Per-effect mini-bundles

Using Bundles
~~~~~~~~~~~~~

.. code-block:: javascript

   import { CanvasRenderer, UIController } from './noisemaker-shaders-core.esm.js';

   const renderer = new CanvasRenderer({
       canvas,
       width: 512,
       height: 512,
       useBundles: true,
       bundlePath: './effects'
   });

   await renderer.loadManifest();
   await renderer.loadEffect('synth/noise');
   await renderer.compile('search synth\nnoise().write(o0)\nrender(o0)');
   renderer.start();

URL Parameters
~~~~~~~~~~~~~~

The demo supports URL parameters for deep linking:

- ``?effect=synth/noise`` — Load specific effect
- ``?backend=webgpu`` — Select rendering backend
- ``?bundles=1`` — Use pre-built effect bundles

Pluggable Controls
------------------

The UI system is designed to be **pluggable** — downstream projects can substitute custom web components for the default HTML elements.

Overview
~~~~~~~~

The ``UIController`` class manages all UI interactions for the shader demo:

- Effect selection and loading
- DSL editing and parsing
- Dynamic control generation from effect parameters
- Bidirectional sync between controls and DSL text

The control system allows downstream projects to substitute custom web components (like ``<my-custom-dropdown>``) for the default HTML elements (``<select>``, ``<input type="range">``, etc.).

Architecture
------------

Control Handle Interface
~~~~~~~~~~~~~~~~~~~~~~~~

Each control is represented by a **ControlHandle** object:

.. code-block:: javascript

   {
       element: HTMLElement,     // DOM element to append
       getValue: () => any,      // Get current value
       setValue: (value) => void // Set display value
   }

The ``UIController`` stores these handles on control group elements (``controlGroup._controlHandle``) so that ``checkStructureAndApplyState()`` can update controls without knowing their implementation details.

Control Factory
~~~~~~~~~~~~~~~

The ``ControlFactory`` class provides factory methods for creating controls:

.. code-block:: javascript

   import { ControlFactory } from './lib/control-factory.js'

   const factory = new ControlFactory()

   // Create a dropdown
   const selectHandle = factory.createSelect({
       choices: [
           { value: 0, label: 'Option A' },
           { value: 1, label: 'Option B' }
       ],
       value: 0,
       className: 'control-select'
   })

   // Create a slider
   const sliderHandle = factory.createSlider({
       value: 0.5,
       min: 0,
       max: 1,
       step: 0.01,
       className: 'control-slider'
   })

Available factory methods:

- ``createSelect(options)`` — Dropdown/select controls
- ``createSlider(options)`` — Range slider controls
- ``createToggle(options)`` — Boolean toggle switches
- ``createColorPicker(options)`` — Color picker inputs
- ``createButton(options)`` — Momentary action buttons
- ``createTextDisplay(options)`` — Read-only text labels
- ``createValueDisplay(options)`` — Value display spans

Customizing Controls
--------------------

Downstream projects can provide custom control implementations by extending ``ControlFactory``:

.. code-block:: javascript

   import { ControlFactory, UIController } from './lib/demo-ui.js'

   class CustomControlFactory extends ControlFactory {
       createSelect(options) {
           // Use a custom web component instead of <select>
           const el = document.createElement('my-custom-dropdown')
           el.items = options.choices.map(c => ({
               value: c.value,
               label: c.label
           }))
           el.value = options.value

           return {
               element: el,
               getValue: () => el.value,
               setValue: (v) => { el.value = v }
           }
       }

       createSlider(options) {
           const el = document.createElement('my-custom-slider')
           el.min = options.min
           el.max = options.max
           el.step = options.step
           el.value = options.value

           return {
               element: el,
               getValue: () => el.value,
               setValue: (v) => { el.value = v }
           }
       }
   }

   // Pass the custom factory to UIController
   const ui = new UIController(renderer, {
       controlFactory: new CustomControlFactory(),
       effectSelect: document.getElementById('effect-select'),
       dslEditor: document.getElementById('dsl-editor'),
       controlsContainer: document.getElementById('controls'),
       statusEl: document.getElementById('status')
   })

ProgramState
------------

``ProgramState`` is a decoupled state management layer that sits between the UI and the renderer. It provides:

- **Centralized state access** via ``getValue()``/``setValue()``
- **Event-driven updates** - emits ``change``, ``structurechange``, ``reset`` events
- **Batching** - multiple changes can be batched to emit a single event
- **Serialization** - ``serialize()``/``deserialize()`` for undo/redo and persistence
- **Media metadata** - stores metadata about media and text inputs

Basic Usage
~~~~~~~~~~~

.. code-block:: javascript

   // Access via UIController
   const state = ui.programState

   // Get/set parameter values
   const value = state.getValue('step_0', 'scale')
   state.setValue('step_0', 'scale', 2.0)

   // Batch multiple changes (single event)
   state.batch(() => {
       state.setValue('step_0', 'scale', 2.0)
       state.setValue('step_0', 'octaves', 4)
   })

   // Subscribe to changes
   state.on('change', ({ stepKey, paramName, value }) => {
       console.log(`${stepKey}.${paramName} = ${value}`)
   })

   // Reset a step to defaults
   state.resetStep('step_0', effectDef)

   // Serialize for undo/redo
   const snapshot = state.serialize()
   state.deserialize(snapshot)

   // Get all step values (replaces _effectParameterValues)
   const allValues = state.getAllStepValues()

DSL Synchronization
-------------------

The control system maintains bidirectional sync between controls and DSL text:

Controls → DSL
~~~~~~~~~~~~~~

When a control value changes:

1. The control's ``change`` event fires
2. ``programState.setValue()`` updates the state
3. ``_updateDslFromEffectParams()`` regenerates the DSL text
4. The DSL editor is updated

DSL → Controls
~~~~~~~~~~~~~~

When DSL text changes (e.g., user edits the text):

1. ``checkStructureAndApplyState(dsl)`` is called
2. For each parameter, the method finds the control group
3. If ``controlGroup._controlHandle.setValue`` exists, it's called
4. Otherwise, falls back to native element queries (backward compatibility)

This design ensures that custom web components are updated correctly when DSL text changes, solving the common problem where custom dropdowns don't sync from DSL edits.

Module Controls Reset Hook
--------------------------

When a module's "reset" button is clicked, the UIController rebuilds that module's controls from scratch. Downstream projects that apply custom UI transformations (e.g., rearranging mixer A/B sliders into a special layout) need to re-apply those transformations after the rebuild.

The ``onModuleControlsReset`` callback fires after a module's controls are rebuilt:

.. code-block:: javascript

   const ui = new UIController(renderer, {
       // ... other options ...
       onModuleControlsReset: (stepIndex, moduleElement, effectDef) => {
           // Re-apply custom UI transformations
           if (effectDef.category === 'mixer') {
               this._applyMixerLayout(moduleElement, effectDef)
           }
       }
   })

**Callback parameters:**

- ``stepIndex`` — The step index of the affected module in the pipeline
- ``moduleElement`` — The DOM element (``<div class="shader-module">``) whose controls were rebuilt
- ``effectDef`` — The effect definition object, useful for checking effect type or accessing globals

Integration Points
------------------

UIController Options
~~~~~~~~~~~~~~~~~~~~

.. code-block:: javascript

   new UIController(renderer, {
       // Required
       effectSelect: HTMLSelectElement,      // Effect selector dropdown
       dslEditor: HTMLTextAreaElement,       // DSL text editor
       controlsContainer: HTMLElement,       // Container for effect controls
       statusEl: HTMLElement,                // Status message display

       // Optional
       fpsCounterEl: HTMLElement,            // FPS counter display
       loadingDialog: HTMLDialogElement,     // Loading dialog
       loadingDialogTitle: HTMLElement,      // Loading dialog title
       loadingDialogStatus: HTMLElement,     // Loading dialog status text
       loadingDialogProgress: HTMLElement,   // Loading dialog progress bar

       // Callbacks
       onControlChange: Function,            // Called when any control changes
       onRequestRecompile: Function,         // Called when recompile is needed
       onModuleControlsReset: Function,      // Called after module reset button rebuilds controls

       // Pluggable controls
       controlFactory: ControlFactory        // Custom control factory
   })

Exports
~~~~~~~

The ``demo-ui.js`` module exports:

.. code-block:: javascript

   import {
       // Main class
       UIController,

       // Control factory
       ControlFactory,
       defaultControlFactory,

       // Utilities
       camelToSpaceCase,
       formatEnumName,
       formatValue,
       extractEffectsFromDsl,

       // Re-exported from canvas.js
       cloneParamValue,
       isStarterEffect,
       hasTexSurfaceParam,
       hasExplicitTexParam,
       getVolGeoParams,
       is3dGenerator,
       is3dProcessor,
       getEffect
   } from './lib/demo-ui.js'

Example: Custom Dropdown Component
----------------------------------

Here's a complete example of integrating a custom ``<select-dropdown>`` web component:

.. code-block:: javascript

   class SelectDropdown extends HTMLElement {
       static get observedAttributes() { return ['value'] }

       constructor() {
           super()
           this._items = []
           this._value = null
       }

       set items(arr) {
           this._items = arr
           this._render()
       }

       get value() { return this._value }
       set value(v) {
           this._value = v
           this._updateDisplay()
       }

       // ... implementation details ...
   }
   customElements.define('select-dropdown', SelectDropdown)

   // Factory that uses it
   class AppControlFactory extends ControlFactory {
       createSelect(options) {
           const el = document.createElement('select-dropdown')
           el.items = options.choices
           el.value = options.value

           return {
               element: el,
               getValue: () => el.value,
               setValue: (v) => { el.value = v }
           }
       }
   }

With this setup:

1. Controls render using ``<select-dropdown>`` instead of ``<select>``
2. User interactions update the DSL text correctly
3. DSL text edits update the dropdown via ``setValue()``
4. No need to override ``checkStructureAndApplyState()`` or other internal methods
