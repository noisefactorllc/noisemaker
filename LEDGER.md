# Out-of-Band Ledger

Some layers of the platform are allowed to lag behind feature work: the
primary development pass ships the feature, and a separate catch-up pass
tops these layers off later. This file is the checkpoint record for those
passes.

Each section records:

- **Checkpoint** — the commit (SHA, date) through which the category is
  known to be caught up. "Caught up through X" describes what was audited,
  not where the fix landed. Cross-repo categories list one checkpoint per
  repo.
- **Scope** — what the pass owns.
- **Gap detection** — how to compute outstanding work since the checkpoint.
- **Log** — one line per completed pass, newest first.

Running a catch-up pass: compute the gap over `<checkpoint>..HEAD`, do the
work, verify it, then update the checkpoint and append a log line.

## I18n strings

- **Checkpoint:** noisemaker `da1b6985` / noisedeck `73538a8f` (2026-09-17)
- **Scope:** two translation surfaces:
  - Noisemaker effect catalogs
    `shaders/effects/strings.{de,es,fr,it,ja,pt}.json`. The English catalog
    `strings.en.json` is generated from effect definitions (`npm run strings`)
    and drift-tested by `npm run test:shaders:i18n`.
  - Noisedeck UI catalogs under
    `app/js/i18n/locales/{de,es,fr,it,ja,pt}/`. The matching `en/` slices are
    the hand-authored source of truth.
  Missing locale keys fall back to English at runtime, so gaps on both
  surfaces are invisible without the checks below.
- **Gap detection:**
  1. Noisemaker — every key present in `strings.en.json` and absent from a
     locale file needs a translation. From `shaders/effects/`:

     ```
     node -e 'const fs=require("fs");const en=Object.keys(JSON.parse(fs.readFileSync("strings.en.json","utf8")));for(const l of["de","es","fr","it","ja","pt"]){const t=new Set(Object.keys(JSON.parse(fs.readFileSync("strings."+l+".json","utf8"))));const m=en.filter(k=>!t.has(k));if(m.length)console.log(l+":",m.join(", "))}'
     ```

     Keys stay in the same (sorted) order as the English catalog. Match each
     locale's existing conventions — parameter labels lowercase, effect names
     capitalized, description tone per locale — and reuse the file's existing
     translation for a term before inventing a new one. Run
     `npm run test:shaders:i18n` to enforce exact key order and non-empty values
     across all six translated catalogs, in addition to generated-English drift
     and runtime fallback behavior.
  2. Noisedeck — from its repository root, run the catalog-parity test. Its
     diff names every missing or extra leaf key by locale:

     ```
     node --test --test-timeout=60000 tests/i18n.node-test.js
     ```

     Add keys to the matching area slice in English order. The test enforces
     non-empty string values plus every placeholder, plural leaf, and markup tag
     from the English catalog.
