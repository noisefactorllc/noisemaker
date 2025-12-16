.. _shader-language:

Polymorphic DSL
===============

Polymorphic is the high level language powering the Noisemaker Rendering Pipeline, enabling live-coding visuals by chaining functions that evaluate to native shader graphs. The Polymorphic DSL serves as the high-level builder for the pipeline, allowing users to define complex, multi-pass effects declaratively.

The language evaluates to a Directed Acyclic Graph (DAG) of render passes executed on the GPU. Each valid program must materialize its generator chains into explicit outputs so that the pipeline can schedule and double-buffer them deterministically.

Grammar
-------

.. code-block:: none

   Program        ::= SearchDirective? Statement* RenderDirective?
   SearchDirective::= 'search' Ident ( ',' Ident )*
   Statement      ::= VarAssign | ChainStmt | IfStmt | LoopStmt | Break | Continue | Return
   RenderDirective::= 'render' '(' OutputRef ')'
   Block          ::= '{' Statement* '}'
   IfStmt         ::= 'if' '(' Expr ')' Block ('elif' '(' Expr ')' Block)* ('else' Block)?
   LoopStmt       ::= 'loop' Expr? Block
   Break          ::= 'break'
   Continue       ::= 'continue'
   Return         ::= 'return' Expr?
   VarAssign      ::= 'let' Ident '=' Expr
   ChainStmt      ::= Chain
   Chain          ::= ChainElement ( '.' ChainElement )*
   ChainElement   ::= Call | WriteCall | Write3DCall
   WriteCall      ::= 'write' '(' OutputRef ')'
   Write3DCall    ::= 'write3d' '(' ( VolRef | Ident ) ',' ( GeoRef | Ident ) ')'
   Expr           ::= Chain | NumberExpr | String | Boolean | Color | Ident | Member | OutputRef | SourceRef | VolRef | GeoRef | Func | '(' Expr ')'
   Call           ::= Ident '(' ArgList? ')'
   ArgList        ::= Arg ( ',' Arg )* ','?
   Arg            ::= NumberExpr | String | Boolean | Color | Ident | Member | OutputRef | VolRef | GeoRef | Func
   NumberExpr     ::= Number | 'Math.PI' | '(' NumberExpr ')' | NumberExpr ( '+' | '-' | '*' | '/' ) NumberExpr
   Member         ::= Ident ( '.' Ident )+
   Func           ::= '(' ')' '=>' Expr
   OutputRef      ::= 'o' Digit+
   VolRef         ::= 'vol' Digit+
   GeoRef         ::= 'geo' Digit+
   SourceRef      ::= 's' Digit+
   Ident          ::= Letter ( Letter | Digit | '_' )*
   Number         ::= Digit+ ( '.' Digit+ )?
   String         ::= '"' [^"\n]* '"'
   Digit          ::= '0'…'9'
   Letter         ::= 'A'…'Z' | 'a'…'z'
   Boolean        ::= 'true' | 'false'
   Color          ::= '#' HexDigit HexDigit HexDigit ( HexDigit HexDigit HexDigit )? ( HexDigit HexDigit )?
   HexDigit       ::= Digit | 'A'…'F' | 'a'…'f'

**Precedence & Associativity:**


* ``*``, ``/`` have higher precedence than ``+``, ``-``.
* Operators are left-associative.
* Parentheses ``()`` override precedence.

**Output Materialization:**


* Any chain that begins with a generator **must** terminate with ``.write(<surface>)``; omitting the terminal ``.write()`` on a generator chain yields diagnostic ``S006``.
* Chains that extend an existing surface (e.g., reading via ``read(o0)`` and applying additional nodes) may omit ``.write()`` only when they are nested inside another chain that eventually writes to a surface.

**Chainable Writes:**


* ``.write(<surface>)`` can appear **anywhere** in a chain, including mid-chain.
* When ``.write()`` appears mid-chain, it writes the current result to the specified surface and **passes the texture through** to the next node in the chain.
* Multiple ``.write()`` calls in a single chain write to multiple surfaces.
* **Chains must still terminate with** ``.write()`` — mid-chain writes alone are not sufficient.
* Example: ``noise().write(o0).blur().write(o1)`` writes the noise to ``o0``, then blurs and writes the result to ``o1``.

**Generators:**
A chain must start with a Generator function (an effect with no inputs).


* Standard Generators: ``osc``, ``noise``, ``voronoi``, ``solid``, ``image``, ``video``, ``camera``.
* Custom Generators: Any effect defining ``inputs: {}`` or marked as generator.

**Colors:**
Hex colors support 3, 6, or 8 digits: ``#RGB``, ``#RRGGBB``, ``#RRGGBBAA``. Alpha defaults to ``FF`` (1.0) if omitted.

**Arrow Functions:**
Currently restricted to zero-argument expression lambdas: ``() => expr``. Used primarily for deferred evaluation in control structures or future callbacks.

Language Features
-----------------

Functions & Arguments
^^^^^^^^^^^^^^^^^^^^^

Functions accept arguments either positionally or as named keywords. The two forms are mutually exclusive within a single call.

**Positional arguments:**

.. code-block:: none

  noise(10, 0.1, 1)

**Keyword arguments:**

.. code-block:: none

  noise(freq: 10, sync: 0.1, amp: 1)

Numeric arguments support inline arithmetic (``+``, ``-``, ``*``, ``/``) and constants like ``Math.PI``. Color arguments accept unquoted ``#RGB`` or ``#RRGGBB`` hex codes.

Variables & Aliases
^^^^^^^^^^^^^^^^^^^

Programs may declare variables with ``let`` and reuse them. Variables can alias functions or capture partial applications.

.. code-block:: none

  let pattern = noise
  pattern(20).write(o0)

**Semantics:**


* ``let x = noise``: ``x`` becomes an alias for the ``noise`` function.
* ``let y = noise(10)``: ``y`` stores a **partial application** (Effect Instance with some parameters bound). It does *not* execute the effect.
* ``y(0.5)``: Creates a new Effect Instance, merging the stored parameters (``freq: 10``) with the new arguments (``sync: 0.5``). The original ``y`` remains unchanged (immutable).

Partials
^^^^^^^^

Invoking variables that store function calls merges stored arguments with call-site arguments.

.. code-block:: none

  let tuned = noise(5)
  tuned(amp:0.5).write(o0)

**Merge Rules:**


* **Positional Arguments:** Appended to the stored arguments.
* **Named Arguments:** Merged with stored arguments. **Call-site arguments override stored arguments** if keys conflict.
* **Duplicate Keys:** If a named argument is provided multiple times in a single call, the last value wins.

Control Flow
^^^^^^^^^^^^

The language supports ``if``, ``elif``, ``else`` for conditionals, and ``loop`` for iteration.

.. note::

  Control flow syntax is part of the parser and validator today, but runtime execution (branching and loops) is not yet implemented. Programs using these constructs will not execute until the pipeline gains full support.

**Arrow Functions:**
Arrow functions (``() => expr``) are treated as **lazy expressions**. They are not evaluated immediately but are passed as-is to the effect or control structure, which determines when (or if) to evaluate them.

Namespaces
----------

Polymorphic supports a namespace system to organize effects and ensure compatibility.

New Namespaces
^^^^^^^^^^^^^^

These namespaces are actively developed and maintained:

* ``synth``: 2D generator effects that create patterns from scratch (noise, shapes, fractals)
* ``filter``: 2D single-input effects that transform images (blur, color adjustment, distortion)
* ``mixer``: Two-input effects that combine images (blend modes, compositing)
* ``sim``: Simulations with temporal state or feedback (cellular automata, simulations)
* ``synth3d``: 3D volumetric generator effects (noise3d, ca3d, rd3d)
* ``filter3d``: 3D volumetric processor effects (flow3d, render3d)

Classic Namespaces
^^^^^^^^^^^^^^^^^^

In addition to the actively developed and maintained namespaces above, the following namespaces were ported from older versions of our products. Each namespace offers a different take on how runtime composition can work.

* ``classicNoisedeck``: These are complex and often slower shaders brought over from the "Classic" Noisedeck.app shader graph.
* ``classicNoisemaker``: This effect collection is an attempt at a faithful reproduction of Noisemaker's Python effects in shader language.

Search Order
^^^^^^^^^^^^

Every program **must** begin with a ``search`` directive that defines the namespace resolution order. There are no implicit defaults—explicit search order is required.

.. code-block:: none

  search synth, filter
  noise3d(seed: 1).translate(x: 0, y: 0).write(o0)

When a function like ``noise3d()`` is called, the runtime walks the search order (``synth``, then ``filter``) until a matching effect is found.

**Resolution Rules:**

#. **Mandatory Search Directive:** Every program must start with ``search <namespace>, ...`` to specify which namespaces to search and in what order.
#. **Unqualified Identifiers:** Calls like ``noise()`` walk the search order until a matching effect is found.
#. **Overrides:** The ``from(ns, fn())`` helper allows sourcing an operation from a specific namespace temporarily (e.g., ``from(synth, noise())``).

**Note:** Inline namespace prefixes (e.g., ``synth.noise()``) are **forbidden** in program chains. Use the ``search`` directive or ``from()`` helper instead.

Enums
-----

Many function arguments accept enumerated options defined in a global registry. Enums are defined at the top level in ``std_enums.js`` as global categories (e.g., ``color``, ``blend``, ``wrap``).

For example, the ``noise`` effect accepts a ``colorMode`` parameter with values from the global ``color`` enum. You can reference enum values in three ways:


* **Shorthand identifier:** ``colorMode: rgb`` (validator auto-prefixes to ``color.rgb``)
* **Full path:** ``colorMode: color.rgb``
* **Member expression:** ``let mode = color.mono; noise(colorMode: mode).write(o0)``

The runtime resolves these enum references to their integer counterparts before binding to the shader.

Oscillators
-----------

Oscillators are objects that generate time-varying values for animating effect parameters. They produce looping values synchronized with the animation duration, making them ideal for creating smooth, repeating animations.

Creating Oscillators
^^^^^^^^^^^^^^^^^^^^

Use the ``osc()`` function to create an oscillator:

.. code-block:: none

   osc(type: oscKind.sine)

**Parameters:**

.. list-table::
   :header-rows: 1

   * - Parameter
     - Type
     - Default
     - Description
   * - type
     - oscKind
     - (required)
     - Oscillator waveform type
   * - min
     - number
     - 0
     - Minimum output value
   * - max
     - number
     - 1
     - Maximum output value
   * - speed
     - int
     - 1
     - Loop speed multiplier (divides evenly into animation duration)
   * - offset
     - number
     - 0
     - Phase offset (0..1)
   * - seed
     - number
     - 1
     - Random seed (noise type only)

**Oscillator Types (oscKind):**

* ``oscKind.sine`` - Smooth sine wave: 0 → 1 → 0
* ``oscKind.tri`` - Linear triangle wave: 0 → 1 → 0
* ``oscKind.saw`` - Sawtooth wave: 0 → 1
* ``oscKind.sawInv`` - Inverted sawtooth: 1 → 0
* ``oscKind.square`` - Square wave: 0 or 1
* ``oscKind.noise`` - Periodic 2D noise (seamlessly looping)

Usage Examples
^^^^^^^^^^^^^^

**Basic oscillating parameter:**

.. code-block:: none

   search synth
   noise(scale: osc(type: oscKind.sine, min: 2, max: 8)).write(o0)

**Using variables for reusable oscillators:**

.. code-block:: none

   search synth
   let scaleOsc = osc(type: oscKind.sine, min: 2, max: 8)
   let rotOsc = osc(type: oscKind.saw, min: 0, max: 360)
   noise(scale: scaleOsc, rotation: rotOsc).write(o0)

**Speed control for synchronized loops:**

.. code-block:: none

   search synth
   // speed: 2 means the oscillator completes 2 cycles per animation loop
   noise(scale: osc(type: oscKind.tri, min: 1, max: 10, speed: 2)).write(o0)

**Phase offset for staggered animations:**

.. code-block:: none

   search synth
   let osc1 = osc(type: oscKind.sine, offset: 0)
   let osc2 = osc(type: oscKind.sine, offset: 0.25)
   let osc3 = osc(type: oscKind.sine, offset: 0.5)
   // Three oscillators at different phases create wave-like patterns

**Noise oscillator with seed:**

.. code-block:: none

   search synth
   noise(scale: osc(type: oscKind.noise, min: 2, max: 8, seed: 42)).write(o0)

Runtime Behavior
^^^^^^^^^^^^^^^^

Oscillators are evaluated per-frame based on the current animation time. The pipeline normalizes time to a 0..1 range over the animation duration (default 10 seconds), then applies the speed multiplier and offset before computing the waveform value.

The resulting value is mapped from the internal 0..1 range to the specified min..max range, making oscillators suitable for any numeric parameter regardless of its expected range.

Pipeline Integration
--------------------

The DSL acts as a high-level builder for the Render Graph defined in :ref:`Pipeline Specification <shader-pipeline>`. For a detailed look at how the DSL is compiled, see :ref:`Compiler Specification <shader-compiler>`.

Mapping DSL to Effects
^^^^^^^^^^^^^^^^^^^^^^

When the evaluator encounters a function call like ``.bloom(0.5)``:


#. **Lookup:** Retrieves the ``Bloom`` effect definition using the namespace resolution rules.
#. **Instantiation:** Creates a logical instance of the effect.
#. **Parameter Binding:** Binds arguments to the effect's ``globals``.
#. **Chain Connection:** Connects the output of the previous node to the input of the new instance.

Texture I/O
^^^^^^^^^^^

The DSL provides symmetric operations for reading and writing textures:

**2D Textures:**

* **write(surface):** Writes the chain output to a 2D surface.
  
  - Example: ``noise(10).write(o0)``
  - Surfaces: ``o0``-``o7`` (global)
  - **Chainable:** ``write()`` can appear mid-chain, passing the texture through to subsequent nodes.
  
    - Example: ``noise().write(o0).blur().write(o1)`` — writes noise to ``o0``, then blurs and writes to ``o1``.
    - Example: ``noise().write(o0).invert().write(o1)`` — ``o0`` has the original noise, ``o1`` has the inverted version.

* **read(surface):** Reads from a 2D surface. Built-in to the pipeline, no namespace required.
  
  - Example: ``read(o0).bloom(0.5).write(o1)``

**3D Textures:**

* **write3d(vol, geo):** Writes to both a 3D volume and its geometry buffer.
  
  - Example: ``noise3d(10).write3d(vol0, geo0)``

* **read3d(vol, geo):** Reads from both a 3D volume and its geometry buffer (starter form).
  
  - Example: ``read3d(vol0, geo0).render3d().write(o0)``

* **read3d(vol):** Single-arg form for passing volume references to effect parameters.
  
  - Example: ``ca3d(source: read3d(vol0), geoSource: read3d(geo0))``
  - This mirrors the 2D ``read(o0)`` pattern for surface parameters.

Surfaces and Outputs
^^^^^^^^^^^^^^^^^^^^

The DSL allows writing to named outputs (Surfaces) and reading from them.

**2D Surfaces:**

* **Global Surfaces:** ``o0``-``o7`` are persistent 2D textures.
* **Output:** ``.write(o0)`` marks the chain as writing to ``o0``.
* **Input:** ``read(o0)`` creates a read dependency on ``o0``.
* **None:** ``none`` disables a surface parameter (e.g., ``effect(tex: none)``).

**3D Volume Surfaces:**

* **Global Volumes:** ``vol0``-``vol7`` are persistent 3D texture volumes (default 64³).
* **Global Geometry Buffers:** ``geo0``-``geo7`` are 2D geometry buffers storing surface normals and depth.
* **Output:** ``.write3d(vol0, geo0)`` writes 3D volume data and geometry to the specified surfaces.
* **Input (starter):** ``read3d(vol0, geo0)`` reads from a volume and its geometry buffer to start a chain.
* **Input (param):** ``read3d(vol0)`` or ``read3d(geo0)`` passes a reference to an effect parameter.
* **None:** ``none`` disables a volume/geometry parameter (e.g., ``ca3d(source: none)``).

The geometry buffers store precomputed raymarching results (xyz=surface normal, w=depth), enabling downstream post-processing effects without re-raymarching.

Feedback Loops
^^^^^^^^^^^^^^

If a chain reads from a Surface that hasn't been written to yet in the current frame (or reads from itself), it reads the texture content from the **previous frame**. This enables feedback effects.

Diagnostics
-----------

.. list-table::
   :header-rows: 1

   * - Code
     - Stage
     - Severity
     - Message
   * - L001
     - Lexer
     - Error
     - Unexpected character
   * - L002
     - Lexer
     - Error
     - Unterminated string literal
   * - P001
     - Parser
     - Error
     - Unexpected token
   * - P002
     - Parser
     - Error
     - Expected closing parenthesis
   * - S001
     - Semantic
     - Error
     - Unknown identifier
   * - S002
     - Semantic
     - Warning
     - Argument out of range
   * - S003
     - Semantic
     - Error
     - Variable used before assignment
   * - S005
     - Semantic
     - Error
     - Illegal chain structure
   * - S006
     - Semantic
     - Error
     - Starter chain missing write() call
   * - R001
     - Runtime
     - Error
     - Runtime error


Common Errors
^^^^^^^^^^^^^


* **S005 (Illegal chain structure):** Generator functions (like ``osc``, ``noise``) must appear at the start of a chain. They cannot consume an existing chain output.
* **S006 (Starter chain missing write):** Generator-driven chains must end with ``.write()`` to produce a reusable surface.
