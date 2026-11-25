Seeded Draws
============

This page is the contract for every implementation of the language's random
constructs. An implementation that follows it reproduces every draw of a
program exactly: the same source and seed give the same values everywhere.
``shaders/tests/fixtures/seeded-draws.json`` holds vectors that an
implementation's tests can check, and ``shaders/src/lang/draws.js`` and
``shaders/src/lang/randomize.js`` are the reference implementation. The
language itself is described in :doc:`language`.

Where draws happen
------------------

Draws resolve when a program compiles. Shaders never draw: a random call
becomes a value before any backend sees the program, so every backend
renders the same values.

A random call may appear in a parameter value, a ``let`` value, a vector or
array component, arithmetic, an automation argument (``osc()``, ``midi()``,
``audio()``), a ``maybe`` probability, a ``use`` argument, the part of
``use(pick(...))``, and an ``if`` or ``elif`` condition. It may not appear in a
surface argument, an effect name, a header directive, an arrow function, a
meta argument (``_id``, ``_skip``, ``_seed``) or a call-level ``seed:``.

The draw
--------

A draw is a 32-bit unsigned integer ``u`` computed from a seed and a key::

    mix32(x):
        z = (x + 0x9E3779B9)            mod 2^32
        z = (z XOR (z >> 16)) * 0x21F0AAAD   mod 2^32
        z = (z XOR (z >> 15)) * 0x735A2D97   mod 2^32
        return z XOR (z >> 15)

    fnv1a32(bytes):
        h = 0x811C9DC5
        for each byte b: h = (h XOR b) * 0x01000193   mod 2^32
        return h

    u = mix32(mix32(seed) XOR fnv1a32(utf8(key)))

Each multiply keeps the low 32 bits of the product. ``mix32`` is a bijection;
its inverse, ``unmix32``, undoes each step in reverse order, and pins use it.

The seed is the program's ``seed`` directive, or 0 without one, unless a
``_seed:`` scope or a call-level ``seed:`` sets it (see *Scopes*).

Mappings
--------

Each formula is exact as written.

``randInt(min, max)``
    Bounds are integers from -2^31 to 2^31-1; reversed bounds are put in order.
    ``r = max - min + 1`` and the value is ``min + (u mod r)``, computed in
    integer arithmetic of at least 53 bits. ``r`` can be 2^32.

``rand(min, max)``
    ``f = (u >> 8) / 2^24``, exact in 32- and 64-bit floats. Then, in 64-bit
    floats, three separate operations: ``d = max - min``, ``m = f * d``,
    ``min + m``. Reversed bounds are not put in order. ``rand()`` is
    ``rand(0, 1)``.

``pick(a, b, ...)``
    The argument at index ``u mod n``. A ``choices(...)`` argument contributes
    its whole list.

``chance(p)`` and ``maybe(p)``
    ``t = floor(p * 2^32)`` in 64-bit floats, exact for every ``p`` from 0 to 1;
    the result is true when ``u < t``, compared in at least 33-bit arithmetic.

``randColor(h:, s:, v:)``
    The three components draw from the call's one ``u``:
    ``u_h = mix32(u XOR fnv1a32("h"))``, and likewise ``s`` and ``v``. A
    component left out is ``f`` of its draw, as for ``rand()``. With
    ``h' = h - floor(h)``, for each channel ``n`` of 5, 3 and 1:
    ``k = n + 6h'``, less 6 if it is 6 or more;
    ``m = max(0, min(k, 4 - k, 1))``; ``c = v - (v * s) * m``; the byte is
    ``floor(255c + 0.5)``.

Numeric literals, probabilities and arithmetic are correctly rounded 64-bit
floats. An implementation must not fuse a multiply and an add into one
operation; C and C++ ports compile these functions with ``-ffp-contract=off``
or its equivalent.

Keys
----

A key is a UTF-8 string of segments joined by ``/``, with no leading ``/`` and
no empty segment.

