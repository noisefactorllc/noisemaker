.. _shader-language:

Polymorphic DSL
===============

Polymorphic is the high-level language for the Noisemaker Rendering Pipeline. It supports live-coded visuals through function chains that evaluate to native shader graphs. The DSL lets users define complex, multi-pass effects declaratively.

The language compiles to an ordered array of render passes that the GPU executes.
Each valid program must write its generator chains to explicit outputs.
These outputs let the pipeline connect passes and manage double-buffered
surfaces deterministically.

Grammar
-------

.. code-block:: none

   Program        ::= Ignored SearchDirective ( Ignored Statement )* ( Ignored RenderDirective )? Ignored
   SearchDirective::= 'search' Namespace ( ',' Namespace )*
   Namespace      ::= Ident | Keyword
   Statement      ::= VarAssign | ChainStmt | IfStmt | Break | Continue | Return
   RenderDirective::= 'render' '(' OutputRef ')'
   Block          ::= '{' ( Statement ';'* )* '}'
   IfStmt         ::= 'if' '(' Expr ')' Block ('elif' '(' Expr ')' Block)* ('else' Block)?
   Break          ::= 'break'
   Continue       ::= 'continue'
   Return         ::= 'return' Expr?
   VarAssign      ::= 'let' Ident '=' Expr
   ChainStmt      ::= Chain
   Chain          ::= Call ( Comment* '.' Comment* ChainElement )*
   ChainElement   ::= Call | WriteCall | Write3DCall | SubchainCall
   SubchainCall   ::= 'subchain' '(' SubchainArgs? ')' '{' ( Comment* '.' Comment* Call )+ Comment* '}'
   SubchainArgs   ::= String | SubchainPair ( ','? SubchainPair )* ','?
   SubchainPair   ::= Ident ':' String
   WriteCall      ::= 'write' '(' WriteTarget ')'
   WriteTarget    ::= OutputRef | XyzRef | VelRef | RgbaRef | MeshRef | 'none'
   Write3DCall    ::= 'write3d' '(' ( VolRef | OutputRef | Ident ) ',' ( GeoRef | OutputRef | Ident ) ')'
   Call           ::= Ident '(' ArgList? ')'
   ArgList        ::= Arg ( ',' Arg )* ','?
   Arg            ::= Kwarg | Expr
   Kwarg          ::= Ident ':' Expr
   Expr           ::= Term ( ( '+' | '-' ) Term )*
   Term           ::= Unary ( ( '*' | '/' ) Unary )*
   Unary          ::= ( '+' | '-' )* Primary
   Primary        ::= Number | 'Math.PI' | String | Boolean | Color | Array | Func | Ident | Member
                    | Chain | Object | SurfaceRef | '(' Expr ')'
   Object         ::= '{' ( Ident ':' Expr ( ',' Ident ':' Expr )* ','? )? '}'
   Array          ::= '[' ( Expr ( ',' Expr )* )? ']'
   Member         ::= Ident ( '.' Segment )+
   SceneCall      ::= 'scene' '(' SceneArg ( ',' SceneArg )* ')'          (preview)
   SceneArg       ::= Kwarg | CameraCall | LightCall | EnvironmentCall | NodeChain
   NodeChain      ::= ( MeshCall | VolumeCall | GroupCall ) ( '.' NodeLink )*
   VolumeCall     ::= 'volume' '(' ArgList ')'                               (preview)
   NodeLink       ::= MaterialCall | 'reflector' '(' ')'
   MaterialCall   ::= 'material' '(' MaterialSpec ')'
   MaterialSpec   ::= ( 'solid' | 'surface' ) '(' ArgList? ')' ( '.' MaterialTerm )*
   MaterialTerm   ::= ( 'pbr' | 'emit' ) '(' ArgList? ')'
   Func           ::= '(' ')' '=>' Expr
   SurfaceRef     ::= OutputRef | SourceRef | VolRef | GeoRef | XyzRef | VelRef | RgbaRef | MeshRef
   OutputRef      ::= 'o' OutputDigit
   VolRef         ::= 'vol' Digit+
   GeoRef         ::= 'geo' Digit+
   XyzRef         ::= 'xyz' Digit+
   VelRef         ::= 'vel' Digit+
   RgbaRef        ::= 'rgba' Digit+
   MeshRef        ::= 'mesh' Digit+
   SourceRef      ::= 's' Digit+
   Ident          ::= ( Letter | '_' ) ( Letter | Digit | '_' )*
   Keyword        ::= 'let' | 'render' | 'write' | 'write3d' | 'true' | 'false' | 'if' | 'elif' | 'else'
                    | 'break' | 'continue' | 'return' | 'search' | 'subchain'
   Segment        ::= Ident | SurfaceRef | ( Keyword - 'search' )
   Number         ::= Digit+ ( '.' Digit+ )? | '.' Digit+
   String         ::= '"' ( '\' AnyChar | [^"\\\n] )* '"' | "'" ( '\' AnyChar | [^'\\\n] )* "'" | '"""' .* '"""'
   Digit          ::= '0'…'9'
   OutputDigit    ::= '0'…'7'
   Letter         ::= 'A'…'Z' | 'a'…'z'
   Boolean        ::= 'true' | 'false'
   Color          ::= '#' HexDigit{3} | '#' HexDigit{6} | '#' HexDigit{8}
   HexDigit       ::= Digit | 'A'…'F' | 'a'…'f'
   Comment        ::= '//' [^\n]* | '/*' .* '*/'
   Ignored        ::= ( Comment | ';' )*

