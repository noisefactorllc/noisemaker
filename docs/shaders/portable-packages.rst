.. _portable-packages:

Portable Effect Packages
========================

This guide shows how to write a Portable effect package. The format rules
are in :ref:`portable-format`; this page gives worked examples of them.
:doc:`portable-parameters` covers ``globals``, :doc:`portable-shaders` covers
the GLSL and WGSL programs, and :doc:`portable-dsl` covers calling the effect
from a program.

The examples on this page come from the version 1.1 documents and use the
legacy form of ``passes``, an array of passes. A version 2 package declares
``"format": "noisemaker-portable-effect"`` and ``"version": 2`` and keys
``passes`` by pass name; :ref:`portable-format-versions` gives the version 2
form with an example.

File Structure
--------------

A package is a directory or ZIP archive holding ``definition.json``, at least
one of ``glsl/`` and ``wgsl/``, and an optional ``help.md``. The layout and
the program file rules are in :ref:`portable-format` (Section 8.1). Provide
both GLSL and WGSL shaders: an effect with one shader language works only on
the corresponding backend (WebGL or WebGPU).

definition.json
---------------

The definition file describes the effect's identity, parameters, and
rendering structure. The fields are listed in :ref:`portable-format`
(Section 8.3).

Minimal Example
^^^^^^^^^^^^^^^

.. code-block:: json
   :caption: Legacy form

   {
     "name": "My Effect",
     "func": "myEffect"
   }

This minimal legacy definition omits ``passes``. The importing application
generated a single pass from the shader files; ``registerPortableEffect``
requires passes (:ref:`portable-registration`).

Complete Example
^^^^^^^^^^^^^^^^

.. code-block:: json
   :caption: Legacy form

   {
     "name": "Plasma Wave",
     "func": "plasmaWave",
     "description": "Animated plasma effect with customizable colors",
     "starter": true,
     "tags": ["noise", "color"],
     "globals": {
       "scale": {
         "type": "float",
         "default": 2.0,
         "uniform": "scale",
         "min": 0.1,
         "max": 10.0
       },
       "speed": {
         "type": "float",
         "default": 1.0,
         "uniform": "speed",
         "min": 0.0,
         "max": 5.0
       },
       "color": {
         "type": "color",
         "default": [1.0, 0.5, 0.0],
         "uniform": "baseColor"
       }
     },
     "passes": [
       {
         "name": "render",
         "program": "main",
         "inputs": {},
         "outputs": { "color": "outputTex" }
       }
     ]
   }

Provide ``func`` explicitly. If ``func`` is omitted, the ``name`` value is
the function name, so it must be a valid identifier.

Starter and Filter Effects
--------------------------

Portable effects can generate or process 2D images and 3D volumes, or render
3D volumes into images. ``starter`` describes whether an effect can begin a
chain, independently of its output dimensions:

- ``starter: true``: the effect generates imagery from scratch, with no input
  required. Noisedeck calls these "synths".
- ``starter: false``: the effect requires input from a previous effect in the
  chain.

When ``starter`` is omitted, it is inferred from the passes' pipeline input
bindings (:ref:`portable-registration`).

Starter Effects
^^^^^^^^^^^^^^^

.. code-block:: json
   :caption: Legacy form

   {
     "starter": true,
     "passes": [
       {
         "name": "render",
         "program": "main",
         "inputs": {},
         "outputs": { "color": "outputTex" }
       }
     ]
   }

DSL usage:

.. code-block:: text

   search user, filter

   myEffect().blur().write(o0)

Filter Effects
^^^^^^^^^^^^^^

.. code-block:: json
   :caption: Legacy form

   {
     "starter": false,
     "passes": [
       {
         "name": "render",
         "program": "main",
         "inputs": { "inputTex": "inputTex" },
         "outputs": { "color": "outputTex" }
       }
     ]
   }

DSL usage:

.. code-block:: text

   search synth, user

   noise().myFilter().write(o0)

