# AI-development instrumentation implementation plan

> **Operator note:** Execute on the current `main` checkout. Do not create a
> branch, worktree, commit, push, pull request, build, bundle, or deployment.

**Goal:** Make `llms-full.txt` and the shader documentation a complete,
source-traceable operating contract for AI development against every requested
Noisemaker surface.

**Architecture:** `llms-full.txt` is the self-contained machine-facing
contract. A focused test treats required headings, schemas, tool names,
thresholds, citations, matrix cells, and gap identifiers as observable
documentation behavior. Supporting RST pages provide a human entry point and
remove claims that conflict with current runtime behavior.

**Technology:** Plain text, reStructuredText, Node.js ESM tests, existing
Noisemaker source/tests, and the configured Shade MCP stdio server.

---

## Task 1: Add the failing contract test

**Files:**

- Create: `shaders/tests/test_llms_full_contract.mjs`
- Test: `shaders/tests/test_llms_full_contract.mjs`

1. Write assertions for the nine named surfaces and all four capability labels.
2. Assert the four formal schema names are present.
3. Assert all 18 Shade MCP verb names are present.
4. Assert source-backed threshold identifiers and inequalities are present.
5. Assert the worked effect contains complete definition, GLSL, WGSL, request,
   and response blocks.
6. Assert the traceability matrix has 36 filled cells and a gap register.
7. Run `node shaders/tests/test_llms_full_contract.mjs` and confirm failure is
   caused by missing contract sections in the current document.

## Task 2: Build the source evidence ledger

**Files:**

- Modify: `llms-full.txt`

1. Add the source snapshot, status vocabulary, shared types, and common result
   and failure envelope conventions.
2. Cite repository file/symbol pairs and the exact Shade MCP source snapshot.
3. Record which assertions are enforced, consumed, observed, or unsupported.
4. Re-run the contract test; it must still fail on the unimplemented surface
   sections.

## Task 3: Instrument DSL, effects, and globals

**Files:**

- Modify: `llms-full.txt`

1. Add lexer/parser-derived EBNF, surface state, read/write/render semantics,
   literals, control flow, and disallowed syntax.
2. Add the full consumed effect-definition structural grammar and the actual
   partial validator behavior.
3. Add the globals schema, all observed types and UI metadata, enum identifier
   registration, argument binding, uniform binding, clamping, and diagnostic
   shapes.
4. Enumerate raw syntax failures, semantic diagnostics, expansion failures,
   and definition validator strings.
5. Run `node shaders/tests/test_parser.js`,
   `node shaders/tests/test-unparser.mjs`, and the contract test.

## Task 4: Instrument passes, graphs, textures, and mutation

**Files:**

- Modify: `llms-full.txt`

1. Add formal pass and texture schemas derived from catalog census plus runtime
   consumption.
2. Document input-to-sampler, output-to-target, uniform, repeat, MRT,
   draw-mode, graph expansion, inter-pass texture, and source-order behavior.
3. Document dimension resolution, backend format maps, filtering, mip absence,
   and actual frame persistence behavior.
4. Document `compileGraph()`, liveness records, allocation-map shape, and the
   fact that the map is not consumed by the pipeline.
5. Add exact `listSteps`, `getCompatibleReplacements`, and `replaceEffect`
   shapes and rejection strings.
6. Run `node shaders/tests/test_transform.js` and the contract test.

## Task 5: Instrument output metrics and backend parity

**Files:**

- Modify: `llms-full.txt`

1. Add `renderEffectFrame` field ranges and exact predicates for all-zero,
   transparent, low-luma-variance, and monochrome output.
2. Explicitly mark animation and low-variety pass/fail predicates as missing.
3. Add responsiveness, passthrough, FPS, and repository-harness policies with
   their exact thresholds and exemption boundaries.
4. Add pixel-parity units, epsilon semantics, mismatch threshold, solid-color
   and Y-flip diagnostics, and error variants.
5. Add a backend-authorability table grounded in loader/compiler/backend code
   and call out the missing complete capability preflight.
6. Re-run the contract test.

## Task 6: Publish every Shade MCP contract

**Files:**

- Modify: `llms-full.txt`

1. Add a source-pinned tool protocol preamble and the single-vs-batch return
   convention.
2. Document the full input grammar and output unions for each of the 18 verbs.
3. Include implicit auto-detection failures, AI-provider failures, browser
   failures, write side effects, WebGL-only readback limitations, and
   inconsistent error envelopes.
4. Re-run the contract test.

## Task 7: Capture the worked effect transcript

**Files:**

- Modify: `llms-full.txt`

1. Reproduce `synth/testPattern/definition.js`, its GLSL, and its WGSL.
2. Add its legal DSL program and explain every resolved pass/resource binding.
3. Invoke `checkEffectStructure`, `compileEffect` on both backends,
   `renderEffectFrame`, `testUniformResponsiveness`, `testNoPassthrough`, and
   `testPixelParity` through the configured Shade MCP server.
4. Preserve the exact JSON requests and actual JSON response bodies.
5. If a response exposes a tool or engine gap, retain it and classify it rather
   than editing the transcript into a pass.
6. Re-run the contract test.

## Task 8: Correct and connect supporting documentation

**Files:**

- Create: `docs/shaders/agent-instrumentation.rst`
- Modify: `docs/shaders.rst`
- Modify: `docs/shaders/effects.rst`
- Modify: `docs/shaders/pipeline.rst`
- Modify: `docs/shaders/compiler.rst`
- Modify: `docs/shaders/language.rst`

1. Add the new human-facing instrumentation entry point to the shader toctree.
2. Replace or qualify schema fields and scheduling/persistence claims that are
   not implemented.
3. Link each corrected page to the machine-facing full contract and source
   symbols.
4. Use source-status labels consistently.
5. Run the contract test and `git diff --check`.

## Task 9: Complete the matrix, gaps, and final verification

**Files:**

- Modify: `llms-full.txt`
- Test: `shaders/tests/test_llms_full_contract.mjs`

1. Fill every one of the 36 surface/capability cells with a section reference,
   source reference, validator/tool, and diagnosis channel or explicit gap ID.
2. Confirm every provisional gap against source and give it a stable ID.
3. Run:

   - `node shaders/tests/test_llms_full_contract.mjs`
   - `node shaders/tests/test_parser.js`
   - `node shaders/tests/test-unparser.mjs`
   - `node shaders/tests/test_transform.js`
   - focused graph/effect-validator tests discovered in `shaders/tests/`
   - `git diff --check`
   - `git status --short --branch`

4. Review the final diff against the user's hard requirements and report any
   remaining unverified facts as gaps.
