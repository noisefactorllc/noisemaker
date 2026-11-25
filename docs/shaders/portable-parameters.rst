.. _portable-parameters:

Portable Effect Parameters
==========================

Parameters expose shader uniforms to the user interface and the DSL. A
Portable package defines them in the ``globals`` object of
``definition.json``. The parameter rules are in :ref:`portable-format-parameters`
and in Sections 4 to 4d of :ref:`shader-effects`; this page shows them with
examples.

Basic Structure
---------------

.. code-block:: json

   "globals": {
     "parameterName": {
       "type": "float",
       "default": 1.0,
       "uniform": "parameterName",
       "min": 0.0,
       "max": 10.0
     }
   }

DSL programs use the key (``parameterName``). The ``uniform`` field names the
GLSL uniform, and defaults to the key when it is omitted.

Common Types
------------

These are the types most packages use. The full set of parameter types is in
:ref:`shader-integration` (Parameter Types).

.. list-table::
   :header-rows: 1
   :widths: 15 15 25 45

   * - Type
     - GLSL Type
     - Default Format
     - UI Control
   * - ``float``
     - ``float``
     - ``1.0``
     - Slider
   * - ``int``
     - ``int``
     - ``4``
     - Slider (integer steps)
   * - ``boolean``
     - ``bool``
     - ``true``
     - Toggle
   * - ``vec2``
     - ``vec2``
     - ``[0.5, 0.5]``
     - Dual sliders
   * - ``vec3``
     - ``vec3``
     - ``[1.0, 0.0, 0.5]``
     - Triple slider
   * - ``color``
     - ``vec3``
     - ``[1.0, 0.0, 0.5]``
     - Color picker (hex in DSL)

Parameter Properties
--------------------

.. list-table::
   :header-rows: 1
   :widths: 15 15 70

   * - Property
     - Type
     - Description
   * - ``type``
     - string
     - Required. Data type (see above).
   * - ``default``
     - varies
     - Default value. Declare one for every parameter
       (:ref:`portable-format-parameters`).
   * - ``uniform``
     - string
     - GLSL uniform name; defaults to the key
   * - ``min``
     - number
     - Minimum slider value (float and int only)
   * - ``max``
     - number
     - Maximum slider value (float and int only). Sliders use 100 when it is
       absent.
   * - ``step``
     - number
     - Slider step increment (float and int only)
   * - ``choices``
     - object
     - Choices for a dropdown (see Choice Parameters below)

Float Parameters
----------------

.. code-block:: json

   "amplitude": {
     "type": "float",
     "default": 1.0,
     "min": 0.0,
     "max": 2.0,
     "step": 0.01
   }

GLSL:

.. code-block:: glsl

   uniform float amplitude;

DSL:

.. code-block:: text

   myEffect(amplitude: 1.5)

Integer Parameters
------------------

.. code-block:: json

   "octaves": {
     "type": "int",
     "default": 4,
     "min": 1,
     "max": 8
   }

GLSL:

.. code-block:: glsl

   uniform int octaves;

DSL:

.. code-block:: text

   myEffect(octaves: 6)

Boolean Parameters
------------------

.. code-block:: json

   "invert": {
     "type": "boolean",
     "default": false
   }

GLSL:

.. code-block:: glsl

   uniform bool invert;

DSL:

.. code-block:: text

   myEffect(invert: true)

Vector Parameters
-----------------

vec2
^^^^

.. code-block:: json

   "offset": {
     "type": "vec2",
     "default": [0.5, 0.5]
   }

GLSL:

.. code-block:: glsl

   uniform vec2 offset;

DSL:

.. code-block:: text

   myEffect(offset: vec2(0.5, 0.25))

vec3
^^^^

.. code-block:: json

   "lightDirection": {
     "type": "vec3",
     "default": [1.0, 0.5, 0.0]
   }

GLSL:

.. code-block:: glsl

   uniform vec3 lightDirection;

DSL:

.. code-block:: text

   myEffect(lightDirection: vec3(1.0, 0.5, 0.0))

vec3 (Color)
^^^^^^^^^^^^

.. code-block:: json

   "tint": {
     "type": "color",
     "default": [1.0, 0.5, 0.0]
   }

GLSL:

.. code-block:: glsl

   uniform vec3 tint;

DSL (color parameters use hex formatting):