Tags
----

Tags help categorize effects for searchability. Use tags from the curated
list in :ref:`shader-effects` (Section 2b). The built-in search offers only
those tags as filter options, and the definition validator reports any other
tag as unknown.

Passes
------

Provide explicit passes, especially for filter effects, which need
``inputs``. The pass properties are listed in :ref:`portable-format`
(Section 8.4), and the reserved texture names in :ref:`shader-effects`
(Section 7.1).

Starter effect (single pass):

.. code-block:: json
   :caption: Legacy form

   "passes": [{
     "name": "render",
     "program": "main",
     "inputs": {},
     "outputs": { "color": "outputTex" }
   }]

Filter effect (single pass):

.. code-block:: json
   :caption: Legacy form

   "passes": [{
     "name": "render",
     "program": "main",
     "inputs": { "inputTex": "inputTex" },
     "outputs": { "color": "outputTex" }
   }]

Multi-Pass Definition
^^^^^^^^^^^^^^^^^^^^^

.. code-block:: json
   :caption: Legacy form

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

The version 2 form of this definition is in :ref:`portable-format`
(Section 8.4).

Textures
--------

The ``textures`` object defines internal render targets for multi-pass
effects:

.. code-block:: json

   "textures": {
     "tempTex": {
       "width": 512,
       "height": 512,
       "format": "rgba8"
     }
   }

A texture without dimensions or a format is created at screen size with the
``rgba16f`` format. Dimensions also accept ``screen``, ``auto``, percentages
such as ``"50%"``, ``{ "scale": 0.5 }``, ``{ "screenDivide": "zoom",
"default": 1 }`` and parameter dimensions such as ``{ "param": "volumeSize"
}`` with optional ``multiply``, ``power``, ``paramDefault`` and final computed
``default`` values. :ref:`shader-effects` (Sections 7.2 and 7.3) gives the
resolution rules and backend formats.

Volume Textures and Geometry
----------------------------

A volume is stored as an atlas, and it does not inherit the canvas
resolution, so a volume effect declares both its texture dimensions and its
pass viewport. The addressing rules and the generator, filter and renderer
contracts are in :ref:`portable-format` (Section 8.6). This volume starter
writes an atlas and a geometry texture in one pass:

.. code-block:: json
   :caption: Legacy form

   {
     "name": "My Volume",
     "func": "myVolume",
     "starter": true,
     "globals": {
       "volumeSize": { "type": "int", "default": 64, "uniform": "volumeSize" }
     },
     "textures": {
       "volume": {
         "width": { "param": "volumeSize", "default": 64 },
         "height": { "param": "volumeSize", "power": 2, "default": 4096 },
         "format": "rgba16f"
       },
       "geometry": {
         "width": { "param": "volumeSize", "default": 64 },
         "height": { "param": "volumeSize", "power": 2, "default": 4096 },
         "format": "rgba16f"
       }
     },
     "passes": [{
       "name": "fill", "program": "fill", "drawBuffers": 2,
       "viewport": {
         "width": { "param": "volumeSize", "default": 64 },
         "height": { "param": "volumeSize", "power": 2, "default": 4096 }
       },
       "inputs": {},
       "outputs": { "color": "volume", "geoOut": "geometry" }
     }],
     "outputTex3d": "volume",
     "outputGeo": "geometry",
     "defaultProgram": "search user, render\nmyVolume().render3d().write(o0)\nrender(o0)"
   }

A volume filter or renderer needs an upstream volume in its
``defaultProgram``. Existing 2D packages keep their directory and ZIP layout.

Program Name Mapping
--------------------

Shader program names map to files in the available shader directories:

.. list-table::
   :header-rows: 1
   :widths: 25 35 35

   * - Program Name
     - GLSL Path
     - WGSL Path
   * - ``main``
     - ``glsl/main.glsl``
     - ``wgsl/main.wgsl``
   * - ``blur``
     - ``glsl/blur.glsl``
     - ``wgsl/blur.wgsl``
   * - ``compute``
     - ``glsl/compute.glsl``
     - ``wgsl/compute.wgsl``

