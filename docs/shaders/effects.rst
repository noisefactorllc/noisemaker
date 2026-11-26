.. _shader-effects:

Effect Definition Spec
======================

An "Effect" is a self-contained unit that transforms inputs to outputs using one or more rendering or compute passes.

1. Schema
---------

Create effect definitions with the ``Effect`` constructor and a configuration object. This is the primary and recommended approach.

.. code-block:: javascript

   import { Effect } from '../../../src/runtime/effect.js';

   export default new Effect({
     name: "SimpleBloom",
     namespace: "examples",
     func: "bloom",

     globals: {
       intensity: {
         type: "float",
         default: 0.5,
         min: 0,
         max: 1,
         ui: { label: "Intensity", control: "slider" }
       },
       threshold: {
         type: "float",
         default: 0.5,
         min: 0,
         max: 1,
         ui: { label: "Threshold", control: "slider" }
       }
     },

     textures: {
       downsampled: { width: "25%", height: "25%", format: "rgba16f" }
     },

     passes: [
       {
         name: "downsample",
         program: "downsample",
         inputs: {
           scene: "inputTex"
         },
         outputs: {
           color: "downsampled"
         }
       },
       {
         name: "composite",
         program: "composite",
         inputs: {
           scene: "inputTex",
           bloom: "downsampled"
         },
         outputs: {
           color: "outputTex"
         }
       }
     ]
   });

2. Key Concepts
---------------


* ``namespace``: Logical grouping for the effect (e.g., ``"synth"``, ``"filter"``). Combined with ``name``, it forms the unique identity.
* ``textures``: Defines the internal render targets. Dimensions can be absolute, relative to screen (``"screen"``, ``"50%"``), or fixed.
* ``passes``:

  * ``program``: Key to look up the shader code (GLSL/WGSL).
  * ``inputs``: Maps shader uniform samplers to texture names.
  * ``outputs``: Maps shader output locations (or write buffers) to texture names.
  * ``uniforms``: Maps shader uniform names to effect-global parameter names.
  * ``repeat``: A fixed repeat count or the name of a uniform that supplies it.
  * Backend fields include ``entryPoint``, ``drawMode``, ``drawBuffers``,
    ``count``, ``countUniform``, ``blend``, ``workgroups``, ``storageBuffers``,
    and ``storageTextures``.

2b. Tags and Namespaces
-----------------------

**Tags** and **namespaces** categorize effects to help users find and understand them.

**Namespaces**

Namespace is the primary categorization and acts as an implicit tag. Each effect belongs to exactly one namespace.

.. list-table::
   :header-rows: 1
   :widths: 20 80

   * - Namespace
     - Description
   * - ``io``
     - Built-in pipeline I/O operations. The required search directive needs no ``io`` entry.
   * - ``classicNoisedeck``
     - Complex shaders ported from the original noisedeck.app pipeline
   * - ``synth``
     - 2D generator modules
   * - ``mixer``
     - Blend two sources from A to B
   * - ``filter``
     - Apply special effects to 2D input
   * - ``points``
     - Agent and particle simulations (e.g. physarum, flock, dla, lenia, life)
   * - ``render``
     - Rendering utilities (render3d, cubemaps, mesh and points rendering, render loops)
   * - ``synth3d``
     - 3D volumetric generators (e.g. noise3d, cellularAutomata3d, reactionDiffusion3d, fractal3d, shape3d)
   * - ``filter3d``
     - 3D volumetric processors (flow3d, palette3d)
   * - ``user``
     - User-defined effects

**Tags**

Tags are curated labels for additional categorization. An effect may have multiple tags. Tags are optional. The ``shaders/src/runtime/tags.js`` file defines them globally.

.. list-table::
   :header-rows: 1
   :widths: 15 85

   * - Tag
     - Description
   * - ``3d``
     - 3D volumetric effects
   * - ``agents``
     - Particle and agent-based systems
   * - ``antialiasing``
     - Edge smoothing and antialiasing
   * - ``audio``
     - Audio-reactive effects
   * - ``blend``
     - Compositing and blend modes
   * - ``blur``
     - Blur and softening
   * - ``color``
     - Color manipulation
   * - ``distort``
     - Input distortion
   * - ``edges``
     - Accentuate or isolate texture edges
   * - ``fractal``
     - Fractal patterns
   * - ``geometric``
     - Shapes
   * - ``geometry``
     - 3D mesh geometry
   * - ``glitch``
     - Glitch and corruption effects
   * - ``image``
     - Image-input effects
   * - ``lens``
     - Emulated camera lens effects
   * - ``mesh``
     - 3D mesh rendering
   * - ``midi``
     - MIDI-reactive effects
   * - ``noise``
     - Very noisy
   * - ``palette``
     - Color palette mapping
   * - ``pattern``
     - Repeating or structured patterns
   * - ``pixel``
     - Pixelation and pixel-level effects
   * - ``sim``
     - Simulations with temporal state
   * - ``text``
     - Text rendering
   * - ``tiling``
     - Seamless tiling
   * - ``transform``
     - Transforms positions
   * - ``util``
     - Utility function
   * - ``video``
     - Video-input effects

**Usage in Effect Definitions:**

.. code-block:: javascript

   import { Effect } from '../../../src/runtime/effect.js';

   export default new Effect({
     name: "Warp",
     namespace: "filter",
     func: "warp",
     tags: ["distort", "noise"],  // Multiple tags allowed

     globals: { /* ... */ },
     passes: [ /* ... */ ]
   });

**Tag Validation:**

Validation checks tags against the curated list in ``shaders/src/runtime/tags.js``. Development checks flag invalid tags, and the definition validator reports a tag outside the list as an unknown tag. The built-in search offers only the listed tags as filter options. Portable packages (Section 8) use the same list. Use ``validateTags()`` to check tags programmatically:

