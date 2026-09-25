# Active Framework Gap: GAP-006

Status: closed (implemented at 6113da0). Machine verification of the published
revision is pending at the time of this record commit; the completed-evidence
section below is finalized in a forward commit once exact-commit CI and the
site deployment pass. The GAP-005 record is preserved below, unchanged.

The prior active-target records for GAP-005, GAP-004, GAP-003, and GAP-027 are
preserved below, unchanged. See their "Completed Evidence" sections.

## GAP-006

Gap statement from `llms-full.txt`:

> Resource allocation/liveness output is analysis-only. Renderers do not
> consume its physical allocation plan

Source evidence: `shaders/src/runtime/resources.js` -
`analyzeLiveness()`/`allocateResources()`; `compiler.js` stores
`graph.allocations` with no pipeline/backend consumer. Consequence: an agent
cannot query the actual runtime allocation/reuse plan promised by the
analyzer.

## Selected Contract (backward compatible)

- `Pipeline.getResourcePlan()` reports the actual runtime texture
  allocation/reuse plan: the analyzer's physical allocation map
  (`graph.allocations`), the sharing the renderer actually materialized
  (`sharedTextures` groups), and per-record entries (`textures` with
  `virtualTextures`) for every non-global graph texture. Available on every
  pipeline, pooling opt-in or not.
- The renderer consumes the plan behind the explicit `texturePooling: true`
  opt-in (`new Pipeline(graph, backend, { texturePooling: true })` or
  `createRuntime(source, { texturePooling: true })`):
  `Pipeline.buildTexturePoolingPlan()` groups `graph.allocations` members that
  share a physical slot, `recreateTextures()` creates one backend texture per
  group under the group's primary id, and every member's backend map entry is
  aliased to that record so pass execution binds the shared texture through
  either id. `releaseRegroupedTextures()`/`applyTextureAliases()` keep the
  sharing correct across resize and recompile.
- Pooling is refused for groups whose members' specs differ or carry
  `persistent`/`mipmaps`/3D policy, for members whose first touch in the pass
  list is a read or that are sampled by their own producing pass, and for
  members written by partial/non-clearing passes (any explicit `drawMode` —
  points/billboards/triangles scatter geometry without covering the surface —
  or `blend`, whose result depends on the destination's previous contents), so
  first-read and cross-frame accumulation semantics match standalone textures.
- No new rejection of previously accepted input: the default (opt-out)
  pipeline keeps one backend texture per virtual id, exactly as before.

## Implementation-phase evidence (local, pre-verification)

- Red run against the pre-change tree (base `6c3f9a2`, current suite):
  `node shaders/tests/test_resource_pooling.js` exited 1 with 4 passed /
  8 failed — every failure was missing plan consumption (shared records,
  execution-time binding, query contract, default no-pooling parity of the
  shared fields; the analyzer-presence and vacuous-refusal cases pass at
  base).
- Green run: 12 passed / 0 failed, exit 0.
- Test wiring (functional): the suite is registered in
  `scripts/run-js-tests.js` and inserted into the existing
  `test:shaders:runtime` npm script; no workflow files changed.
- Local checks at the candidate tree: `npm run test:shaders:runtime` (includes
  the new suite), `npm run test:shaders:lang`, `node shaders/tests/test_harness.js`,
  `node scripts/run-js-tests.js --skip-parity`, full eslint over
  `js/ scripts/ test/ shaders/ demo/`, `node --test
  test/docs-static-paths.test.js`, and `git diff --check` all exited 0.
- Files: `shaders/src/runtime/pipeline.js`, `shaders/tests/test_resource_pooling.js`,
  `scripts/run-js-tests.js`, `package.json`, `llms-full.txt`, and this record.

## Retained criteria and ownership (explicitly not proven by this record)

- Consumption is opt-in: the default render path still allocates one backend
  texture per virtual texture id; the analyzer plan is consumed only when
  `texturePooling: true` is set.
- Real GPU-device pooling behavior rides the repository's existing GPU-test
  job; the recording-backend suite cannot execute the WebGL2/WebGPU backends
  headlessly.
- Pooling is deliberately restricted to textures whose next use fully
  overwrites their storage: a texture written by a partial/non-clearing pass
  (`drawMode` scatter or `blend`) or depending on its own previous-frame
  contents is never pooled, so the consumer never hands a group-mate's frame
  content to an accumulating texture. The pipeline does not inject clears
  between group members' passes within a frame; the analyzer's
  disjoint-lifetime guarantee plus these exclusions are the safety contract.

## GAP-005 (closed; preserved record unchanged)

Gap statement from `llms-full.txt`:

> `name`, `viewport`, `clear`, `samplerTypes`, and `type` are not copied into
> expanded effect passes. (Narrowed at noisemaker `ff1bfbc1`: `conditions`
> used to be on this list; `expand()` now copies it and
> `Pipeline.shouldSkipPass()` consumes it.)

Source evidence: `shaders/src/runtime/expander.js` - constructed pass object;
`shaders/src/runtime/pipeline.js` - `shouldSkipPass()`. Consequence: authoring
these remaining fields has no runtime effect through `definition.js` and emits
no diagnostic.

## Selected Contract (backward compatible)

- `expand()` copies `name`, `viewport`, `clear`, `samplerTypes`, and `type`
  verbatim from each pass definition onto the constructed expanded pass, so
  authoring through `definition.js` reaches `CompiledGraph.passes` as queryable
  pass state. Unauthored fields stay `undefined` (default parity).
- `viewport` accepts the same dimension grammar as texture sizes (numbers,
  'screen', percentages, `{param}`/`{screenDivide}`/`{scale, clamp}` forms on
  the x/y/w/h/width/height keys, exactly what `validateEffectDefinition()`
  already accepts). At execution time `Pipeline.resolvePassViewport()` resolves
  the spec per frame into `viewportResolved` {x, y, w, h} numbers (x/y default
  0; missing w/h default to the frame screen size), using the pass uniforms so
  param-driven viewports track uniform updates. The reusable resolved box is
  cached per pass (no per-frame allocation), the authored spec stays queryable
  on `viewport`, and a fully numeric viewport passes through unchanged.
- The WebGPU and WebGL2 backends prefer `viewportResolved` over the raw spec in
  their existing fallback paths; output-texture dimensions keep priority in
  both backends, and the legacy direct read of a manually supplied numeric
  `viewport` on a hand-built graph pass is preserved. `clear` reaches the
  WebGPU render-pass loadOp and `samplerTypes` the WebGPU per-binding sampler
  selection through their existing consumers.
- No new rejection of previously accepted input: shipped definitions author
  `name`/`type`/dimension-form `viewport`, none author `clear` or
  `samplerTypes`, and every newly effective path keeps its existing priority
  rules, so rendered behavior is unchanged.

## Implementation-phase evidence (local, pre-verification)

- Red run: `node shaders/tests/test_pass_fields.js` exited 1 with 1 passed /
  7 failed — every failure was missing field propagation (verbatim copy,
  backend-execution reach, viewport resolution and uniform tracking, numeric
  pass-through, oscillator proxy); the two default-parity compatibility cases
  passed before and after.
- Green run: 8 passed / 0 failed, exit 0.
- Test wiring (functional): the suite is registered in
  `scripts/run-js-tests.js` and inserted into the existing
  `test:shaders:runtime` npm script; no workflow files changed.
- `npm run test:shaders:runtime` exited 0 at the candidate tree (including the
  new suite); `node shaders/tests/test_mip_controls.js` 15/15 and
  `node shaders/tests/test_pipeline.js` passed, confirming the neighboring
  contract suites still pass.
- Files: `shaders/src/runtime/expander.js` (verbatim copy),
  `shaders/src/runtime/pipeline.js` (`resolvePassViewport()` plus render-loop
  and oscillator-proxy wiring), `shaders/src/runtime/backends/webgl2.js` and
  `webgpu.js` (prefer `viewportResolved` in the existing fallback viewport
  paths), `shaders/tests/test_pass_fields.js`, `scripts/run-js-tests.js`,
  `package.json`, `llms-full.txt`, and this record.

## Retained criteria and ownership (explicitly not proven by this record)

- `name` and `type` are queryable pass labels; backend shader-kind dispatch
  remains source-derived, so `type` has no behavioral consumer on the expanded
  pass.
- `inputOverride` on dimension specs remains accepted-but-unconsumed; it is a
  dimension-spec field outside this pass-field row (the closed GAP-003
  retained note now says the same).
- WebGPU device-level viewport/sampler behavior rides the repository's
  existing GPU-test job; no GPU-device test in this repository executes the
  WebGPU backend headlessly.

## Completed Evidence (this run)

- Implementation commit: `fa83eeabf278f1f4999c1d1fff43e2e5338b72ba`
  (`feat(shaders): copy name/viewport/clear/samplerTypes/type onto expanded
  passes (GAP-005)`); record commit
  `8eeb7b5ac14eb37a8d16037f607a88ce63924cd3` (`docs: close GAP-005 with
  pass-field propagation evidence for fa83eeab`), both pushed to
  `refs/heads/main`. Independent review approved the exact published tip
  `8eeb7b5ac14eb37a8d16037f607a88ce63924cd3` (review
  `baecabf7-3710-4591-ab88-54e0ee6fca6f`).
- All eight declared local checks passed at that SHA (dependencies,
  shader-language, shader-runtime, effect-harness, javascript, lint,
  docs-paths, diff-hygiene).
- Exact-commit CI passed at `8eeb7b5ac14eb37a8d16037f607a88ce63924cd3`:
  Shaders (36197728173), Site (36197728193), Downstream (36197728267),
  Docs site (36197728143), JavaScript (36197728187).
- Machine verification receipt: `"verified": true` at
  2026-09-25T22:45:40.102Z for
  `8eeb7b5ac14eb37a8d16037f607a88ce63924cd3`; the `noisemaker-site`
  deployment serves that SHA at https://noisemaker.app/.
- The `llms-full.txt` GAP-005 register row now reads "Closed at noisemaker
  `fa83eeabf278f1f4999c1d1fff43e2e5338b72ba` (verified
  2026-09-25T22:45:40.102Z)" with the contract and evidence above; the
  open-gap count dropped from 19 to 18.

## GAP-004 (closed; preserved record unchanged)

Status: closed (implemented and verified at 2f47612c29045c1b91af94887a8ff20106e980ef)

The prior active-target records for GAP-003 and GAP-027 are preserved below,
unchanged. Both closed and published successfully; see their "Completed
Evidence" sections.

## GAP-004

Gap statement from `llms-full.txt`:

> Mip and persistent-across-frames controls do not exist. Definition-level 3D
> `filter` and unknown texture fields are discarded

Source evidence: `shaders/src/runtime/compiler.js` - `extractTextureSpecs()`;
backend texture creation methods. Consequence: an agent cannot author/query mip
policy, persistence, or 3D nearest filtering, and typos can be ignored.

## Selected Contract (backward compatible)

- 2D texture specs may author `mipmaps: true`: full chain allocation
  (`floor(log2(max(w,h))) + 1` levels — WebGL2 allocates every level with
  per-level `texImage2D` calls at `createTexture()`, WebGPU allocates
  `mipLevelCount` with per-level single-mip views), per-frame regeneration
  from level-0 writes via `backend.generateMipmaps()` (WebGL2 level-to-level
  NEAREST blits; WebGPU cached fullscreen resample pipelines with per-level
  bind groups cached on the record), render/compute writes into level 0,
  sampling through the full-chain view with a linear mipmap sampler, and
  queryable `mipmaps`/`mipLevels` records.
- 2D texture specs may author `persistent: true`: contents are resampled
  across recreation at a new size (the pipeline copies the old texture into a
  temporary, recreates, and resamples back through `backend.copyTexture()`;
  WebGPU uses `copyTextureToTexture` when dimensions match and neither side
  is mipmapped, a fullscreen resample pass otherwise), with a queryable
  `persistent` record. Global surface recreation preserves persistent halves
  and recreates each half exactly once per allocation change.
- `textures3d` specs may author `filter: 'nearest' | 'linear'`: honored by
  both backends (WebGL2 at `createTexture3D()`; WebGPU in sampler selection
  only when authored — unauthored 3D sampling keeps the historical nearest
  default), with a queryable `filter` record.
- Unknown/misplaced texture spec fields are rejected by
  `validateEffectDefinition()` with per-field diagnostics. These keys were
  never consumed before, so no previously accepted input changes behavior.

## Implementation-phase evidence (local, pre-verification)

- Tests-first: `shaders/tests/test_mip_controls.js` — 15 focused tests
  covering validator acceptance/rejection (including typo and misplaced-field
  cases), `extractTextureSpecs()` propagation through `compileGraph()`,
  pipeline policy plumbing/preservation/regeneration and the global-surface
  single-recreate contract against recording backends, and the WebGL2 backend
  itself against a recording stub GL (full-chain allocation with level dims,
  mipmap min filter, level N-1 -> N blit sequence, plain-texture skip). Each
  contract branch was demonstrated red before implementation.
- Test wiring (functional): the suite is registered in
  `scripts/run-js-tests.js` and prepended to the existing
  `test:shaders:runtime` npm script; no workflow files changed.

## Completed Evidence (this run)

- Implementation commits: `a021a2834008315e34d86f78c430b62d77ec6775`
  (policy plumbing + validator + backends + tests),
  `62eb56fa2f1f1f11fefeb184ce665cb186d4b2e8` (WebGL2 mip-chain allocation,
  cached WebGPU mip bind groups, backend-level tests), and
  `2f47612c29045c1b91af94887a8ff20106e980ef` (global-surface
  single-recreate leak fix), pushed to `refs/heads/main`. Independent review
  approved the exact candidate SHA `2f47612c29045c1b91af94887a8ff20106e980ef`
  (review `55cfba6d-bd00-477d-9ee1-f19ddf6fade9`).
- All eight declared local checks passed at that SHA (dependencies,
  shader-language, shader-runtime, effect-harness, javascript, lint,
  docs-paths, diff-hygiene).
- Exact-commit CI passed at that SHA: Release (tag `v1.0.182`, run
  36173647198), Shaders (36172741063), Site (36172741094), Downstream
  (36172741064), Docs site (36172741147), JavaScript (36172741121).
- Machine verification receipt: `"verified": true` at
  2026-09-25T18:30:05.670Z for candidate
  `2f47612c29045c1b91af94887a8ff20106e980ef`; the `noisemaker-site`
  deployment serves the same SHA at https://noisemaker.app/.
- The `llms-full.txt` GAP-004 register row now reads "Closed at noisemaker
  `2f47612c29045c1b91af94887a8ff20106e980ef` (verified
  2026-09-25T18:30:05.670Z)" with the contract and evidence above; the
  open-gap count dropped from 20 to 19.

## Retained criteria and ownership (explicitly not proven by this record)

- WebGPU mip generation, resample copies, and sampler selection were verified
  at the contract/pipeline level and by review; no GPU-device test in this
  repository executes the WebGPU backend headlessly, so device-level behavior
  rides the repository's existing GPU-test job (Shaders workflow GPU tests
  passed at the same SHA).
