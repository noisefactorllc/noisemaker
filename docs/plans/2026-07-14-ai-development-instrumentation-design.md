# AI-development instrumentation design

Date: 2026-07-14

## Objective

Make `llms-full.txt` a complete, source-grounded operating contract for an AI
agent developing against Noisemaker. For every engine surface, the document
must let the agent introspect legal state, author or mutate state, validate the
result with quantitative signals, and diagnose failure from machine-readable
output. Unsupported or unobservable behavior must be reported as an engine
instrumentation gap instead of being described as implemented.

## Scope

The contract covers these nine surfaces:

1. DSL programs.
2. Effect definitions.
3. Parameters and globals.
4. Passes and the expanded render graph.
5. Textures and surface resources.
6. Compatibility and mutation.
7. Rendered output.
8. Cross-backend parity.
9. All Shade MCP verbs exposed by the configured server.

The supporting RST documentation will be corrected where it contradicts the
runtime. No runtime behavior will be changed merely to make an existing prose
claim true.

## Source of truth

Claims are derived from executable source, effect definitions, tests, and the
configured Shade MCP implementation. Each contract section names its source
file and symbol. The documentation distinguishes four statuses:

- `enforced`: invalid input is rejected by current code.
- `consumed`: current code reads and acts on the field, but validation may be
  incomplete.
- `observed`: current definitions use the shape, including shapes that the
  runtime currently ignores.
- `unsupported`: the requested capability has no authoring or query contract.

This distinction prevents catalog conventions and aspirational documentation
from being presented as runtime guarantees.

## Documentation architecture

`llms-full.txt` is the self-contained machine-facing contract. It will contain:

1. A source-snapshot and interpretation header.
2. Common scalar, vector, identifier, result-envelope, and error-envelope
   types.
3. One section per surface in the fixed order `Introspect`, `Act`, `Validate`,
   `Diagnose`.
4. Formal EBNF for DSL syntax and TypeScript-style structural grammars for
   effect definitions, globals, passes, and textures.
5. Exact runtime and Shade MCP metric names, units, mathematical ranges, and
   implemented pass/fail inequalities.
6. The complete input and output union for every Shade MCP verb.
7. A worked `synth/testPattern` effect containing its complete definition,
   GLSL, WGSL, DSL invocation, exact MCP requests, and captured responses.
8. A nine-by-four traceability matrix.
9. A numbered gap register for missing enforcement, observability, or
   structured diagnostics.

`docs/shaders/agent-instrumentation.rst` will provide a human-readable entry
point and point to the detailed contract. Existing shader documentation will
be corrected where it asserts unsupported texture persistence, mip policy,
topological scheduling, cycle diagnostics, condition execution, or other
behavior not present in current source.

## Formal authoring contracts

The authoring schemas are closed over what current source consumes, while
separately listing observed-but-unconsumed keys. They do not claim that
`validateEffectDefinition()` enforces the complete schema; its actual string
diagnostic templates are documented separately.

The DSL grammar will follow lexer and parser behavior rather than the stale
header grammar in `parser.js`. It will include search directives, statements,
chain heads, chain elements, `read(oN)` in both supported roles, write targets,
render targets, literals, branches, subchains, and disallowed constructs.

The graph contract will expose the returned `compileGraph()` shape, expanded
pass order, symbolic texture bindings, and liveness allocation map. It will
state that source order is retained and that the allocation map is currently
not consumed by the pipeline.

## Validation and diagnosis

Every validator is described as an executable predicate. Examples include:

- `renderEffectFrame`: alpha `< 0.01`, luma variance `< 0.0001`, and exact
  sampled RGB cardinality `<= 1` for the implemented flags.
- `testUniformResponsiveness`: average-luma delta `> 0.002` or maximum channel
  mean delta `> 0.002` for a tested global.
- `testNoPassthrough`: temporal RGB difference `> 0.01` or more than five
  sampled colors.
- `testPixelParity`: per-channel mismatch when difference is greater than
  epsilon; overall success when fewer than one percent of channels mismatch.
- `benchmarkEffectFPS`: success against the caller's `target_fps`, with the
  repository harness's separate 30 FPS threshold identified as a harness
  policy rather than an MCP default.

Raw parser `SyntaxError` messages, semantic diagnostic objects, graph expansion
errors, backend error codes, compatibility rejections, threshold failures, and
MCP tool error variants will be enumerated separately. Inconsistent or
unstructured errors are gaps, not normalized fictional envelopes.

## Worked effect

`synth/testPattern` is the worked instance because it is an existing,
dual-backend effect whose complete definition and shader sources are small
enough to publish and whose structure, WebGL2 and WebGPU compilation, render
metrics, uniform response, pixel parity, and FPS all pass the configured Shade
MCP validators. The documentation will reproduce the checked-in source
verbatim and pair it with actual calls against the configured viewer. Internal
texture and multi-pass authoring remain covered by the formal schemas and an
expanded `filter/motionBlur` binding example; that effect is not used as the
passing transcript because current parity and validator calls expose real
failures.

If a validator reports an expected policy exception or an implementation gap,
the transcript will preserve that result and explain it. It will not replace a
real result with a hand-authored passing object. The worked validation set must
at minimum compile both backends, inspect structure, render, test relevant
uniforms, test filter modification, and test pixel parity.

## Known gaps to preserve as findings

The initial audit identified these likely gaps for final confirmation:

- Surface-reference tokens accept arbitrary nonnegative numeric suffixes even
  though only indices zero through seven are preallocated and documented.
- Lexer/parser failures throw raw `SyntaxError` values instead of the declared
  `L001`/`L002`/`P001`/`P002` diagnostic shapes.
- Effect-definition validation is partial and does not reject unknown keys or
  validate most field values.
- Several keys present in effect definitions or old documentation are not
  copied into expanded passes.
- There is no authorable mip policy or `persistent` texture field.
- The liveness allocation plan is returned but not applied by the pipeline.
- Compatibility preflight checks only starter position and effect existence,
  not parameter, texture, backend, or render-graph compatibility.
- Render metrics expose no implemented animation or low-variety predicate.
- Render metric implementations differ between the MCP verb and a shared
  helper snapshot.
- Some MCP verbs require a WebGL context despite accepting `webgpu`.
- The configured MCP dependency is unpinned, so tool contracts can drift.
- No engine API provides a complete backend-authorability preflight.

Each item will be retained only if source and focused probes confirm it.

## Verification

Verification will include:

- A test-first contract test that initially fails against the current
  `llms-full.txt` and later checks all 36 matrix cells, all four schemas, all 18
  MCP verbs, all required threshold names, source citations, the worked
  example, and the gap register.
- Existing focused DSL, transform, effect-validation, and graph tests.
- Exact Shade MCP calls for the worked effect, retaining the raw JSON response
  bodies used in the documentation.
- `git diff --check` and a final source-to-doc spot audit.

No package or documentation build command is required or permitted by the
repository instructions.