.. code-block:: javascript

   import { validateTags, isValidTag } from '../../../src/runtime/tags.js';

   // Check a single tag
   isValidTag('color');  // true
   isValidTag('foobar'); // false

   // Validate an array of tags
   validateTags(['color', 'distort']);  // { valid: true, invalidTags: [] }
   validateTags(['color', 'invalid']);  // { valid: false, invalidTags: ['invalid'] }

**UI Rendering:**

The demo UI renders tags to the right of the namespace badge. It emphasizes the namespace and displays additional tags in a lighter style.

3. On-Disk Layout
-----------------

Effects are typically authored as a directory containing a definition file, shader sources, and documentation.

.. code-block:: text

   my-effect/
   ├── definition.js       # Exports new Effect({...}) or Effect subclass
   ├── glsl/
   │   └── my-shader.glsl  # WebGL implementation
   ├── wgsl/
   │   └── my-shader.wgsl  # WebGPU implementation
   └── help.md             # User documentation (markdown)

**Shader References:**
The ``program`` field in a pass can specify a relative path (e.g., ``"./my-shader"``). The runtime resolves this path relative to the definition file. It inserts the backend directory (``glsl/`` or ``wgsl/``) and appends the corresponding extension (``.glsl`` or ``.wgsl``).

**Documentation:**
The ``help.md`` file is optional but recommended for library effects. It provides context for the editor UI.

**Example DSL:**
The demo UI generates example DSL snippets from the effect type (starter, filter, or mixer). You do not need to maintain ``example.dsl`` files manually.

4. Global Enums
---------------

A global registry defines common enumerations for consistency and reduced duplication. Effects reference these enums by name instead of redefining the choices.

**Global Registry Example:**

.. code-block:: javascript

   const globalEnums = {
     "interpolation": {
       "nearest": 0,
       "linear": 1,
       "hermite": 2,
       "cubic": 3
     },
     "wrapMode": {
       "clamp": 0,
       "repeat": 1,
       "mirror": 2
     }
   };

**Effect Usage:**

.. code-block:: javascript

   globals: {
     interp: {
       type: "int",
       enum: "interpolation", // References global key
       default: "linear"      // Uses string key
     }
   }

The runtime resolves the string value (e.g., ``"linear"``) to its integer counterpart (``1``) before binding to the shader.

**Exact vector formatting:**

For ``vec4`` parameters that store coordinates, set ``ui.format: 'vector'``
to preserve their numeric values when generating DSL:

.. code-block:: javascript

   vertices: {
     type: 'vec4',
     default: [0, 0, 1, 1],
     ui: { format: 'vector' }
   }

When the unparser receives this parameter definition and an array or typed
array of four finite numbers, it emits an array literal without rounding,
color clamping, or exponent notation. Remap uses this for its packed vertex
pairs. Hosts that call ``unparse()`` must supply effect definitions through
``getEffectDef`` so the formatter can read the metadata. This property does
not change the parameter's shader type or reject legacy hexadecimal input.

4b. UI Categories
-----------------

Use ``ui.category`` to group uniform controls visually in the demo UI. Categories organize controls into sections for complex effects with many parameters.

**Category Requirements:**

- Category names **MUST** be camelCase (start with lowercase letter, no spaces/underscores/hyphens)
- Categories appear in order of first occurrence in the globals object
- Controls without a category default to ``"general"`` (displayed last)
- The UI shows category labels on hover and renders separators between groups

**Example:**

.. code-block:: javascript

   globals: {
     temperature: {
       type: "float",
       default: 0,
       uniform: "gradeTemperature",
       ui: {
         label: "Temperature",
         control: "slider",
         category: "primary"      // camelCase required
       }
     },
     hslHueCenter: {
       type: "float",
       default: 0,
       uniform: "gradeHslHueCenter",
       ui: {
         label: "Hue Center",
         control: "slider",
         category: "hslSecondary", // camelCase, no spaces
         enabledBy: "hslEnable"    // Only enabled when hslEnable is truthy
       }
     }
   }

4c. Conditional Control Visibility (enabledBy)
-----------------------------------------------

The ``enabledBy`` property enables or disables a parameter's UI control according to other parameter values. It supports simple truthy checks and complex conditional expressions.

**Simple String Format (Legacy):**

The simplest form takes a parameter name as a string. A "truthy" value enables the control:

- A non-zero number
- A true boolean
- A non-empty string

.. code-block:: javascript

   enabledBy: "hslEnable"    // enabled when hslEnable is truthy

**Comparison Operators:**

For more precise control, use an object with ``param`` and one or more comparison operators:

.. code-block:: javascript

   enabledBy: { param: "intensity", gt: 0.5 }     // enabled when intensity > 0.5
   enabledBy: { param: "intensity", gte: 0.5 }    // enabled when intensity >= 0.5
   enabledBy: { param: "intensity", lt: 0.5 }     // enabled when intensity < 0.5
   enabledBy: { param: "intensity", lte: 0.5 }    // enabled when intensity <= 0.5
   enabledBy: { param: "mode", eq: 1 }            // enabled when mode === 1
   enabledBy: { param: "mode", neq: 0 }           // enabled when mode !== 0

**Set Membership:**

Check if a value is a member of (or excluded from) a set of values:

.. code-block:: javascript

   enabledBy: { param: "mode", in: [1, 2, 3] }       // enabled when mode is 1, 2, or 3
   enabledBy: { param: "mode", notIn: [0, 4] }       // enabled when mode is NOT 0 or 4
   enabledBy: { param: "preset", in: ["a", "b"] }    // works with strings too

**Multiple Conditions (AND):**

Multiple operators in a single object use AND logic:

.. code-block:: javascript

   enabledBy: { param: "intensity", gt: 0, lt: 1 }   // enabled when 0 < intensity < 1

**Logical Operators:**

For complex conditions, use ``or``, ``and``, and ``not``:

.. code-block:: javascript

   // OR: enabled when EITHER condition is true
   enabledBy: {
     or: [
       { param: "mode", eq: 1 },
       { param: "enabled", eq: true }
     ]
   }

   // AND (explicit): enabled when ALL conditions are true
   enabledBy: {
     and: [
       { param: "mode", gt: 0 },
       { param: "intensity", gte: 0.5 }
     ]
   }

   // NOT: invert a condition
   enabledBy: { not: { param: "disabled", eq: true } }

   // Complex nested conditions
   enabledBy: {
     or: [
       { param: "mode", eq: 2 },
       { and: [
         { param: "mode", eq: 1 },
         { param: "advanced", eq: true }
       ]}
     ]
   }

**Operator Reference:**

.. list-table::
   :header-rows: 1
   :widths: 15 85

   * - Operator
     - Description
   * - ``eq``
     - Equal to value
   * - ``neq``
     - Not equal to value
   * - ``gt``
     - Greater than value (numbers only)
   * - ``gte``
     - Greater than or equal to value (numbers only)
   * - ``lt``
     - Less than value (numbers only)
   * - ``lte``
     - Less than or equal to value (numbers only)
   * - ``in``
     - Value is member of array
   * - ``notIn``
     - Value is not member of array
   * - ``or``
     - Array of conditions, any must be true
   * - ``and``
     - Array of conditions, all must be true
   * - ``not``
     - Invert the nested condition

**BANNED:**

- ``category: "Primary"`` — PascalCase forbidden
- ``category: "HSL Secondary"`` — spaces forbidden
- ``category: "hsl_secondary"`` — underscores forbidden

4d. Reseed-Gated Parameters (resetOnChange)
--------------------------------------------

Some parameters are only read when an effect reseeds its state: a spawn
layout or seed read when an agent respawns, a density read while a volume
is seeded. Changing such a parameter live has no visible effect until the
effect's ``resetState`` fires. Mark
those parameters with ``ui.resetOnChange: true`` so hosts can distinguish
them and pulse the effect's ``resetState`` when one changes, instead of
restarting the effect on every choice.

.. code-block:: javascript

   layout: {
     type: 'int',
     default: 0,
     uniform: 'layout',
     ui: {
       label: 'layout',
       control: 'dropdown',
       resetOnChange: true   // read only when an agent respawns
     }
   }

The value must be a boolean; the definition validator diagnoses any other
type. The flag is a UI hint only: it does not change the parameter's shader
type or its uniform name.

5. Lifecycle Methods (Class-Based Effects)
-------------------------------------------

Most effects are purely declarative and use the ``new Effect({...})`` pattern above. Some effects require CPU-side state, such as simulation steps, complex time-keeping, or audio analysis. For these effects, choose one of these approaches:

1. **Pass lifecycle functions in the config** (simpler):

.. code-block:: javascript

   import { Effect } from '../../../src/runtime/effect.js';

   export default new Effect({
     name: "PulseEffect",
     namespace: "examples",
     func: "pulse",

     globals: {
       speed: { type: "float", default: 1.0 },
       intensity: { type: "float", default: 0.5 }
     },

     passes: [
       { name: "main", program: "pulse", outputs: { color: "outputTex" } }
     ],

     // Lifecycle hooks as config properties
     onInit() {
       this.state.phase = 0;
     },

     onUpdate({ time, delta, uniforms }) {
       this.state.phase += delta * uniforms.speed;
       return {
         u_pulse: Math.sin(this.state.phase) * uniforms.intensity
       };
     }
   });

2. **Subclass Effect** (for complex cases with additional methods):

.. code-block:: javascript

   import { Effect } from '../../../src/runtime/effect.js';

   export default class MediaEffect extends Effect {
     name = "Media";
     namespace = "synth";
     func = "media";

     globals = { /* ... */ };
     passes = [ /* ... */ ];

     onInit() {
       this.state.imageWidth = 1;
       this.state.imageHeight = 1;
     }

     onUpdate(_context) {
       return {
         imageSize: [this.state.imageWidth || 1, this.state.imageHeight || 1]
       };
     }

     // Additional custom methods
     setMediaDimensions(width, height) {
       this.state.imageWidth = width;
       this.state.imageHeight = height;
     }
   }

**When to use class-based effects:**

- You need custom methods beyond lifecycle hooks
- You have complex module-level setup (e.g., building enum choices from imports)
- The effect requires external resource management

**Lifecycle Method Contract:**

The runtime invokes these methods at specific stages:

- ``onInit()``: The runtime calls this once when it loads the effect. Initialize state here.
- ``onUpdate({ time, delta, uniforms })``: The runtime calls this every frame before rendering. Return an object of computed uniforms.
- ``onDestroy()``: The runtime calls this when it removes the effect. Release resources here.

Uniforms returned from ``onUpdate`` bind under fallback semantics: a returned
key binds only when the pass does not already resolve that uniform, so
DSL-provided, step-provided, and authored values keep priority. The hooks run
in the production ``Pipeline`` (not only the test harness): ``onInit()`` once
per effect instance per pipeline lifetime (idempotent across resize and hot
recompile), ``onUpdate()`` once per frame before pass execution, and
``onDestroy()`` at dispose with hook errors joining the existing dispose
error path.

.. code-block:: javascript

   // Lifecycle methods can be defined in config or as class methods

   onInit() {
     this.state.generation = 0;
     this.state.lastUpdate = 0;
   }

   onUpdate({ time, delta, uniforms }) {
     // Update state periodically
     if (time - this.state.lastUpdate > 0.1) {
       this.state.generation++;
       this.state.lastUpdate = time;
     }

     // Return computed uniforms for this frame
     return {
       u_generation: this.state.generation,
       u_computed_value: Math.sin(time) * uniforms.intensity
     };
   }

   onDestroy() {
     // Cleanup resources (e.g., event listeners, audio contexts)
   }

6. Effect Constructor Reference
-------------------------------