Registration
------------

A loaded package registers in the ``user`` namespace as ``user.<func>`` and
``user/<func>``, for example ``user.plasmaWave`` and ``user/plasmaWave``.
:ref:`portable-registration` describes registration and the consumer
contract. The DSL's ``search`` directive controls which namespaces are
searched:

.. code-block:: text

   search user, synth, filter

   plasmaWave().blur().write(o0)

   render(o0)

.. _portable-workspace:

Multi-Effect Workspaces
-----------------------

The workspace module of the Portable repository, `workspace.mjs
<https://github.com/noisefactorllc/portable/blob/486543b4a993f56f1f57d691dc11124c70c3db12/workspace.mjs>`_,
defines workspace version 1: an enclosing JSON format, independent of the
effect format version. Individual effect packages keep their original files
and definitions. This is a data contract; consumers still need compiler and
renderer validation before accepting an edited composition.

.. list-table::
   :header-rows: 1
   :widths: 20 80

   * - Field
     - Required value or meaning
   * - ``format``
     - ``"noisefactor-workspace"``
   * - ``version``
     - ``1``
   * - ``id``
     - Stable workspace identity
   * - ``revision``
     - Nonnegative safe integer; starts at 0
   * - ``effects``
     - Array of ``{ id, files }`` portable packages
   * - ``assets``
     - Workspace-level encoded file map
   * - ``composition``
     - ``{ dsl, effectIds }``: program and authored dependencies

Each effect carries ``definition.json`` and at least one GLSL or WGSL shader.
A complete two-effect fixture is
`fixtures/two-effect-workspace.json
<https://github.com/noisefactorllc/portable/blob/486543b4a993f56f1f57d691dc11124c70c3db12/fixtures/two-effect-workspace.json>`_.
Every file entry maps a relative path to ``{ "encoding": "utf8", "data":
"..." }`` for text, or, in memory, ``{ "encoding": "binary", "data":
<Uint8Array> }`` for binary files such as images. Definitions and shaders use
UTF-8. Binary files stay bytes: they are never base64 or any other text, and
JSON cannot carry them. A workspace with only UTF-8 files saves as JSON; a
workspace with binary files saves and shares as a packed workspace. File paths
cannot be absolute, use backslashes, contain control characters or colons, or
contain empty, dot, parent, or prototype-related segments. Effect file paths
are relative to that effect's package; workspace asset paths are relative to
the workspace asset collection. Asset resolution is the consumer's
responsibility: this format does not rewrite shader source or fetch external
resources.

Workspace and effect IDs are stable strings of 1 to 128 ASCII letters,
digits, underscores, or hyphens, starting with a letter or digit. IDs do not
change when display names change. Each effect registers in ``user`` using its
definition's ``func`` (or ``name`` if ``func`` is absent); duplicate IDs or
function names are rejected rather than silently renamed. Parameters retain
their declarations and defaults in ``definition.json``; composition values
are expressed in the DSL, so there is no second parameter-value map to
reconcile.

``composition.effectIds`` explicitly lists the authored effect dependencies.
It must contain unique IDs present in ``effects``. Unused authored effects may
remain in the workspace. Consumers use the Noisemaker compiler to discover DSL
dependencies and check them against this list; envelope validation alone does
not claim that the list matches the DSL. Built-in effects are resolved by the
consumer's pinned Noisemaker version. The DSL must be nonempty. Unknown
envelope fields or versions are rejected to prevent unsupported data being
discarded.

The browser-compatible module exports:

- ``parseWorkspace(json)`` and ``serializeWorkspace(workspace)``: validate and
  round-trip the complete envelope as JSON, preserving effect files and
  assets. ``serializeWorkspace`` refuses a workspace with binary files.