- Unknown WebGL/WebGPU format and dimension-form fallbacks remain silent
  authoring paths under GAP-007 (texture-spec fields themselves are now
  validated).
- `transient` remains a non-authorable concept (absence of `persistent`);
  no new rejection of previously accepted input was introduced.

## GAP-003 (closed; preserved record unchanged)

Gap statement from `llms-full.txt`:

> `validateEffectDefinition()` validates only a subset of the consumed
> definition schema

Source evidence: `shaders/src/runtime/effect-validator.js` versus `effect.js`
and `expander.js`. Consequence: invalid globals/pass/texture fields can survive
structure validation.

## Selected Contract (backward compatible)

`validateEffectDefinition(def)` remains a deterministic, side-effect-free
structure check returning error strings (`[]` for valid input). It now covers:

- Plain definition objects and supported `Effect` instances (top-level
  unknown-field diagnosis runs on plain objects; nested declarative containers
  are fully diagnosed on every input shape; legitimate subclass instance state
  is not rejected).
- Definition metadata, tags (validated against `VALID_TAGS`), lifecycle hook
  field types, globals (types incl. `string`, defaults, scalar-or-array
  min/max with componentwise checks, choices incl. string-typed globals,
  std-enum resolution for `member`/`enum`, uniform/define/colorModeUniform
  strings), pass fields and binding references (inputs/outputs/uniforms/
  conditions/countUniform, numeric literals preserved), texture specs and
  dimension expressions (numbers, keywords, percentages, `{param}`/
  `{screenDivide}`/`{scale, clamp}` forms), both existing uniform-layout forms
  (slot/component and byte form, with duplicate and overlapping-conflict
  detection), and param aliases.
- Malformed/null/array/non-object containers are reported without throwing;
  errors follow declaration insertion order; the input is never mutated and
  lifecycle hooks are never invoked; runtime globals are never sorted.

Declaration/schema validation is distinct from shader compilation, GPU
capability checks, and runtime behavior; the validator proves structure only.

## Implementation-phase evidence (local, pre-verification)

- Tests-first: `shaders/tests/test_effect_definition_validation.js` — 16
  focused tests covering the negative/compatibility matrix above, plus a
  dynamic corpus gate over the tracked definitions with explicit denominators
  (expected=210 executed=210 pass=210 failure=0 skip=0 unexecuted=0). Import
  errors and unexecuted definitions are failures, not skips.
- Test wiring (functional): the suite is registered in
  `scripts/run-js-tests.js` and prepended to the existing
  `test:shaders:runtime` npm script; no workflow files changed.
- All 16 tests and the corpus gate pass locally at the candidate tree;
  `git diff --check` clean; trailing-newline convention restored on the
  validator module.

## Completed Evidence (this run)

- Implementation commit: `9d3474dfdc6cb737ebb7b2f3598b16d940af1544` (main,
  `ba87ffa` validator/tests + `9d3474d` contract completion, wiring, and
  implementation-phase records). Independent review approved the exact
  commits (review `0c4ca419-56b3-4d0c-b4cc-e5d1e79422d4`).
- All six declared source workflows succeeded at that exact SHA: Release
  (tag `v1.0.181`, run 36155221398: Build JS bundles, Build shader bundle,
  Build standalone Linux/macOS/Windows, Publish release), JavaScript
  (36154763053: JS tests, JS lint, bundles, standalones, Publish snapshot
  release), Shaders (36154762848: Shader tests, GPU tests, Bundle shaders,
  Dispatch scaffold static-site-release, Dispatch scaffold library-release),
  Site (36154762845), Downstream (36154762970), Docs site (36154762881).
- Exact-revision deployments at that SHA: https://noisemaker.app/,
  https://docs.noisemaker.app/, and the `noisemaker-shaders-core.esm.js`
  CDN artifact (revision pointers all serve
  `9d3474dfdc6cb737ebb7b2f3598b16d940af1544`; digests in the verification
  receipt, verified 2026-09-25T15:39:55.746Z).
- Pinned artifacts check passed: release `v1.0.181` archive (asset
  sha256 `7d0761df750fdfa030ea1eefda2a83c035124f9bd91939325589abd9de8875bb`),
  manifest inventory expected=228 executed=228 passed=228 failed=0, docs/CDN
  revision and body digests matching the source SHA.
- Machine verification receipt: `"verified": true` at
  2026-09-25T15:39:55.746Z for candidate
  `9d3474dfdc6cb737ebb7b2f3598b16d940af1544` with checks dependencies,
  shader-language, shader-runtime, effect-harness, javascript, lint,
  docs-paths, diff-hygiene, artifacts.

## Retained criteria and ownership (explicitly not proven by this record)

- `inputOverride` in dimension specs is accepted (string, non-empty) because
  shipped 3D effects declare it, but no runtime consumer was found; it remains
  silently uncopied under the GAP-005 uncopied-field gap. GAP-005 retains that
  propagation gap.
- `storageBuffers`/`storageTextures` shapes are validated only as objects; no
  declaration metadata exists to validate their internal grammar structurally.
- Declaration/schema validation is distinct from shader compilation, GPU
  capability, and runtime behavior; this record never claims those are proven
  by CPU structure checks.

## GAP-027

