.. _portable-dsl:

Portable Effects in the DSL
===========================

The Polymorphic DSL composes effects into visual programs. This guide shows
how a Portable package effect is called from a program. The language itself
is specified in :ref:`shader-language`.

Basic Structure
---------------

Every DSL program starts with a ``search`` directive, followed by effect
chains:

.. code-block:: text

   search {namespaces}
   {effect chains}
   render({output})

The ``search`` directive is required. The ``render()`` directive is optional;
without it, the last surface written is rendered to the screen.

.. code-block:: text

   search user, synth, filter

   noise(scaleX: 50, scaleY: 50)
     .blur(radiusX: 5, radiusY: 5)
     .write(o0)

   render(o0)

Search Directive
----------------

The ``search`` directive declares the namespaces that effects are looked up
in:

.. code-block:: text

   search user, synth, filter, classicNoisedeck

Package effects register in the ``user`` namespace
(:ref:`portable-registration`), so a program that calls one includes
``user``:

.. code-block:: text

   search user

   myEffect().write(o0)

   render(o0)

The built-in namespaces are listed in :ref:`shader-effects` (Section 2b).

Effect Chains
-------------

Effects are chained with ``.`` (dot):

.. code-block:: text

   search synth, filter

   noise().blur().adjust().write(o0)

Starter Effects
^^^^^^^^^^^^^^^

Starter effects begin a chain. They generate imagery without additional
input:

.. code-block:: text

   search synth

   noise().write(o0)

Filter Effects
^^^^^^^^^^^^^^

A filter effect follows another effect, which is its input:

.. code-block:: text

   search synth, filter

   noise().blur().write(o0)

Mixer Effects
^^^^^^^^^^^^^

Mixer effects combine the current chain with a second source through the
``tex:`` parameter:

.. code-block:: text

   search synth, mixer, filter

   noise().write(o0)
   gradient().blendMode(tex: read(o0)).write(o1)

   render(o1)

Parameters
----------

Pass parameters to effects with ``name: value`` syntax:

.. code-block:: text

   noise(scaleX: 50, scaleY: 50, octaves: 5, speed: 1)

.. list-table::
   :header-rows: 1
   :widths: 15 35 50

   * - Type
     - Syntax
     - Example
   * - Number
     - ``value``
     - ``scaleX: 50``
   * - Boolean
     - ``true`` / ``false``
     - ``invert: true``
   * - Enum
     - ``name``
     - ``mode: multiply``
   * - Color
     - ``#rrggbb``
     - ``color: #ff6600``
   * - Array
     - ``vec2(x, y)`` or ``vec3(x, y, z)``
     - ``offset: vec2(0.5, 0.3)``

Color syntax:

.. code-block:: text

   solid(color: #ff6600)              // Hex color

:ref:`shader-language` gives the complete argument syntax.

Output Buffers
--------------

Write chains to output buffers with ``.write()``:

.. code-block:: text

   noise().write(o0)     // Write to buffer 0
   gradient().write(o1)  // Write to buffer 1

The buffers are ``o0`` to ``o7``.

Reading from Buffers
^^^^^^^^^^^^^^^^^^^^

Use ``read()`` to reference a buffer:

.. code-block:: text

   search synth, filter

   noise().write(o0)
   read(o0).blur(radiusX: 10, radiusY: 10).write(o1)

   render(o1)

Render Directive
----------------

The ``render()`` directive names the buffer to display:

.. code-block:: text

   render(o0)

Using Package Effects
---------------------

Basic Usage
^^^^^^^^^^^

.. code-block:: text

   search user

   myEffect().write(o0)

   render(o0)

With Parameters
^^^^^^^^^^^^^^^

.. code-block:: text

   search user

   flowingTerrain(
     speed: 0.8,
     scale: 5.0,
     color1: #1a472a,
     color2: #f0f0f5
   ).write(o0)

   render(o0)

In a Chain
^^^^^^^^^^

A filter effect from a package follows a starter:

.. code-block:: text

   search user, synth

   noise().myFilter(strength: 0.5).write(o0)

   render(o0)

Combined with Library Effects
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: text

   search user, synth, filter

   myEffect(scale: 3.0)
     .blur(radiusX: 3, radiusY: 3)
     .adjust(saturation: 1.5)
     .write(o0)

   render(o0)

Multiline Formatting
--------------------

Chains can span lines:

.. code-block:: text

   search user, synth, filter

   noise(
     scaleX: 50,
     scaleY: 50,
     octaves: 6,
     ridges: true
   )
     .palette(
       index: santaCruz,
       offset: 30
     )
     .blur(radiusX: 2, radiusY: 2)
     .write(o0)

   render(o0)

Multiple Chains
---------------

A composition can use several chains:

.. code-block:: text

   search synth, filter, mixer

   // Background pattern
   cell(scale: 50)
     .write(o0)

   // Blend cells and noise with patternMix
   noise(scaleX: 50, scaleY: 50)
     .palette(index: brushedMetal)
     .patternMix(tex: read(o0))
     .write(o1)

   render(o1)

Comments
--------

Use ``//`` for comments:

.. code-block:: text

   search synth

   // Main pattern
   noise(scaleX: 50, scaleY: 50).write(o0)

   // Final output
   render(o0)

Common Patterns
---------------

Simple Starter
^^^^^^^^^^^^^^

.. code-block:: text

   search user

   myStarter().write(o0)

   render(o0)

Filter Chain
^^^^^^^^^^^^

.. code-block:: text

   search user, synth

   noise()
     .myFilter(param: 1.0)
     .write(o0)

   render(o0)

Layer Composition
^^^^^^^^^^^^^^^^^

.. code-block:: text

   search user, synth, mixer

   effect2().write(o0)

   effect1()
     .alphaMask(tex: read(o0))
     .write(o1)

   render(o1)

Feedback Loop
^^^^^^^^^^^^^

.. code-block:: text

   search synth, filter, render

   noise()
   .loopBegin(alpha: 100)
     .blur(radiusX: 10, radiusY: 10)
     .loopEnd()
     .write(o0)

   render(o0)

Error Messages
--------------

Common DSL errors when calling package effects. The full diagnostic list is in
:ref:`shader-language`.

Illegal chain structure (S005)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

A non-starter effect cannot begin a chain. It needs input from another
effect.

.. code-block:: text

   // Wrong - myFilter is not a starter
   myFilter().write(o0)

   // Correct - chain from a starter
   noise().myFilter().write(o0)

Unknown effect (S001)
^^^^^^^^^^^^^^^^^^^^^

The effect is not found in the searched namespaces.

.. code-block:: text

   // Wrong - missing 'user' namespace
   search synth
   myEffect().write(o0)

   // Correct
   search user, synth
   myEffect().write(o0)

Best Practices
--------------

1. **Always include** ``user`` **for package effects.**

   .. code-block:: text

      search user, synth, filter

2. **Use descriptive parameter names.**

   .. code-block:: text

      myEffect(speed: 1, complexity: 3)

3. **Break complex chains across lines.**

   .. code-block:: text

      effect()
        .filter1()
        .filter2()
        .write(o0)

4. **Comment compositions.**

   .. code-block:: text

      // Background layer
      noise().write(o0)

      // Foreground
      pattern().write(o1)

5. **Test effects in isolation first.**

   .. code-block:: text

      search user

      myEffect().write(o0)

      render(o0)