- ``packWorkspace(workspace)`` and ``unpackWorkspace(bytes)``: validate and
  round-trip any workspace, binary files included, as a packed workspace: a
  ZIP archive of stored entries holding ``workspace.json`` (the envelope with
  each file's encoding but not its data) and every file as raw bytes at
  ``effects/<effect id>/<path>`` or ``assets/<path>``. Equal workspaces pack
  to equal bytes. Unpacking rejects compressed, damaged, missing and unlisted
  entries.
- ``importSingleEffect(files, { workspaceId, effectId, dsl? })``: wrap a
  legacy map of UTF-8 file contents at revision 0. It uses ``defaultProgram``
  when no DSL is supplied; packages without a default require explicit DSL.
  ZIP extraction and binary legacy-file decoding belong to the importer.
- ``exportEffect(workspace, effectId)``: return a detached encoded file map
  for that individual package. Workspace assets are not implicitly copied
  into an individual export; a consumer must resolve or reject external
  dependencies.
- ``replaceEffect(workspace, effectId, files, { expectedRevision })``:
  produce a detached candidate at the next revision. It preserves the other
  effects, assets, and composition, rejects a stale revision or changed DSL
  function identity, and never mutates the original workspace.

The consumer compiles and renders a candidate before committing it to
history. After asynchronous validation, it compares the current revision
again before commit. Failure or a revision conflict retains the previous
valid workspace. Undo and redo restore content through new monotonically
increasing revisions; they must not reuse an old revision and thereby make a
stale result applicable. These transaction and history behaviors belong to
the consumer, not the file codec. A structurally valid file is not a rendered
acceptance result.

Complete Starter Effect
-----------------------

.. code-block:: json
   :caption: definition.json (version 2)

   {
     "format": "noisemaker-portable-effect",
     "version": 2,
     "name": "Flowing Terrain",
     "func": "flowingTerrain",
     "description": "Procedural terrain with animated flow",
     "starter": true,
     "tags": ["noise", "3d"],
     "globals": {
       "speed": {
         "type": "float",
         "default": 0.5,
         "min": 0.0,
         "max": 2.0
       },
       "scale": {
         "type": "float",
         "default": 3.0,
         "min": 0.5,
         "max": 10.0
       },
       "height": {
         "type": "float",
         "default": 0.3,
         "min": 0.0,
         "max": 1.0
       },
       "color1": {
         "type": "color",
         "default": [0.1, 0.4, 0.2]
       },
       "color2": {
         "type": "color",
         "default": [0.9, 0.9, 0.95]
       }
     },
     "defaultProgram": "search user\nflowingTerrain(speed: 0.8, scale: 5.0, height: 0.5).write(o0)\nrender(o0)",
     "passes": {
       "render": {
         "program": "main",
         "inputs": {},
         "outputs": { "color": "outputTex" }
       }
     }
   }

The ``defaultProgram`` field contains an example DSL program that
demonstrates the effect with good parameter values. Applications use it as
the initial program when the effect is loaded.

.. code-block:: glsl
   :caption: glsl/main.glsl

   #version 300 es
   precision highp float;

   #define TAU 6.28318530718

   uniform vec2 resolution;
   uniform float time;

   uniform float speed;
   uniform float scale;
   uniform float height;
   uniform vec3 color1;
   uniform vec3 color2;

   out vec4 fragColor;

   // Simplex noise function (abbreviated)
   float noise(vec2 p) {
       return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
   }

   float fbm(vec2 p) {
       float v = 0.0;
       float a = 0.5;
       for (int i = 0; i < 5; i++) {
           v += a * noise(p);
           p *= 2.0;
           a *= 0.5;
       }
       return v;
   }

   void main() {
       vec2 uv = gl_FragCoord.xy / resolution * scale;
       float t = time * speed;

       float n = fbm(uv + vec2(t, 0.0));
       n = pow(n, 2.0) * height;

       vec3 color = mix(color1, color2, n);

       fragColor = vec4(color, 1.0);
   }