Gap statement from `llms-full.txt`:

> Subchain arguments have no enforced key set, separator rule, duplicate-key diagnostic, or discarded-key report

Source evidence: `shaders/src/lang/parser.js` - `parseSubchainCall()` accepts
arbitrary identifier/string pairs, makes commas optional, overwrites duplicates
in `kwargs`, and projects only `name`/`id` into the AST. Consequence: a typo or
unknown subchain key can parse successfully and disappear; retry logic
receives no machine-readable failure.

## Selected Contract (backward compatible)

One contract, reported through the existing language API:

- Enforced key set: keyword arguments accept exactly `name` and `id` with
  quoted string values (existing P006 rejection for non-string values is
  unchanged). A single leading positional string literal remains shorthand
  for `name`. Mixing positional and keyword arguments keeps its legacy
  rejection. Both `name` and `id` remain optional; `subchain()` with no
  arguments is unchanged.
- Separator rule: keyword arguments must be comma-separated. A missing comma
  between keyword arguments is reported with code `P010`.
- Duplicate rule: the last occurrence of a key wins (historical overwrite
  behavior preserved); every occurrence after the first is reported with code
  `P009` at the offending key token.
- Discarded-key reporting: any key outside `{name, id}` is still discarded
  (the AST projects only `name`/`id`) and reported with code `P008`, naming
  the key and its location. Duplicate unknown keys report once per occurrence.
- Diagnostic codes `P008`/`P009`/`P010` are registered in
  `shaders/src/lang/diagnostics.js` with parser stage and `warning` severity.
- Default path: reports ride on the Subchain AST node as non-enumerable
  `subchainArgumentDiagnostics` metadata (public AST/serialized shape
  unchanged) and are surfaced by `validate()`/`compile()` in the existing
  `diagnostics` array with `{code, message, severity, nodeId?, location?}`
  entries, in source order of the offending token. When a missing separator
  and a duplicate land on the same key token, the separator report precedes
  (the comma belongs to the gap before the key). Locations use the lexer's
  source-derived position (line, column) with the token line/col fallback;
  spans are carried on the node metadata.
- One explicit opt-in validation path: `parse(tokens, { subchainArguments:
  'strict' })` and `compile(src, { subchainArguments: 'strict' })` reject the
  same conditions by throwing `SyntaxError` carrying the same codes with
  severity `error`, location, and span. Default parsing acceptance is
  unchanged for every historically accepted program.
- Nesting: `subchain` inside a subchain body keeps its legacy rejection
  (historically unparseable; covered by a regression test).

## Compatibility Proofs

- Differential gate registered in the repository:
  `shaders/tests/test_subchain_argument_differential.js` with
  `shaders/tests/fixtures/subchain-argument-baseline.json`, a recorded
  snapshot of the exact public `compile()` results and thrown errors of a
  generated 18-program corpus (valid forms, permissive legacy forms,
  historically rejected forms, CRLF, comments, EOF variants) taken from
  `git archive` of the recorded source revision
  `3886ecfa41fdebdf2428f07fec05ab46602c07f2` (the revision GAP-027 was
  selected at). The committed test asserts current `compile()` matches the
  recorded baseline on acceptance, thrown error class/message, plans, render,
  vars, and searchNamespaces, and that the only permitted added diagnostics
  are P008/P009/P010; it also pins the strict opt-in throw codes over the
  same corpus. Registered in `test:shaders:lang` and the non-parity
  JavaScript runner like the other new checks.
- Existing legacy errors preserved byte-identically: P006 non-string value
  message, positional+keyword mixing rejection (P002), shared expectation
  precedence (P001/P002), and subchain-in-subchain rejection (P001).
- The pre-existing permissive-subchain coverage in
  `shaders/tests/test_diagnostic_locations.js` kept its AST/compiled-index
  assertions and moved the permissive form to a dedicated test asserting the
  new stable reports; acceptance and compiled shape are unchanged there.

## Required Tests and CI Checks

- `node shaders/tests/test_subchain_arguments.js` (new suite, registered in
  `test:shaders:lang` and the non-parity JavaScript runner): key set,
  separator, duplicate precedence (including repeated unknown keys reporting
  P008 per occurrence and never P009), discarded-key reporting, source-order
  and tie-break conventions, strict opt-in throws with location/span,
  location conventions including the no-position fallback and the fully
  position-less report, legacy message compatibility, CRLF/comment behavior,
  unparse and serialized-AST shape equality.
- `node shaders/tests/test_subchain_argument_differential.js` with
  `shaders/tests/fixtures/subchain-argument-baseline.json` (recorded baseline
  revision `3886ecfa41fdebdf2428f07fec05ab46602c07f2`): registered
  differential gate over the generated corpus, in both aggregate suites.
- The job's seven declared checks plus `npm run test:shaders:lang`.
- Exact-commit CI (Shaders, Docs site, Site, Downstream) and the
  `noisemaker-site` exact-revision deployment verification before closure.

## Bounded Work Items

- [x] Confirm GAP-002 closed and GAP-027 open at the checked-out source.
- [x] Red: focused suite fails before implementation (10 of 19 cases red).
- [x] Implement the contract (parser report collection, diagnostics catalog
  P008-P010, validator surfacing, strict opt-in on parse/compile).
- [x] Differential gate: 0 mismatches over the generated corpus, both as the
  initial job-time `git archive` run and as the committed registered suite.
- [x] Register the new suites in `test:shaders:lang` and
  `scripts/run-js-tests.js`, including the committed differential suite
  against the recorded baseline revision.
- [x] Run all seven declared checks (dependencies, diagnostic-locations,
  shader-language, javascript, lint, docs-paths, diff-hygiene) plus
  `npm run test:shaders:lang`: all exit 0 at the candidate commit.
- [x] Independent review of the exact commits, direct-main publication,
      exact-commit CI, and exact-revision site verification.
- [x] Update the `llms-full.txt` GAP-027 row and open-gap register from
      verified evidence; mark GAP-027 closed only after the full contract is
      proven published.

## Completed Evidence (this run)

- Started on clean `main` at `3886ecfa41fdebdf2428f07fec05ab46602c07f2`,
  tracking `origin/main`, no pending changes.
- Confirmed GAP-002 closed (`llms-full.txt` closure record, line 4019) and
  GAP-027 open in the 22-row open-gap matrix.
- Red run: `node shaders/tests/test_subchain_arguments.js` exited 1 with the
  10 contract cases failing before implementation; 19/19 green after.
- Aggregate: `npm run test:shaders:lang` exited 0 including the registered
  suite; `node --test test/docs-static-paths.test.js` exited 0 after the
  record/`llms-full.txt` update; `git diff --check` exited 0.
- Closure evidence (2026-09-25): implementing revision
  `240740dd2d30cbd0984b179834ab24abe71c8fb2` has six successful public push
  runs (Shaders 36105621091, Docs site 36105621142, Site 36105621096,
  Downstream 36105621082, JavaScript 36105621083, Release 36106261468).
  Publication record `0610e077e294ff19f4c341f3bb2336a97d217bc1` passed
  independent review (7c8806d0-839c-4bf3-984e-191ac6fdf814), all seven
  declared source checks, its own exact-source Site run (36139959380,
  success), and exact-revision deployment verification at
  https://noisemaker.app/ (`deployment-meta.json` serves that SHA; verified
  2026-09-25T13:17:24.773Z). The `llms-full.txt` GAP-027 row was removed and
  the open-gap register updated from 22 to 21 entries.

# Prior Active-Target Record: GAP-002 (closed, preserved)

# Active Framework Gap: GAP-002

Status: closed

## Gap

Exact problem statement from `llms-full.txt`:

> Parser errors outside shared token expectations, automation argument validation, search directive validation, reachable output validation, and explicit subchain validation lack a stable diagnostic schema; parser locations retain token-counter limitations and source spans are unavailable. Complete AST `loc` coverage is not a public contract

Agent consequence:

> retry code must still parse human text for remaining parser failures and cannot reliably identify parser source spans

## Source Files and Observed Behavior

- `shaders/src/lang/lexer.js` now attaches structured diagnostics to native `SyntaxError` failures; `parser.js` exposes structured P001/P002 diagnostics for shared token expectations and P003 for automation argument validation and P004 for search directive validation and P005 for reachable output validation and P006 for explicit subchain validation; other throw paths remain unstructured.
- `shaders/src/lang/diagnostics.js` catalogs lexer, parser, and semantic codes. Lexer failures expose L001-L004; shared parser token expectations expose P001/P002 and automation argument validation exposes P003 and search directive validation exposes P004 and reachable output validation exposes P005 and explicit subchain validation exposes P006; other parser failures do not yet expose catalog codes.
- Before the semantic-column fix, `shaders/src/lang/validator.js`: `pushDiag()` read `node.loc.column`, while parser-authored locations use `node.loc.col`. Existing semantic diagnostic locations therefore lost their column when serialized.
- Pre-fix reproduction through public `compile()`: `search synth\n  read(123).write(o0)` produces located S001 and S005 diagnostics with line 2 and undefined columns instead of columns 3 and 13.
- Many AST nodes have no `loc` at all. This run does not invent coordinates for those nodes or claim complete source-span coverage.

## Backward-Compatibility Contract

- Preserve accepted/rejected DSL behavior, rendered output, defaults, saved programs, effect step indexes, compiled plans, and public result fields.
- Populate the existing `Diagnostic.location.column` from parser-authored `loc.col`; preserve an explicit existing `loc.column` on caller-supplied ASTs.
- Preserve diagnostics without a location, code/message/severity/identifier fields, and the parser AST shape. Do not introduce a second public location field.
- Preserve existing thrown error classes and messages. Future structured lexer/parser diagnostics must be additive on existing errors or opt-in/versioned if their result contract changes.
- No effect definitions, shader programs, backend behavior, or Python code changes.

## Objective Completion Criteria

- [ ] Lexer and parser failures expose a stable machine-readable diagnostic contract without parsing message text, while preserving legacy calls.
- [ ] Diagnostic source coordinates have a defined public convention and reliable coverage for lexer/parser failures, with explicitly represented unavailable spans.
- [x] Existing located semantic diagnostics preserve their line and obtain the parser-provided column; caller-supplied columns and unlocated diagnostics remain compatible.
- [ ] Regressions prove the new contracts and legacy compatibility through public entry points.
- [ ] All required local checks and exact-commit CI pass for each bounded implementation.