.. code-block:: text

   tint(color: #ff8040)

Choice Parameters
-----------------

``choices`` defines a dropdown selection. The rules for choice names are in
:ref:`portable-format-parameters`: a name must not begin with a digit, and
must not contain a hyphen, spaces or other special characters.

.. code-block:: json

   "blendMode": {
     "type": "int",
     "default": 0,
     "choices": {
       "normal": 0,
       "multiply": 1,
       "screen": 2,
       "overlay": 3,
       "add": 4
     }
   }

GLSL:

.. code-block:: glsl

   uniform int blendMode;

   void main() {
       if (blendMode == 0) { /* normal */ }
       else if (blendMode == 1) { /* multiply */ }
       // ...
   }

DSL:

.. code-block:: text

   myEffect(blendMode: multiply)

Uniform Name Mapping
--------------------

The ``uniform`` property allows different names in the DSL and in GLSL:

.. code-block:: json

   "globals": {
     "speed": {
       "type": "float",
       "default": 1.0,
       "uniform": "u_speed"
     }
   }

- The DSL uses ``myEffect(speed: 2.0)``.
- GLSL uses ``uniform float u_speed;``.

If ``uniform`` is omitted, the parameter key is the uniform name (``speed``,
in this example).

Built-in Uniforms
-----------------

The runtime provides these uniforms automatically. Do not define them in
``globals``. :ref:`shader-pipeline` (Phase 3) defines them.

.. list-table::
   :header-rows: 1
   :widths: 20 15 65

   * - Uniform
     - Type
     - Description
   * - ``resolution``
     - ``vec2``
     - Canvas size in pixels
   * - ``time``
     - ``float``
     - Normalized time 0.0 to 1.0 over the loop duration
   * - ``frame``
     - ``int``
     - Current frame number
   * - ``aspect``
     - ``float``
     - Width / height ratio

Using Time
^^^^^^^^^^

.. code-block:: glsl

   #define TAU 6.28318530718

   uniform float time;

   void main() {
       // time goes 0.0 → 1.0 over the loop duration
       float t = time * TAU;  // Full cycle per loop
       float wave = sin(t);
   }

Texture Samplers
^^^^^^^^^^^^^^^^

For filter effects, the input texture is bound to a sampler:

.. code-block:: glsl

   uniform vec2 resolution;
   uniform sampler2D inputTex;

   void main() {
       vec2 uv = gl_FragCoord.xy / resolution;
       vec4 color = texture(inputTex, uv);
   }

UI Properties
-------------

The ``ui`` object controls how a parameter appears in the application UI:

- ``ui.label``: display label for the control. It defaults to the parameter
  key.
- ``ui.category``: group name for organizing related parameters. Category
  names are camelCase (:ref:`shader-effects`, Section 4b).

.. code-block:: json

   "scaleX": {
     "type": "float",
     "default": 75,
     "min": 1,
     "max": 100,
     "ui": {
       "label": "horiz scale",
       "category": "transform"
     }
   },
   "speed": {
     "type": "float",
     "default": 1.0,
     "min": 0.0,
     "max": 2.0,
     "ui": {
       "label": "speed",
       "category": "animation"
     }
   }

Parameters with the same ``category`` value are grouped together. Parameters
without a category go in the ``general`` category, which is displayed last.
Sections 4b to 4d of :ref:`shader-effects` describe the other ``ui`` fields.

Best Practices
--------------

Always Specify Ranges for Int and Float Parameters
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: json

   "scale": {
     "type": "float",
     "default": 1.0,
     "min": 0.1,
     "max": 10.0
   }

Without ``min`` and ``max``, slider controls default to 0 to 100, which may
not suit the parameter.

Use Sensible Defaults
^^^^^^^^^^^^^^^^^^^^^

Defaults should produce a visible, interesting result without changes.

Match Uniform Names
^^^^^^^^^^^^^^^^^^^

Keep parameter keys and uniform names identical unless there is a reason for
them to differ:

.. code-block:: json

   "scale": {
     "type": "float",
     "default": 2.0
   }

.. code-block:: glsl

   uniform float scale;  // Matches the parameter key

Document Parameters
^^^^^^^^^^^^^^^^^^^

Put the explanation in ``ui.hint``, which hosts show as the control's
tooltip:

.. code-block:: json

   "lacunarity": {
     "type": "float",
     "default": 2.0,
     "min": 1.0,
     "max": 4.0,
     "ui": { "hint": "Frequency multiplier between octaves" }
   }

Legacy packages sometimes carry a parameter ``description``. The engine does
not read it, and a version 2 package refuses it as an unknown field.

Group Related Parameters
^^^^^^^^^^^^^^^^^^^^^^^^

Use ``ui.category`` to organize complex effects:

.. code-block:: json

   "scale": { "type": "float", "default": 3.0, "ui": { "category": "noise" } },
   "octaves": { "type": "int", "default": 5, "ui": { "category": "noise" } },
   "speed": { "type": "float", "default": 0.5, "ui": { "category": "animation" } }

Complete Example
----------------

.. code-block:: json
   :caption: Version 2

   {
     "format": "noisemaker-portable-effect",
     "version": 2,
     "name": "Fractal Noise",
     "func": "fractalNoise",
     "starter": true,
     "globals": {
       "scale": {
         "type": "float",
         "default": 3.0,
         "min": 0.5,
         "max": 20.0,
         "ui": { "hint": "Base frequency scale", "category": "noise" }
       },
       "octaves": {
         "type": "int",
         "default": 5,
         "min": 1,
         "max": 10,
         "ui": { "hint": "Number of noise layers", "category": "noise" }
       },
       "lacunarity": {
         "type": "float",
         "default": 2.0,
         "min": 1.0,
         "max": 4.0,
         "ui": { "hint": "Frequency multiplier per octave", "category": "noise" }
       },
       "persistence": {
         "type": "float",
         "default": 0.5,
         "min": 0.0,
         "max": 1.0,
         "ui": { "hint": "Amplitude decay per octave", "category": "noise" }
       },
       "speed": {
         "type": "float",
         "default": 0.5,
         "min": 0.0,
         "max": 2.0,
         "ui": { "hint": "Animation speed", "category": "animation" }
       },
       "color1": {
         "type": "color",
         "default": [0.0, 0.0, 0.2],
         "ui": { "hint": "Dark color", "category": "color", "label": "dark color" }
       },
       "color2": {
         "type": "color",
         "default": [1.0, 0.8, 0.4],
         "ui": { "hint": "Light color", "category": "color", "label": "light color" }
       }
     },
     "defaultProgram": "search user\nfractalNoise(scale: 5.0, octaves: 6).write(o0)\nrender(o0)",
     "passes": {
       "render": {
         "program": "main",
         "inputs": {},
         "outputs": { "color": "outputTex" }
       }
     }
   }