An ``Ident`` is never a ``Keyword``. A ``Namespace`` must name a registered
namespace. Otherwise the parser reports ``P004``.
``Chain`` in ``Primary`` cannot contain ``WriteCall`` or ``Write3DCall``
(``P005``). Positional and keyword arguments may be mixed in ordinary calls.

``VolumeCall`` is an ordinary ``ArgList`` constrained by the scene compiler
rather than by the grammar: it takes exactly one positional argument, a volume
reference ``( VolRef | Ident )`` naming ``vol0``–``vol7`` — written directly or
reached through a ``let`` binding — and every other argument is a keyword.
Positional and keyword arguments may appear in any order, and a trailing comma
is permitted, as they are in any other ``ArgList``. Keyword *values* are
constrained there too, not by the grammar: ``mode`` is an ordinary ``String`` to
the parser and one of ``"smooth"`` or ``"voxel"`` to the compiler. See
:ref:`shader-scene` for the keyword set.

Productions marked ``(preview)`` are experimental. ``SceneCall`` and everything
reachable from it — ``SceneArg``, ``NodeChain``, ``VolumeCall``, ``NodeLink``,
``MaterialCall``, ``MaterialSpec``, ``MaterialTerm`` — are provisional in Noisemaker 1.5 and
scheduled to be finalized in 2.0. ``ObjectLiteral`` was added to serve them and
is likewise provisional: it is currently only meaningful inside ``scene()``.

**Precedence & Associativity:**


* ``*``, ``/`` have higher precedence than ``+``, ``-``.
* Operators are left-associative.
* Parentheses ``()`` override precedence.

**Output Materialization:**


* Any chain that begins with a generator **must** terminate with ``.write(<surface>)``. Omitting the terminal ``.write()`` yields diagnostic ``S006``.
* A chain that extends an existing surface may omit ``.write()`` only inside another chain that eventually writes to a surface.
  For example, an extending chain can read through ``read(o0)`` and apply additional nodes.

**Chainable Writes:**


* ``.write(<surface>)`` can appear **anywhere** in a chain, including mid-chain.
* A mid-chain ``.write()`` writes the current result to the specified surface.
  It **passes the texture through** to the next node.
* Multiple ``.write()`` calls in a single chain write to multiple surfaces.
* **Chains must still terminate with** ``.write()`` — mid-chain writes alone are not sufficient.
* Example: ``noise().write(o0).blur().write(o1)`` writes the noise to ``o0``, then blurs and writes the result to ``o1``.

**Generators:**
An effect chain that creates new content starts with a generator. The passes in a generator consume none of the pipeline inputs that
``isStarterEffect()`` recognizes:

- ``inputTex``
- ``inputTex3d``
- Direct surface references ``o0`` through ``o7``

The ``read()`` and ``read3d()`` operations are separate
built-in ways to start from existing surfaces.


* Generator examples (non-exhaustive): ``noise``, ``solid``, ``media``.
* Pass inputs determine generator classification. An effect may declare
  explicit non-pipeline inputs and still be a generator.

**Colors:**
Hex colors support 3, 6, or 8 digits: ``#RGB``, ``#RRGGBB``, ``#RRGGBBAA``. Alpha defaults to ``FF`` (1.0) if omitted.

**Strings:**
Strings use double or single quotes: ``"hello"`` or ``'hello'``. A backslash and the character after it do not end the string, so ``"say \"hi\""`` is one string. A quoted string cannot contain a newline. For multi-line strings, use triple quotes: ``"""line1\nline2\nline3"""``. Triple-quoted strings preserve embedded newlines. This is useful for the ``text`` effect:

.. code-block:: none

  noise().text(text: """Hello
  World""").write(o0)

**Arrow Functions:**
Arrow functions currently support only zero-argument expression lambdas: ``() => expr``. Their primary use is deferred evaluation in control structures or future callbacks.

**Comments and separators:**
``//`` starts a line comment. ``/* ... */`` is a block comment, and block comments do not nest. Comments can go before ``search``, between statements, after ``render()``, and before or after the ``.`` in a chain. A comment inside an argument list is a parser error (``P001``). Comments inside an ``if``, ``elif`` or ``else`` block can appear before a statement or before the closing brace. The parser accepts them, and the unparser preserves them. A ``;`` can come before ``search`` and after ``search``, a statement or ``render()``. It is optional.

Language Features
-----------------

Functions & Arguments
^^^^^^^^^^^^^^^^^^^^^

Functions accept arguments positionally, as named keywords, or as a mix of both within a single call.

**Positional arguments:**

.. code-block:: none

  noise(10, 2, 50)

**Keyword arguments:**

.. code-block:: none

  noise(type: 10, octaves: 2, scaleX: 50)