## Required Tests and CI Checks

For the completed semantic-column item and current lexer item:

- `node shaders/tests/test_diagnostic_locations.js` (new public-compile and direct-validator regressions).
- `npm run test:shaders:lang` with the new suite registered.
- `node scripts/run-js-tests.js --skip-parity` with the new suite registered.
- `npm run lint`.
- `node --test test/docs-static-paths.test.js` after updating `llms-full.txt`.
- `git diff --check` and exact pushed commit's triggered GitHub Actions workflows, including Shaders, JavaScript, Docs site, Site, and Downstream when triggered.
- Future lexer/parser work must add focused failures, legacy error compatibility checks, and the same aggregate/CI gates before it is selected.

## Bounded Work Items

Previously completed semantic-column work:

- [x] Add and register regression coverage for exact columns on read/write and multiline inline-read failures, serialized locations, explicit caller-provided columns, missing locations, and unchanged valid plans. Demonstrate the missing-column failure before implementation.
- [x] Map parser `loc.col` into existing diagnostic `location.column`, preserving explicit `loc.column` values and all other fields.
- [x] Review the complete diff, fix actionable findings, and run focused plus required checks.
- [x] Update only the proven semantic-column limitation in `llms-full.txt`; retain GAP-002 and the open-gap count.
- [x] Commit only this run's files, pull/rebase, push normally, and monitor exact-commit CI.

Remaining full-gap work:

- [ ] Define and implement the compatible structured lexer/parser error contract and source-coordinate coverage with red-green tests.
- [ ] Verify the full GAP-002 contract, update the gap register from evidence, and mark this record closed only after all completion criteria pass.

## Completed Evidence

- Started on clean `main` at `3001db9130769634ec29b55b0c95fb3772a13776`, tracking `origin/main`, with no active Git operation.
- Initial `git pull --rebase`: already up to date.
- Previous active target GAP-022 was closed. Selected GAP-002 for a bounded developer-contract correction.
- Shade tool discovery returned no callable Shade tools. This item changes language diagnostics only, with no shader development or rendered-output changes.
- Root cause confirmed by public `compile()` reproduction and the parser/validator location field mismatch.

- Focused red run: after correcting the test fixture's AST path, `node shaders/tests/test_diagnostic_locations.js` exited 1 with exactly two missing-column failures (expected columns 3/13 and 17, received undefined); all three compatibility cases passed before implementation.
- Minimal implementation: `pushDiag()` now uses `node.loc.column ?? node.loc.col` for the existing `location.column` field. No new public fields or validation policy were introduced.
- Focused green run: `node shaders/tests/test_diagnostic_locations.js` exited 0 with 5 passed and 0 failed.
- Aggregate coverage: registered the focused suite once in `test:shaders:lang` and once in the non-parity JavaScript runner.
- `npm run test:shaders:lang` exited 0 and ran all five new cases.
- `node scripts/run-js-tests.js --skip-parity` exited 0 and ran all five new cases. Its MIDI adapter-unavailable message is an expected operational-error test fixture, followed by PASS.
- `npm run lint` exited 0 with no diagnostics.
- `node --test test/docs-static-paths.test.js` exited 0 with 4 passed and 0 failed.
- `git diff --check` exited 0. The register retains GAP-002 and its existing open-gap count.

- Independent high-reasoning review of all six changed files found no Critical, Important, or Minor issues. The reviewer reran the five focused tests and diff hygiene, checked caller column zero, and compared baseline/current behavior: only the intended parser-provided columns changed. Aggregate registration propagates failures correctly.

- Implementation commit: `e5bd2013087e54d53841db8c45a54f973aaa5174` (`fix: preserve source columns in DSL diagnostics`).
- Pre-push `git pull --rebase` reported main up to date and did not change tested sources.
- Normal push advanced `origin/main` from `3001db91` to `e5bd2013`.
- Exact-commit CI passed: Shaders `35698026719`, JavaScript `35698026738`, Docs site `35698026995`, Site `35698026613`, and Downstream `35698026692` all completed successfully for the implementation SHA.
- Shaders included hosted language/runtime/render/structure checks, all GPU suites, bundle packaging, and both scaffold release dispatches. One persistent `gh run watch` monitored this workflow to successful completion.
- Follow-on Release `35698413358` also passed for the implementation SHA, including Linux/macOS/Windows standalone builds, JS/shader bundles, and release publication. It was monitored with a separate sequential persistent watch after Shaders completed. Dependabot auto-merge runs were skipped as inapplicable.

## Remaining Work

The semantic-column item is complete and verified locally and in exact-commit CI. The current lexer item and its evidence are below. GAP-002 stays active: structured parser errors, parser coordinate coverage and unavailable-span representation, and full-contract compatibility regressions remain. Continue GAP-002 on the next run; do not select another gap.


## Current Run: Structured Lexer Failures (2026-09-22)

Bounded design: keep throwing native `SyntaxError` with byte-for-byte legacy
messages. Add one non-enumerable `diagnostic` property containing JSON-safe
`code`, `stage`, `severity`, `message`, `location`, and `span`. Preserve ordinary
error enumeration/JSON and all successful token, AST, and compile result shapes.
Use existing L001/L002 codes and add L003 for unterminated comments and L004 for
out-of-range output references. Single-, double-, and triple-quoted strings use L002.

Coordinates: `location.line` and `location.column` are one-based; columns and
zero-based half-open `span.start`/`span.end` offsets count UTF-16 code units.
Only LF starts a new line; CR and tabs each occupy one column. Compute locations
from the source on the failure path so existing scanner bookkeeping quirks do
not corrupt the structured location or require changes to successful tokens.
Unexpected characters cover the rejected code unit; invalid output references
cover the reference; unterminated constructs cover their opening delimiter
through EOF or up to but excluding the unescaped LF ending a single-/double-quoted string scan.
All lexer failures have known spans. Parser diagnostics and unavailable-span
representation remain outside this bounded item.

Files: `shaders/src/lang/lexer.js` (failure construction and five throw sites),
`shaders/src/lang/diagnostics.js` (L003/L004 catalog entries),
`shaders/tests/test_diagnostic_locations.js` (already registered in both
aggregates), `llms-full.txt` (proven public contract), and this active record.

- [x] Add public `lex()`/`compile()` regressions for all lexer failure branches,
  exact legacy error messages/classes, JSON-safe diagnostics, precise spans,
  multiline/CRLF/tab/UTF-16 coordinates, and unchanged successful token shapes.
  Run the suite before implementation and verify missing diagnostics fail.
- [x] Add structured lexer failures using the existing diagnostic catalog without
  changing accepted/rejected source or successful results.
- [x] Review the full diff and run the focused suite, shader-language suite,
  non-parity JS suite, lint, documentation path tests, and diff hygiene.
- [x] Narrow only the proven lexer limitation in the register; leave GAP-002 open.
- [x] Commit this run's files, rebase, push normally, and verify exact-commit CI.

Startup: clean `main` at `52ac841bcda0e80042b6f399bca4b7d66268f48a`, no active
Git operation. Initial pull fast-forwarded to `a0ff705a` with upstream changes
only in `LEDGER.md` and `llms-full.txt`. No callable Shade tools were available;
this item changes language diagnostics only, not shader programs or rendering.


### Current Run Evidence

- After correcting two fixture assumptions (escaped-LF source length and a
  function token requiring a delimiter), the focused pre-implementation run
  exited 1: all nine new failure cases lacked `error.diagnostic`; all six
  compatibility/previous cases passed. Every legacy message assertion passed.
- Focused green run: `node shaders/tests/test_diagnostic_locations.js` exited 0,
  15 passed / 0 failed. New failure cases exercise both `lex()` and `compile()`.
- `npm run test:shaders:lang`, `node scripts/run-js-tests.js --skip-parity`, and
  `npm run lint` each exited 0. The existing suite registration includes all
  15 focused cases in both aggregates; no registration changes were needed.
- `node --test test/docs-static-paths.test.js`: 4 passed / 0 failed, exit 0.
- `git diff --check`: exit 0. GAP-002 and the 23-row open register remain open.
- No builds were run locally. No shader effects, parser behavior, Python code,
  DSL defaults, rendered output, saved programs, or compiled indexes changed.

- Full-diff review found no actionable issues. Independent review also found no
  actionable findings and reran the focused 15-case suite plus diff hygiene.
  Its baseline differential check against `a0ff705a` passed 25,000 inputs:
  4,651 accepted inputs had identical tokens; 20,349 rejected inputs preserved
  error classes/messages and had valid structured coordinates.
- The non-parity suite's `MIDI access failed: Error: adapter unavailable` log is
  an expected operational-error fixture followed by PASS, not an unresolved
  console error.

- Implementation commit `643b2be1e28b62e3282a4009c2ea65c583ed6ccc`
  (`feat: expose structured DSL lexer diagnostics`) was pushed normally after
  `git pull --rebase` reported main up to date; tested sources did not change.
- Exact-commit CI passed: Shaders `35744969052`, Docs site `35744968934`,
  Site `35744968979`, and Downstream `35744968932`. One persistent
  `gh run watch 35744969052 --exit-status` exited 0 after hosted tests, all
  GPU suites, bundle packaging, and both scaffold release dispatches passed.
  JavaScript CI was not triggered by this shader-only source change; its local
  non-parity suite and lint both passed. Dependabot auto-merge was inapplicable
  and skipped.

All selected lexer work is complete, with no remaining work in this bounded
item. GAP-002 stays active for structured parser errors, parser coordinates
and unavailable spans, full-contract regressions, and the remaining full-gap
checks. Select no other gap on the next run.


## Current Run: Parser Token Expectations (2026-09-22 evening)

Continue GAP-002. Startup: clean main at ae4e3302, synchronized with origin/main,
no active Git operation or pending job-owned publication; initial pull/rebase
reported already up to date. Select only the shared parser expect() failure
path for this run. Other parser throw sites and source-derived parser spans
remain later bounded work.