The ``Effect`` constructor accepts a configuration object. The list below describes common properties. Section 7 summarizes the remaining
fields that the current constructor copies. Section 8.3 gives the required
fields of a Portable package, which differ from those of the constructor.

**Required:**

- ``name`` (string): Display name for the effect
- ``passes`` (array): One or more render/compute passes

**Optional:**

- ``namespace`` (string): Logical grouping (e.g., ``"filter"``, ``"synth"``, ``"mixer"``)
- ``func`` (string): DSL function name used by runtime registration
- ``tags`` (array): Curated tags for categorization (see section 2b)
- ``globals`` (object): Uniform parameters exposed to shaders and UI
- ``textures`` (object): Internal render targets
- ``onInit`` (function): Lifecycle hook called once on load
- ``onUpdate`` (function): Lifecycle hook called every frame
- ``onDestroy`` (function): Lifecycle hook called on cleanup

**Example - Minimal Effect:**

.. code-block:: javascript

   import { Effect } from '../../../src/runtime/effect.js';

   export default new Effect({
     name: "Invert",
     namespace: "filter",
     func: "inv",
     passes: [
       {
         name: "main",
         program: "invert",
         inputs: { inputTex: "inputTex" },
         outputs: { fragColor: "outputTex" }
       }
     ]
   });

**Example - Effect with Globals and Textures:**

.. code-block:: javascript

   import { Effect } from '../../../src/runtime/effect.js';

   export default new Effect({
     name: "Blur",
     namespace: "filter",
     func: "blur",

     globals: {
       radiusX: { type: "float", default: 5.0, min: 0, max: 50, uniform: "radiusX" },
       radiusY: { type: "float", default: 5.0, min: 0, max: 50, uniform: "radiusY" }
     },

     textures: {
       _blurTemp: { width: "screen", height: "screen", format: "rgba8unorm" }
     },

     passes: [
       {
         name: "blurH",
         program: "blurH",
         inputs: { inputTex: "inputTex" },
         outputs: { fragColor: "_blurTemp" }
       },
       {
         name: "blurV",
         program: "blurV",
         inputs: { inputTex: "_blurTemp" },
         outputs: { fragColor: "outputTex" }
       }
     ]
   });

7. Configuration Shape and Validation
-------------------------------------

Effect definitions are validated at development and load time by
``validateEffectDefinition()`` in ``shaders/src/runtime/effect-validator.js``.
A Portable package is checked by ``normalizePortableDefinition()``
(Section 8), which reads the package's format and then calls this validator.
The validator is a deterministic, side-effect-free function that returns an array of
descriptive error strings (empty if valid) without throwing or mutating definitions.
It validates the full definition grammar consumed across ``effect.js``, ``expander.js``,
``compiler.js``, and ``pipeline.js``.

The machine-readable form of the definition grammar is the generated JSON
Schema below. ``shaders/scripts/generate-portable-schema.mjs`` writes it to
``shaders/portable/portable-effect.schema.json`` from the shared declaration
grammar. The schema covers the declarative fields that a Portable package
(Section 8) can carry. A JavaScript definition (``definition.js``) can also
carry the lifecycle functions of Section 5 (``onInit``, ``onUpdate``,
``onDestroy``, ``asyncInit``); a package cannot.

.. literalinclude:: ../../shaders/portable/portable-effect.schema.json
   :language: json

**Field notes:**

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Field
     - Meaning
   * - ``name``
     - Non-empty display name. Spaces are allowed.
   * - ``globals.<key>.type``
     - One of ``boolean``, ``color``, ``float``, ``geometry``, ``int``,
       ``mat3``, ``member``, ``palette``, ``string``, ``surface``, ``vec2``,
       ``vec3``, ``vec4`` and ``volume``. See :ref:`shader-integration`,
       Parameter Types.
   * - ``globals.<key>.default``
     - Optional in the grammar. The validator checks its type when it is
       present. A package should declare one for every parameter.
   * - ``globals.<key>.choices``
     - Map of label strings to values for dropdowns.
   * - ``globals.<key>.enum``
     - Reference to a global enum key (Section 4).
   * - ``globals.<key>.ui.category``
     - UI grouping category. Write it in camelCase (Section 4b).
   * - ``globals.<key>.ui.hint``
     - Tooltip text for the control.
   * - ``globals.<key>.ui.enabledBy``
     - A parameter name for a truthy check, or a condition object
       (Section 4c).
   * - ``textures.<name>``
     - User-defined textures. Width and height default to screen; format
       defaults to ``rgba16f``. Unknown or misplaced policy fields are
       rejected with per-field diagnostics.
   * - ``textures.<name>.mipmaps``
     - 2D only: allocate a full mip chain and regenerate it from level-0
       writes each frame.
   * - ``textures.<name>.persistent``
     - 2D only: the pipeline resamples contents after an allocation-size
       change. Global surface specs also retain their final bindings across
       frames.
   * - ``textures3d.<name>.filter``
     - 3D only: ``nearest`` or ``linear`` sampler filtering. Unauthored 3D
       defaults are linear on both backends.
   * - ``outputTex3d``
     - Internal texture name to expose as 3D volume output (Section 7.1).
   * - ``outputGeo``
     - Internal texture name to expose as geometry buffer output
       (Section 7.1).
   * - pass ``name``
     - Pass label, preserved verbatim on expanded passes.
   * - pass ``type``
     - Pass type label, such as ``render`` or ``compute``. Backend
       shader-kind dispatch remains source-derived.
   * - pass ``drawBuffers``
     - Integer, at least 1.
   * - pass ``clear``
     - Whether to clear output attachments before pass execution (WebGPU
       render-pass ``loadOp``).
   * - pass ``samplerTypes``
     - Per-binding sampler selection on WebGPU: ``default``, ``nearest``,
       ``repeat`` or ``mipmap``. WebGL2 ignores it.
   * - pass ``viewport``
     - Per-pass viewport box: ``x``, ``y``, ``w`` and ``h`` numbers, or
       ``width`` and ``height`` dimension specifications that resolve against
       current uniforms and screen dimensions per frame.
   * - pass ``conditions``
     - ``runIf`` and ``skipIf`` predicates, evaluated per frame before
       dispatch.
   * - pass ``uniforms``
     - Shader uniform name to effect-global parameter name.
   * - pass ``workgroups``
     - Array of one to three positive integers.