**Mixed arguments:**

Positional and keyword arguments may be interleaved in any order. This is what
lets :ref:`scene() <shader-scene>` carry renderer settings as keywords alongside
its child nodes as positional arguments.

.. code-block:: none

  scene(ambient: 0.15, camera(fov: 60), background: [0, 0, 0]).write(o0)

The binding rule: keywords claim their own parameter slots by name, wherever
they appear in the call. The positionals are then bound **in source order to the
slots no keyword claimed**, left to right. A positional never occupies a slot a
keyword already holds — where it would have landed on one, it shifts to the next
unfilled slot instead. This is deliberate, and it is what makes the interleaving
above work at all.

Given ``blur(amount, angle, quality)``, all three of these bind ``amount: 0.9``,
``angle: 0.5`` and ``quality: 4``:

.. code-block:: none

  blur(0.9, 0.5, 4)
  blur(0.9, angle: 0.5, 4)
  blur(angle: 0.5, 0.9, 4)

In the second call, ``4`` would have reached ``angle`` by position; because
``angle:`` is already claimed, it shifts to ``quality``. A positional left
over once every slot is filled raises ``Too many positional arguments for
blur(): 'blur' takes 3``.

``//`` comments may appear inside an argument list, an array literal or an
object literal, between arguments. They are skipped by the parser, so a
program re-emitted from its parsed form (as the demo does when a parameter is
changed) comes back without them; comments on their own lines between
statements survive that round trip.

Numeric arguments support inline arithmetic (``+``, ``-``, ``*``, ``/``) and constants like ``Math.PI``. Color arguments accept unquoted ``#RGB`` or ``#RRGGBB`` hex codes.

**Vector parameters:**

Some effects accept multi-component vector parameters. Use the built-in vector constructors:

* ``vec2(x, y)`` — 2-component vector
* ``vec3(x, y, z)`` — 3-component vector
* ``vec4(x, y, z, w)`` — 4-component vector

.. code-block:: none

  effect(param: vec2(0.5, 0.25)).write(o0)

**Array literals:**

Array literals contain comma-separated numbers in square brackets. They
provide an additional input form for any vector-valued argument. The parser
and validator handle them like ``vec2()``, ``vec3()``, and ``vec4()``.
The unparser preserves the ``[…]`` form through a parse → unparse cycle.
Vector constructor calls remain unchanged. They remain the canonical form
for programs that already use them.

.. code-block:: none

  effect(param: [0.5, 0.25]).write(o0)
  effect(quad: [0.05, 0.05, 0.45, 0.95]).write(o0)

Elements may be any numeric expression (negative numbers, arithmetic,
``Math.PI``). The validator does not enforce array length. It passes every declared
element to the runtime.

For a ``vec4`` parameter whose effect definition sets ``ui.format: 'vector'``,
the unparser writes four finite numeric values as an array literal without
rounding or color clamping. Remap's packed vertex parameters use this format
to preserve exact coordinates when the editor regenerates DSL. Other
``vec4`` parameters retain their existing formatting. See :doc:`effects`
for the definition contract.

Variables & Aliases
^^^^^^^^^^^^^^^^^^^

Programs may declare variables with ``let`` and reuse them. Variables can alias functions or capture partial applications.

.. code-block:: none

  let pattern = noise
  pattern(10).write(o0)

**Semantics:**

Each chain uses the value from the latest ``let`` statement before that
chain. A later ``let`` statement does not change an earlier chain. Inside a
block, a ``let`` statement applies to the rest of that block. It does not
change values outside the block.

* ``let x = noise``: ``x`` becomes an alias for the ``noise`` function.
* ``let y = noise(10)``: ``y`` stores a **partial application** with ``type``
  set to ``10``. It does *not* execute the effect.
* ``y(2)``: Creates a new Effect Instance by appending ``octaves: 2`` to the
  stored positional arguments. The original ``y`` remains unchanged
  (immutable).

Partials
^^^^^^^^

Invoking variables that store function calls merges stored arguments with call-site arguments.

.. code-block:: none

  let tuned = noise(type: 10, scaleX: 25)
  tuned(scaleX: 50).write(o0)

**Merge Rules:**


* **Positional Arguments:** Appended to the stored arguments.
* **Named Arguments:** Merged with stored arguments. **Call-site arguments override stored arguments** if keys conflict.
* **Duplicate Keys:** If a call provides a named argument multiple times, the last value wins.

Control Flow
^^^^^^^^^^^^

The language supports ``if``, ``elif``, ``else`` for conditionals.

.. note::

  The parser and validator support control flow syntax, but the runtime does not yet execute branches. Programs using these constructs will not execute until the pipeline gains full support.

**Arrow Functions:**
Arrow functions (``() => expr``) are **lazy expressions**. The evaluator passes them unchanged to the effect or control structure without evaluating them immediately. That recipient determines when or whether to evaluate them.

Subchains
^^^^^^^^^

Subchains group contiguous effects within a chain. Each group forms one unit that you can identify, manipulate, and reason about.

**Syntax:**