Design: preserve native SyntaxError class and exact message; add the existing
non-enumerable diagnostic property shape with P002 for expected RPAREN and
P001 for other token mismatches, catalog stage/severity, and message. Location
copies the unexpected token's positive integer line/col as line/column; if
either is unavailable, location is null. Span is explicitly null because the
public token contract does not carry source offsets. Token coordinates retain
legacy scanner limitations; this does not claim source-derived parser coverage.
Successful token/AST/compile shapes, accepted DSL, defaults, saved programs,
rendered output, and step indexes remain unchanged.

Files: shaders/src/lang/parser.js, shaders/tests/test_diagnostic_locations.js,
llms-full.txt, and this active record. No shader programs/effects or Python edits.

- [x] Prove shared-expect failures lack diagnostics through parse(lex(source))
  and compile(source), with legacy messages, EOF, multiline/UTF-16, serialization,
  and unavailable caller-token location coverage.
- [x] Add the bounded compatible parser diagnostics.
- [x] Review and run focused diagnostics, shader-language aggregate, non-parity
  JS aggregate, lint, documentation path checks, and diff hygiene.
- [x] Update only the proven register limitation; retain GAP-002 as active.
- [x] Commit, rebase, normally push, verify exact-source CI and publication.

Existing publication consequences: Shaders runs hosted and GPU suites before
bundles and Scaffold static-site/library release dispatches; generated release
tags trigger Release artifact builds. No manual dispatch or local build is needed.

### Parser Expectation Evidence

- Focused red run: 15 existing cases passed, all 11 added cases failed because
  error.diagnostic was undefined; legacy class/message assertions passed.
- Focused green run: 26 passed, 0 failed, exit 0.
- Baseline differential check against ae4e3302: 3,265 lexable mutations;
  685 accepted ASTs identical, 2,580 rejected inputs kept error class/message;
  1,809 errors gained the intended structured expectation diagnostic.
- Shader-language aggregate, ESLint, and four-case docs static-path suite
  passed with exit 0. Non-parity JS aggregate also passed, exit 0.
  Its MIDI adapter-unavailable log is an expected fixture followed by PASS.
- No local builds or shader changes. No callable Shade tools were available.
- Independent read-only review found no actionable issues; it reran the
  26-case suite and compared 16 rejected inputs and three accepted ASTs with
  ae4e3302, preserving all legacy behavior. Full-diff review and diff hygiene
  passed. Only the four planned files are changed; the 23-row open register
  remains open.
- Remaining full-gap criteria: other parser throw sites, source-derived parser
  coordinates/spans, and full-contract verification. This bounded item does
  not claim full parser diagnostic coverage.

- Implementation commit `44bc4ed4ac729bddaa95b083d64bee942ade35da`
  (`feat: expose structured parser expectation diagnostics`) pushed normally
  after an unchanged pre-push rebase.
- Exact-commit workflows passed: Shaders `35795782020`, Docs site
  `35795781884`, Site `35795781762`, and Downstream `35795782012`.
  JavaScript CI was not triggered by these paths; required local JS/lint passed.
  Inapplicable Dependabot auto-merge was skipped.
- One persistent Shaders watch exited 0 after all hosted and GPU suites,
  bundle upload, and both Scaffold dispatches passed. The uploaded shader
  artifact is nonempty, unexpired, and tied to the implementation SHA.
- Scaffold library release `35796072192` passed for the implementation SHA,
  including CDN purge. Follow-on Release `35796113305` passed under one
  sequential persistent watch, publishing `v1.0.169` with nonempty Linux,
  macOS, Windows, shader, and JavaScript assets. The remote annotated tag
  peels to exactly `44bc4ed4ac729bddaa95b083d64bee942ade35da`.

All selected parser-expectation work is complete. GAP-002 remains active for
other parser failure paths, source-derived parser coordinate/span coverage,
and full-contract verification. Continue this same gap next run.

## Current Run: Automation Argument Failures (2026-09-23)

Continue GAP-002 on the existing main checkout. Startup was clean at
`dd38fdd2baf820b112520bd024e4db8c55f09789`, with no active Git operation or
pending job-owned publication. Initial pull/rebase fast-forwarded to
`532ed64775000635e43caac085e4451c06e71afc`; upstream changes were documentation.

Bounded design: use the existing non-enumerable `error.diagnostic` contract for
all explicit argument-validation failures in `transformOscInvocation`,
`transformMidiInvocation`, and `transformAudioInvocation`. Add catalog code
P003 (invalid automation arguments). Reuse the shared parser error construction
for P001/P002 and P003; keep native SyntaxError class, exact messages, ordinary
error enumeration/JSON, accepted DSL, successful AST/compile fields and indexes,
and all defaults unchanged. P003 locations identify the invocation's name token;
invalid/missing token coordinates produce null. Spans stay explicitly null.
Token-counter limitations and other parser failure paths remain open.

Files: `shaders/src/lang/parser.js`, `shaders/src/lang/diagnostics.js`,
`shaders/tests/test_diagnostic_locations.js`, `llms-full.txt`, and this record.
No shader effects/programs, Python, or runtime changes. Shade tool discovery
found no callable tools; this bounded item is language diagnostics only.

- [x] Add public parse/compile regressions for every selected failure branch,
  both selector fields, error serialization, CRLF/tab/UTF-16 locations, missing
  caller-token coordinates, and preserved valid automation defaults/results.
  Demonstrate absent diagnostics before implementing.
- [x] Extract the existing parser diagnostic constructor, add P003, and convert
  only the selected automation failure sites without changing validation.
- [x] Review the complete diff; run focused diagnostics, shader-language and
  non-parity JS aggregates, lint, docs static-path checks, and diff hygiene.
- [x] Narrow only the proven register limitation; retain the 23 open gap rows.
- [x] Commit scoped work, pull/rebase, normally push, verify exact-source CI
  and the existing downstream publication; publish final evidence.

Publication path reviewed: Shaders runs hosted and real GPU tests, bundles,
and Scaffold static-site/library dispatches. Library publication creates the
release tag that triggers Release artifact builds. Docs site, Site, and
Downstream run for applicable paths. Preserve these existing workflows; no
local builds, manual dispatches, branches, worktrees, or PRs.


### Automation Argument Evidence

- Initial regression run exposed missing diagnostics and one incorrect column
  fixture. Checked the baseline parser and corrected column 26 to column 24.
  Replayed the corrected suite against baseline parser `532ed647`: exit 1,
  27 passed / 24 failed, all failures from missing structured diagnostics.
- Current focused suite: exit 0, 51 passed / 0 failed. It exercises all 18
  selected throw sites, both name/id branches, public parse and compile,
  serialization, invalid caller-token coordinates, and valid AST defaults.
- Baseline differential check: 2,536 inputs; 1,020 accepted ASTs and compiled
  results unchanged; 1,516 errors preserve class, message, enumeration, and
  JSON. Of those errors, 1,132 gained P003; other parser errors stayed unchanged.
- Shader-language aggregate, non-parity JavaScript aggregate, ESLint, and
  four-case documentation static-path suite all exited 0. The existing MIDI
  adapter-unavailable fixture logged its expected error and passed.
- Complete diff review and independent read-only review found no actionable
  findings. The reviewer independently passed all 51 focused cases and diff
  hygiene. Exactly the five planned files changed; 23 open-gap rows remain.
- No local builds or shader/rendering changes. GAP-002 remains active for
  other parser throw sites, source-derived parser coordinates/spans, and
  full-contract verification.

- Implementation `e32a5a4a2e1f7b20e4b0db010ad41fd3a30b396b`
  (`feat: expose structured automation argument diagnostics`) pushed normally
  after an unchanged pre-push rebase; remote main confirmed at that SHA.
- Exact-commit CI passed: Shaders `35830018106`, Docs site `35830018127`,
  Site `35830018161`, and Downstream `35830018186`. JavaScript workflow was
  not triggered by these paths; required local JS/lint checks passed.
  Inapplicable Dependabot auto-merge was skipped.
- The persistent Shaders CLI watch exited 0 after hosted/GPU suites, bundle
  upload, and both Scaffold dispatches passed. The shader artifact is nonempty
  (1,441,094 bytes), unexpired, and records the exact implementation SHA.
- Scaffold library release `35830522179` passed for the implementation SHA,
  including CDN purge. Static-site releases `35830028038` and `35830520406`
  passed for noisemaker-site at the same SHA.
- Follow-on Release `35830555378` passed under one sequential persistent
  CLI watch, publishing `v1.0.170`. Its annotated remote tag peels to the exact
  implementation SHA; all eight Linux/macOS/Windows/shader/JS assets are
  nonempty and the release is published, not a draft.

All selected automation-argument work is complete. GAP-002 remains active for
other parser failure paths, source-derived parser coordinate/span coverage,
and full-contract verification. Continue this same gap next run.

## Current Run: Search Directive Failures (2026-09-23)

Continue GAP-002. Startup was clean main at `731b76e4`; initial pull/rebase
advanced to `893a9a558ad9fc1c8ae7b9849aa3b530cbc10d94` with documentation-only
changes. No active Git operation or pending prior job publication was found.

Bounded design: attach the existing non-enumerable diagnostic contract with
P004 (invalid search directive) to the seven explicit search validation sites:
duplicate directive, invalid namespace, missing first/additional namespace,
misplaced top-level/nested directive, and missing required directive. Keep
native SyntaxError classes/messages, error JSON/enumeration, validation order,
accepted source, AST/compile shapes, defaults, and indexes unchanged. Use the
existing offending token coordinates; missing required search points to the
consumed EOF token. Invalid/missing coordinates and all spans remain null.
Source-derived parser coordinates, other throw paths, and full-gap closure
remain out of scope for this item.

Files: `shaders/src/lang/parser.js`, `shaders/src/lang/diagnostics.js`,
`shaders/tests/test_diagnostic_locations.js`, `llms-full.txt`, and this record.
No shader development; Shade discovery returned no callable tools.

Publication path: Shaders runs hosted/GPU suites, bundle packaging, and
existing Scaffold library/static-site dispatches; the library release creates
a tag triggering Release artifacts. Applicable Docs site, Site, and Downstream
checks also apply. No local builds or manual release/dispatch operations.