- **Log:**
  - 2026-09-17 — caught up through noisemaker `da1b6985` / noisedeck
    `73538a8f`: audited noisedeck range `47b145e0..73538a8f` (covering Tearoff
    #194 trigger `adef85dd`) and noisemaker `c68fb3c8..da1b6985`. The only UI string
    addition in the range (`menus.app.downloadApp` in `adef85dd`) was already
    translated in all six UI locales (`de`, `es`, `fr`, `it`, `ja`, `pt`);
    all 3,689 Noisemaker effect strings remain in exact key parity with zero
    missing keys across all six translated catalogs. Verified via Noisemaker
    gap detection, `npm run test:shaders:i18n` (5/5), Noisedeck's
    `tests/i18n.node-test.js` (6/6), `export-dialog-i18n`,
    `standalone-account-menu`, and the Noisemaker JS test suite (58/58 passed).
    No catalog edits were required.
  - 2026-09-16 — caught up through noisemaker `c68fb3c8` / noisedeck
    `47b145e0`, closing the gap left by incomplete Tearoff #156 (below) as
    well as this task's own nominal range (noisemaker `ff1bfbc1..c68fb3c8`,
    noisedeck `458f7758..47b145e0`) — audited from the stale checkpoint
    forward rather than trusting #156's own narrative, per this file's
    "audit the target's actual state" rule. Both gap-detection commands
    came back clean: the noisemaker key-diff found zero missing keys in any
    of the six locales, and noisedeck's `tests/i18n.node-test.js` passed
    6/6 with no catalog-parity failures. Spot-checked that the round's three
    new effects (`synth3d/heightmap3d`, `render/renderLandscape3d`,
    `points/heightGrid`) already carry real, non-empty translations across
    all six noisemaker locales (e.g. `synth3d/heightmap3d` →
    "Höhenkarte 3D" / "Mapa de alturas 3D" / "Carte de hauteur 3D" /
    "Mappa di altezza 3D" / "3D高さマップ" / "Mapa de altura 3D"), not just
    present-but-empty stand-ins. `npm run test:shaders:i18n` passed 5/5.
    No translation work was needed on either surface — #156's own catalog
    work (3,689 English keys, all six locales complete) was already correct
    and complete; only this checkpoint had never been advanced to reflect
    it. #156's Log entry below is left untouched; its remaining
    non-i18n items (browser/runtime fixes) are outside this section's scope.
  - 2026-09-12 — Tearoff #156 remains incomplete. Audited Noisemaker
    `7d6cc7127457..ff1bfbc1740c` and Noisedeck
    `94f4d0021133..458f77583394`. Removed four obsolete landscape-control
    keys from all seven effect catalogs. All six translations contain all
    3,689 English keys. Noisedeck requires no catalog changes.
    Corrected Noisedeck's audio fixtures, cache teardown handling,
    browser-specific clipboard permissions, and Remap test interactions.
    Bounds checks use the accepted pointer coordinates and still require
    exact uniform values. Its latest Node suite reported 873 passes, one existing
    conditional skip, and no failures. All 40 Chromium audio tests passed.
    Affected browser checks reported 120 passes and three existing skips
    across Chromium, Firefox, and Linux WebKit with a virtual display.
    The WebKit viewport test exceeded its 45-second budget with two CPUs,
    then passed in 42.4 seconds with four CPUs and unchanged assertions.
    The full browser suite then exposed a Noisemaker state-expression
    serialization defect. The compiler and unparser fix passed the language,
    runtime, i18n, prescribed JavaScript, and parity-evidence checks.
    Browser replay of seed `110457923` passed all 500 mutations against
    the fixed source, with no skipped mutations. The published engine
    still needs this fix before the full browser suite can complete.
    Both I18n checkpoints remain unchanged. The operator authorized
    autonomous publication. The compiler fix is pushed as `c68fb3c8`.
    Shader CI exposed the same Linux landscape pixel failure as `ff1bfbc1`.
    A same-size WebGPU presentation copy was interpolating adjacent texels.
    A focused GPU regression failed before selecting the nearest sampler
    for same-size copies, then passed on Mac and Linux. Scaled copies still
    use linear filtering. The Linux landscape camera test now passes exact
    cross-backend parity. Setting the existing test resolution before the
    first run also resolved the controls audit timeout; all 100 Linux audit
    cases passed. Mac camera parity, runtime, JavaScript, and all registered
    parity evidence checks passed. The follow-up fix is pushed as `9a31314c`.
    Its CI camera checks passed, but the controls audit timed out on WebGPU.
    A second CI run with diagnostics (`b02b42ec`) instead timed out during
    initial editor loading. The audit now starts with a simple program,
    selects the required 256x256 resolution, and uses a separate 60-second
    compilation wait. Its five-second UI action limit and exact pixel checks
    remain unchanged. This test fix is pushed as `5fea6395`; all 100 local
    Linux audit cases passed. Its CI run was canceled after repeated
    control timeouts; it did not pass. Further harness inspection found
    that loading the reference page started an unrelated asynchronous
    homepage renderer. The reference now uses an empty same-origin fixture.
    The editor selects its test resolution before its first frame and stops
    before each program change. A full audit of these changes is in progress.
    That audit passed 69 cases, then rapid WebGPU mode changes settled on
    the older selection. A completed compile callback was restoring its old
    DSL state while a later compile was queued. The UI now lets only the latest
    request restore controls and report completion. A deterministic regression
    failed before the fix and passed afterward. All 100 browser audit cases
    then passed with unchanged source hashes. Language, runtime, i18n, and lint
    checks passed. The fix is pushed as `bb158566`. Its CI passed the
    earlier gates, then timed out waiting for screenshot stability within five
    seconds. The capture now brings the editor forward and has a separate
    30-second deadline; its pixel checks and control-action limits are unchanged.
    All four focused presentation cases passed. This harness fix is pushed as
    `6f60c815`. Its CI reached the same screenshot stability timeout at 30
    seconds. The audit now captures the visible canvas rectangle and explicitly
    verifies unchanged geometry across capture. All four presentation cases
    passed. This change is pushed as `f37bd787`; exact-commit CI and shader
    release verification remain pending.
    A Noisedeck browser preflight passed 211 cases before exposing obsolete
    startup-carousel assertions. Startup now shows static resource slides;
    its tests now verify paging and no preview canvases. The gallery retains
    its live-context checks. All 15 focused cases passed across Chromium,
    Firefox, and Linux WebKit. Full released-engine validation is pending.
    A later preflight exposed a cached HTTP 429 for a Godot kit file that
    currently returns HTTP 200. The shared test cache now stores only successful
    responses and lets waiting requests recover after an uncacheable error.
    All five cache regressions passed, including stale-error recovery and lock
    contention. The real Godot archive-cancellation test then passed.
  - 2026-09-18 — verified the state left by the entry above. All seven
    noisemaker fixes (`c68fb3c8` through `f37bd787`) are merged to main;
    CI has passed on every push since, most recently `688c5146`. The
    noisedeck fixes (origin-cache eviction of uncacheable responses,
    disposed-response handling after page close, browser-specific
    clipboard grants, pointer-rounding tolerance in the remap bounds
    checks, and the resource-carousel test rewrite) are committed on
    `preview` at `c48fe396`: full node suite 1046/1047 (one pre-existing
    skip), Chromium 73/73 (one pre-existing skip), Firefox clipboard fix
    passing. WebKit did not run locally — this machine's Playwright
    WebKit build is frozen and rejects a protocol setting Playwright now
    sends, unrelated to the change — so it still needs its usual Linux
    CI pass once pushed. This closes out the remaining non-i18n items
    from the 2026-09-12 entry; nothing from that entry is still open.
  - 2026-09-07 — caught up through noisemaker `d30d1045` / noisedeck
    `94f4d002`: audited all 20 live-capture settings, status, permission,
    recording-limit, and export-warning strings; all six UI translations
    were already complete. All six effect catalogs retain all 3,639 English
    keys. Generated-English drift, key order, placeholders, markup, fallback,
    and locale checks passed, along with Noisedeck's full 806-test Node suite
    and both affected toolbar/settings browser tests. No catalog edits were
    required.
  - 2026-09-07 — caught up through noisemaker `d30d1045` / noisedeck
    `00cb87d2`: all six effect catalogs contain all 3,639 English keys.
    Audited the new Remap editor and MIDI CC, NRPN, MPE, and audio-channel
    copy plus the removed Sync retry string; all six UI locales were already
    complete. Generated-English drift, exact key order, non-empty values,
    placeholders, markup, fallback, and async locale checks passed, as did
    Noisedeck's full 806-test Node suite. No catalog edits were required.
  - 2026-09-03 — caught up through noisemaker `691eea16` / noisedeck
    `0f3917fb`: verified that the updated Cell description is present in all six
    translated effect catalogs and that Noisedeck's insert-zone, MIDI-device,
    and audio-device strings are translated in all six UI locales. Revalidated
    exact key order, non-empty values, placeholders, markup, generated-English
    drift, runtime fallback, and async locale selection; no catalog edits were
    required in this pass.
  - 2026-08-31 — caught up through noisemaker `c38316a1` / noisedeck
    `114d64f7`: Noisemaker's generated English catalog and all six translated
    effect catalogs remained complete. Noisedeck's translations for unloaded
    user effects, storage save failures, and paid-feature load failures were
    present in all six locales; revalidated exact key parity, non-empty values,
    placeholders, markup, and async locale selection. No catalog edits were
    required in this pass.
  - 2026-08-29 — caught up through noisemaker `19c15cc0` / noisedeck
    `eb3c3de6`: Noisemaker's generated English catalog and all six translated
    effect catalogs were already complete; added 312 Noisedeck translations
    (52 new UI leaves in each of six locales) for shader-pipeline export,
    collaboration, completion, save-failure, and unloaded-user-effect copy.
    Added durable Noisemaker key-order/non-empty-value checks and Noisedeck
    key-order, non-empty-value, placeholder, and markup integrity checks.
  - 2026-08-19 — caught up through `1ee891a2`: audited the i18n
    catch-up range; the English catalog was unchanged and all six locale
    catalogs remain complete, so no additional translations were needed in
    this pass.
  - 2026-08-14 — caught up through `712ac2cf`: audited the i18n
    catch-up range; the English catalog was unchanged and all six locale
    catalogs are now complete, so no additional translations were needed in
    this pass.
  - 2026-08-14 — catch-up, 1,566 strings: 261 missing keys across all six
    locales, covering the new and expanded `filter/chrome` through
    `filter/wind` effect blocks.
  - 2026-07-10 — initial top-off, 37 strings: `filter/parallax` block
    (5 keys, de/fr/it/ja/pt), `filter/dither.type.errorDiffusion` and
    `filter/lighting.heightMap` (all six locales).