.. code-block:: none

   .subchain(name: "group name", id: "unique_id") {
     .effect1()
     .effect2(param: value)
   }

**Arguments:**

* ``name`` (optional): A human-readable label for the subchain.
* ``id`` (optional): A unique identifier for programmatic access.

You can omit both arguments or pass ``name`` as a positional argument. Keyword arguments must be comma-separated. Missing comma separators (``P010``) or unknown/duplicate keys (``P008``, ``P009``) produce parser warnings in standard mode or syntax errors when compiled with ``subchainArguments: 'strict'``.

**Examples:**

.. code-block:: none

   search synth, filter, render

   noise()
     .subchain(name: "feedback loop", id: "fb1") {
       .loopBegin()
       .loopEnd()
     }
     .subchain(name: "color grading") {
       .adjust(mode: hsv)
       .adjust(rotation: 180, saturation: 0.5)
     }
     .write(o0)

   render(o0)

**Rules:**

* Subchains cannot be empty—they must contain at least one effect.
* Subchains cannot be the first element in a chain. They require input from a preceding effect.
* Effects inside subchains cannot be generators (e.g., ``noise()``, ``solid()``).
* Subchains are chainable—the output flows through to subsequent effects after the closing brace.
* Effects inside subchains use the same argument syntax as regular chain effects.

**Use Cases:**

* Grouping related effects for organizational clarity.
* Marking effect groups for UI controls or programmatic manipulation.
* Defining reusable patterns within complex compositions.
* Enabling downstream tools to identify and operate on logical effect groups.

Scenes
^^^^^^

``scene()`` describes a 3D scene — a camera, lights, and a hierarchy of meshes
with PBR materials — which the deferred renderer resolves into a surface. It
behaves like any other generator and must terminate in ``.write(oN)``, so its
output composes with the 2D effect library.

.. note::

   **Preview feature — experimental and subject to change.** The scene
   vocabulary and its semantics ship as a preview in Noisemaker 1.5 and are
   scheduled to be finalized in Noisemaker 2.0. Names, keywords, defaults and
   rendered output may change without a deprecation period.

.. code-block:: none

  scene(
    ambient: 0.15,
    camera(fov: 60, pos: [0, 3, 8], target: [0, 0, 0]),
    light(type: "directional", dir: [-1, -1, -1], intensity: 2),
    mesh("sphere", radius: 1.5, pos: [0, 1, 0])
      .material(solid(color: [0.9, 0.9, 0.95]).pbr(metallic: 0.1, roughness: 0.6))
  ).write(o0)

The scene vocabulary is ``scene``, ``camera``, ``light``, ``environment``,
``mesh``, ``volume``, ``group``, ``material``, ``solid``, ``surface``, ``pbr``
and ``emit``. ``reflector()`` is a chain link on a node inside the scene, not
a vocabulary word of its own.

Every call is first resolved against the registered effects in the active search
order. ``solid`` is both a scene material source and the ``synth/solid``
generator, and a top-level ``solid()`` under ``search synth`` still compiles to
the 2D effect.

Only ``scene`` falls through to the scene layer when no effect matches, and it
must start its chain — ``noise().scene(...)`` would discard the incoming surface
and instead raises ``scene() is a generator and must start a chain``. The other
eleven names are scene *children*; they live inside a ``scene()`` call and never
reach the chain. Used as a chain element with no effect behind them they raise
``Unknown effect: '<name>'. Scene nodes like <name>() are only valid inside
scene().``

Arguments inside ``scene()`` are preserved as AST and handed to the scene
compiler rather than validated against the effect registry, which is why terms
like ``reflector()`` need no registration and why scene errors surface as
``SyntaxError`` with a line and column rather than as validator diagnostics.

Transform components and light intensity accept the same three automation
descriptors as effect uniforms in place of numbers: ``osc()``, ``midi()`` and
``audio()``. They are evaluated against the same normalized loop time and the
same live MIDI and audio state, so a scene and the effects around it respond to
one performance.

See :ref:`shader-scene` for the full node, material and settings reference, and
:ref:`shader-deferred-rendering` for how the scene is drawn.

Namespaces
----------

Polymorphic supports a namespace system to organize effects and ensure compatibility.

Built-in I/O
^^^^^^^^^^^^

Pipeline-level I/O operations are globally available. A program still requires
a ``search`` directive, but these operations do not require an ``io`` entry in
its search order:

* ``read(surface)``: Read from a 2D surface (e.g., ``read(o0)``)
* ``write(surface)``: Write to a 2D surface (e.g., ``.write(o0)``)
* ``read3d(vol, geo)``: Read from 3D volume and geometry buffers
* ``write3d(vol, geo)``: Write to 3D volume and geometry buffers
* ``render(surface)``: Set the final render output (program directive)

``render3d()`` is an effect in the ``render`` namespace, not a built-in I/O
operation.

New Namespaces
^^^^^^^^^^^^^^

These namespaces are actively developed and maintained:

* ``synth``: 2D generator effects that create patterns from scratch (noise, shapes, fractals)
* ``filter``: 2D single-input effects that transform images (blur, color adjustment, distortion)
* ``mixer``: Two-input effects that combine images (blend modes, compositing)
* ``render``: Rendering utilities and feedback loops (render3d, pointsEmit, pointsRender, loopBegin/End)
* ``points``: Particle and agent-based simulations (physarum, life, flock, flow)
* ``synth3d``: 3D volumetric generators (noise3d, cell3d, cellularAutomata3d, reactionDiffusion3d)
* ``filter3d``: 3D volumetric processors (flow3d, palette3d)

Classic Namespaces
^^^^^^^^^^^^^^^^^^

The following namespaces contain ports from older versions of our products. They supplement the actively developed and maintained namespaces above. Each namespace offers a different approach to runtime composition.

* ``classicNoisedeck``: These are complex and often slower shaders brought over from the "Classic" Noisedeck.app shader graph.

Custom Namespaces
^^^^^^^^^^^^^^^^^

External integrations can introduce their own top-level namespace at runtime via the ``registerNamespace()`` API, alongside the built-ins listed above. After registration, the ``search`` directive accepts the new id. The namespace behaves like any built-in namespace. The reserved ``user`` namespace is also available without registration for ad-hoc effects.

See :doc:`integration` for the full API: ``registerNamespace(id, descriptor)``, ``unregisterNamespace(id)``, and validation rules.

Search Order
^^^^^^^^^^^^

Every program **must** begin with a ``search`` directive that defines the namespace resolution order. The language requires an explicit search order and has no implicit defaults.

.. code-block:: none

  search synth, filter
  noise().translate().write(o0)

For a call such as ``noise()``, the compiler searches namespaces in order
(``synth``, then ``filter``) until it finds a matching effect.

**Resolution Rules:**

#. **Mandatory Search Directive:** Every program must start with ``search <namespace>, ...`` to specify which namespaces to search and in what order.
#. **Unqualified Identifiers:** Calls like ``noise()`` search namespaces in order until they find a matching effect.
#. **Overrides:** The ``from(ns, fn())`` helper allows sourcing an operation from a specific namespace temporarily (e.g., ``from(synth, noise())``).

**Note:** Inline namespace prefixes (e.g., ``synth.noise()``) are **forbidden** in program chains. Use the ``search`` directive or ``from()`` helper instead.

Enums
-----

Many function arguments accept enumerated options defined in a global registry. The ``std_enums.js`` file defines these top-level categories: ``channel``, ``color``, ``oscType``, ``oscKind``, ``midiMode``, ``midiZone``, ``audioBand`` and ``palette``. Effect definitions add the ``choices`` of their parameters to the registry when they load.

For example, the ``noise`` effect accepts a ``colorMode`` parameter with values from the global ``color`` enum. You can reference enum values in three ways:


* **Shorthand identifier:** ``colorMode: rgb`` (validator auto-prefixes to ``color.rgb``)
* **Full path:** ``colorMode: color.rgb``
* **Member expression:** ``let mode = color.mono; noise(colorMode: mode).write(o0)``

The runtime resolves these enum references to their integer counterparts before binding to the shader.

Palettes
--------

The ``palette`` enum provides named color palettes for effects like ``palette()`` in the ``filter`` namespace. Palettes are cosine gradient functions that map scalar values (typically luminance) to RGB colors.

**Usage:**

.. code-block:: none

   search filter
   read(o0).palette(index: vaporwave).write(o1)

**Available Palettes:**

.. list-table::
   :header-rows: 1

   * - Name
     - Description
   * - ``none``
     - Neutral (grayscale)
   * - ``grayscale``
     - Grayscale gradient
   * - ``afterimage``
     - Warm afterimage effect
   * - ``barstow``
     - Desert sunset tones
   * - ``bloob``
     - Cool cyan and blue
   * - ``blueSkies``
     - Sky blue gradient
   * - ``brushedMetal``
     - Metallic gray tones
   * - ``burningSky``
     - Fiery orange and purple
   * - ``california``
     - Warm sunset colors
   * - ``columbia``
     - Bright magenta and cyan
   * - ``cottonCandy``
     - Soft pink and blue pastels
   * - ``darkSatin``
     - Dark smooth gradient
   * - ``dealerHat``
     - Warm orange and brown
   * - ``dreamy``
     - Soft dream-like tones
   * - ``eventHorizon``
     - Deep space blues
   * - ``fiveG``
     - Vibrant tech colors
   * - ``ghostly``
     - Pale ethereal tones
   * - ``hazySunset``
     - Warm hazy oranges
   * - ``heatmap``
     - Thermal imaging colors
   * - ``hypercolor``
     - Bright neon colors
   * - ``jester``
     - Bold contrasting hues
   * - ``justBlue``
     - Pure blue channel
   * - ``justCyan``
     - Pure cyan (green + blue)
   * - ``justGreen``
     - Pure green channel
   * - ``justPurple``
     - Pure magenta (red + blue)
   * - ``justRed``
     - Pure red channel
   * - ``justYellow``
     - Pure yellow (red + green)
   * - ``mars``
     - Rusty red planet tones
   * - ``modesto``
     - Earthy green and purple
   * - ``moss``
     - Forest green and brown
   * - ``neptune``
     - Deep ocean blues
   * - ``netOfGems``
     - Jewel-toned purples
   * - ``organic``
     - Natural earthy tones
   * - ``papaya``
     - Tropical orange
   * - ``radioactive``
     - Toxic green glow
   * - ``royal``
     - Deep purple royalty
   * - ``santaCruz``
     - Beach sunset colors
   * - ``seventiesShirt``
     - Retro 70s colors
   * - ``sherbet``
     - Citrus orange and pink
   * - ``sherbetDouble``
     - Double-frequency sherbet
   * - ``silvermane``
     - Silver metallic (OkLab)
   * - ``skykissed``
     - Soft pink sky
   * - ``solaris``
     - Solar flare oranges
   * - ``spooky``
     - Halloween orange and black (OkLab)
   * - ``springtime``
     - Fresh spring pastels
   * - ``sproingtime``
     - Bright spring greens
   * - ``sulphur``
     - Yellow sulfur tones
   * - ``summoning``
     - Dark ritual magenta
   * - ``superhero``
     - Bold comic book colors
   * - ``toxic``
     - Poisonous green
   * - ``tropicalia``
     - Tropical paradise (OkLab)
   * - ``tungsten``
     - Cool tungsten lighting
   * - ``vaporwave``
     - 80s synthwave aesthetic
   * - ``vibrant``
     - High saturation colors
   * - ``vintage``
     - Aged photograph tones
   * - ``vintagePhoto``
     - Sepia photo effect

