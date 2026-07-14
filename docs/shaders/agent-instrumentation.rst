.. _shader-agent-instrumentation:

AI Development Instrumentation
==============================

The source-grounded machine contract for AI development is
``llms-full.txt`` at the repository root. It is pinned inside the document to
the inspected Noisemaker and Shade MCP commits and covers these nine surfaces:

* DSL programs;
* effect definitions;
* parameters and globals;
* passes and the expanded render graph;
* textures and surface resources;
* replacement compatibility and AST mutation;
* rendered-frame metrics;
* WebGL2/WebGPU parity; and
* all registered Shade MCP verbs.

For each surface, ``llms-full.txt`` supplies four separate contracts:
Introspect, Act, Validate, and Diagnose. The Act sections contain the consumed
TypeScript-style grammars for ``EffectDefinition``, ``GlobalSpec``,
``PassSpec``, and ``TextureSpec``. The final matrix links all 36
surface/capability cells to implementation symbols or to a numbered engine gap.

Validation Predicates
---------------------

The current harness predicates are literal code conditions, not editorial
recommendations:

.. code-block:: text

   blank alpha                 mean_alpha < 0.01
   monochrome luma             luma_variance < 0.0001
   monochrome sampled colors   unique_sampled_colors <= 1
   uniform luma response       luma_delta > 0.002
   uniform channel response    max_channel_delta > 0.002
   temporal response           temporalDiff > 0.01
   filter modification colors uniqueColors > 5
   pixel parity                mismatch_percent < 1
   frame-rate target           fps >= target_fps

Some effect classes have explicit exemptions in the test harness. The
normative list, metric ranges, sampling behavior, and retry diagnostics are in
``llms-full.txt`` and cite ``shaders/tests/test-harness.js`` and the corresponding
Shade MCP helper symbols.

Worked Effect
-------------

The ``synth/testPattern`` section in ``llms-full.txt`` contains its complete
``definition.js``, GLSL, and WGSL, followed by the exact eight MCP request
objects and decoded responses from a single validation session. It
shows one declared effect pass plus the terminal write blit: two expanded
runtime passes. The preserved three-pass ``compileEffect`` responses are
explicitly rejected as stale-graph evidence under GAP-024; pixel parity uses
the corrected readiness check and validates both backends. Recorded render,
uniform, passthrough, and benchmark reports satisfy their numeric predicates,
but the document does not treat them as freshness-proof because those tools
share the same missing current-effect identity signal.

Implementation Status of Other Shader Pages
-------------------------------------------

The Effect, Pipeline, and Compiler pages include historical design material.
Where they conflict with ``llms-full.txt``, the latter's source-cited current
implementation contract wins. In particular, current code does not implement
an authorable ``persistent`` or mip texture field, execute the resource
allocator's physical reuse plan, topologically reorder passes, evaluate pass
``conditions``, invoke config ``onInit``/``onUpdate``/``onDestroy`` callbacks
from the production renderer, or emit the proposed ``ERR_*`` diagnostic
schema. Shade's AI branching analysis can also overwrite its computed status
with unvalidated model JSON. These are listed as gaps rather than described as
working features.

Sources: ``shaders/src/runtime/effect.js``, ``pipeline.js``, ``compiler.js``,
``expander.js``, ``resources.js``, and ``effect-validator.js``;
``shaders/src/lang/transform.js``; ``shaders/tests/test-harness.js``; Shade MCP
tool and harness implementations pinned in ``llms-full.txt``.