## Large-format tiling

- **Checkpoint:** noisemaker `ff1bfbc1` / noisedeck `dacd2046` (preview
  branch), 2026-09-15
- **Scope:** every effect must be classified for Noisedeck's large-format
  (tiled print) export. Tile-aware effects consume the global `tileOffset`
  and `fullResolution` uniforms in both GLSL and WGSL when their coordinates
  depend on the full canvas (packed WGSL layouts may need explicit
  `uniformLayout` slots); purely local kernels are also safe when their
  maximum source footprint fits inside the 1024 px overlap. Effects that
  cannot render tiled belong in one of noisedeck's deny-lists:
  `app/js/utils/hasStatefulEffects.js` (state textures cannot re-render at
  print resolution) or `app/js/utils/hasUpscaleOnlyEffects.js` (would seam
  at the 1024 px tile overlap). An effect in none of the three states
  silently produces seamed prints.
- **Gap detection:** list effects added since the checkpoint
  (`git log --diff-filter=A --name-only <checkpoint>..HEAD -- 'shaders/effects/*/*/definition.js'`)
  and classify each: make it tile-aware, or route it into the appropriate
  deny-list. Verify tile-aware claims with noisedeck's seam harness
  (`tests/large-format-seams/`).
- **Log:**
  - 2026-09-15 — caught up through noisemaker `ff1bfbc1`: classified the
    perspective/depth-sort/defocus round's 3 new and 7 changed effects.
    `points/heightGrid` (new: writes agent state via MRT like the other
    `points/*` behaviors already listed) needed a new
    `hasStatefulEffects.js` entry, mirrored in the seam harness's
    `enumerator.js`. The other 9 needed no routing change: `synth3d/
    heightmap3d` (new) is a volume-atlas bake pass upstream of the canvas
    tile boundary, the same structural class already documented for
    `palette3d`; `render/renderLandscape3d` (new, plus this round's own
    definition change for its perspective camera) correctly derives one
    tile-aware `uv` from `fullResolution`/`tileOffset` shared by both its
    isometric and new perspective branches, verified in both GLSL and
    WGSL; `render/pointsRender` and `render/pointsBillboardRender` were
    already deny-listed and this round's new perspective/depth-sort/
    defocus passes don't change that; `synth/remap`'s full zone-compositor
    rewrite preserved the tile-local-source-sampling / global-polygon-
    coordinate invariant fixed in the 2026-09-07 pass below; `filter/
    chrome`, `filter/grade`, and `mixer/alphaMask`'s premultiplied-alpha/
    gradient fixes didn't touch spatial handling and remain tile-safe.
    Verified 23/23 classifier + harness-mirror tests
    (`has-stateful-effects.node-test.js`, `enumerator.node-test.js`).
    Ran noisedeck's live GLSL seam harness (headless Chromium) for
    `mixer/alphaMask` (pass) and `synth/remap` (trivial/uniform default
    DSL); could not run it for the two new 3D-landscape effects — this
    checkout has no synced `app/js/noisemaker/vendor/`, and the harness's
    live-CDN fallback doesn't resolve newly-published effect bundles for
    its effect loader. Their classification rests on direct source
    verification, the same determinant method this file's own scope note
    and `hasUpscaleOnlyEffects.js`'s header prescribe for structural-safety
    claims, not live seam-harness pixels — flagged for a real render once
    a synced vendor/ checkout is available. Also found, untouched (out of
    scope): noisedeck's `preview` branch carries a second, older stash
    (`fix(fullscreen): restore canvas dimensions on exit for any entry
    path`) and a large set of uncommitted working-tree changes matching
    the dangling Tearoff #156 I18n narrative — both predate this pass and
    were left exactly as found.
  - 2026-09-07 — caught up through noisemaker `827b2e91`: no new effects;
    rechecked the changed Remap definition and Text shader. Remap's active
    zones exposed a GLSL seam: source surfaces are tile-local, but sampling
    used global UV. Corrected the source lookup to use the packed resolution
    slot; polygon coordinates remain global and WGSL already uses local
    source sampling. Remap now has a zero-pixel source displacement and needs
    no deny-list entry. Both backends match full-frame captures exactly at
    2048x2048 and 2048x3000 using Noisedeck's seam harness; four untiled
    before/after captures remain byte-identical. Added a nontrivial active-zone
    regression, renewed source-bound strict Remap parity evidence, and passed
    33 tile checks, 126 harness/classifier tests, Shade compilation/structure,
    and the full non-parity JS suite. Text's external-overlay tile regression
    also passes. No Noisedeck routing changes were required.

  - 2026-09-04 — caught up through noisemaker `ee523ab9` / noisedeck
    `539ee089`: audited 25 added artistic filters and seven changed effect
    definitions. Classified 23 additions as tile-safe, routed `spinBlur` and
    `pondRipples` to the upscale-only path, and kept `extrude` tiled with a
    pinned 768 px maximum source-dependency bound. Repaired `text` WGSL to
    sample its external overlay in global output space and added a behavioral
    WebGPU full-frame/offset-tile regression. Stopped Noisedeck's animation
    loop during controlled captures to eliminate a WebGPU harness race and
    consolidated the diagnostic deny-list onto the production-synced mirror.
    Revalidated 124 harness/classifier tests, 31 cross-backend tile checks,
    all 203 shader structures, and the full shader-language suite; no stateful
    routing changes were required.
  - 2026-07-10 — post-ship catch-up: parallax tile-clamped + synth WGSL
    ports (noisemaker `45a34489`); effects added since ship routed into
    deny-lists, seam-harness hardening (noisedeck `a12ee01e`..`75262325`).
  - 2026-05-16 — feature shipped (noisemaker `f1b0a919`, noisedeck
    `913b722b`).