Section 7.3 describes how backends handle format names.

7.1 Reserved Texture Names
^^^^^^^^^^^^^^^^^^^^^^^^^^

The runtime synthesizes these textures automatically. Do not define them in ``textures``.

**2D Pipeline (standard):**

* ``inputTex`` — 2D input from the previous effect in the chain
* ``outputTex`` — 2D output to the next effect in the chain

**3D Pipeline (volumetric):**

* ``inputTex3d`` — 3D volume input from the previous effect
* ``outputTex3d`` — Effect-level property pointing to an internal texture to expose as 3D output

**Geometry Pipeline:**

* ``inputGeo`` — Geometry buffer (normals + depth) from upstream raymarched effect
* ``outputGeo`` — Effect-level property pointing to an internal texture to expose as geometry output

Effects that produce 3D volumes or geometry buffers declare the output at effect level:

.. code-block:: javascript

   export default new Effect({
     name: "VolumeGenerator",
     namespace: "synth3d",
     textures: {
       volumeCache: { width: 64, height: 4096, format: "rgba16float" },
       geoBuffer: { width: "screen", height: "screen", format: "rgba16float" }
     },
     passes: [ /* ... */ ],
     outputTex3d: "volumeCache",  // Expose volumeCache as 3D output
     outputGeo: "geoBuffer"       // Expose geoBuffer as geometry output
   });

A pass can also bind ``outputTex3d`` directly as an output. Declaring an
internal texture and naming it in the effect-level ``outputTex3d`` field is
preferred, because the texture declaration sets the volume's dimensions.

The effect-level fields also accept passthrough values. ``outputTex3d:
"inputTex3d"`` retains the upstream volume, and ``outputGeo: "inputGeo"``
passes the upstream geometry through; passthrough does not require an unused
shader sampler. In a legacy Portable package (Section 8.2), ``null`` for
either field means the field is absent.

The meaning of ``inputGeo`` depends on the preceding stage. Geometry from a
volume generator is an atlas; geometry from a volume renderer is a screen
image (Section 8.6).

7.2 Dimension Resolution Algorithm
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

For each texture dimension (``width`` or ``height``), resolve to integer pixels:

.. code-block:: js

   function resolveDimension(spec, screenSize, uniforms = {}) {
     if (typeof spec === 'number') return Math.max(1, Math.floor(spec))

     // 'screen', 'auto', 'input', and 'resolution' are all validator-accepted
     // keywords whose resolution is the screen dimension; no fallback diagnostic.
     if (['screen', 'auto', 'input', 'resolution'].includes(spec)) return screenSize

     if (typeof spec === 'string' && spec.endsWith('%')) {
       const percent = parseFloat(spec)
       return Math.max(1, Math.floor(screenSize * percent / 100))
     }

     if (typeof spec === 'object') {
       // Param-based; `default` is the final fallback after transforms.
       if (spec.param !== undefined) {
         const hasTransform = spec.power !== undefined || spec.multiply !== undefined
         const paramDefault = spec.paramDefault ?? 64
         let value = uniforms[spec.param] ?? paramDefault
         if (spec.multiply !== undefined) value *= spec.multiply
         if (spec.power !== undefined) value = Math.pow(value, spec.power)
         if (hasTransform && uniforms[spec.param] === undefined && spec.default !== undefined) {
           value = spec.default
         }
         return Math.max(1, Math.floor(value))
       }

       // Screen-divide: { screenDivide: 'zoom', default: 1 }
       if (spec.screenDivide !== undefined) {
         const divisor = uniforms[spec.screenDivide] ?? spec.default ?? 1
         return Math.max(1, Math.round(screenSize / divisor))
       }

       // Scale-based: { scale: 0.5, clamp: { min: 64, max: 512 } }
       if (spec.scale !== undefined) {
         let computed = Math.floor(screenSize * spec.scale)
         if (spec.clamp) {
           if (spec.clamp.min !== undefined) computed = Math.max(spec.clamp.min, computed)
           if (spec.clamp.max !== undefined) computed = Math.min(spec.clamp.max, computed)
         }
         return Math.max(1, computed)
       }
     }

     return screenSize  // Fallback
   }

All dimensions MUST be positive integers. Numeric, percentage, parameter, and
scale results round down. The ``screenDivide`` form rounds to the nearest
integer. Dimension resolution enforces a minimum of 1px.

A parameter dimension with ``inherit: true`` reads the value its scope already
has and never writes the effect's own value over it. A particle behavior sizes
its per-agent textures with ``{ param: 'stateSize', inherit: true }`` so they
follow the ``pointsEmit`` state size.

7.3 Backend Format Resolution
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Each backend resolves format names independently. There is no capability
negotiation or precision-downgrade policy.

* WebGL recognizes ``rgba8``, ``rgba16f``, ``rgba32f``, ``r8``, ``r16f``,
  and ``r32f``. Any other name falls back to the ``rgba8`` descriptor.
* WebGPU maps those compact names to their WebGPU equivalents. It recognizes
  the corresponding WebGPU-format spellings plus ``bgra8unorm``. It passes
  any other non-empty format string through unchanged. An omitted format
  resolves to ``rgba8unorm``.

Unsupported resolved formats or usages fail when the backend creates or uses
the texture. The resolver does not check device capabilities in advance.

.. _portable-format:

8. Portable Effect Packages
---------------------------