- [x] Prove missing diagnostics with public parse/compile regressions covering
  every selected branch, EOF, CRLF/tab/UTF-16, missing caller coordinates, and
  preserved successful namespace behavior.
- [x] Apply P004 only to the selected explicit search validation failures.
- [x] Review the complete diff and run focused, language, non-parity JS, lint,
  documentation-path, compatibility differential, and diff-hygiene checks.
- [x] Narrow the proven register limitation; retain GAP-002 and 23 open gaps.
- [x] Commit scoped changes, rebase, push normally, verify exact-source CI and
  downstream artifacts, and publish final evidence.


### Search Directive Evidence

- Baseline reproduction confirmed all seven selected explicit throw sites lack
  diagnostics. Corrected one test fixture from `ast.searchOrder` to the existing
  `ast.namespace.searchOrder` before the final red run. Corrected red run exited
  1: 52 passed / 11 failed, all failures from missing diagnostics.
- Focused green suite exited 0: 63 passed / 0 failed, exercising public parse
  and compile entry points, every selected failure branch, EOF, CRLF/tab/UTF-16
  coordinates, unavailable caller-token coordinates, error JSON/enumeration,
  and valid namespace order, keyword namespaces, duplicate namespaces, and
  compiled indexes.
- Differential test against `893a9a55`: 4,050 inputs, 741 accepted ASTs unchanged,
  3,309 rejected inputs preserving error class/message/JSON/enumeration;
  2,505 failures gained P004. Other diagnostics remained unchanged.
- Shader-language aggregate, non-parity JavaScript aggregate, ESLint, and
  four-case docs static-path suite all exited 0. The JavaScript suite's existing
  MIDI adapter-unavailable fixture logged its expected error and passed.
- Complete diff review and independent read-only review found no actionable
  findings. Independent reviewer reran all 63 focused cases and diff hygiene.
- Exactly the five planned files changed. `git diff --check` passed; the register
  retains 23 open gaps and GAP-002 stays active. No local builds or shader,
  renderer, runtime, or Python changes.
- Implementation `0766743e6fb8e7d640f7958aa1b2930544e4da22`
  (`feat: expose structured search directive diagnostics`) pushed normally
  after an unchanged pre-push rebase. Remote main confirmed at that SHA.
- Exact-source CI passed: Shaders `35878981076`, Docs site `35878981097`,
  Site `35878980896`, and Downstream `35878980941`. Shaders included hosted
  and real GPU suites, bundles, and both existing release dispatches.
  JavaScript workflow did not trigger for these paths; local JS/lint passed.
  Inapplicable Dependabot auto-merge was skipped.
- The persistent Shaders CLI watch exited 0. Its unexpired shader artifact
  records the exact implementation SHA and is nonempty (1,440,036 bytes).
- Scaffold library release `35879409666` passed for this exact SHA, including
  CDN purge. Static-site releases `35878996863` and `35879409076` passed for
  noisemaker-site; `35879019886` passed for noisemaker-docs at the same SHA.
  The site workflow's optional CDN verification/purge jobs were skipped by
  its existing conditions; no separate live CDN assertion is made here.
- Release `35879492002` passed for the implementation SHA and published
  `v1.0.171`. The remote annotated tag was independently resolved through
  GitHub's API to the exact SHA; all eight Linux/macOS/Windows/shader/JS assets
  are nonempty, and the release is neither draft nor prerelease. One
  sequential persistent CLI watch was used for each of Shaders, library
  release, and Release; all exited 0 (Release was already successful when
  watched).
- SSH remote checks later failed twice with public-key authentication errors.
  Existing GitHub CLI HTTPS credentials verified remote main and completed
  an unchanged pull/rebase using command-scoped transport configuration.
  No repository or authentication configuration was changed.

All selected search-directive work is complete. GAP-002 remains active for
other parser throw paths, source-derived parser coordinates/spans, and
full-contract verification. Continue this target on the next run.


## Current Run: Output Validation Failures (2026-09-23 evening)

Continue GAP-002. Startup: clean main at cc1ba2687f9a10d8aa8488323d155a5e0fccc338,
no active Git operation or pending job-owned publication. Initial pull/rebase
reported already up to date. The remote default branch is main and the existing
HTTPS publication path is accessible.

Bounded design: attach P005 (invalid output operation) using the existing
parserError helper at five reachable explicit validation sites: render target,
write/write3d in expression context, write surface, write3d texture, and
write3d geometry. Preserve native SyntaxError and exact messages, accepted and
rejected DSL, validation order, successful AST/compile shapes, defaults, saved
programs, rendered output, and step indexes. Location identifies the rejected
token (write keyword for expression-context rejection), or is null for missing
caller coordinates; span remains null. Token-counter limitations remain.
The unreachable duplicate-render and write-dispatch fallback throw sites are
not selected; no control-flow change is authorized by this item.

Files: shaders/src/lang/parser.js, shaders/src/lang/diagnostics.js,
shaders/tests/test_diagnostic_locations.js, llms-full.txt, and this record.
No shader programs, effects, backends, or Python changes. No callable Shade
tools were discovered; this item changes language errors only.

Publication consequences: existing Shaders hosted/GPU tests gate bundles and
Scaffold library/static-site dispatches; library tags trigger Release artifacts.
Docs site, Site, and Downstream also trigger for the selected paths. No manual
dispatch, local build, or publication-system change.

- [x] Add parse/compile regressions for all five sites, EOF, multiline/CRLF/tab/
  UTF-16 input, unavailable caller coordinates, unchanged shared-expect errors,
  and valid render/write/write3d shapes. Verify missing diagnostics fail first.
- [x] Add P005 to the catalog and replace only the five selected error constructors.
- [x] Review the complete diff; run focused diagnostics, language aggregate,
  non-parity JS aggregate, lint, docs static paths, differential compatibility,
  and diff hygiene. Fix every actionable finding.
- [x] Narrow the proven gap statement; keep GAP-002 active and the open count.
- [x] Commit scoped changes, rebase, push normally, verify exact-source CI and
  existing downstream artifacts, and publish final evidence.

Review focus: malformed caller-token coordinates, EOF targets, UTF-16 columns,
shared expectation precedence, and accepted output forms/defaults/indexes.
Full source-derived parser coordinates and remaining throw paths stay open.


### Output Validation Evidence

- Corrected the success fixture to assert the existing render result string
  (`o1`) before final red verification. Corrected red run exited 1: 65 passed /
  14 failed, all failures because error.diagnostic was missing. Legacy message
  and class checks passed, as did accepted-form and precedence compatibility.
- Focused green run: 79 passed / 0 failed, exit 0. Both parse and compile cover
  all five selected sites; EOF, CRLF/tab/UTF-16, unavailable caller coordinates,
  native error/JSON compatibility, accepted surface/reference forms, render
  selection, shared expectation precedence, and compiled indexes are covered.

- Shader-language aggregate, non-parity JavaScript aggregate, ESLint, and
  four-case docs static-path suite all exited 0. The existing MIDI adapter-
  unavailable fixture logged its expected error and passed.
- Differential verification against cc1ba268: 4,555 generated inputs, 5 lexer
  rejections excluded, 354 accepted ASTs/compile outcomes unchanged, 4,196 parser
  rejections preserving legacy class/message/JSON/enumeration, and 2,167 errors
  gaining P005. Other structured diagnostics stayed unchanged.
- Complete diff review and independent read-only review found no actionable
  issues. The independent reviewer reran 79 focused cases and diff hygiene;
  an additional 65 caller-coordinate/property-descriptor checks passed.
- Only the five planned files changed. Diff hygiene passed; 23 open gap rows
  remain. GAP-002 is active for remaining parser throw paths, source-derived
  coordinates/spans, and full-contract verification. No local builds ran.

### Output Validation Publication Reconciliation (2026-09-24)

- The previous run stopped before pushing because concurrent unrelated edits
  made the checkout unsafe. Its corrected scoped commit was
  `7a54ab3856d71ce037f11215572e8137ad4f53c0`; no unrelated work was published by
  that run. This run verified all five retained commit blobs against its
  checkpoint and reviewed the complete diff again with no actionable findings.
- Startup was clean main at `285e50f538371ffa1ed5656821a417fef36e7c5c`, with no
  active Git operation or local-only commits. Initial pull/rebase was unchanged.
  Remote main already contained the implementation through published tip
  `c9ee8a049b2b63cd300da67c01ee40baf29dc288`. The only changes between the
  implementation and that tip were `LEDGER.md` and `llms-full.txt`; shader
  sources, tests, dependency manifests, scripts, and workflows were identical.