## Documentation

- **Checkpoint:** noisemaker `5a142567` (2026-09-16)
- **Scope:** the Sphinx docs under `docs/` (published to docs.noisemaker.app
  by `.github/workflows/docs-site.yml`) and the per-effect
  `shaders/effects/*/*/help.md` files rendered by the live Effect Reference.
  `help.md` is normally written in-band with the effect; this pass catches
  stragglers and decides which shipped features merit a narrative guide.
- **Gap detection:**
  1. Effects missing `help.md`: compare `shaders/effects/*/*/definition.js`
     against the corresponding `help.md` paths.
  2. Features shipped since the checkpoint that merit a guide under
     `docs/shaders/features.rst` (pattern: `docs/shaders/cubemaps.rst`).
  3. Narrative statements invalidated by recent commits (grep the affected
     terms in `docs/`).
- **Log:**
  - 2026-09-16 — caught up through `5a142567`: the range (`c68fb3c8..5a142567`)
    contains no new or changed effect definitions and no other `docs/`
    edits — its only doc-relevant content is this section's own prior
    catch-up commit (`5a142567` itself, the four files logged below) plus
    unrelated dependency bumps (Playwright, eslint, ruff, types-requests)
    and browser/CI test-harness fixes (WebGPU presentation sampling,
    landscape capture timing, renderer pruning audit) that touch no
    Sphinx narrative or effect-help content. Confirmed via
    `git diff --stat c68fb3c8..5a142567 -- docs/
    'shaders/effects/*/*/definition.js' 'shaders/effects/*/*/help.md'`
    (only the four already-logged files) and re-ran the production
    `dirhtml` Sphinx build: same 18 pre-existing warnings, no new ones.
    No gaps to close.
  - 2026-09-15 — caught up through `c68fb3c8`: the range added three
    effects (`synth3d/heightmap3d`, `render/renderLandscape3d`,
    `points/heightGrid`) landing a native voxel-heightfield landscape
    renderer, plus a perspective camera and depth-sorted alpha/aperture
    defocus for `pointsBillboardRender`, and a full rewrite of `synth/remap`'s
    zone compositor. Wrote the two missing `help.md` files
    (`heightmap3d`, `renderLandscape3d`); `heightGrid`,
    `pointsRender`/`pointsBillboardRender`, and `remap` already carried
    accurate in-band `help.md` updates. Corrected `docs/shaders/smrticles.rst`:
    `pointsRender`'s parameter table was missing `posZ`/`fieldOfView`
    (present in the definition since before this checkpoint, so this was a
    pre-existing gap, not new this round) and still described `viewMode` as
    flat/ortho only; added a `pointsBillboardRender` reference section
    (shape modes, blend modes, depth sort, defocus) that did not exist
    despite the effect predating this checkpoint, replaced a stale note
    claiming billboards/textured sprites were "planned for future releases"
    when `pointsBillboardRender` already ships them, and added `heightGrid`
    to the behavior-middleware table. Corrected `docs/shaders/pipeline-3d.rst`:
    added `heightmap3d` to the generators list and `renderLandscape3d` to
    the renderers table, both previously absent. Confirmed the help-table
    checker passes (1,263 documented parameters across 203 effects) and the
    production-format Sphinx dirhtml build passes with the same 18
    pre-existing warnings as the prior checkpoint (all `Pygments lexer name
    'dsl' is not known`, unrelated to this pass).
  - 2026-09-07 — caught up through `d30d1045`: verified help coverage for
    all 210 effects and 1,223 documented parameters across the 200 effects
    recognized by the table checker. Documented lossless Remap vertex
    formatting in the language, effect-authoring, and effect-help references.
    Re-audited the in-band MIDI CC, CC14, NRPN, MPE, audio-channel, and capture
    capability guides; no additional feature guide was needed. The existing
    non-parity suite, six Remap round-trip tests, and four static-asset checks
    passed. The production-format Sphinx dirhtml build passed with 18 warnings
    in unchanged documentation and configuration.
  - 2026-09-04 — caught up through `acb26f80`: verified `help.md`
    file coverage for all 210 effect definitions and ran the existing
    parameter-table checker across the 200 definitions it recognizes. Corrected
    the affected shader-language narrative for mandatory namespace search,
    built-in I/O, current generators and namespaces, and schema-valid argument
    and partial-application examples. Aligned the compiler guide with its actual
    parse, validate, expand, allocate, graph-assembly, backend-compilation, and
    error contracts, and removed the same obsolete DAG, synthetic-texture,
    pass-field, and runtime-shape claims from the pipeline and effect-authoring
    guides. No effect or user-facing feature was added, so no new narrative
    guide was required. Revalidated the production `dirhtml` Sphinx build and
    static-document asset checks.
  - 2026-09-04 — caught up through `8cad384f`: verified `help.md`
    file coverage for all 210 effect definitions and ran the existing
    parameter-table checker across the 200 definitions it recognizes. Audited
    the documentation-only range: its refreshed AI development contract and
    corrected oscillator, normalized automation, selected-device, raw-audio,
    and nested-automation language are already reflected in the existing
    shader guides. No effect or user-facing feature was added, so no new
    narrative guide was required. Revalidated the production `dirhtml` Sphinx
    build and static-document asset checks.
  - 2026-09-04 — caught up through `5b0b7aa7`: verified `help.md`
    file coverage for all 210 effect definitions and ran the existing
    parameter-table checker across the 200 definitions it recognizes. Updated
    the existing CLI, general DSL language, and shader guides
    for strobe verdicts, magic-mashup input gating, normalized and nested
    MIDI/audio automation,
    selected external devices, raw audio, external-state exports, device-bound
    3D volume sizing, and MRT precision fallback. The remaining dependency,
    ledger, localization, and tiled-text changes did not require another
    narrative guide. Revalidated the production `dirhtml` Sphinx build and
    static-document asset checks.
  - 2026-08-19 — caught up through `1ee891a2`: verified `help.md`
    coverage for all 210 effects and audited the shader-parity attestation
    infrastructure, PixelSort parity repair, JS/Python parity corrections,
    fixture tooling, and dependency updates in the range; updated the release
    workflow narrative for the new CPU parity-attestation gate, while no new
    effect or user-facing feature required an additional feature guide.
  - 2026-08-14 — caught up through `24c7053c`: verified `help.md`
    coverage for all 210 effects and audited the renderer-output guide and
    navigation links, i18n catalogs, AI contract, CI, and vendored tooling in
    the range; the existing guide covers the only Sphinx-relevant feature, so
    no additional narrative changes were needed in this pass.
  - 2026-08-14 — caught up through `0d34e10d`: verified `help.md`
    coverage for all 210 effects, added the renderer-output guide for sinks
    and bounded asynchronous frame export, and audited the in-band export-kit,
    static-site, effect-authoring, and repository-link changes; no other
    Sphinx narrative was invalidated.
  - 2026-08-11 — caught up through `f33b5bfb`: verified `help.md`
    coverage for all 210 effects and audited the AI development contract
    refresh plus the prior documentation catch-up; neither shipped a shader
    feature nor invalidated Sphinx narrative, so no guide or narrative edits
    were needed.
  - 2026-08-11 — caught up through `7cc4894b`: verified `help.md`
    coverage for all 210 effects, corrected the remaining stale pre-move
    repository URL in the CLI help snapshot, and audited the Playwright and
    Ruff dependency bumps; no additional shader feature guides needed.
  - 2026-08-10 — caught up through `7cdf2b6d`: verified `help.md`
    coverage for all 210 effects (including 25 effects added since the
    checkpoint), corrected four stale pre-move noisemaker repository links,
    and audited the in-band coding-agents guide plus runtime fixes; no
    additional shader feature guides needed.
  - 2026-07-10 — initial catch-up: added `help.md` for
    `mixer/channelCombine` and `filter/temporalAberration`; added feature
    guides for parallax, the 3D pipeline, and mashup.