A Portable effect package carries an effect as data: a ``definition.json``
file and its GLSL and WGSL program sources. Hosts register a loaded package
with ``CanvasRenderer.registerPortableEffect()``
(:ref:`portable-registration`). This section is the format specification. The
guides explain it with examples:

- :doc:`portable-packages`: definitions, passes, textures, volumes and
  workspaces
- :doc:`portable-parameters`: declaring ``globals``
- :doc:`portable-shaders`: writing the GLSL and WGSL programs
- :doc:`portable-dsl`: calling package effects from a program
- :doc:`portable-viewer`: previewing a package during development

8.1 Package Layout
^^^^^^^^^^^^^^^^^^

A package is a directory or ZIP archive:

.. code-block:: text

   effect-name/
   ├── definition.json           # REQUIRED: Effect metadata
   ├── glsl/                     # At least one of glsl/ or wgsl/ REQUIRED
   │   ├── main.glsl             # A program as one fragment stage
   │   ├── deposit.vert          # A program as split stages: vertex ...
   │   └── deposit.frag          # ... and fragment
   ├── wgsl/                     # At least one of glsl/ or wgsl/ REQUIRED
   │   ├── main.wgsl
   │   └── deposit.wgsl
   ├── assets/                   # OPTIONAL: any other files, kept as bytes
   │   └── mesh.obj
   └── help.md                   # OPTIONAL: Documentation

- ``definition.json`` is required, at the root of the package, in UTF-8.
- At least one of ``glsl/`` and ``wgsl/`` is required. An effect with only
  one shader language runs only on the corresponding backend: GLSL on WebGL2,
  WGSL on WebGPU. Provide both for use across Noise Factor applications.
- ``help.md`` is optional documentation.
- Every other file is an asset. The package keeps its bytes, and a host
  uploads it, for example a mesh through ``loadOBJFromString()``. No pass
  binds an asset by declaration.

A shader file's name, without its directory and extension, is its program
name. A pass's ``program`` value ``blur`` names ``glsl/blur.glsl`` and
``wgsl/blur.wgsl``. When a package provides both directories, every program
needs a file in each, so that a backend never meets a missing shader in the
middle of a pipeline.

A GLSL program is ``glsl/<program>.glsl``, which the backend runs as the
fragment stage with its own full-screen vertex stage, or the split stages
``glsl/<program>.vert`` and ``glsl/<program>.frag``. A points, billboards or
triangles pass needs a vertex stage, so its GLSL program uses the split form.
A ``.frag`` file alone runs with the default vertex stage. A ``.vert`` file
without its ``.frag`` file is refused (``missing-stage``), and so is a
``.glsl`` file beside split stages of the same program (``duplicate-stage``).
A WGSL program is one file that holds all of its entry points.

**Paths.** Paths are relative to the package root, with ``/`` between
segments; a ``\`` counts as one. Names compare in Unicode NFC. A path that is
absolute, names a drive, has an empty or ``..`` segment, or holds a control
character is refused (``invalid-path``). So is a segment that a Windows disk
would change or cannot hold: one that ends with a dot or a space, holds one of
``< > : " | ? *``, or is a reserved device name such as ``CON`` or ``NUL``. Two
paths for one file, including two that differ only in case, are refused
(``duplicate-path``), because one would overwrite the other on a disk. A
``.DS_Store`` file and a ``__MACOSX`` directory are not package files and are
left out. A program name that is a reserved key (``constructor``,
``__proto__`` and the other keys of ``Object.prototype``) is refused
(``reserved-name``), and so is a shader file that holds only white space
(``empty-stage``).

**ZIP archives.** A ZIP package holds the same files at the archive root.
Stored and deflated entries are read. Each entry's size and CRC-32 must match
its record, and its local header must name the same file with the same
method. An encrypted entry, a ZIP64 or multi-disk archive, a link, another
compression method, a damaged record or stream, two entries that share
archive bytes, and a size larger than deflate can produce from the entry's
bytes are refused. So the files read are never much larger than the archive.
Directory entries carry no file.

**Loading.** ``loadPortablePackage()`` (:ref:`portable-registration`) reads
the files of a package and nothing else: it fetches nothing and runs no code
from the package. With a backend it requires that backend's language for
every program (``missing-backend``); without one it requires one complete
language. It keeps every file's bytes, so ``packageFiles()`` gives back the
same files.

.. _portable-format-versions:

8.2 Format Profiles
^^^^^^^^^^^^^^^^^^^

**Version 2.** A version 2 package declares its authoring profile with two
top-level fields:

.. list-table::
   :header-rows: 1
   :widths: 20 30 50

   * - Field
     - Value
     - Meaning
   * - ``format``
     - ``"noisemaker-portable-effect"``
     - Marks the definition as a Portable effect package
   * - ``version``
     - ``2``
     - Integer major version of the authoring profile

In version 2, ``passes`` is an object keyed by pass name, not an array. Each
key is a DSL identifier, and the passes run in declaration order. This shape
makes every supported older core refuse a version 2 package loudly instead of
rendering it without its version 2 features.

**Legacy (version 1 and 1.1).** A package with no ``format`` and ``version``
marker takes the legacy path unchanged. Its ``passes`` is an array, and the
omissions that legacy loading historically accepted still load: ``name`` when
``func`` is present, ``namespace``, and the pass fields other than
``program`` (Section 8.4).

**Unsupported versions.** A package that declares an explicit major version
that the core does not know is refused with the diagnostic code
``unsupported-version``, and nothing is registered.

The multi-effect workspace envelope (:ref:`portable-workspace`) has its own
version, independent of these profiles.