Oscillators
-----------

Oscillators are objects that generate deterministic, time-varying values for
animating effect parameters. When the other fields are literal or
boundary-matched, a whole-number literal ``speed`` produces a seamless repeat
at the animation boundary. Fractional or automated speeds do not guarantee one.

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
     - ``oscKind.sine``
     - Oscillator waveform type
   * - min
     - number or automation
     - 0
     - Minimum normalized output (0–1)
   * - max
     - number or automation
     - 1
     - Maximum normalized output (0–1)
   * - speed
     - number or automation
     - 1
     - Loop speed multiplier. Automated values map to -20..20.
   * - offset
     - number or automation
     - 0
     - Phase offset in cycles. Automated values map to -1..1.
   * - seed
     - number or automation
     - 1
     - Random seed (``noise`` and ``noise2d`` types)

**Oscillator Types (oscKind):**

* ``oscKind.sine`` - Smooth sine wave: 0 → 1 → 0
* ``oscKind.tri`` - Linear triangle wave: 0 → 1 → 0
* ``oscKind.saw`` - Sawtooth wave: 0 → 1
* ``oscKind.sawInv`` - Inverted sawtooth: 1 → 0
* ``oscKind.square`` - Square wave: 0 or 1
* ``oscKind.noise`` - Periodic noise (seamlessly looping)
* ``oscKind.noise2d`` - Two-stage periodic noise: the ``osc2d`` effect's waveform, with both noise stages sampled at a fixed seed-derived position. Stays within 0 → 1 and loops seamlessly at whole-number speeds.

Usage Examples
^^^^^^^^^^^^^^

**Basic oscillating parameter:**

.. code-block:: none

   search synth
   noise(scaleX: osc(type: oscKind.sine, min: 0.1, max: 0.8)).write(o0)

**Using variables for reusable oscillators:**

.. code-block:: none

   search synth
   let horizontalScale = osc(type: oscKind.sine, min: 0.1, max: 0.8)
   let verticalScale = osc(type: oscKind.saw, min: 0.2, max: 1)
   noise(scaleX: horizontalScale, scaleY: verticalScale).write(o0)

**Speed control for synchronized loops:**

.. code-block:: none

   search synth
   // speed: 2 means the oscillator completes 2 cycles per animation loop
   noise(scaleX: osc(type: oscKind.tri, min: 0.1, max: 1, speed: 2)).write(o0)

**Phase offset for staggered animations:**

.. code-block:: none

   search synth
   let horizontalScale = osc(type: oscKind.sine, offset: 0)
   let verticalScale = osc(type: oscKind.sine, offset: 0.25)
   noise(scaleX: horizontalScale, scaleY: verticalScale).write(o0)

**Noise oscillator with seed:**

.. code-block:: none

   search synth
   noise(scaleX: osc(type: oscKind.noise, min: 0.1, max: 0.8, seed: 42)).write(o0)

Runtime Behavior
^^^^^^^^^^^^^^^^

The pipeline evaluates oscillators each frame from the current animation time. It normalizes time to a 0..1 range over the animation duration (default 10 seconds). It applies the speed multiplier and offset before computing the waveform value.

The waveform yields a value in ``0..1``. ``min`` and ``max`` (each in ``0..1``, default the whole range) narrow it to a sub-range, and the result is then mapped onto the consuming parameter's own declared range — so ``osc(min: 0.2, max: 0.8)`` on ``scale`` sweeps the middle 60% of whatever ``scale`` allows, and no oscillator needs to know a parameter's units. A ``min`` or ``max`` outside ``0..1`` is clamped to it (an effect uniform warns; a :ref:`scene <shader-scene>` rejects it).

Live Input
----------