## AI development contract (llms-full.txt)

- **Checkpoint:** noisemaker `688c5146` / shade-mcp `0a92bd83`, 2026-09-17
- **Scope:** the hand-authored agent contract `llms-full.txt` — the
  executable-source companion served at the site root that describes
  *current* runtime behavior across nine surfaces (DSL, effect definition,
  parameters/globals, passes/graph, textures, compatibility/mutation,
  rendered output, cross-backend parity, Shade MCP tool contracts), a fully
  worked validated effect, the surface × capability traceability matrix, and
  the 30-entry open gap register (GAP-001..017, GAP-019..024, and
  GAP-026..032). The file pins its
  own audited SHAs in the "Source snapshots used for this contract" block at
  its head; that block and this checkpoint are the same two SHAs and must be
  advanced together. There is no generator — every update is a hand edit
  verified against live source.
  The short public index `llms.txt` carries no pinned snapshot and is kept
  current in-band with its links, so it is not part of this pass.
- **Gap detection:**
  1. Noisemaker drift — commits since the noisemaker checkpoint touching the
     primary source roots the contract reads:

     ```
     git log --oneline 246ff57f..HEAD -- shaders/src/lang/ shaders/src/runtime/ shaders/src/renderer/canvas.js shaders/tests/test-harness.js
     ```

     Each can invalidate a behavior statement, typed grammar, or validator
     message, or change a gap's status. Re-audit the affected surface
     section(s) and re-check every gap whose "Source evidence" file changed.
  2. Shade MCP drift (GAP-013) — `.mcp.json` runs
     `npx -y github:noisedeck/shade-mcp` unpinned. Re-resolve it to its current
     commit; if it moved off the pinned shade-mcp SHA, re-capture `tools/list`
     (tool count and signatures) and the `shade-mcp` server/protocol version
     triple, then re-audit the "Shade MCP tool contracts" section and the
     MCP-side gaps.