8.3 Top-Level Fields
^^^^^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 18 16 12 54

   * - Field
     - Type
     - Default
     - Description
   * - ``format``
     - string
     -
     - Version 2 marker (Section 8.2)
   * - ``version``
     - integer
     -
     - Version 2 marker (Section 8.2)
   * - ``name``
     - string
     -
     - Display name for the effect
   * - ``func``
     - string
     -
     - DSL function name: camelCase, no spaces
   * - ``namespace``
     - string
     -
     - Registration context (:ref:`portable-registration`)
   * - ``description``
     - string
     - ``""``
     - Human-readable description
   * - ``starter``
     - boolean
     - inferred
     - Whether the effect can start a chain. When it is omitted, it is
       inferred from the passes' pipeline input bindings
       (:ref:`portable-registration`).
   * - ``tags``
     - string[]
     - ``[]``
     - Categorization tags from the curated list (Section 2b)
   * - ``globals``
     - object
     - ``{}``
     - Parameter definitions (Section 8.5)
   * - ``passes``
     - object (version 2) or array (legacy)
     -
     - Rendering pass configuration (Section 8.4)
   * - ``textures``
     - object
     - ``{}``
     - Internal texture definitions (Section 7)
   * - ``defaultProgram``
     - string
     -
     - Example DSL program for this effect (Section 8.7)
   * - ``outputTex3d``
     - string or null
     -
     - Internal volume atlas exposed to the next effect, or ``inputTex3d``
       for passthrough. In a legacy package ``null`` means absent.
   * - ``outputGeo``
     - string or null
     -
     - Internal geometry texture exposed to the next effect, or ``inputGeo``
       for passthrough. In a legacy package ``null`` means absent.
   * - ``uniformLayout``
     - object or array
     -
     - Explicit WGSL uniform-buffer field layout, when the shader requires one
   * - ``uniformLayouts``
     - object
     -
     - Program name to WGSL uniform layout, for multi-pass shaders

At least one of ``name`` and ``func`` must be present. When ``func`` is
absent, ``name`` is the function name and must be a valid DSL identifier.
Provide ``func`` explicitly.

``starter: true`` marks an effect that generates imagery without input; these
are the synths of Noisedeck. ``starter: false`` marks an effect that requires
input from a previous effect in the chain. ``starter`` describes whether an
effect can begin a chain, independently of whether it produces 2D images or
3D volumes.

8.4 Passes
^^^^^^^^^^

Each pass runs one program. In version 2, the pass name is the key:

.. code-block:: json

   {
     "format": "noisemaker-portable-effect",
     "version": 2,
     "name": "Two Pass Blur",
     "func": "twoPassBlur",
     "textures": {
       "tempTex": { "width": "100%", "height": "100%", "format": "rgba16f" }
     },
     "passes": {
       "blur_h": {
         "program": "blur",
         "inputs": { "inputTex": "inputTex" },
         "outputs": { "color": "tempTex" }
       },
       "blur_v": {
         "program": "blur",
         "inputs": { "inputTex": "tempTex" },
         "outputs": { "color": "outputTex" }
       }
     }
   }

The legacy form carries the same passes as an array, each with a ``name``
field:

.. code-block:: json

   "passes": [
     {
       "name": "blur_h",
       "program": "blur",
       "inputs": { "inputTex": "inputTex" },
       "outputs": { "color": "tempTex" }
     },
     {
       "name": "blur_v",
       "program": "blur",
       "inputs": { "inputTex": "tempTex" },
       "outputs": { "color": "outputTex" }
     }
   ]

The legacy documents allowed ``passes`` to be omitted, and the importing
application then generated a single pass from the shader files.
``registerPortableEffect`` requires passes, so a host that calls it supplies
them.

The tables below list every pass property and every resource form that the
runtime supports, the values the validator accepts, and the backends that act
on each. They are generated from the shared grammar. A property that names a
single backend has no effect on the other. Legacy loading accepts a pass
without a ``name``, and the pass properties other than ``program`` may be
left out.

.. include:: portable-grammar.inc

Limitations:

- WebGL2 has no compute passes and cannot write a 3D texture. A package that
  needs either runs on WebGPU, or gives WebGL2 a fragment form of the same
  work, as the built-in volume effects do with their atlas.
- A ``storageTextures`` binding to a texture the effect declares is not found
  on WebGPU, which writes ``outputTex`` and the shared surfaces. WebGL2 writes
  nothing for a pass with ``storageTextures``.
- Vertex data comes only from textures: the particle state, the mesh
  surfaces or the pass's own inputs. A package has no vertex buffers.
- Some fields have no effect, and version 2 refuses them with the diagnostic
  code ``unsupported-field``: ``storageBuffers``, a uniform name in
  ``workgroups``, and the ``noise`` pipeline input, which nothing writes, so
  it always reads blank. A legacy definition still loads with them.
- ``inputOverride`` in a size object has no effect either. Version 2 accepts
  it, because built-in definitions carry it.
- Version 2 does not accept the top-level ``outputXyz``, ``outputVel``,
  ``outputRgba`` and ``outputTex`` fields. An effect made from a declaration
  does not carry them yet, so they would not hand anything on. A package hands
  on particle state through the shared ``global_xyz``, ``global_vel`` and
  ``global_rgba`` surfaces.

Effects without input use ``"inputs": {}``. A filter binds its input
explicitly, for example ``"inputs": { "inputTex": "inputTex" }``. Section 7.1
lists the reserved texture names (``inputTex``, ``outputTex``,
``inputTex3d``, ``inputGeo``, ``outputTex3d``). The other pass properties of
Section 2 and the field notes of Section 7 apply to packages as well.

.. _portable-format-parameters:

8.5 Parameters
^^^^^^^^^^^^^^

Each key of ``globals`` is a parameter name that DSL programs use. Its
``uniform`` field names the shader uniform and defaults to the key. The
types, ``default``, ``min``, ``max``, ``step``, ``choices``, ``enum`` and
``ui`` fields follow Sections 4 to 4d and the field notes of Section 7.

- Declare a ``default`` for every package parameter. The validator does
  not require one.