Use ``midi()`` and ``audio()`` to drive parameters from external signals. Like
``osc()``, both return normalized values that the receiving effect parameter
maps onto its own range. Their numeric fields can also contain other automation
descriptors.

``midi(channel, mode?, min?, max?, sensitivity?, cc: N, nrpn: N, name: "...", id: "...")``

* ``channel``: Fixed MIDI channel 1–16, required unless ``zone`` is supplied.
* ``zone``: Optional keyword-only ``midiZone.lower`` or ``midiZone.upper``.
  Selects the newest held note across MPE member channels. Cannot be combined
  with ``channel``. No held note returns ``min``.
* ``members``: Optional keyword-only count 1–15, requiring ``zone``. Omit to
  follow the port's RPN 6 zone configuration, using 15 until configured.
  An explicit count overrides discovery for the binding.
* ``mode``: ``midiMode.*`` value (default ``midiMode.velocity``)
* ``min`` / ``max``: Number or automation setting the normalized bounds (default 0..1)
* ``sensitivity``: Number or automation setting trigger falloff (default 1)
* ``cc``: Optional keyword-only controller number (default 1). Use
  ``midiMode.cc`` for 7-bit CC 0–127, or ``midiMode.cc14`` for paired 14-bit CC.
  In 14-bit mode, ``cc: N`` selects MSB controller 0–31 and LSB controller
  ``N + 32``. CC values hold independently per device/channel and ignore
  note-off and ``sensitivity``.
* ``nrpn``: Keyword-only parameter address 0–16382, required for
  ``midiMode.nrpn``. Tracks CC99/98 selection and Data Entry CC6/38 separately
  per device/channel/parameter. Values are normalized from 0–16383.
* ``name`` / ``id``: Optional keyword-only input selector. The ``id`` field requires ``name``.

``midiMode.pitchBend`` reads the full 14-bit bend position (neutral 8192),
``midiMode.pressure`` reads channel pressure, and ``midiMode.polyPressure``
reads key pressure. They work with fixed channels or MPE zones. Zone bindings
read raw member gestures; manager controls remain separately addressable by
fixed channel. Bend is a normalized position, without semitone conversion or
manager/member combination. MIDI 2.0 and general RPN parameter automation are
not exposed. See :doc:`midi-audio` for message handling, held-note selection,
and the distinct byte-update policies for ``cc14`` and NRPN.

``audio(band, min?, max?, channel: N, name: "...", id: "...")``

* ``band`` (required): ``audioBand.low``, ``audioBand.mid``, ``audioBand.high``,
  ``audioBand.vol``, or ``audioBand.raw``
* ``min`` / ``max``: Number or automation setting the normalized bounds (default 0..1)
* ``channel``: Optional keyword-only channel 1–32. Alone, it selects a channel
  on the default audio device. Without any selector, the legacy aggregate
  analyser remains in use.
* ``name`` / ``id``: Optional keyword-only device selector. A named audio
  source requires ``channel``; ``id`` requires ``name`` and is authoritative.

Device and channel selection are independent for both functions. A name-only
selector must match exactly one connected device; missing, disconnected,
ambiguous, or unavailable selected sources resolve to ``min``.
``audioBand.raw`` requires a real host-supplied sample before it becomes ready;
raw silence then maps to the midpoint of the output range.

Audio channel choices must follow the host's actual delivered count. The DSL's
32-channel processing ceiling does not guarantee 32-channel hardware capture:
the Chromium 152 Linux capture path currently requests two channels per device,
and Chromium's Web Audio bridge hands the graph a stereo fold of any track.
See :doc:`midi-audio` for backend limits and capture requirements.

Example:

.. code-block:: none

   search synth
   let floor = audio(band: audioBand.low)
   let rate = midi(channel: 1, min: floor, max: 1)
   noise(scaleX: osc(type: oscKind.sine, speed: rate)).write(o0)

These fields support nesting:

- ``osc()``: ``min``, ``max``, ``speed``, ``offset``, and ``seed``
- ``midi()``: ``min``, ``max``, and ``sensitivity``
- ``audio()``: ``min`` and ``max``

Enum values, channel numbers, and MIDI ``cc``, ``nrpn``, and ``members`` must be static literals or
``let`` aliases resolving to valid literals, not live automation. Device
names and IDs must remain quoted string literals.
Bounds are clamped to 0–1 before mapping to the receiving parameter's range.
The language supports up to eight nested levels beneath the outer descriptor.
For selected-device examples, raw audio behavior, and host
integration, see :doc:`midi-audio`.

Pipeline Integration
--------------------

The DSL acts as a high-level builder for the Render Graph defined in :ref:`Pipeline Specification <shader-pipeline>`. For compiler details, see :ref:`Compiler Specification <shader-compiler>`.

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
  - Surfaces: ``o0``-``o7`` (global; references outside this range produce a ``SyntaxError`` at parse time)
  - **Chainable:** ``write()`` can appear mid-chain, passing the texture through to subsequent nodes.
  
    - Example: ``noise().write(o0).blur().write(o1)`` — writes noise to ``o0``, then blurs and writes to ``o1``.
    - Example: ``noise().write(o0).invert().write(o1)`` — ``o0`` has the original noise, ``o1`` has the inverted version.