- **Log:**
  - 2026-09-17 — caught up through noisemaker `688c5146` (shade-mcp
    unchanged): audited WebGPU frame export row-orientation fix (`5ceb97ba`
    and `688c5146`). Documented that WebGPU frame export resolve inverts vertical
    orientation in the resolve shader (`textureDimensions(sourceTexture).y - 1 - i32(position.y)`)
    to match canvas presentation and WebGL2 parity. Verified non-parity JS
    tests and WebGPU frame export unit tests all pass cleanly.
  - 2026-09-15 — caught up through noisemaker `9a31314c` (shade-mcp
    unchanged): re-audited the perspective/depth-sort/defocus/3D-landscape
    round's 7 commits touching the watched source roots. Narrowed GAP-005 —
    `conditions` used to be on its uncopied-pass-field list; `expander.js`
    now copies it and `Pipeline.shouldSkipPass()` consumes it at execution
    time, the mechanism this round's per-`viewMode`/`blendMode` pass-cloning
    pattern relies on to select which cloned pass variant runs (`name`,
    `viewport`, `clear`, `samplerTypes`, `type` remain uncopied). Added
    `PassSpec.defines` to the typed grammar (undocumented before this pass):
    it does not land on the expanded pass object directly, but derives a
    `__KEY_value`-suffixed compiled-program variant merging effect- and
    pass-level compile-time defines. Documented that a numeric `PassSpec.
    uniforms` value bypasses global lookup as a literal compile-time
    constant, that `evaluateAutomation()` now rounds `int`-typed globals'
    resolved automation value, that `expander.js` follows volume/geometry
    surface dimensions through `write3d()`/`read3d()` handoffs (exports,
    forward reads, repeated same-surface filters) instead of resetting to
    the 64 default, and that a custom vertex shader now receives the same
    `#define` injection as the fragment stage. Re-resolved the unpinned
    Shade MCP package to its current commit: still `0a92bd83`, no drift, so
    the MCP-side sections and worked-example transcript needed no
    re-capture — confirmed by source inspection that the worked
    `synth/testPattern` effect's own files are unchanged in this range and
    none of the round's expander/pipeline changes are reachable by an
    effect using none of those mechanisms. The full non-parity JS test
    suite passed.
  - 2026-09-07 — caught up through noisemaker `246ff57f` / shade-mcp
    `0a92bd83`: documented lossless vec4 formatting, CC/CC14, NRPN, pressure,
    bend, MPE selection, port inventories/lifecycle, default audio channels,
    and aggregate/raw cleanup. Narrowed GAP-031 to legacy note modes, extended
    GAP-032 to default channels, and closed GAP-018 after the tool descriptions
    stopped promising glob support. Rechecked changed-source engine and MCP
    gaps. Resolved the runtime mirror to the pinned Shade commit, built its
    locked dependencies, and captured the 0.2.2/2025-11-25 handshake, all 18
    schemas, and eight worked calls in one session. Tool descriptions and error
    strings changed; argument types/defaults did not. The exact two-pass source
    graph reproduced, while the compile reports still demonstrate GAP-024.
    Noisemaker language/runtime and focused MIDI suites passed; Shade's 157
    tests, typecheck, build, and standalone-drop checks passed.
  - 2026-09-04 — caught up through noisemaker `691eea16` / shade-mcp
    `23258ca3`: re-audited selected MIDI ports, selected audio device/channels,
    bipolar raw audio, recursive capture requirements, and eight-level nested
    automation across the changed parser, validator, unparser, external-input,
    and pipeline sources. Added the exact mixed-argument exception, selector
    validation/round-trip contract, runtime state resolution, nested-field
    ranges and deterministic phase integration, and host capture requirements.
    Opened GAP-031 for the unenforced MIDI channel range and GAP-032 because the
    built-in audio manager cannot populate selected-device or raw-ready state;
    rechecked the other changed-source gaps without closing them. Re-resolved
    the configured GitHub runtime to `23258ca3`, whose drift is README-only,
    and recaptured the `shade-mcp`/`0.2.2`/`2025-11-25` handshake and all 18
    unchanged tool schemas in one fresh session. Recaptured all eight worked
    calls and reproduced the exact two-pass source graph. The returned
    responsiveness fields do not belong to `synth/testPattern`, strengthening
    GAP-024's stale-graph finding rather than validating that response.
  - 2026-08-31 — caught up through noisemaker `a4701daf` / shade-mcp
    `ba407982`: verified that Noisemaker's watched source roots are unchanged
    from the prior checkpoint, re-resolved the unpinned GitHub package to the
    exact Shade MCP commit, and recaptured the
    `shade-mcp`/`0.2.2`/`2025-06-18` handshake and all 18 tool signatures from
    the configured runtime. The tool names, input schemas, absent output
    schemas, and forbidden task support are unchanged. Audited the Shade MCP
    dependency/release changes and documented its build-time version injection
    plus standalone-drop handshake gate; its tests, typecheck, build, external
    dependency gate, and bare-drop check all passed. Rechecked every MCP-side
    gap; none closed. Recaptured the full eight-call worked transcript in the
    same `0.2.2` session; the seven deterministic responses were byte-for-byte
    unchanged, the FPS sample still passed its threshold, and the results
    continue to expose GAP-024 rather than proving end-to-end backend identity.
    The source-level worked program also reproduced its exact two-pass graph.
  - 2026-08-29 — caught up through noisemaker `c767e481` / shade-mcp
    `ac4c6ba1`: re-audited the two watched device-limit commits and documented
    the expanded capability object, numeric volume-atlas clamping across graph,
    host, and UI paths, WebGL MRT budget probing/error cleanup, and ordered
    full-to-half-float MRT adaptation across WebGL2/WebGPU. Rechecked the
    changed-source evidence for GAP-001/004/005/006/007/016/026; none closed.
    Opened GAP-030 because MRT adaptation mutates graph formats without
    invalidating same-size reused backend textures. Reproduced the worked source
    graph and device-limit regression gates. Shade MCP did not move in this
    Tearoff range, so its handshake, 18 tool schemas, historical browser
    transcript, and MCP-side gaps remain pinned unchanged.
  - 2026-08-14 — caught up through noisemaker `f6b22ab3` / shade-mcp
    `ac4c6ba1`: verified that no Noisemaker watched source root changed,
    re-resolved the unpinned MCP package, and recaptured the
    `shade-mcp`/`0.2.1`/`2025-06-18` handshake, all 18 tool schemas, the exact
    two-pass source graph, and the eight-call worked transcript. Re-audited
    the affected MCP contract sources and every MCP-side gap; documented the
    configurable browser/AI timeouts, headless/session lifecycle, restricted
    loopback/opaque-origin CORS, opt-in description image, refreshable effect
    index, and manifest invalidation, narrowed GAP-020 now that pixel parity
    also uses the shared `isError` wrapper, and opened GAP-029 for invalidation
    racing an already in-flight index rebuild.
  - 2026-08-11 — caught up through noisemaker `e1feefa0` / shade-mcp
    `346ee022`: documented the renderer sink and bounded asynchronous frame
    export contracts across WebGL2/WebGPU, rechecked every changed-source gap,
    and opened GAP-028 for pending accepted frames canceled without a terminal
    queue result. Re-resolved the unpinned MCP package; recaptured the
    `shade-mcp`/`0.1.4`/`2025-06-18` handshake, all 18 tool schemas, and the
    eight-call worked transcript after the Node 22/SDK/Zod upgrades.
  - 2026-08-10 — caught up through noisemaker `7cc4894b` / shade-mcp
    `3e531fc6`: re-audited Noisemaker runtime drift; re-resolved the unpinned
    MCP package; recaptured the `shade-mcp`/`0.1.4`/`2025-06-18` handshake,
    all 18 tool signatures, and the worked transcript; narrowed GAP-020 for
    the new whole-call `isError` marker; closed GAP-025.
  - 2026-07-14 — contract instrumented (`dc67827b`) at snapshot noisemaker
    `75507112` / shade-mcp `7fd0d975`: nine surface sections, worked validated
    effect, 9×4 traceability matrix, 26-gap register. Audited clean through
    `478989b6`; checkpoint established at the contract's own snapshot.