- There are no CI runs for ancestor `7a54ab38` itself. Exact published-tip CI at
  `c9ee8a04` passed: [Shaders 35958155355](https://github.com/noisefactorllc/noisemaker/actions/runs/35958155355),
  [Docs site 35958155293](https://github.com/noisefactorllc/noisemaker/actions/runs/35958155293),
  [Site 35958155325](https://github.com/noisefactorllc/noisemaker/actions/runs/35958155325),
  and [Downstream 35958155287](https://github.com/noisefactorllc/noisemaker/actions/runs/35958155287).
  Shaders passed hosted tests, GPU tests, bundles, and both release dispatches.
  Its exact-SHA artifact was nonempty (1,441,592 bytes) and unexpired.
- [Scaffold library release 35958426549](https://github.com/noisefactorllc/scaffold/actions/runs/35958426549)
  passed for `c9ee8a04`, including successful purge of all seven CDN edges.
  Scaffold static-site runs `35958166180` and `35958425307` passed for
  noisemaker-site; `35958182265` passed for noisemaker-docs at that same SHA.
  No separate current live-site or live-CDN assertion is made.
- [Release 35958467661](https://github.com/noisefactorllc/noisemaker/actions/runs/35958467661)
  passed. The `v1.0.176` annotated tag resolves to exactly `c9ee8a04`; all eight
  expected desktop, shader, and JavaScript assets are nonempty. The release is
  neither draft nor prerelease. One sequential `gh run watch --exit-status`
  process for each of Shaders, library release, and Release exited 0; all had
  already completed successfully. No manual dispatch or release was performed.
- Fresh local verification on unchanged engine sources: focused diagnostics
  79/79, shader-language aggregate, non-parity JavaScript aggregate, ESLint,
  and documentation paths 4/4 all passed. The expected MIDI adapter-unavailable
  fixture passed. JavaScript CI was not triggered by the published paths;
  inapplicable Dependabot auto-merge was skipped. No local builds ran.

The prior output-validation implementation and publication are verified. This
run completes its evidence record only. GAP-002 remains active for other parser
throw paths, source-derived coordinates/spans, and full-contract verification.


## Current Run: Structured Subchain Failures (2026-09-24)

Bounded design: add P006 (invalid subchain) through the existing parserError
helper at the three explicit parseSubchainCall validation sites. Invalid string
values and missing body dots use the rejected token, including EOF. Empty bodies
use the invocation token. Preserve native SyntaxError messages, JSON/enumeration,
accepted AST/compile shapes, defaults, indexes, and shared-expectation precedence.
Locations retain the existing positive-integer token coordinate contract; unknown
locations and source spans remain null. This does not tighten subchain argument
keys, separators, or duplicates and does not close GAP-027.

Files: shaders/src/lang/parser.js, shaders/src/lang/diagnostics.js,
shaders/tests/test_diagnostic_locations.js, llms-full.txt, and this record.

- [x] Add regressions through parse and compile for all three sites, EOF,
  comments, CRLF/tab/UTF-16, unavailable caller coordinates, legacy error shape,
  shared-expectation precedence, and accepted subchain arguments/body/indexes.
  Verify the new diagnostic assertions fail before implementation.
- [x] Add P006 and replace only the three selected SyntaxError constructors.
- [x] Review the entire diff; run focused diagnostics, language aggregate,
  non-parity JavaScript, ESLint, documentation paths, compatibility differential,
  and diff hygiene; correct actionable findings.
- [x] Narrow the proven GAP-002 statement without closing it or GAP-027.
- [x] Commit scoped work, rebase, push normally, verify exact-source CI and
  existing downstream artifacts, and publish final evidence.

Review focus: EOF targets; invocation location for empty/comment-only bodies;
malformed caller coordinates; shared expectation precedence; preserved unknown
keys, optional commas, duplicate overwrite behavior, defaults and step indexes.

Startup: clean main at 9928905a; no active Git operation or local-only commits;
initial pull/rebase unchanged. Prior publication is complete. Existing workflows
trigger Shaders, Docs site, Site and Downstream for these paths, with shader
bundle, scaffold library/site dispatches, and the resulting tagged Release.
The configured GitHub actor has push access and existing dispatch secrets are
present. No callable Shade tools were discovered; this is language diagnostic
work, with no shader programs, effects, or renderer changes.


### Subchain Validation Evidence

- Corrected the accepted fixture to use a registered filter instead of a
  starter-only effect before final red verification. Corrected red run exited
  1 with 81 passed / 10 failed; every failure was a missing diagnostic.
- Focused green run: 91 passed / 0 failed, exit 0. Both parse and compile cover
  all three explicit sites, EOF, comment-only bodies, CRLF/tab/UTF-16 text,
  unavailable caller coordinates, native error properties/JSON, shared error
  precedence, accepted permissive arguments, defaults, and compiled indexes.
- Shader-language aggregate, non-parity JavaScript aggregate, ESLint, and
  documentation paths (4/4) exited 0. No local builds ran.
- Differential verification against 9928905a: 6,741 generated inputs; 165 lexer
  rejections excluded, 126 accepted ASTs unchanged, 6,450 parser rejections
  preserving legacy class/message/JSON/enumeration, and 3,459 errors gaining
  P006. Other structured diagnostics remained identical.
- Complete five-file diff reviewed; diff hygiene passes and 23 open gap rows
  remain. GAP-002 and GAP-027 stay open. Independent review found no actionable
  findings and passed 91 focused tests plus 80 additional baseline compatibility,
  coordinate, EOF/comment and precedence checks. Publication verification is
  recorded below. The expected MIDI adapter-unavailable fixture passed.


### Subchain Validation Publication

- Implementation `13fa8b54002539df71ceffa34b4d894cb0a4573d`
  (`feat: expose structured subchain validation diagnostics`) contains only the
  five reviewed files. Pre-push pull/rebase did not change tested sources.
  Normal push succeeded and independent remote inspection confirmed the SHA.
- Exact-source [Shaders 36017840363](https://github.com/noisefactorllc/noisemaker/actions/runs/36017840363),
  [Docs site 36017840357](https://github.com/noisefactorllc/noisemaker/actions/runs/36017840357),
  [Site 36017840320](https://github.com/noisefactorllc/noisemaker/actions/runs/36017840320),
  and [Downstream 36017840207](https://github.com/noisefactorllc/noisemaker/actions/runs/36017840207)
  all passed. Shaders passed hosted tests, GPU tests, bundle creation and both
  release dispatches. Its exact-SHA artifact is nonempty (1,440,051 bytes) and
  unexpired. JavaScript CI was not triggered by these paths; local JS and lint
  passed. Inapplicable Dependabot auto-merge was skipped.
- [Scaffold library release 36018297071](https://github.com/noisefactorllc/scaffold/actions/runs/36018297071)
  passed for the exact implementation SHA, including 7/7 CDN edge purges.
  Static-site runs [36017859777](https://github.com/noisefactorllc/scaffold/actions/runs/36017859777)
  and [36018294941](https://github.com/noisefactorllc/scaffold/actions/runs/36018294941)
  passed for noisemaker-site, and [36017877111](https://github.com/noisefactorllc/scaffold/actions/runs/36017877111)
  passed for noisemaker-docs at the same SHA. Their optional CDN jobs were skipped
  by existing conditions; no separate live-site assertion is made.
- [Release 36018361328](https://github.com/noisefactorllc/noisemaker/actions/runs/36018361328)
  passed. The annotated `v1.0.177` tag resolves exactly to the implementation SHA.
  All eight expected desktop, shader, and JavaScript assets are nonempty; the
  release is neither draft nor prerelease. Shaders, library release and Release
  each used one sequential persistent `gh run watch --exit-status` process,
  all exiting 0. No manual dispatch or release was performed.

All selected subchain work is complete. GAP-002 remains active for remaining
parser throw paths, source-derived parser coordinates/spans and full-contract
verification. The gap register retains 23 open gaps, including GAP-027.


## Current Run: Remaining Parser Throw Paths (2026-09-24)

Bounded design: structure every remaining parser throw path through the
existing parserError helper, completing parser diagnostic coverage. Add P007
(invalid call expression) for the `from()` argument-validation `fail()` helper
(five explicit branches), the forbidden inline namespace syntax, and both
mixed positional/keyword argument sites. Reuse P001 for the remaining
token-expectation failures: missing expressions after `=` (VarAssign and
keyword arguments), missing array-closing brackets, non-identifier member
segments after `.`, unexpected primary tokens, and number coercion. Number
coercion locates the offending AST node's parser-authored `loc` when present
and is explicitly null otherwise. Attach P005 to the two unreachable
defense-in-depth sites (duplicate render directive and write/write3d dispatch
fallback) for contract completeness; they are unreachable through public
`parse`/`compile`, so no public regression can target them and control flow is
unchanged. Preserve native SyntaxError classes, exact messages, ordinary error
enumeration/JSON, accepted DSL, AST/compile shapes, defaults, indexes, and
shared-expectation precedence. Spans stay explicitly null; token-counter
location limitations remain. GAP-002 stays active for the full-contract
verification and closure decision.

Files: shaders/src/lang/parser.js, shaders/src/lang/diagnostics.js,
shaders/tests/test_diagnostic_locations.js, llms-full.txt, and this record.
No shader programs, effects, backends, or Python changes.

- [x] Add parse/compile regressions for all reachable selected sites, EOF,
  CRLF/tab/UTF-16, unavailable caller coordinates, explicit null locations for
  number coercion, legacy error shape/JSON/enumeration, shared-expectation
  precedence, and preserved valid `from()` overrides and mixed automation
  arguments. Demonstrate missing diagnostics against the baseline first.
- [x] Add P007 to the catalog and convert the thirteen remaining raw
  SyntaxError constructor sites without changing validation or messages.
- [x] Review the entire diff; run focused diagnostics, language aggregate,
  non-parity JavaScript, ESLint, documentation paths, dependency install,
  compatibility differential, and diff hygiene.
- [x] Narrow the proven GAP-002 statement; retain GAP-002 and 23 open gaps.
- [ ] Commit scoped work, rebase, push normally, verify exact-source CI and
  existing downstream artifacts, and publish final evidence.


### Remaining Parser Throw Path Evidence

- Startup: clean main at 13853df matching the gap revision; no active Git
  operation or pending job-owned publication. A missing local node_modules
  tree was restored with the check-defined
  `npm ci --bin-links=false --ignore-scripts --no-audit --no-fund` (exit 0).
- Baseline probes confirmed all thirteen raw sites, including that
  `parseWriteCall()` is only entered for WRITE/WRITE3D tokens and that the
  statement loop breaks after consuming `render()`, making the two defense-in-
  depth sites unreachable through public entry points.
- Focused red run against the baseline parser (stash-verified): exit 1,
  92 passed / 18 failed; every failure was a missing diagnostic and all legacy
  class/message assertions passed.
- Focused green run: exit 0, 110 passed / 0 failed. New coverage includes all
  four reachable `from()` branches, inline namespace syntax, both mixed-
  argument branches, both expression-after-`=` sites, closing brackets,
  member-segment expectations, unexpected primary tokens, number coercion with
  explicit null locations, CRLF/tab/UTF-16 columns, unavailable caller
  coordinates, non-enumerable property descriptors, and valid `from()` override
  plus midi mixed-argument shapes.
- Differential verification against 13853df: 8,000 generated inputs; 89
  accepted ASTs identical; 7,911 rejections preserving legacy class, message,
  enumeration, and JSON; 2,591 errors gained structured diagnostics (P007
  1,307, P001 1,284); zero mismatches. No P005/P006 regressions and the two
  unreachable sites were never observed, as expected.
- Shader-language aggregate, non-parity JavaScript aggregate, ESLint, and the
  four-case documentation static-path suite all exited 0. `git diff --check`
  passed; the register retains 23 open gaps and GAP-002 stays active.
- No local builds, shader, renderer, runtime, or Python changes.


## Current Run: Numeric Coercion Source Positions (2026-09-25)

Independent verification of the coordinate-repair candidate found one remaining
important defect: `toNumber()` passed the offending AST node's legacy `loc`
into `parserError`, and `ArrayLiteral.loc` is built from legacy token counters,
so numeric-coercion diagnostics still reported drifted non-null coordinates
after multiline function tokens (line 2/column 33 instead of source line
3/column 16, 2/37 instead of 3/20, and 2/34 instead of 3/17). The indirect
AST-to-diagnostic path dropped the source provenance that tokens now carry.

Bounded repair: the array-literal AST node carries its bracket token's
source-derived position as a non-enumerable private field alongside the
unchanged public `loc` shape, and `toNumber()` prefers that position, falls
back to the node's parser-authored `loc`, and stays explicitly null when
neither carries valid coordinates. An audit of other diagnostic sites found
no further reconstruction or dropped positions: every other `parserError`
site receives a lexer token directly, and the two unreachable defense-in-depth
sites pass token-derived coordinates. Legacy messages, accepted/rejected DSL,
public token/AST/compile shapes, enumeration, and JSON serialization are
unchanged.

Files: shaders/src/lang/parser.js, shaders/tests/test_diagnostic_locations.js,
llms-full.txt, and this record. No shader programs, effects, backends, or
Python changes.

- [x] Reproduce all six control and drift coercion cases through parse and
  compile with the operator's exact expected coordinates, and verify the
  red failures against the pre-repair parser.
- [x] Repair the indirect path with private node provenance and add
  regressions with the source-coordinate oracle, the public-shape/
  non-enumerability check, and the preserved explicit-null cases.
- [x] Audit all diagnostic sites for reconstructed or dropped positions.
- [x] Run the required checks, compatibility differential, and diff hygiene.
- [x] Commit the scoped forward correction, rebase, push normally, and record
  exact-source CI and deployment verification after publication.


### Numeric Coercion Repair Evidence

- Red run against the pre-repair parser (stash-verified): 115 passed / 7
  failed; every failure was one of the six new coercion regressions (drifted
  locations or missing spans) or the provenance shape check.
- Green run: 122 passed / 0 failed, exit 0. All six operator cases produce
  exactly {line 3, column 16}, {line 3, column 20}, and {line 3, column 17}
  with bracket-token source spans {45,46}, {49,50}, and {46,47}, and the
  no-drift controls keep {2,9}, {2,13}, and {2,10}, through both
  parse(lex(source)) and compile(source).
- Differential verification against published 9fa1a22 (engine identical to
  3923222): 8,000 generated inputs now including array-coercion forms; 99
  accepted ASTs identical; 7,901 rejections preserving legacy class, message,
  and empty enumeration; 7,547 parser errors carry valid source-derived spans
  matching the independent oracle; 546 locations corrected from drifted
  coordinates; zero mismatches.
- Shader-language aggregate, non-parity JavaScript aggregate, ESLint, the
  four-case documentation static-path suite, and `git diff --check` all
  exited 0. No local builds, shader, renderer, runtime, or Python changes.

## Current Run: Source-Derived Parser Coordinates (2026-09-25)

Independent verification rejected the draft closure of the previous run: it
treated known token-counter drift after multiline function tokens and escaped-LF
strings as an acceptable documented convention, contradicting the acceptance
criterion requiring reliable source coordinates for parser failures. Two exact
probes showed parse(lex(source)) and compile(source) reporting line 2/column 32
instead of source line 3/column 15, and line 2/column 24 instead of line
3/column 12. The unpushed draft closure commit was discarded and GAP-002 stayed
open until this repair.

Bounded design: the lexer attaches a non-enumerable `position` to every token
it emits, recording one-based source `line`/`column` and the zero-based
half-open source span, computed with the same UTF-16/LF-only convention as
lexer failure diagnostics by an offset-anchored walk that is independent of
the legacy position counters. `parserError` prefers that position: parser
diagnostic `location` becomes source-derived and `span` becomes the token's
source span. Tokens supplied by callers without a position fall back to their
own positive-integer `line`/`col` with an explicitly null span (previous
behavior), and tokens without valid coordinates produce null locations.
Legacy `SyntaxError` classes and messages, including the historical
token-counter text inside messages, are unchanged. Successful tokens keep
their public shape (`position` is non-enumerable), as do AST/compile shapes,
defaults, and indexes. GAP-002 is re-closed only after this run's checks and
exact-commit CI pass.

Files: shaders/src/lang/lexer.js (position metadata and add() call sites),
shaders/src/lang/parser.js (parserError coordinate preference),
shaders/tests/test_diagnostic_locations.js, llms-full.txt, and this record.
No shader programs, effects, backends, or Python changes.

- [x] Reproduce both drift probes through parse and compile with exact
  expected source coordinates before implementing.
- [x] Add the non-enumerable token positions and source-derived parser
  diagnostics without changing messages, accepted/rejected DSL, or public
  shapes.
- [x] Review the entire diff; run focused diagnostics, language aggregate,
  non-parity JavaScript, ESLint, documentation paths, compatibility
  differential, and diff hygiene.
- [x] Correct the public contract documentation and this record truthfully,
  including the withdrawn draft-closure claim.
- [x] Commit, rebase, push normally, verify exact-source CI, and record the
  closure evidence.


### Source-Derived Parser Coordinate Evidence

- Red run: both operator probes failed before implementation, showing drifted
  locations {line 2, column 32} and {line 2, column 24} instead of the source
  positions {line 3, column 15} and {line 3, column 12}.
- Green run: both probes produce exactly {line 3, column 15} and {line 3,
  column 12} with source spans {44,46} and {36,38} through parse(lex(source))
  and compile(source); legacy messages are byte-for-byte unchanged.
- Focused suite: 115 passed / 0 failed, exit 0. New coverage includes both
  drift regressions, an independent source-walk oracle verifying every token
  position against computed line/column for multiline constructs (FUNC,
  escaped LF, CRLF, tabs, UTF-16, multiline comments, triple-quoted strings,
  subchains), non-enumerable position descriptors with JSON round-trip, and
  the caller-token fallback (valid line/col without position keep token
  coordinates with null span). The pre-existing table expectations now assert
  exact source-derived spans via the same oracle helper.
- Differential verification against published 4891b99: 8,000 generated inputs;
  116 accepted ASTs identical; 7,884 rejections preserving legacy class,
  message, and empty enumeration; 7,577 parser errors carry valid source-
  derived spans whose locations match the independent oracle; 268 locations
  corrected from drifted token coordinates to source-derived values; zero
  mismatches. Lexer diagnostics are unchanged in shape.
- Shader-language aggregate, non-parity JavaScript aggregate, ESLint, and the
  four-case documentation static-path suite all exited 0. `git diff --check`
  passed.
- No local builds, shader, renderer, runtime, or Python changes.


### Full-Gap Closure (2026-09-25)

- Objective completion criteria, all verified with published evidence:
  1. Stable machine-readable contract: every lexer failure exposes L001-L004
     diagnostics with source-derived locations and spans; every parser throw
     path (shared expectations, automation, search, output, subchain, call
     forms, and both defense-in-depth sites) exposes P001-P007 with
     source-derived coordinates and spans for lexer-produced tokens. No
     failure requires parsing message text.
  2. Defined public coordinate convention with reliable coverage: one-based
     line/column in UTF-16 code units, LF-only line breaks, CR/tab one
     column, zero-based half-open spans, source-derived lexer coordinates,
     source-derived parser coordinates via non-enumerable token positions,
     caller-token fallback, and explicit null locations/spans where no source
     position exists. Documented in `llms-full.txt`.
  3. Semantic diagnostics preserve parser-provided columns with caller and
     unlocated compatibility (completed at `e5bd2013`).
  4. Regressions: 122 focused cases across public `lex()`, `parse()`, and
     `compile()`, each contract branch demonstrated red before
     implementation, plus differential checks of up to 25,000 generated
     inputs against baselines with zero legacy behavior changes.
  5. All required local checks and exact-commit CI passed for every earlier
     bounded implementation in this record; the coordinate-repair and numeric-
     coercion repair commit
     `fca611fd8f91424661d4e531d39313d24ea21134` passed all seven declared
     local checks, its own exact-commit CI (below), and the site deployment
     verification (below).
- Implementation publication: `4891b9953f9fd8a61cf9ae0dda2fe747a9be82df`
  (`feat: expose structured call-form and expectation diagnostics`) was pushed
  to `refs/heads/main` and machine-verified (review
  `64ede8eb-8340-44cb-8361-db914f5feaa9`). Exact-commit CI passed: Shaders
  `36086042048`, Docs site `36086042055`, Site `36086042037`, Downstream
  `36086042178`, and Release `36086653725` for tag `v1.0.178`, which contains
  exactly that SHA. The `noisemaker-site` deployment serves it at
  https://noisemaker.app/.
- Publication of the coordinate repair and numeric-coercion repair:
  `fca611fd8f91424661d4e531d39313d24ea21134` was pushed to `refs/heads/main`
  and machine-verified (review `08c78d73-301c-4b38-8291-ec68f87c6d72`,
  verified 2026-09-25T03:48:37.055Z). All seven declared checks passed
  (dependencies, diagnostic-locations, shader-language, non-parity
  JavaScript, lint, docs static paths, diff hygiene). Exact-commit CI passed:
  Shaders `36091601774`, Docs site `36091601761`, Site `36091601784`, and
  Downstream `36091601748`. The `noisemaker-site` deployment serves
  `fca611fd8f91424661d4e531d39313d24ea21134` at https://noisemaker.app/.
- The open-gap register in `llms-full.txt` lists 22 open gaps with the GAP-002
  row removed; GAP-027 remains open.

GAP-002 is closed. The closure is published and machine-verified:
`fca611fd8f91424661d4e531d39313d24ea21134` passed independent review, all
required local checks, exact-commit CI, and the declared deployment
verification, completing every objective completion criterion with published
evidence.
