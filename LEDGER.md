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

- **Checkpoint:** noisemaker `5b81e04f` / noisedeck `a5d448b2` (2026-09-23)
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
  - 2026-09-23 — caught up through noisemaker `5b81e04f` / noisedeck
    `a5d448b2`: audited noisemaker range `dd38fdd2..5b81e04f` and noisedeck
    `697d2df9..a5d448b2` (covering Tearoff #425 trigger `0a2a7012..df632d0a`).
    In noisemaker, zero effect definitions or parameters were added or removed,
    leaving all 3,677 keys in exact parity across all seven catalogs (`en` and
    `de`, `es`, `fr`, `it`, `ja`, `pt`). In noisedeck, `sync.previewPaused` was
    added to English (`34295fbf`) and translated across all six UI locales
    (`55fa1a24`), merged in `df632d0a`; all UI string leaf keys remain in exact
    parity. Verified via Noisemaker gap detection (0 missing keys across all 6
    locales), `npm run test:shaders:i18n` (5/5), Noisemaker JS test suite (63/63
    passed), Noisedeck `tests/i18n.node-test.js` (6/6),
    `tests/export-dialog-i18n.node-test.js` (2/2),
    `tests/menu-shortcuts-accelerators.node-test.js` (7/7), and
    `tests/downstream-workflow.node-test.js` (1/1). No catalog edits were required.
  - 2026-09-22 — caught up through noisemaker `dd38fdd2` / noisedeck
    `697d2df9`: audited noisemaker range `7ea31be3..dd38fdd2` (covering Tearoff
    #392 trigger `2f855c9c..36a519a2` through HEAD) and noisedeck
    `4e412eb5..697d2df9`. In noisemaker, commit `36a519a2` added
    `render/renderLandscape3d.filtering`, `render/renderLandscape3d.filtering.isosurface`,
    and `render/renderLandscape3d.filtering.voxel` across all seven effect
    catalogs (`en` and `de`, `es`, `fr`, `it`, `ja`, `pt`), bringing the
    active catalog to 3,677 keys in exact parity. Noisedeck had zero UI string
    additions or deletions across the range. Verified via Noisemaker gap
    detection (0 missing keys across all 6 locales), `npm run test:shaders:i18n`
    (5/5), Noisemaker JS test suite (65/65 passed), Noisedeck
    `tests/i18n.node-test.js` (6/6), `tests/export-dialog-i18n.node-test.js` (2/2),
    `tests/downstream-workflow.node-test.js` (1/1), and
    `tests/menu-shortcuts-accelerators.node-test.js` (7/7). No catalog edits were
    required.
  - 2026-09-21 — caught up through noisemaker `7ea31be3` / noisedeck
    `4e412eb5`: audited noisemaker range `1086890d..7ea31be3` (covering Tearoff
    #312 trigger `c68fb3c8..2f855c9c`) and noisedeck `e1146981..4e412eb5`.
    In noisemaker, commit `2f855c9c` retired `filter/bc`, `filter/colorspace`,
    and `filter/hs`, removing their 15 effect string definitions across all
    seven catalogs (`en` and `de`, `es`, `fr`, `it`, `ja`, `pt`), bringing the
    active catalog to 3,674 keys in exact parity. Noisedeck had zero UI string
    additions or deletions across the range. Verified via Noisemaker gap
    detection, `npm run test:shaders:i18n` (5/5), Noisedeck's
    `tests/i18n.node-test.js` (6/6), `export-dialog-i18n` (2/2),
    `downstream-workflow` (1/1), and the Noisemaker JS test suite (57/57 passed).
    No catalog edits were required.
  - 2026-09-20 — caught up through noisemaker `1086890d` / noisedeck
    `e1146981`: audited noisedeck range `73538a8f..e1146981` (covering Tearoff
    #293 trigger `adef85dd..0a2a7012`) and noisemaker `da1b6985..1086890d`.
    UI string additions in noisedeck (`startup.statuses.enabled`,
    `startup.statuses.midiNoDevices`, `startup.statuses.midiPortFailed` in
    `0a2a7012`) were already translated across all six UI locales (`de`, `es`,
    `fr`, `it`, `ja`, `pt`); all 3,689 Noisemaker effect strings remain in
    exact key parity with zero missing keys across all six translated catalogs.
    Verified via Noisemaker gap detection, `npm run test:shaders:i18n` (5/5),
    Noisedeck's `tests/i18n.node-test.js` (6/6), `export-dialog-i18n` (2/2),
    `startup-backend` (13/13), and the Noisemaker JS test suite (58/58 passed).
    No catalog edits were required.
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

- **Checkpoint:** noisemaker `1d581ffa` / noisedeck `697d2df9` (preview
  branch), 2026-09-22
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
  - 2026-09-22 — caught up through noisemaker `1d581ffa` / noisedeck
    `697d2df9`: gap detection (`git log --diff-filter=A`) identified zero
    new effects in range `eef25e91..1d581ffa` (covering Tearoff #393 trigger
    `2f855c9c..36a519a2` through HEAD). Audited the one effect with changed
    definition in the range: `render/renderLandscape3d` (`36a519a2`), which
    added a pruned isosurface filtering mode. Both perspective and isometric
    isosurface raymarch paths derive global UV coordinates from `tileOffset`
    and `fullResolution` across GLSL and WGSL, preserving its tile-aware
    classification. No additions to `hasStatefulEffects.js` or
    `hasUpscaleOnlyEffects.js` required. Verified Noisemaker landscape tests
    (`npm run test:shaders:landscape`, 13/13 passing with dual WebGL2/WebGPU
    parity attestations for `synth3d/heightmap3d` and `render/renderLandscape3d`),
    Noisemaker JS test suite (65/65 passed), and Noisedeck classifier and seam
    harness tests (83/83 passed across `has-stateful-effects.node-test.js`,
    `has-upscale-only-effects.node-test.js`, and
    `tests/large-format-seams/enumerator.node-test.js`).
  - 2026-09-21 — caught up through noisemaker `eef25e91` / noisedeck
    `4e412eb5`: gap detection (`git log --diff-filter=A`) identified zero
    new effects in range `ead42a5d..eef25e91` (covering Tearoff #313 trigger
    `f2506d21..2f855c9c`). Audited the effects changed in the range: commit
    `2f855c9c` retired `filter/bc`, `filter/colorspace`, and `filter/hs`, none
    of which were in noisedeck's deny-lists (`hasStatefulEffects.js` or
    `hasUpscaleOnlyEffects.js`). In noisedeck, zero classifier changes occurred
    across `d6fd477a..4e412eb5`. Verified 83/83 classifier and seam harness tests
    in noisedeck (`has-stateful-effects.node-test.js`,
    `has-upscale-only-effects.node-test.js`, `enumerator.node-test.js`). No additions
    to `hasStatefulEffects.js` or `hasUpscaleOnlyEffects.js` required.
  - 2026-09-18 — caught up through noisemaker `ead42a5d` / noisedeck
    `d6fd477a`: gap detection (`git log --diff-filter=A`) identified zero
    new effects in range `ff1bfbc1..ead42a5d`. Audited the two effects with
    changed definitions in the range: `synth3d/heightmap3d` and
    `render/renderLandscape3d` (`f2506d21`). Their definitions changed
    only `defaultProgram` to use discrete `write`/`read` pipelines instead
    of inline surface parameter calls; neither shader implementation (.glsl /
    .wgsl) or spatial coordinate handling was modified. Both effects remain
    tile-safe under their established classifications (`heightmap3d` volume
    bake pass upstream of canvas tiles; `renderLandscape3d` global-UV
    projection from `tileOffset`/`fullResolution`). No additions to
    `hasStatefulEffects.js` or `hasUpscaleOnlyEffects.js` required. Verified
    83/83 classifier and seam harness tests in noisedeck
    (`has-stateful-effects.node-test.js`, `has-upscale-only-effects.node-test.js`,
    `enumerator.node-test.js`).
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

- **Checkpoint:** noisemaker `6a0af04d` (2026-09-26)
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
  - 2026-09-26 — caught up through `6a0af04d`: audited range
    `6c3f9a26..6a0af04d` (Tearoff item 571, covering trigger
    `8eeb7b5a..6a0af04d` delivered as `6c3f9a26..428ea29..9574362..6a0af04d`,
    audited linearly in the local checkout). Gap detection confirmed zero
    missing `help.md` files across all effect definitions. Shipped features
    documented in the Sphinx docs: GAP-006 texture-pooling consumption (the
    `texturePooling: true` opt-in, `Pipeline.buildTexturePoolingPlan()`
    grouping/aliasing, the identical-plain-2D-spec / producing-write /
    partial-and-non-clearing-write guard including the viewport-without-clear
    case from `9574362`, and `Pipeline.getResourcePlan()`) in
    `docs/shaders/pipeline.rst` Sections 2 and 7; GAP-007 structured
    diagnostics (one `ShaderDiagnostic` union with `backend`/`stage`/parsed
    `messages`, the added `ERR_SHADER_MISSING` code row, and the enumerated
    still-unstructured paths) in `docs/shaders/pipeline.rst` Section 11 and
    `docs/shaders/compiler.rst` Failures and Diagnostics (with a new
    `pipeline-error-codes` anchor). No new standalone guide required under
    `docs/shaders/features.rst` — both features are pipeline/runtime
    internals, matching the prior pass's precedent. Invalidated statements:
    corrected `docs/shaders/pipeline.rst` claims that the Pipeline creates
    textures by virtual ID and never uses the allocation map as a pool.
    Verified the Sphinx docs build locally
    (`sphinx-build -b dirhtml docs docs/_build/dirhtml`: build succeeded;
    only the pre-existing `pipeline-3d.rst` `dsl` lexer warning, unchanged),
    docs static asset paths (`node --test test/docs-static-paths.test.js`,
    4/4 pass), ESLint (`npm run lint`), and the non-parity JS test suite
    (`node scripts/run-js-tests.js --skip-parity`).
  - 2026-09-25 — caught up through `6c3f9a26`: audited range
    `69d83b80..6c3f9a26` (Tearoff item 557, covering `69d83b80..8eeb7b5a`
    and publication evidence at `6c3f9a26`). Gap detection confirmed zero
    missing `help.md` files across all 210 effect definitions and all 1,258
    documented parameters across 200 effects match definitions
    (`node shaders/tests/test_effect_help_params.mjs`). Shipped features:
    GAP-004 texture policies (`mipmaps`, `persistent`, 3D `filter`) in
    `docs/shaders/effects.rst` and `docs/shaders/pipeline.rst`; GAP-005 pass
    fields (`name`, `type`, `clear`, `samplerTypes`, `viewport`) and dynamic
    dimension viewport resolution (`viewportResolved`) documented in
    `docs/shaders/effects.rst` (passSpec schema updated with `type`, `clear`,
    `samplerTypes`, `viewport`, and `conditions`) and `docs/shaders/pipeline.rst`
    (Section 9.2 added for pass-field propagation and viewport resolution).
    No new standalone guide required under `docs/shaders/features.rst` as pass
    execution controls belong to core pipeline/effect schemas. Invalidated
    statements: corrected `docs/shaders/pipeline.rst` Section 9 to state that
    the expander copies authored `conditions` for per-frame dynamic pass
    skipping. Verified the Sphinx docs build locally
    (`sphinx-build -b dirhtml docs docs/_build/dirhtml`: build succeeded, 0 errors),
    docs static asset paths (`node --test test/docs-static-paths.test.js`, 4/4 pass),
    ESLint (`npm run lint`), and non-parity JS test suite
    (`node scripts/run-js-tests.js --skip-parity`).
  - 2026-09-25 — caught up through `69d83b80`: audited range
    `fa4b2f02..69d83b80` (Tearoff item 538, delivered as the observed ranges
    `2f47612c..63349a7d` and `fa4b2f0..69d83b80`; the trigger end is a
    force-push/non-contiguous delivery, so the range was diffed directly in
    the checkout). Gap detection confirmed zero missing `help.md` files
    across all 210 effect definitions and all 1,258 documented parameters
    across 200 effects match definitions
    (`node shaders/tests/test_effect_help_params.mjs`). The range's
    Documentation-scope changes are this pass's own prior Sphinx edits
    (`69d83b80`: GAP-003 `validateEffectDefinition` in
    `docs/shaders/pipeline.rst` and `docs/shaders/effects.rst`) plus
    `63349a7`'s `docs/releases.rst` rewrite for the retired per-push
    SNAPSHOT release (checked against the remaining workflow narrative —
    accurate); no invalidated narrative statements remained. The range's
    engine commits (`a021a28`, `62eb56f`, `2f47612`, GAP-004 texture
    policies and backend mip handling) and closure docs (`85ded3a`) were
    audited under the AI development contract section. Invalidated-statement
    audit of GAP-004 updated `docs/shaders/effects.rst` (textureSpec schema
    now documents `mipmaps`, `persistent`, and 3D `filter`) and
    `docs/shaders/pipeline.rst` (resize-behavior section documents both 2D
    allocation policies, mip-chain regeneration, persistent resample, and
    3D filtering; the blanket "does not blit old surface content" sentence
    no longer holds for persistent textures), with no new standalone
    narrative guide: the policy documentation lives in the existing
    `docs/shaders/effects.rst` and `docs/shaders/pipeline.rst` sections
    rather than a new `docs/shaders/features.rst`-linked page. Verified the
    Sphinx docs build locally at the exact source
    (`sphinx-build -b dirhtml docs` with `docs/sphinx-requirements.txt`:
    build succeeded, 18 pre-existing warnings, 0 errors), docs static paths
    (`node --test test/docs-static-paths.test.js`, 4/4 pass), ESLint
    (`npm run lint`), and non-parity JS test suite
    (`node scripts/run-js-tests.js --skip-parity`). Published-source CI and
    deployment evidence observed via the GitHub API: `docs-site.yml`
    succeeded at `69d83b80` (run 36164682935) and at `63349a7d` (run
    36174749632), with `downstream.yml` also succeeding at both SHAs
    (36164683019, 36174749672); the live docs.noisemaker.app deployment
    serves `git_hash: 63349a7d6b95da1e97f35b8570872db82c55d7da` per
    `deployment-meta.json` — `63349a7d` descends from `69d83b80`
    (verified with `git merge-base --is-ancestor`), so the deployed Sphinx
    HTML includes the `69d83b80` GAP-003 `.rst` edits. The GAP-004
    texture-policy `.rst` documentation added later in this pass is not yet
    in that deployment; it publishes with this documentation commit's own
    `docs-site.yml` run.
  - 2026-09-25 — caught up through `fa4b2f02`: audited range
    `cfccdf96..fa4b2f02` (covering Tearoff #534 trigger `60b90af3..9d3474df`
    through HEAD). Gap detection confirmed zero missing `help.md` files across
    all 210 effect definitions. Verified all 1,258 documented parameters across
    200 effects match definitions (`node shaders/tests/test_effect_help_params.mjs`).
    Updated Sphinx docs in `docs/shaders/pipeline.rst` and `docs/shaders/effects.rst`
    to reflect GAP-003 runtime effect definition validation (`validateEffectDefinition`
    in `shaders/src/runtime/effect-validator.js`), correcting earlier abridged descriptions.
    Confirmed zero new narrative feature guides required under `docs/shaders/features.rst`.
    Verified docs static paths (`node --test test/docs-static-paths.test.js`, 4/4 pass),
    structure suite (`npm run test:shaders:structure`, 206/206 pass), ESLint
    (`npm run lint`), and non-parity JS test suite (`node scripts/run-js-tests.js --skip-parity`).
  - 2026-09-25 — caught up through `cfccdf96`: audited range
    `240740dd..cfccdf96` (covering Tearoff #522 trigger `60b90af3..5f4b7c43`
    through HEAD). Range consists entirely of documentation, ledger, and AI contract
    updates (`5a58a325`, `c85db3f0`, `5f4b7c43`, `cfccdf96`). Gap detection confirmed
    zero missing `help.md` files across all 210 effect definitions. Verified all 1,258
    documented parameters across 200 effects match definitions
    (`node shaders/tests/test_effect_help_params.mjs`). Confirmed zero new narrative
    feature guides required under `docs/shaders/features.rst`. Verified docs static paths
    (`node --test test/docs-static-paths.test.js`, 4/4 pass), ESLint (`npm run lint`),
    and non-parity JS test suite (`node scripts/run-js-tests.js --skip-parity`).
  - 2026-09-25 — caught up through `240740dd`: audited range
    `bbdeb56c..240740dd` (covering Tearoff #510 trigger `4891b995..60b90af3`
    through HEAD). Gap detection confirmed zero missing `help.md` files across
    all 210 effect definitions. Verified all 1,258 documented parameters across
    200 effects match definitions (`node shaders/tests/test_effect_help_params.mjs`).
    Invalidation audit updated `docs/shaders/language.rst` to document subchain argument
    separator rules, strict-mode option (`subchainArguments: 'strict'`), and added
    `P008` (Unknown subchain argument key), `P009` (Duplicate subchain argument key),
    and `P010` (Missing ',' between subchain arguments) to the DSL diagnostics table.
    Audited subchain-argument validation contract (`66b2c721`), registered differential
    gate baseline (`240740dd`), and AI contract checkpoint (`3886ecfa`); confirmed zero
    new narrative feature guides required under `docs/shaders/features.rst`. Verified
    docs static paths (`node --test test/docs-static-paths.test.js`, 4/4 pass), ESLint
    (`npm run lint`), and non-parity JS test suite (`node scripts/run-js-tests.js --skip-parity`).
  - 2026-09-24 — caught up through `bbdeb56c`: audited range
    `aa96726d..bbdeb56c` (covering Tearoff #496 trigger `c9ee8a04..4891b995`
    through HEAD). Gap detection confirmed zero missing `help.md` files across
    all 210 effect definitions. Verified all 1,258 documented parameters across
    200 effects match definitions (`node shaders/tests/test_effect_help_params.mjs`).
    Invalidation audit updated `docs/shaders/language.rst` to add `P007` (Invalid
    call expression) to the DSL diagnostics table. Audited structured call-form and
    expectation diagnostics (`4891b995`), scanner source coordinate derivation (`9fa1a221`),
    numeric coercion array coordinate derivation (`fca611fd`), and GAP-002 closure
    provenance citations (`8a21c9ca`/`bbdeb56c`); confirmed zero new narrative feature
    guides required under `docs/shaders/features.rst`. Verified docs static paths
    (`node --test test/docs-static-paths.test.js`, 4/4 pass), ESLint (`npm run lint`),
    and non-parity JS test suite (`node scripts/run-js-tests.js --skip-parity`).
  - 2026-09-24 — caught up through `aa96726d`: audited range
    `30c47030..aa96726d` (covering Tearoff #482 trigger `c9ee8a04..13853dff`
    through HEAD). Gap detection confirmed zero missing `help.md` files across
    all 210 effect definitions. Verified all 1,258 documented parameters across
    200 effects match definitions (`node shaders/tests/test_effect_help_params.mjs`).
    Confirmed zero narrative statements invalidated and zero new narrative feature
    guides required under `docs/shaders/features.rst`. Verified docs static paths
    (`node --test test/docs-static-paths.test.js`, 4/4 pass), ESLint (`npm run lint`),
    and non-parity JS test suite (`node scripts/run-js-tests.js --skip-parity`).
  - 2026-09-24 — caught up through `30c47030`: audited range
    `c7e9e09d..30c47030` (covering Tearoff #474 triggers `c9ee8a04..13fa8b54`,
    GAP-002 subchain validation evidence `741333cb`, and site styling `30c47030`).
    Gap detection confirmed zero missing `help.md` files across all 210 effect
    definitions. Verified all 1,258 documented parameters across 200 effects match
    definitions (`node shaders/tests/test_effect_help_params.mjs`). Invalidation
    audit updated `docs/shaders/language.rst` to add `P006` (Invalid subchain) to
    the DSL diagnostics table. Confirmed zero new narrative feature guides required
    under `docs/shaders/features.rst`. Verified docs static paths (`node --test test/docs-static-paths.test.js`,
    4/4 pass), ESLint (`npm run lint`), and non-parity JS test suite (`node scripts/run-js-tests.js --skip-parity`).
  - 2026-09-24 — caught up through `c7e9e09d`: audited range
    `65ff358f..c7e9e09d` (covering Tearoff #455 triggers through `823bbff1`
    and contract checkpoint advance `c7e9e09d`). Gap detection confirmed zero
    missing `help.md` files across all 210 effect definitions. Verified all 1,258
    documented parameters across 200 effects match definitions (`node shaders/tests/test_effect_help_params.mjs`).
    Verified `P005` in `docs/shaders/language.rst`; confirmed zero new narrative
    feature guides required. Verified docs static paths (`node --test test/docs-static-paths.test.js`,
    4/4 pass), ESLint (`npm run lint`), and non-parity JS test suite (`node scripts/run-js-tests.js --skip-parity`).
  - 2026-09-24 — caught up through `65ff358f`: audited range
    `7d0be45c..65ff358f` (covering Tearoff #442 triggers `9b88e567..c9ee8a04`
    and `cc1ba268` through HEAD). Gap detection confirmed zero missing `help.md`
    files across all 210 effect definitions. Verified all 1,258 documented
    parameters across 200 effects match definitions (`node shaders/tests/test_effect_help_params.mjs`).
    Invalidation audit updated `docs/shaders/language.rst` to add `P005` (Invalid
    output operation) to the DSL diagnostics table. Audited structured output
    validation diagnostics (`7a54ab38`, P005 for invalid render targets,
    expression-context writes, and invalid write/write3d target arguments),
    AI development contract checkpoint advance (`c9ee8a04`), site header strip
    styling (`285e50f5`), and GAP-002 output validation reconciliation (`65ff358f`);
    no additional narrative feature guides under `docs/shaders/features.rst`
    required. Verified docs static paths (`node --test test/docs-static-paths.test.js`,
    4/4 pass), ESLint (`npm run lint`), and non-parity JS test suite (`node scripts/run-js-tests.js --skip-parity`).
  - 2026-09-23 — caught up through `7d0be45c`: audited range
    `ec952244..7d0be45c` (covering Tearoff #433 triggers `0766743e..9b88e567`
    and `5b81e04f` through HEAD). Gap detection confirmed zero missing `help.md`
    files across all 210 effect definitions. Verified all 1,258 documented
    parameters across 200 effects match definitions (`node shaders/tests/test_effect_help_params.mjs`).
    Invalidation audit updated `docs/shaders/renderer-output.rst` to document
    the optional `deferRender()` sink method and `renderer.deferredFrameCount`
    shipped in `5b81e04f`. Audited `classicNoisedeck/glitch` zero-amount guards
    and parity attestation (`9b88e567`); no additional narrative feature guides
    under `docs/shaders/features.rst` required. Verified docs static paths
    (`node --test test/docs-static-paths.test.js`, 4/4 pass), ESLint (`npm run lint`),
    and non-parity JS test suite (`node scripts/run-js-tests.js --skip-parity`).
  - 2026-09-23 — caught up through `ec952244`: audited range
    `731b76e4..ec952244` (covering Tearoff #417 triggers `9e188535..0766743e`
    through HEAD). Gap detection confirmed zero missing `help.md` files across
    all 210 effect definitions. Verified all 1,258 documented parameters across
    200 effects match definitions (`node shaders/tests/test_effect_help_params.mjs`).
    Invalidation audit updated `docs/shaders/language.rst` to add `P004` (Invalid
    search directive) to the DSL diagnostics table. Audited structured search
    directive diagnostics (`0766743e`, P004 in `parse(tokens)` / `compile(source)`),
    scoped texture size preservation on `setUniform` (`e2874c85`/`3a32b198`), and
    `classicNoisedeck/noise` zero-refract optimization and parity attestation
    (`fde2ea40`/`e11f0767`); none required additional narrative feature guides.
    Verified docs static paths (`node --test test/docs-static-paths.test.js`, 4/4 pass),
    ESLint (`npm run lint`), and non-parity JS test suite (`node scripts/run-js-tests.js --skip-parity`).
  - 2026-09-23 — caught up through `731b76e4`: audited range
    `eb46047b..731b76e4` (covering Tearoff #402 triggers `44bc4ed4..9e188535`
    and `532ed647..e32a5a4a` through HEAD). Gap detection confirmed zero missing
    `help.md` files across all 210 effect definitions. Verified all 1,258 documented
    parameters across 200 effects match definitions (`node shaders/tests/test_effect_help_params.mjs`).
    Invalidation audit updated `docs/shaders/language.rst` to add `L003` (Unterminated
    comment), `L004` (Output surface reference out of range), and `P003` (Invalid
    automation arguments) to the DSL diagnostics table and remove duplicate `S005` entry.
    Audited automation argument diagnostics (`e32a5a4a`, P003 in `parse(tokens)` /
    `compile(source)` for `osc()`, `midi()`, `audio()`), documented in `llms-full.txt`
    and `docs/plans/active-framework-gap.md`. Verified docs static paths (`node --test
    test/docs-static-paths.test.js`, 4/4 pass), ESLint (`npm run lint`), and non-parity
    JS test suite (`node scripts/run-js-tests.js --skip-parity`).
  - 2026-09-22 — caught up through `eb46047b`: audited range
    `2779b409..eb46047b` (covering Tearoff #394 trigger `e5bd2013..44bc4ed4`
    through HEAD). Gap detection confirmed zero missing `help.md` files
    across all 210 effect definitions. Verified all 1,258 documented
    parameters across 200 effects match definitions (`node shaders/tests/test_effect_help_params.mjs`,
    incremented from 1,257 due to `filtering` added to `renderLandscape3d` in
    `36a519a2`). Invalidation audit updated `docs/shaders/pipeline-3d.rst` to
    document `renderLandscape3d`'s new smooth `isosurface` mode alongside
    `voxel` mode. Audited parser expectation diagnostics (`44bc4ed4`,
    P001/P002 in `parse(tokens)` / `compile(source)`), already documented in
    `llms-full.txt` and `docs/plans/active-framework-gap.md`. Verified docs
    static paths (`node --test test/docs-static-paths.test.js`, 4/4 pass) and
    non-parity JS test suite (`node scripts/run-js-tests.js --skip-parity`,
    65 tests pass).
  - 2026-09-22 — caught up through `2779b409`: audited range
    `e5bd2013..2779b409` (covering Tearoff #374 trigger `e5bd2013..643b2be1`
    through HEAD). Gap detection confirmed zero missing `help.md` files
    across all 210 effect definitions. Verified all 1,257 documented
    parameters across 200 effects match definitions (`node shaders/tests/test_effect_help_params.mjs`).
    Audit of commits in the range (`52ac841b` recording GAP-002 column
    verification, `b0364da0` docs ledger advance, `a0ff705a` contract ledger
    advance, `643b2be1` exposing structured DSL lexer diagnostics, and
    `2779b409` recording GAP-002 lexer verification) confirmed no narrative
    statements in `docs/` were invalidated and no new narrative feature guides
    under `docs/shaders/features.rst` were required. Verified docs static paths
    (`node --test test/docs-static-paths.test.js`, 4/4 pass) and non-parity JS
    test suite (`node scripts/run-js-tests.js --skip-parity`, 64 tests pass).
  - 2026-09-22 — caught up through `e5bd2013`: audited range
    `c9ca39ba..e5bd2013` (covering Tearoff #343 trigger `62bd24bc..e5bd2013`
    through HEAD). Gap detection confirmed zero missing `help.md` files
    across all 210 effect definitions. Verified all 1,257 documented
    parameters across 200 effects match definitions (`node shaders/tests/test_effect_help_params.mjs`).
    Audit of commits in the range (`68d37721` excluding builtins from mutation
    introspection, `256d2d46` closing GAP-022 in docs plan, `3001db91` ledger
    coverage, and `e5bd2013` preserving source columns in DSL diagnostics)
    confirmed no narrative statements in `docs/` were invalidated and no new
    narrative feature guides under `docs/shaders/features.rst` were required.
    Verified docs static paths (`node --test test/docs-static-paths.test.js`,
    4/4 pass) and non-parity JS test suite (`node scripts/run-js-tests.js --skip-parity`,
    64 tests pass).
  - 2026-09-21 — caught up through `c9ca39ba`: audited range
    `9d522a31..c9ca39ba` (covering Tearoff #327 trigger `50b8f909..62bd24bc`
    through HEAD). Gap detection confirmed zero missing `help.md` files
    across all 210 effect definitions. Verified all 1,257 documented
    parameters across 200 effects match definitions. Invalidation audit
    confirmed no further documentation statements invalidated (DSL output
    surface range enforcement in `docs/shaders/language.rst` already landed
    in `62bd24bc`). Verified docs static paths (`node --test test/docs-static-paths.test.js`,
    4/4 pass) and non-parity JS test suite (`node scripts/run-js-tests.js --skip-parity`,
    64 tests pass).
  - 2026-09-21 — caught up through `9d522a31`: audited range
    `f61ac073..9d522a31` (covering Tearoff #315 trigger `2f855c9c..50b8f909`
    through HEAD). Gap detection confirmed zero missing `help.md` files
    across all 210 effect definitions. Invalidation audit identified that
    the DSL grammar definition for `OutputRef` in `docs/shaders/language.rst`
    allowed unbounded digits (`'o' Digit+`); updated it to `OutputDigit`
    (`'0'…'7'`) and documented compile-time range enforcement (resolved
    by GAP-001 in `50b8f909`). Verified `node --test test/docs-static-paths.test.js`
    (4/4 pass), `node shaders/tests/test_effect_help_params.mjs` (1257 documented
    parameters across 200 effects matching definitions), and `node scripts/run-js-tests.js --skip-parity`
    (57/57 passed).
  - 2026-09-21 — caught up through `f61ac073`: audited range
    `ac8a8d90..f61ac073` (covering Tearoff #306 trigger `8ddf9e6e..2f855c9c`
    through HEAD). Gap detection confirmed zero missing `help.md` files
    across all 210 effect definitions (accounting for the removal of expired
    effects `bc`, `colorspace`, and `hs` in `2f855c9c`). Invalidation audit
    identified an outdated warning in `docs/shaders/renderer-output.rst`
    regarding frame-export queue reconfiguration/close accounting; corrected
    it to document that canceled pending frames are now accounted as `dropped`
    (resolved by GAP-028 in `0139e958`). Verified `node --test test/docs-static-paths.test.js`
    (4/4 pass), `node shaders/tests/test_effect_help_params.mjs` (1257 documented
    parameters across 200 effects matching definitions), and `node scripts/run-js-tests.js --skip-parity`
    (57/57 passed).
  - 2026-09-20 — caught up through `ac8a8d90`: audited range

    `beabda38..ac8a8d90`. Gap detection confirmed zero missing `help.md`
    files across all 213 effect definitions. Commits in the range consist of
    documentation and ledger synchronizations: active framework gap resolution
    (`b8332f16`, closing GAP-031), prior Documentation checkpoint and Sphinx
    narrative updates (`8ddf9e6e`), contract snapshot re-audit (`1086890d`),
    and I18n strings checkpoint advancement (`ac8a8d90`). None invalidated
    existing Sphinx narrative in `docs/` or required new feature guides under
    `docs/shaders/features.rst`. Verified `node --test test/docs-static-paths.test.js`
    (4/4 pass) and `node shaders/tests/test_effect_help_params.mjs` (1263
    documented parameters across 203 effects matching definitions). No
    documentation gaps to close.
  - 2026-09-20 — caught up through `beabda38`: audited range
    `f90a4d2a..beabda38`. Gap detection confirmed zero missing `help.md`
    files across all 213 effect definitions. Shipped commits in the range
    include borrowed VideoFrame texture upload support (`2df19feb`),
    dynamic surface/texture format recreation on format changes (`6e0166ce`,
    GAP-030), and static integer 1..16 channel enforcement for legacy MIDI
    modes (`beabda38`, GAP-031). Narrative audit identified an invalidated
    statement in `docs/shaders/midi-audio.rst` regarding legacy note mode
    channel handling, which was corrected to reflect static integer 1–16
    validation across all channel-based modes; also documented borrowed
    `VideoFrame` upload support in `docs/shaders/integration.rst`. Verified
    `node --test test/docs-static-paths.test.js` (4/4 pass) and
    `node shaders/tests/test_effect_help_params.mjs` (1263 documented
    parameters across 203 effects matching definitions).
  - 2026-09-19 — caught up through `f90a4d2a`: audited range
    `ead42a5d..f90a4d2a`. Gap detection confirmed zero missing `help.md`
    files across all 213 effect definitions. Shipped commits in the range
    include the compiler phase-2 harness nonzero exit status fix
    (`f1d2b46a`, GAP-023), related active framework gap status resolution
    (`f90a4d2a`), starter-position documentation in llms-full.txt (`f3d6f9a6`),
    agent doc unifications, and symlink ban enforcements. None invalidated
    existing Sphinx narrative in `docs/` or required new feature guides under
    `docs/shaders/features.rst`. Verified `node --test test/docs-static-paths.test.js`
    (4/4 pass) and `node shaders/tests/test_effect_help_params.mjs` (1263
    documented parameters across 203 effects matching definitions). No
    documentation gaps to close.
  - 2026-09-18 — caught up through `ead42a5d`: audited range
    `5a142567..ead42a5d`. Gap detection identified zero missing `help.md`
    files across all 213 effect definitions. Shipped commits in the range
    include the WebGPU frame export row-inversion orientation fix
    (`5ceb97ba`/`688c5146`), `defaultProgram` discrete-chain updates for
    `synth3d/heightmap3d` and `render/renderLandscape3d` (`f2506d21`), and
    associated parity attestations (`ead42a5d`). None invalidated existing
    Sphinx narrative in `docs/` or required new feature guides under
    `docs/shaders/features.rst`. Verified `node --test test/docs-static-paths.test.js`
    (4/4 pass). No documentation gaps to close.
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

- **Checkpoint:** noisemaker `5e52a2a2` / shade-mcp `00340b1`, 2026-09-25
- **Scope:** compatibility between Noisemaker and Shade MCP, recorded in
  this shared ledger and the hand-authored agent contract `llms-full.txt` — the
  executable-source companion served at the site root that describes
  *current* runtime behavior across nine surfaces (DSL, effect definition,
  parameters/globals, passes/graph, textures, compatibility/mutation,
  rendered output, cross-backend parity, Shade MCP tool contracts), a fully
  worked validated effect, the surface × capability traceability matrix, and
  the 19-entry open gap register (GAP-005..012, GAP-014..017, GAP-019..021,
  GAP-024, GAP-026, GAP-029, and GAP-032). The file pins its
  own audited SHAs in the "Source snapshots used for this contract" block at
  its head; that block and this checkpoint are the same two SHAs and must be
  advanced together. There is no generator — every update is a hand edit
  verified against live source.
  The short public index `llms.txt` carries no pinned snapshot and is kept
  current in-band with its links, so it is not part of this pass.
  Work spans both repositories even when only one changed. Noisemaker owns
  the engine, effects, viewer, MCP configuration, and vendored integration;
  Shade MCP owns its parsers, analysis, knowledge, browser tools, and harness
  exports. Fix affected integration code in its owning repository before
  describing the pair as compatible. Preserve valid DSL behavior, rendered
  output, defaults, saved programs, step indexes, and public tool result
  shapes. Unrelated engine gap closure is outside this pass.
- **Delivery evidence:** record four identities separately in each completed
  pass: Noisemaker source SHA, Shade MCP source SHA, the immutable Shade MCP
  commit configured in `.mcp.json`, and the release tag/source SHA delivered
  to `vendor/shade-mcp/`. The MCP pin and vendored harness are independent
  delivery paths. A local Shade build or source fix proves neither release
  nor installation. Use the existing release and `pull-shade-mcp` process;
  never hand-edit generated vendor bundles or replace the immutable pin
  with a floating branch. Commit, push, release, and deployment actions
  still require explicit operator authorization.
- **Gap detection:**
  1. Noisemaker drift — inspect changes since this section's current
     Noisemaker checkpoint, including source consumed by Shade and changes
     to either delivery path:

     ```
     git log --oneline <noisemaker-checkpoint>..HEAD -- shaders/src/ shaders/effects/ shaders/tests/ demo/shaders/ .mcp.json vendor/shade-mcp/ pull-shade-mcp .github/workflows/pull-shade-mcp.yml test/mcp-config.test.js
     ```

     Each can invalidate a behavior statement, typed grammar, or validator
     message, catalog reference, viewer bridge, harness API, or gap status.
     Check Shade's consumers against these changes, re-audit the affected
     contract sections, and re-check gaps whose "Source evidence" changed.
  2. Shade MCP drift — `.mcp.json` runs
     `npx -y github:noisedeck/shade-mcp#<sha>` pinned to an immutable commit
     (GAP-013 closed). Check upstream `noisefactorllc/shade-mcp` for new
     commits since the Shade checkpoint and for newer releases. Compare
     tool schemas/results, harness exports, and browser behavior with
     Noisemaker's viewer, vendor imports, and configured MCP. Reconcile both
     delivery paths with the tested Shade source and record their provenance.
     A newer release does not reopen GAP-013: that gap tracks immutable
     pinning, not freshness.
  3. Audit both complete checkpoint-to-source ranges. A queue trigger range
     is not evidence that an earlier pass completed. Missing vendor
     provenance, pending source fixes, undelivered releases, and unavailable
     checks are explicit blockers, not grounds to advance a checkpoint.
- **Validation and completion:** run Noisemaker's prescribed JS tests and
  lint, Shade's typecheck and tests, relevant structure/compile/render checks
  on WebGL2 and WebGPU through the configured MCP and vendored harness, and
  Shade's real viewer smoke test (`NOISEMAKER` set to the Noisemaker checkout,
  `node scripts/browser-smoke.mjs`). Build Shade when needed under its
  instructions; never build Noisemaker dist locally. Re-capture MCP
  initialization, `tools/list`, the server/protocol version triple, and the
  affected worked request/response from one session at the tested immutable
  pin. Unit tests or a tool count alone do not prove browser compatibility.
  Verify required CI for each changed repository's exact published commit
  and verify the resulting delivery state. Then update affected contract
  sections, the traceability matrix, and source-evidence gaps, and advance
  both checkpoints together with the contract's snapshot block. Include all
  four identities and validation evidence in the log. If any part remains
  unverified, keep the last completed checkpoints and record remaining work
  here. Historical entries below do not retroactively certify these added
  delivery checks.
- **Log:**
  - 2026-09-25 — caught up through noisemaker `5e52a2a2` / shade-mcp `00340b1`:
    audited watched source roots across noisemaker range `69d83b80..5e52a2a2`
    (covering Tearoff #551 trigger `4891b995..2f47612c` through HEAD).
    Commits `a021a283`, `62eb56fa`, and `2f47612c` implemented GAP-004 authorable
    mipmaps/persistent/3D filter texture policies across WebGL2 and WebGPU
    backends, compiler, and pipeline. Commit `85ded3a6` closed GAP-004 with
    verified publication evidence for `2f47612c` (review 55cfba6d-bd00-477d-9ee1-f19ddf6fade9;
    Release v1.0.182 run 36173647198, Shaders 36172741063, Site 36172741094, Downstream
    36172741064, Docs site 36172741147, JavaScript 36172741121). Commit `63349a7d`
    retired per-push snapshot releases. Commits `c6bc8e17` and `5e52a2a2` advanced
    Documentation checkpoints and recorded docs deployment. Shade MCP source
    unchanged at `00340b1`. Verified four identities: Noisemaker source
    `5e52a2a2fcaeb3cd540e7bdc0328a2a009116ff5`, Shade MCP source
    `00340b148e109464b1a87d89ff29fc7622d384c9`, `.mcp.json` pinned to
    `cbcab33363851016f65391fbb9ef71d66729c07f`, and `vendor/shade-mcp/` delivered
    from release `v0.2.3` (`cbcab33363851016f65391fbb9ef71d66729c07f`). Open gap
    count stands at 19 entries (GAP-004 closed). Verified Noisemaker non-parity JS
    tests (`node scripts/run-js-tests.js --skip-parity`, all suites pass) and lint
    (`npm run lint`), Shade MCP typecheck (`npm run typecheck`, 0 errors) and unit
    tests (`npm test`, 24 files / 157 tests pass), structure check via vendored
    harness (`npm run test:shaders:structure`, 206/206 pass, 1258 parameters), WebGL2
    and WebGPU render checks (`npm run test:shaders:render:webgl2` and
    `npm run test:shaders:render:webgpu`), and live browser smoke test against
    Noisemaker viewer (`NOISEMAKER=... node scripts/browser-smoke.mjs`, all 3 checks OK:
    `compileEffect`, `renderEffectFrame`, module import from `setContent` page).
    Re-captured MCP initialization, server info (`shade-mcp 0.2.3`), protocol
    (`2024-11-05`), 18 tools via `tools/list`, and worked tool call `checkEffectStructure`
    with `effect_id: "synth/noise"`. Updated `llms-full.txt` snapshot block and
    advanced `LEDGER.md` checkpoint together.
  - 2026-09-25 — caught up through noisemaker `69d83b80` / shade-mcp `00340b1`:
    audited watched source roots across noisemaker range `5f4b7c43..69d83b80`
    (covering Tearoff #535 trigger `4891b995..9d3474df` through HEAD).
    Commits `ba87ffae` and `9d3474df` implemented GAP-003 runtime effect definition
    validation contract (`validateEffectDefinition` in `shaders/src/runtime/effect-validator.js`)
    with an explicit-denominator 210/210 corpus gate wired into test suites.
    Commit `0bd09d00` recorded GAP-027 verified publication closure evidence.
    Commits `7a643033` and `fa4b2f02` closed GAP-003 with verified publication evidence
    and aligned `llms-full.txt` validator cross-references. Commits `286ccf68` and `69d83b80`
    advanced Documentation checkpoints through `fa4b2f02`.
    Shade MCP source unchanged at `00340b1`. Verified four identities: Noisemaker source
    `69d83b80e09227195fa9810e37b96dd594713ac3`, Shade MCP source
    `00340b148e109464b1a87d89ff29fc7622d384c9`, `.mcp.json` pinned to
    `cbcab33363851016f65391fbb9ef71d66729c07f`, and `vendor/shade-mcp/` delivered
    from release `v0.2.3` (`cbcab33363851016f65391fbb9ef71d66729c07f`). Open gap
    count stands at 20 entries (GAP-003 and GAP-027 closed). Verified Noisemaker
    non-parity JS tests (`node scripts/run-js-tests.js --skip-parity`, all suites pass)
    and lint (`npm run lint`), Shade MCP typecheck (`npm run typecheck`, 0 errors)
    and unit tests (`npm test`, 24 files / 157 tests pass), structure check via
    vendored harness (`npm run test:shaders:structure`, 206/206 pass, 1258 parameters),
    WebGL2 and WebGPU render checks (`npm run test:shaders:render:webgl2` and
    `npm run test:shaders:render:webgpu`), and live browser smoke test against Noisemaker
    viewer (`NOISEMAKER=... node scripts/browser-smoke.mjs`, all 3 checks OK: `compileEffect`,
    `renderEffectFrame`, module import from `setContent` page). Re-captured MCP
    initialization, server info (`shade-mcp 0.2.3`), protocol (`2024-11-05`),
    18 tools via `tools/list`, and worked tool call `checkEffectStructure` with `effect_id: "synth/noise"`.
    Updated `llms-full.txt` snapshot block and advanced `LEDGER.md` checkpoint together.
  - 2026-09-25 — caught up through noisemaker `5f4b7c43` / shade-mcp `00340b1`:
    audited watched source roots across noisemaker range `60b90af3..5f4b7c43`
    (covering Tearoff #516 trigger `4891b995..240740dd` through HEAD).
    Commit `66b2c721` implemented GAP-027 subchain-argument validation contract
    (P008 unknown/discarded key, P009 duplicate key, P010 missing comma separator,
    and `subchainArguments: 'strict'` opt-in rejection). Commit `240740dd`
    (v1.0.180) registered differential gate baseline against `3886ecfa` (0 regressions).
    Commits `5a58a325` and `c85db3f0` recorded published contract and gap status.
    Commit `5f4b7c43` advanced the Documentation checkpoint through `240740dd`.
    Shade MCP source unchanged at `00340b1`. Verified four identities: Noisemaker source
    `5f4b7c43a0201ab197cd1b27a66e6217b776bf57`, Shade MCP source
    `00340b148e109464b1a87d89ff29fc7622d384c9`, `.mcp.json` pinned to
    `cbcab33363851016f65391fbb9ef71d66729c07f`, and `vendor/shade-mcp/` delivered
    from release `v0.2.3` (`cbcab33363851016f65391fbb9ef71d66729c07f`). Open gap
    count stands at 22 entries (GAP-027 documented and active). Verified Noisemaker
    non-parity JS tests (`node scripts/run-js-tests.js --skip-parity`, all suites pass)
    and lint (`npm run lint`), Shade MCP typecheck (`npm run typecheck`, 0 errors)
    and unit tests (`npm test`, 24 files / 157 tests pass), structure check via
    vendored harness (`npm run test:shaders:structure`, 206/206 pass, 1258 parameters),
    and live browser smoke test against Noisemaker viewer
    (`NOISEMAKER=... node scripts/browser-smoke.mjs`, all 3 checks OK: `compileEffect`,
    `renderEffectFrame`, module import from `setContent` page). Re-captured MCP
    initialization, server info (`shade-mcp 0.2.3`), protocol (`2024-11-05`),
    18 tools via `tools/list`, and worked tool call `checkEffectStructure` with `effect_id: "synth/noise"`.
    Updated `llms-full.txt` snapshot block and advanced `LEDGER.md` checkpoint together.
  - 2026-09-24 — caught up through noisemaker `60b90af3` / shade-mcp `00340b1`:
    audited watched source roots across noisemaker range `13853dff..60b90af3`
    (covering Tearoff #497 triggers `5b81e04f..4891b995` through HEAD).
    Commit `4891b995` exposed structured call-form and expectation diagnostics
    (P007/P001), closing GAP-002 parser throw sites. Commit `9fa1a221` derived
    parser diagnostic coordinates from source positions. Commit `fca611fd`
    derived numeric-coercion coordinates from array positions. Commits `8a21c9ca`
    and `bbdeb56c` documented verified GAP-002 closure provenance and publication
    evidence in `docs/plans/active-framework-gap.md` and `llms-full.txt`. Commit
    `60b90af3` advanced the Documentation checkpoint through `bbdeb56c`.
    Shade MCP source unchanged at `00340b1`. Verified four identities: Noisemaker source
    `60b90af373bceaf62060346d873d4f66232c7173`, Shade MCP source
    `00340b148e109464b1a87d89ff29fc7622d384c9`, `.mcp.json` pinned to
    `cbcab33363851016f65391fbb9ef71d66729c07f`, and `vendor/shade-mcp/` delivered
    from release `v0.2.3` (`cbcab33363851016f65391fbb9ef71d66729c07f`). Open gap
    count stands at 22 entries (GAP-002 closed, GAP-027 active). Verified Noisemaker
    non-parity JS tests (`node scripts/run-js-tests.js --skip-parity`, 122/122 pass)
    and lint (`npm run lint`), Shade MCP typecheck (`npm run typecheck`, 0 errors)
    and unit tests (`npm test`, 24 files / 157 tests pass), structure check via
    vendored harness (`npm run test:shaders:structure`, 206/206 pass, 1258 parameters),
    WebGL2/WebGPU render checks (`npm run test:shaders:render:webgl2` and `npm run test:shaders:render:webgpu`),
    and live browser smoke test against Noisemaker viewer
    (`NOISEMAKER=... node scripts/browser-smoke.mjs`, all 3 checks OK: `compileEffect`,
    `renderEffectFrame`, module import from `setContent` page). Re-captured MCP
    initialization, server info (`shade-mcp 0.2.3`), protocol (`2025-11-25`),
    18 tools via `tools/list`, and worked tool call `checkEffectStructure` with `effect_id: "synth/noise"`.
    Updated `llms-full.txt` snapshot block and advanced `LEDGER.md` checkpoint together.
  - 2026-09-24 — caught up through noisemaker `13853dff` / shade-mcp `00340b1`:
    audited watched source roots across noisemaker range `823bbff1..13853dff`
    (covering Tearoff #475 triggers `5b81e04f..13fa8b54` through HEAD).
    Commit `13fa8b54` narrowed GAP-002 by exposing structured parser diagnostics (P006)
    for explicit subchain validation sites (non-string arguments, missing body dot,
    empty body), preserving permissive argument keys/separators/duplicates and shared-expectation
    precedence. Commits `c7e9e09d` (AI development contract checkpoint advance),
    `9928905a` (Documentation checkpoint advance), `741333cb` (GAP-002 subchain validation evidence docs),
    `30c47030` (site: white ink on magenta surfaces), and `13853dff` (Documentation checkpoint advance)
    contained site script, documentation, and contract checkpoint updates with zero engine drift.
    Shade MCP source unchanged at `00340b1`. Verified four identities: Noisemaker source
    `13853dff08f583c14edd3536774b19e41eda8364`, Shade MCP source
    `00340b148e109464b1a87d89ff29fc7622d384c9`, `.mcp.json` pinned to
    `cbcab33363851016f65391fbb9ef71d66729c07f`, and `vendor/shade-mcp/` delivered
    from release `v0.2.3` (`cbcab33363851016f65391fbb9ef71d66729c07f`). Open gap
    count stands at 23 entries (GAP-002 narrowed). Verified Noisemaker non-parity JS tests
    (`node scripts/run-js-tests.js --skip-parity`, 79 parser tests + 91 diagnostic location tests + all integration tests pass)
    and lint (`npm run lint`), Shade MCP typecheck (`npm run typecheck`, 0 errors)
    and unit tests (`npm test`, 24 files / 157 tests pass), structure check via
    vendored harness (`npm run test:shaders:structure`, 206/206 pass, 1258 parameters),
    WebGL2/WebGPU render checks (`npm run test:shaders:render:webgl2` and `npm run test:shaders:render:webgpu`),
    and live browser smoke test against Noisemaker viewer
    (`NOISEMAKER=... node scripts/browser-smoke.mjs`, all 3 checks OK: `compileEffect`,
    `renderEffectFrame`, module import from `setContent` page). Re-captured MCP
    initialization, server info (`shade-mcp 0.2.3`), protocol (`2025-11-25`),
    18 tools via `tools/list`, and worked tool call `checkEffectStructure` with `effect_id: "synth/noise"`.
    Updated `llms-full.txt` snapshot block, DSL diagnostic description, and diagnostic code table,
    and advanced `LEDGER.md` checkpoint together.
  - 2026-09-24 — caught up through noisemaker `823bbff1` / shade-mcp `00340b1`:
    audited watched source roots across noisemaker range `7a54ab38..823bbff1`
    (covering Tearoff #453 triggers `5b81e04f..c9ee8a04` through HEAD).
    Commit `c9ee8a04` advanced AI development contract checkpoint for GAP-002 (P005).
    Commits `285e50f5` (site header strip program pixel density/AA ink), `65ff358f`
    (active-framework-gap docs reconciliation for GAP-002), and `823bbff1`
    (Documentation checkpoint advance) contained site script and documentation
    updates with zero engine drift across watched source roots (`shaders/`,
    `demo/shaders/`, `.mcp.json`, `vendor/shade-mcp/`). Shade MCP source unchanged at
    `00340b1`. Verified four identities: Noisemaker source `823bbff1d17061d231cb0c7f5bf4527b3344abab`,
    Shade MCP source `00340b148e109464b1a87d89ff29fc7622d384c9`, `.mcp.json` pinned to
    `cbcab33363851016f65391fbb9ef71d66729c07f`, and `vendor/shade-mcp/` delivered
    from release `v0.2.3` (`cbcab33363851016f65391fbb9ef71d66729c07f`). Open gap
    count stands at 23 entries. Verified Noisemaker non-parity JS tests
    (`node scripts/run-js-tests.js --skip-parity`, 79 parser tests + all integration tests pass)
    and lint (`npm run lint`), Shade MCP typecheck (`npm run typecheck`, 0 errors)
    and unit tests (`npm test`, 24 files / 157 tests pass), structure check via
    vendored harness (`npm run test:shaders:structure`, 206/206 pass, 1258 parameters),
    WebGL2/WebGPU render checks (`npm run test:shaders:render:webgl2` and `npm run test:shaders:render:webgpu`),
    and live browser smoke test against Noisemaker viewer
    (`NOISEMAKER=... node scripts/browser-smoke.mjs`, all 3 checks OK: `compileEffect`,
    `renderEffectFrame`, module import from `setContent` page). Re-captured MCP
    initialization, server info (`shade-mcp 0.2.3`), protocol (`2025-11-25`), and
    18 tools via `tools/list`. Updated `llms-full.txt` snapshot block and advanced `LEDGER.md`
    checkpoint together.
  - 2026-09-23 — caught up through noisemaker `7a54ab38` / shade-mcp `00340b1`:
    audited watched source roots across noisemaker range `e11f0767..7a54ab38`
    (covering Tearoff #434 triggers `e32a5a4a..5b81e04f` through HEAD).
    Commit `9b88e567` optimized `classicNoisedeck/glitch` by guarding glitch, scanline,
    and snow work when amounts are zero and attested WebGL2/WebGPU pixel parity.
    Commit `5b81e04f` implemented output sink deferral via optional `deferRender()`
    method on sinks, tracked in `renderer.deferredFrameCount`, with error isolation
    incrementing `stats.failed`. Commits `7d0be45c` and `cc1ba268` advanced documentation
    and ledger checkpoints. Commit `7a54ab38` narrowed GAP-002 by exposing structured
    parser diagnostics (P005) for reachable output validation sites (invalid render
    targets, expression-context writes, invalid write surfaces, invalid write3d
    texture/geo arguments). Shade MCP source unchanged at `00340b1`. Verified four
    identities: Noisemaker source `7a54ab3856d71ce037f11215572e8137ad4f53c0`, Shade MCP
    source `00340b148e109464b1a87d89ff29fc7622d384c9`, `.mcp.json` pinned to
    `cbcab33363851016f65391fbb9ef71d66729c07f`, and `vendor/shade-mcp/` delivered
    from release `v0.2.3` (`cbcab33363851016f65391fbb9ef71d66729c07f`). Open gap
    count stands at 23 entries (GAP-002 narrowed). Verified Noisemaker non-parity JS tests
    (`node scripts/run-js-tests.js --skip-parity`, 79 parser tests + all integration tests pass)
    and lint (`npm run lint`), Shade MCP typecheck (`npm run typecheck`, 0 errors)
    and unit tests (`npm test`, 24 files / 157 tests pass), structure check via
    vendored harness (`npm run test:shaders:structure`, 206/206 pass), WebGL2/WebGPU
    render checks (`npm run test:shaders:render:webgl2` and `npm run test:shaders:render:webgpu`),
    and live browser smoke test against Noisemaker viewer
    (`NOISEMAKER=... node scripts/browser-smoke.mjs`, all 3 checks OK: `compileEffect`,
    `renderEffectFrame`, module import from `setContent` page). Re-captured MCP
    initialization, server info (`shade-mcp 0.2.3`), protocol (`2024-11-05`), and
    18 tools via `tools/list`. Updated `llms-full.txt` snapshot block, `Sink` interface,
    and Act/Validate subsections for sink deferral, and advanced `LEDGER.md`
    checkpoint together.
  - 2026-09-23 — caught up through noisemaker `e11f0767` / shade-mcp `00340b1`:
    audited watched source roots across noisemaker range `9e188535..e11f0767`
    (covering Tearoff #415 trigger `44bc4ed4..e11f0767`).
    Commits `e32a5a4a`, `731b76e4`, `0766743e`, and `32f818e7` narrowed GAP-002 by
    exposing structured parser diagnostics for automation arguments (P003) and
    search directives (P004) with token coordinates and null spans while retaining
    legacy errors, updating `llms-full.txt` and `docs/plans/active-framework-gap.md`.
    Commits `e2874c85` and `3a32b198` preserved chain- and node-scoped texture sizes
    and pass-level precedence during `pipeline.setUniform()`.
    Commits `fde2ea40` and `e11f0767` optimized `classicNoisedeck/noise` to skip
    refraction when zero and attested GLSL/WGSL pixel parity with refraction active.
    Shade MCP source unchanged at `00340b1`. Verified four identities: Noisemaker
    source `e11f0767993ae77eab6f3e353c942cf721aa9c90`, Shade MCP source
    `00340b148e109464b1a87d89ff29fc7622d384c9`, `.mcp.json` pinned to
    `cbcab33363851016f65391fbb9ef71d66729c07f`, and `vendor/shade-mcp/` delivered
    from release `v0.2.3` (`cbcab33363851016f65391fbb9ef71d66729c07f`). Open gap
    count stands at 23 entries. Verified Noisemaker non-parity JS tests
    (`node scripts/run-js-tests.js --skip-parity`, 63 tests pass) and lint (`npm run lint`),
    Shade MCP typecheck (`npm run typecheck`, 0 errors) and unit tests
    (`npm test`, 24 files / 157 tests pass), structure check via vendored harness
    (206/206 pass), and live browser smoke test against Noisemaker viewer
    (`NOISEMAKER=... node scripts/browser-smoke.mjs`, all 3 checks OK). Advanced
    `llms-full.txt` snapshot block and `LEDGER.md` checkpoint together.
  - 2026-09-22 — caught up through noisemaker `9e188535` / shade-mcp `00340b1`:
    audited watched source roots across noisemaker range `ad60cc9b..9e188535`
    (covering Tearoff #395 trigger `e5bd2013..44bc4ed4` through HEAD).
    Commits `36a519a2`, `31ab014f`, and `ae4e3302` added pruned isosurface mode
    to `renderLandscape3d` with coordinate fixes. Commits `44bc4ed4` and `dd38fdd2`
    narrowed GAP-002 by exposing structured parser expectation diagnostics
    (P001/P002 in parser `expect()`) with token coordinates and null spans while
    retaining legacy errors, updating `llms-full.txt` and `docs/plans/active-framework-gap.md`.
    Commits `1d581ffa`, `eb46047b`, and `9e188535` advanced ledger and docs
    checkpoints. Shade MCP source unchanged at `00340b1`. Verified four
    identities: Noisemaker source `9e188535a1736780f5318d5412f0154f4209e8b1`,
    Shade MCP source `00340b148e109464b1a87d89ff29fc7622d384c9`, `.mcp.json` pinned
    to `cbcab33363851016f65391fbb9ef71d66729c07f`, and `vendor/shade-mcp/`
    delivered from release `v0.2.3` (`cbcab33363851016f65391fbb9ef71d66729c07f`).
    Open gap count stands at 23 entries. Verified Noisemaker non-parity JS tests
    (`node scripts/run-js-tests.js --skip-parity`, 65 tests pass) and lint, Shade MCP
    typecheck (`npm run typecheck`, 0 errors) and unit tests (`npm test`, 24 files /
    157 tests pass), structure check via vendored harness (206/206 pass), and
    live browser smoke test against Noisemaker viewer (`NOISEMAKER=... node scripts/browser-smoke.mjs`,
    all 3 checks OK). Advanced `llms-full.txt` snapshot block and `LEDGER.md`
    checkpoint together.
  - 2026-09-22 — caught up through noisemaker `ad60cc9b` / shade-mcp `00340b1`:
    audited watched source roots across noisemaker range `e5bd2013..ad60cc9b`
    (covering Tearoff #375 trigger `e5bd2013..643b2be1` through HEAD).
    Commit `643b2be1` narrowed GAP-002 by attaching structured JSON-safe
    `error.diagnostic` (L001-L004) to thrown `SyntaxError` on DSL lexer failures
    in `shaders/src/lang/lexer.js` and `diagnostics.js`, preserving legacy error
    messages, types, and successful token output. Commits `52ac841b`, `b0364da0`,
    `a0ff705a`, `2779b409`, and `ad60cc9b` recorded gap verifications, docs
    and contract ledger advances. Shade MCP source unchanged at `00340b1`.
    Verified four identities: Noisemaker source `ad60cc9b62aa3b5f0674c590880898694ede5ddf`
    (source through `2779b409fc4cfcb923cfc67c771d80ad398cd2a3`), Shade MCP source
    `00340b148e109464b1a87d89ff29fc7622d384c9`, `.mcp.json` pinned to
    `cbcab33363851016f65391fbb9ef71d66729c07f`, and `vendor/shade-mcp/` delivered
    from release `v0.2.3` (`cbcab33363851016f65391fbb9ef71d66729c07f`). Open gap
    count stands at 23 entries. Verified Noisemaker non-parity JS tests
    (`node scripts/run-js-tests.js --skip-parity`, 64 tests pass) and lint, Shade MCP
    typecheck (`npm run typecheck`, 0 errors) and unit tests (`npm test`, 24 files /
    157 tests pass), structure-only check via vendored harness (206/206 pass), and
    live browser smoke test against Noisemaker viewer (`NOISEMAKER=... node scripts/browser-smoke.mjs`,
    all 3 checks OK). Advanced `llms-full.txt` snapshot block and `LEDGER.md`
    checkpoint together.
  - 2026-09-22 — caught up through noisemaker `e5bd2013` / shade-mcp `00340b1`:
    audited watched source roots across noisemaker range `50b8f909..e5bd2013`.
    Commit `68d37721` closed GAP-022 by excluding compiled nodes marked `builtin: true`
    from mutation introspection (`listSteps`, `replaceEffect`, `getCompatibleReplacements`)
    in `shaders/src/lang/transform.js`. Commit `e5bd2013` narrowed GAP-002 by preserving
    source columns from parser `loc.col` into `location.column` in `shaders/src/lang/validator.js`.
    In shade-mcp across range `cbcab33..00340b1`, commit `00340b1` documented paired
    Noisemaker compatibility and delivery checks in `CLAUDE.md`, with zero runtime,
    tool, or schema changes. Verified four identities: Noisemaker source `e5bd2013087e54d53841db8c45a54f973aaa5174`,
    Shade MCP source `00340b148e109464b1a87d89ff29fc7622d384c9`, `.mcp.json` pinned to
    `cbcab33363851016f65391fbb9ef71d66729c07f`, and `vendor/shade-mcp/` delivered from
    release `v0.2.3` (`cbcab33363851016f65391fbb9ef71d66729c07f`). Open gap count stands
    at 23 entries. Verified Noisemaker non-parity JS tests (`node scripts/run-js-tests.js --skip-parity`,
    64 tests pass) and lint, Shade MCP typecheck (`npm run typecheck`, 0 errors) and unit tests
    (`npm test`, 24 files / 157 tests pass), Shade MCP build and drop check, structure-only check
    via vendored harness, and live browser smoke test against Noisemaker viewer
    (`NOISEMAKER=... node scripts/browser-smoke.mjs`, all 3 checks OK). Advanced `llms-full.txt`
    snapshot block and `LEDGER.md` checkpoint together.
  - 2026-09-21 — caught up through noisemaker `50b8f909` / shade-mcp `cbcab33`:
    audited watched source roots across noisemaker range `ea113f97..50b8f909`.
    Commit `50b8f909` closed GAP-001 by enforcing DSL output surface range
    `o0..o7` in `shaders/src/lang/lexer.js`, throwing located `SyntaxError`
    before parsing, while preserving member segment access and other reference
    families. Added 6 unit tests in `shaders/tests/test_output_surface_range.js`.
    Open gap count stands at 24 entries. Shade MCP unchanged at `cbcab33` (18
    tools, v0.2.3, protocol 2025-11-25). Verified non-parity JS test suite
    (`node scripts/run-js-tests.js --skip-parity`, 64 tests pass). Advanced
    `llms-full.txt` snapshot block and `LEDGER.md` checkpoint together.
  - 2026-09-21 — caught up through noisemaker `ea113f97` / shade-mcp `cbcab33`:
    audited watched source roots across noisemaker range `beabda38..ea113f97`.
    Commit `0139e958` closed GAP-028 by accounting canceled pending frame-export
    queue frames as `dropped`. Commit `7706a715` / `782f0726` closed GAP-013 by
    pinning the Shade MCP package reference in `.mcp.json` to immutable commit
    `cbcab33363851016f65391fbb9ef71d66729c07f`. Commit `2f855c9c` removed expired
    effects `bc`, `colorspace`, and `hs`. Shade MCP `cbcab33` bumped version to
    0.2.3 and migrated exemplar/catalog references to `adjust` (18 tools, v0.2.3,
    protocol 2025-11-25). Open gap count stands at 25 entries. Verified
    non-parity JS tests pass cleanly (57 tests, 15 nested automation tests, 4
    docs tests, 1 mcp config test). Advanced `llms-full.txt` snapshot block and
    `LEDGER.md` checkpoint together.
  - 2026-09-20 — caught up through noisemaker `beabda38` / shade-mcp `088e1ef`:
    audited watched source roots across noisemaker range `2df19feb..beabda38`.
    Commit `6e0166ce` closed GAP-030 by enforcing backend format parity when
    reusing textures in `pipeline.js`. Commit `beabda38` closed GAP-031 by
    requiring static integers 1..16 for legacy MIDI note mode channels in
    `validator.js`. Updated traceability matrix in `llms-full.txt` to remove
    references to closed gaps (GAP-018, GAP-023, GAP-030, GAP-031). Shade MCP
    unchanged at `088e1ef` (18 tools, v0.2.2, protocol 2025-11-25). Verified
    non-parity JS tests pass cleanly (57 MIDI/audio parser tests, 15 nested
    automation tests, 4 docs tests). Advanced `llms-full.txt` snapshot block and
    `LEDGER.md` checkpoint together.
  - 2026-09-19 — caught up through noisemaker `2df19feb` (shade-mcp unchanged
    at `088e1ef`): audited watched source roots across noisemaker range
    `0209609e..2df19feb`. Commit `2df19feb` added borrowed `VideoFrame` support
    in `updateTextureFromSource` on both WebGL2 and WebGPU backends (synchronous
    display dimension extraction, immediate queue submission without ImageBitmap
    conversion, synchronous caller release, and anamorphic scaling rejection on
    WebGL2). Updated texture surface contract in `llms-full.txt`. Shade MCP
    unchanged at `088e1ef` (18 tools, v0.2.2, protocol 2025-11-25). Verified
    Playwright VideoFrame upload tests (2/2 pass) and non-parity JS test suite
    pass cleanly. Advanced llms-full.txt snapshot block and LEDGER.md checkpoint
    together.
  - 2026-09-19 — caught up through noisemaker `0209609e` / shade-mcp `088e1ef`:
    audited watched source roots across noisemaker range `ead42a5d..0209609e`
    (zero commits touched watched source roots; GAP-023 already documented as
    closed at `f1d2b46a`). In shade-mcp across range `0a92bd83..088e1ef`, single
    commit `088e1ef` modified CI workflow files only (`.github/workflows/`),
    with zero changes to runtime tools, schemas, dependencies, or server version
    (18 tools, v0.2.2, protocol 2025-11-25 unchanged). Re-audited worked effect
    transcript note. Verified non-parity JS tests pass cleanly. Advanced
    llms-full.txt snapshot block and LEDGER.md checkpoint together.
  - 2026-09-18 — caught up through noisemaker `ead42a5d` (shade-mcp
    unchanged): audited watched source roots across range `688c5146..ead42a5d`.
    Single code commit `f2506d21` modified `shaders/src/lang/transform.js`,
    expanding starter-position detection in `replaceEffect()`, `listSteps()`,
    and `getCompatibleReplacements()` to recognize inline surface producers
    (registered starter effects with no pipeline predecessor flattened as a
    dependency of a surface parameter like `heightTex: noise()`). Updated
    compatibility definitions and narrowed GAP-008 in the contract. Shade MCP
    remains at `0a92bd83`. Verified non-parity JS tests pass cleanly. Updated
    contract snapshot block and LEDGER.md checkpoint together.
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