- Write choice names as DSL identifiers: no leading digit, hyphen, space or
  other special character. The DSL reaches a choice by its name, and the
  engine also registers a sanitized form of a name that is not an identifier.
- An explicit ``enum`` takes precedence over the choice path generated from
  ``choices``. A version 2 package names it ``enum``; ``enumPath`` is an older
  spelling that a definition does not carry.
- ``ui.label`` defaults to the parameter key. ``ui.category`` groups
  controls (Section 4b).
- The runtime supplies the built-in uniforms ``resolution``, ``time``,
  ``frame`` and ``aspect`` (:ref:`shader-pipeline`, Phase 3). Do not declare
  them in ``globals``: the validator does not refuse them, but the runtime's
  values replace them.

8.6 Volume Textures and Geometry
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

A 3D volume of size N is stored as an N × N² RGBA atlas. Voxel
``(x, y, z)`` occupies texel ``(x, y + z * N)``. Read it with integer texel
reads: this is data addressing, not image UV mapping. WGSL volume writers use
native pixel coordinates without the screen-space Y flip that 2D image
shaders use.

A volume does not inherit the canvas resolution. Declare both the texture
dimensions and the pass viewport, using parameter dimensions such as
``{ "param": "volumeSize", "power": 2, "default": 4096 }`` (Section 7.2).

- A volume **generator** writes an explicitly sized atlas and exposes it
  through ``outputTex3d``. It can expose an atlas-sized geometry texture
  through ``outputGeo``.
- A volume **filter** reads ``inputTex3d``, writes an explicitly sized atlas
  and exposes it through ``outputTex3d``. ``outputGeo: "inputGeo"`` keeps the
  upstream geometry unchanged. The runtime inherits ``volumeSize`` from the
  upstream generator. Consumers preserve missing defaults and do not write UI
  defaults over that inherited value after compilation.
- A volume **renderer** reads ``inputTex3d`` (and ``inputGeo`` when needed),
  writes ``outputTex`` and exposes a screen-sized geometry target through
  ``outputGeo``, with encoded normals in RGB and depth in A.
  ``outputTex3d: "inputTex3d"`` retains the upstream volume.

The built-in ``render3d`` and ``renderLit3d`` threshold the atlas's red
channel and use RGB for color. Upstream volume geometry can separately carry
density in A and encoded normals in RGB. A renderer that uses that
independent density implements that interpretation explicitly; changing an
RGB palette does not change the built-in renderers' threshold convention.

**Sizing, resizing and persistence.** A texture whose size is not a plain
number is resolved again when the canvas resizes or a size parameter changes,
and the texture is created again at the new size. Its contents start blank,
unless it is ``persistent``: a persistent texture keeps its contents across
that recreation and across a simulation reset. A size the runtime cannot
resolve falls back to the screen size, with the diagnostic
``ERR_DIMENSION_FALLBACK``.

**Points and geometry.** A points or billboards pass reads its vertex data
from the particle state (``xyzTex`` on ``global_xyz``, with ``global_vel``
and ``global_rgba``), and a triangles pass from a mesh surface
(``global_mesh0_positions`` and its normals and uvs). ``outputGeo`` and
``inputGeo`` carry a geometry buffer from one effect to the next, as
``outputTex3d`` and ``inputTex3d`` carry a volume.

**Semantic types and storage.** A parameter's semantic type (``volume``,
``geometry``, ``surface``) says what the value means, not how a backend
stores it. A volume is a 3D texture on WebGPU where a pass writes one, and an
atlas in a 2D texture where the effect declares one; both are volumes.
Version 2 packages declare 2D effects, particle effects, mesh effects, volume
generators, volume filters and volume renderers alike.

Existing generators support cubic resolutions such as 16, 32, 64 and 128,
subject to the device's maximum texture dimension. A wide rectangular world
needs its own addressing and storage scheme; it is not a larger
``volumeSize`` for the existing cubic filters. All textures remain RGBA. Do
not allocate the user surfaces ``o0`` to ``o7`` as internal effect storage.

8.7 Default Program
^^^^^^^^^^^^^^^^^^^

``defaultProgram`` is a complete DSL program that demonstrates the effect,
including ``search user`` and every built-in namespace it uses. Applications
use it as the initial program when they load the effect. A 3D filter or
renderer needs an upstream volume in this program.

8.8 Declarative Content
^^^^^^^^^^^^^^^^^^^^^^^

A package is data. It contains no function strings and no JavaScript modules,
and none of its keys can reach object prototypes (``prototype`` and every own
key of ``Object.prototype``). The lifecycle methods of Section 5 are not
available to packages. ``paramAliases`` is retired.

8.9 Validation
^^^^^^^^^^^^^^

A valid Portable effect package MUST have:

1. A ``definition.json`` with at least ``name`` or ``func``
2. At least one shader file in ``glsl/`` or ``wgsl/`` (or both)
3. Program names in ``passes`` that match shader file names in each provided
   directory
4. A ``format`` and ``version`` marker that the core supports, or no marker
   (Section 8.2)

A valid Portable effect package SHOULD have:

- Both ``glsl/`` and ``wgsl/`` shaders, for cross-backend interoperability
- A meaningful ``description``
- Appropriate ``tags`` for searchability
- A ``starter`` value that matches the effect type
- ``min`` and ``max`` ranges on parameters with sliders

The generated schema in Section 7 is the machine-readable form of these
rules.

To check a package, pass it to ``normalizePortableDefinition()`` in
``shaders/src/portable/definition.js``. It returns ``{ profile, definition,
diagnostics }`` and never throws. Each diagnostic has a ``code``, a ``path``
such as ``globals.speed.ui.control`` or ``passes.blur_h``, and a ``message``.
An empty ``diagnostics`` list means the package is valid. The schema checks
the same structure in an editor or on the command line, without loading
Noisemaker. The runtime validator also checks what a schema cannot state,
such as an ``enabledBy`` reference or a uniform layout that matches its
globals.