==============================================  =============================================
Draw                                            Key
==============================================  =============================================
a ``let``                                       ``<scope>/let:<name>[#k]<path>``
a call in an element's parameter                ``<scope>/<op>@<name>/<param><path>``
a call in an element passed as a value          the value's key, then ``/e:<op>/<param><path>``
a call in an element of a ``let``'s chain       ``<scope>/let:<name>[#k]/<op>@<name>/<param><path>``
a call in a ``use`` argument                    ``<scope>/use@<name>/arg:<arg><path>``
the part of ``use(pick(...))``                  ``<scope>/use@<name>/part<path>``
a ``maybe`` decision                            ``<scope>/maybe_<n>/decide``
a call in a ``maybe`` probability               ``<scope>/maybe_<n>/p<path>``
a call in an ``if`` or ``elif`` condition       ``<scope>/if_<n>/cond<k><path>``
an inherited effect seed                        ``<scope>/<op>@<name>/<param>/inherit``
a call with its own ``seed:``                   ``pin``
==============================================  =============================================

* ``<op>`` is the resolved effect, written ``namespace.func`` (for example
  ``synth.noise``). ``<param>`` is the canonical parameter name.
* ``<path>`` locates the call inside its value: ``/k:<name>`` for an argument
  of ``rand``, ``randInt``, ``chance``, ``randColor``, ``osc``, ``midi`` or
  ``audio``, by parameter name whether written by position or by name;
  ``/a<i>`` for an argument of ``pick``; ``/c<i>`` for a vector or array
  component; ``/o0`` and ``/o1`` for the operands of ``+ - * /``, and ``/o0``
  for unary minus. Indexes count from 0. A value that is one call has an empty
  path.
* ``let:<name>#k`` is the k-th declaration of a name in one scope, from 2; the
  first has no suffix. Lets that hold effects and lets that hold random values
  are counted apart. Each instance of a part counts its own.
* An element of a ``let``'s chain takes the ``<scope>`` where the ``let`` is
  written. Used inside a part instance the ``let`` is not written in, its key
  starts with that instance's scope and ``outer``:
  ``<instance scope>/outer/<scope>/let:<name>[#k]/...``. The ``let`` names its elements as a body does: an
  ``_id:`` written in the ``let``, unless an earlier element of the ``let``
  took it, else the occurrence name, with ``'`` added while that name is taken.
  An ``_id:`` written where the ``let`` is called is the ``<name>`` if no
  earlier element claimed it, with ``'`` added while it is one of the
  ``let``'s own names; a claimed one falls back to the ``let``'s name. Every
  use of the ``let`` without an ``_id:`` of its own draws alike. Its inherited
  seed is drawn under ``<scope>/let:<name>[#k]/<op>@<name>/<param>/inherit``.
  A ``use`` argument that replaces a part's ``let`` draws under that ``let``'s
  key, its elements named as a ``let`` names them, with ``<effect>_<n>`` by
  their place in the argument as the occurrence name. An effect passed as a
  value where a ``let`` is called draws in the scope it is written in:
  ``<scope>/let:<name>[#k]/<op>@<name>/<param>/e:<op>/...``. A ``use``
  argument for a ``let`` that held no effect, such as ``let x = noise``, keys
  under ``let:<name>`` the same way. A ``let`` whose chain calls another
  ``let``'s name, such as ``let b = a(octaves: 2)``, keys that element under
  its own name, with the occurrence name the other ``let`` gave it.
* Inside an element with ``_seed:``, the effects passed to it as values keep
  the restarted keys, ``<op>/<param>/e:<op>/...``, in any scope. A part
  body numbers its ``if`` statements from 1 in each instance.
* ``<scope>`` is the path of enclosing ``use`` sites (``use@<name>``),
  ``maybe`` blocks (``maybe_<n>``) and ``if`` branches (``if_<n>/b<k>``, where
  ``k`` is 0 for the ``if``, then each ``elif``, then the ``else``), empty at
  the top level.

Names
-----

An element's or a use's ``<name>`` is its key name. Key names are assigned in
each naming body: the program outside every part, and each part body.

1. Every element has an occurrence name ``<effect>_<n>``: ``n`` counts, from 1,
   the elements of that effect in source order in its naming body, including
   elements that carry an ``_id:``, elements in every ``if`` branch and in
   untaken ``maybe`` blocks, and the elements of a ``let``, in its chain or
   passed as values inside it, counted once where the ``let`` is written. Uses
   (``use_<n>``), ``maybe`` blocks (``maybe_<n>``) and ``if`` statements
   (``if_<n>``) are counted the same way.
2. An element or use with an ``_id:`` takes it as its key name, unless an
   earlier one in the body has already taken that id.
3. Every other element or use takes its occurrence name. If that name is
   another element's ``_id:`` in the body, or is already given, ``'`` is
   appended until it is not.

Scopes
------

* A ``_seed: <n>`` on an element gives that element's draws the seed ``n``,
  and its keys restart at the element: ``<op>/<param><path>``.
* A ``_seed: <n>`` on a ``use`` gives the part's draws the seed ``n``, and its
  keys restart at ``part:<partName>``.
* A call with its own ``seed: <n>`` draws ``u = mix32(mix32(n) XOR
  fnv1a32("pin"))``. A pin writes the seed
  ``unmix32(unmix32(u) XOR fnv1a32("pin"))``, which draws ``u`` again.

Inherited effect seeds
----------------------

With a ``seed`` directive, or inside a ``_seed:`` scope, an effect parameter
named ``seed``, or marked ``inheritsSeed: true`` in its definition, that the
program does not set takes ``min + (u mod r)`` over the parameter's integer
range (``ceil(min)`` to ``floor(max)``), with ``u`` the draw of its inherit
key and the scope's seed. An oscillator's ``seed`` does not inherit. Without a
directive or a scope, every effect keeps its own value or default.