* **read(surface):** Reads from a 2D surface. Built-in to the pipeline, no namespace required.
  
  - Example: ``read(o0).bloom(0.5).write(o1)``

**3D Textures:**

* **write3d(vol, geo):** Writes to both a 3D volume and its geometry buffer.
  
  - Example: ``noise3d().write3d(vol0, geo0)``

* **read3d(vol, geo):** Reads from both a 3D volume and its geometry buffer (starter form).
  
  - Example: ``read3d(vol0, geo0).render3d().write(o0)``

* **read3d(vol):** Single-arg form for passing volume or geometry references to effect parameters.
  
  - Example: ``cellularAutomata3d(source: read3d(vol0), geoSource: read3d(geo0))``
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
* **None:** ``none`` disables a volume/geometry parameter (e.g., ``cellularAutomata3d(source: none)``).

The geometry buffers store precomputed raymarching results (xyz=surface normal, w=depth), enabling downstream post-processing effects without re-raymarching.

**Agent Particle Surfaces:**

Used by the SMRTicles particle system (see :ref:`SMRTicles <shader-smrticles>`):

* **Position Surfaces:** ``xyz0``-``xyz7`` store agent positions (xyz) and lifecycle state (w).
* **Velocity Surfaces:** ``vel0``-``vel7`` store agent velocities.
* **Color Surfaces:** ``rgba0``-``rgba7`` store agent colors.

The ``pointsEmit`` and ``pointsRender`` wrappers manage these surfaces. Behavior effects read and write these surfaces to update agent state each frame.

**Mesh Surfaces:**

* **Mesh Geometry Textures:** ``mesh0``-``mesh7`` are texture pairs storing mesh geometry data from loaded OBJ files.
* Each mesh surface consists of a positions texture (vertex XYZ + W) and a normals texture (normal XYZ + UV).
* **Loading:** Use ``meshLoader()`` in the pipeline and load mesh files via the API — ``canvas.loadOBJFromURL()`` / ``canvas.loadOBJFromString()`` for OBJ, ``canvas.loadGLTFFromURL()`` / ``canvas.loadGLTFFromString()`` for glTF and GLB. Each takes the target surface as its second argument, defaulting to ``mesh0``.
* **Rendering:** Use ``meshRender()`` to render mesh geometry with lighting and transforms. It takes no surface argument: the effect is bound to ``mesh0``, so load into that surface to render it.
* **Bundled assets:** the OBJ files under ``share/meshes/`` were regenerated in 1.5 from the scene graph's own primitive builders. ``cube.obj`` and ``icosphere.obj`` now render right side out (they were wound inside-out before), ``sphere.obj`` and ``capsule.obj`` are mirrored in X, ``torus.obj`` lies in the XZ plane, and every asset now carries texture coordinates — a ``meshRender()`` program that used a texture-mapped material sees a real mapping where it saw a single texel.

Feedback Loops
^^^^^^^^^^^^^^

A chain reads texture content from the **previous frame** in either of these cases:

- The current frame has no earlier write to that Surface.
- The chain reads from itself.

This behavior enables feedback effects.

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
   * - L003
     - Lexer
     - Error
     - Unterminated comment
   * - L004
     - Lexer
     - Error
     - Output surface reference out of range
   * - P001
     - Parser
     - Error
     - Unexpected token
   * - P002
     - Parser
     - Error
     - Expected closing parenthesis
   * - P003
     - Parser
     - Error
     - Invalid automation arguments
   * - P004
     - Parser
     - Error
     - Invalid search directive
   * - P005
     - Parser
     - Error
     - Invalid output operation
   * - P006
     - Parser
     - Error
     - Invalid subchain
   * - P007
     - Parser
     - Error
     - Invalid call expression
   * - P008
     - Parser
     - Warning
     - Unknown subchain argument key
   * - P009
     - Parser
     - Warning
     - Duplicate subchain argument key
   * - P010
     - Parser
     - Warning
     - Missing ',' between subchain arguments
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
   * - S004
     - Semantic
     - Error
     - Cannot assign null or undefined
   * - S005
     - Semantic
     - Error
     - Illegal chain structure
   * - S006
     - Semantic
     - Error
     - Starter chain missing write() call
   * - S007
     - Semantic
     - Warning
     - Deprecated parameter alias
   * - S008
     - Semantic
     - Warning
     - Deprecated effect
   * - R001
     - Runtime
     - Error
     - Runtime error. Declared in ``diagnostics.js``. No code emits it.


Common Errors
^^^^^^^^^^^^^


* **S005 (Illegal chain structure):** Generator functions (like ``noise`` and ``solid``) must appear at the start of a chain. They cannot consume an existing chain output.
* **S006 (Starter chain missing write):** Generator-driven chains must end with ``.write()`` to produce a reusable surface.
* **S007 (Deprecated parameter alias):** The parameter has a new name. The previous name still works. Use the current name.
* **S008 (Deprecated effect):** A newer effect replaces this effect, but the previous effect still works. Use the current name.
