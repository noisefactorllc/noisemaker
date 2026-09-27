#!/usr/bin/env node
/**
 * GAP-024 focused regressions: requested-effect / compiled-graph /
 * actual-backend identity binding for the repository's browser test-harness
 * paths (shaders/tests/session-identity.js, mirrored from the harness).
 *
 * The upstream Shade MCP browser verbs (`vendor/shade-mcp/harness/index.js`,
 * built from `src/tools/browser/*.ts` and `src/harness/browser-session.ts`)
 * poll status text for readiness, dispatch effect selection without awaiting
 * the asynchronous load, and exit silently when the `setBackend()` poll
 * times out — so any browser `ok` result can describe a previously ready
 * graph or an unintended backend. These regressions pin the repository-side
 * resolution: backend-name normalization, page effect-id extraction, the
 * compiled-graph generation/compiling classification, the full identity
 * record, additive-only result annotation, the opt-in gate, and source
 * guards that keep the harness binding readiness to the page-confirmed
 * identity instead of status text.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
    annotateIdentity,
    classifyGraph,
    classifyIdentity,
    collectPageIdentityInPage,
    identityReadyInPage,
    normalizeBackendName,
    pageEffectId,
    strictIdentityFailed,
} from './session-identity.js'

// ---------------------------------------------------------------------------
// normalizeBackendName: every shipped spelling normalizes; junk is null.
// ---------------------------------------------------------------------------

assert.equal(normalizeBackendName('webgl2'), 'webgl2')
assert.equal(normalizeBackendName('glsl'), 'webgl2')
assert.equal(normalizeBackendName('WebGL2'), 'webgl2')
assert.equal(normalizeBackendName(' webgl2 '), 'webgl2')
assert.equal(normalizeBackendName('webgpu'), 'webgpu')
assert.equal(normalizeBackendName('wgsl'), 'webgpu')
assert.equal(normalizeBackendName('WebGPU'), 'webgpu')
assert.equal(normalizeBackendName('vulkan'), null)
assert.equal(normalizeBackendName(''), null)
assert.equal(normalizeBackendName(null), null)
assert.equal(normalizeBackendName(undefined), null)
assert.equal(normalizeBackendName(42), null)
// A live backend object is normalized through its getName().
assert.equal(normalizeBackendName({ getName: () => 'WebGL2' }), 'webgl2')
assert.equal(normalizeBackendName({ getName: () => 'WebGPU' }), 'webgpu')
assert.equal(normalizeBackendName({ getName: () => 'Mystery' }), null)
assert.equal(normalizeBackendName({}), null)

// ---------------------------------------------------------------------------
// pageEffectId: namespace/name entries and literal string ids; junk is null.
// ---------------------------------------------------------------------------

assert.equal(pageEffectId({ namespace: 'synth', name: 'noise' }), 'synth/noise')
assert.equal(pageEffectId({ namespace: 'render', name: 'pointsRender' }), 'render/pointsRender')
assert.equal(pageEffectId('synth/noise'), 'synth/noise')
// A string without a `/` is not an effect id (never invented into a match).
assert.equal(pageEffectId('noise'), null)
assert.equal(pageEffectId(' '), null)
assert.equal(pageEffectId(null), null)
assert.equal(pageEffectId(undefined), null)
assert.equal(pageEffectId(42), null)
assert.equal(pageEffectId({ namespace: 'synth' }), null)
assert.equal(pageEffectId({ name: 'noise' }), null)
assert.equal(pageEffectId({ namespace: '', name: 'noise' }), null)
assert.equal(pageEffectId({ namespace: 'synth', name: 42 }), null)

// ---------------------------------------------------------------------------
// classifyGraph: generation-advance + noncompiling + nonempty readiness.
// ---------------------------------------------------------------------------

// A ready graph compiled by this request (generation advanced).
assert.deepEqual(
    classifyGraph({ passes: 3, is_compiling: false, generation: 5 }, 4),
    { status: 'ready', passes: 3, generation_before: 4, generation_after: 5, advanced: true },
)

// No generation marker captured (e.g. a failed read): readiness without the
// advancement proof is still readiness, with advanced null.
assert.deepEqual(
    classifyGraph({ passes: 3, is_compiling: false, generation: 5 }, null),
    { status: 'ready', passes: 3, generation_before: null, generation_after: 5, advanced: null },
)

// The row's stale hazard: the graph looks ready but was compiled by a
// previous request — the generation did not advance past the marker.
assert.equal(classifyGraph({ passes: 3, is_compiling: false, generation: 4 }, 4).status, 'stale')
assert.equal(classifyGraph({ passes: 3, is_compiling: false, generation: 2 }, 4).status, 'stale')

// Compiling, empty, and missing pipelines are their own states.
assert.equal(classifyGraph({ passes: 3, is_compiling: true, generation: 5 }, 4).status, 'compiling')
assert.equal(classifyGraph({ passes: 0, is_compiling: false, generation: 5 }, 4).status, 'empty')
assert.equal(classifyGraph(null, 4).status, 'unknown')
assert.equal(classifyGraph(undefined, null).status, 'unknown')
// A malformed pass count is unknown, never invented into ready.
assert.equal(classifyGraph({ passes: '3', is_compiling: false, generation: 5 }, 4).status, 'unknown')

// ---------------------------------------------------------------------------
// classifyIdentity: the full requested-vs-page-confirmed record.
// ---------------------------------------------------------------------------

// Everything agrees: match.
const matching = classifyIdentity(
    { effect: 'synth/noise', backend: 'webgl2', generation_before: 4, backend_switch: { status: 'match' } },
    { effect_id: 'synth/noise', backend: 'glsl', backend_name: 'WebGL2', passes: 3, is_compiling: false, generation: 5 },
)
assert.equal(matching.status, 'match')
assert.deepEqual(matching.requested, { effect: 'synth/noise', backend: 'webgl2' })
assert.equal(matching.effect.status, 'match')
assert.equal(matching.backend.status, 'match')
assert.equal(matching.backend_name.status, 'match')
assert.equal(matching.graph.status, 'ready')
assert.equal(matching.backend_switch.status, 'match')

// The row's exact hazard: an ok result while the page still shows the
// previous effect — effect mismatch makes the whole record a mismatch.
const staleEffect = classifyIdentity(
    { effect: 'synth/noise', backend: 'webgl2', generation_before: 4 },
    { effect_id: 'filter/pixelSort', backend: 'glsl', backend_name: 'WebGL2', passes: 3, is_compiling: false, generation: 5 },
)
assert.equal(staleEffect.status, 'mismatch')
assert.equal(staleEffect.effect.status, 'mismatch')
assert.equal(staleEffect.effect.requested, 'synth/noise')
assert.equal(staleEffect.effect.observed, 'filter/pixelSort')

// The stale-graph hazard: right effect, but the generation did not advance
// past the pre-request marker — the ok describes the previous graph.
const staleGraph = classifyIdentity(
    { effect: 'synth/noise', backend: 'webgl2', generation_before: 4 },
    { effect_id: 'synth/noise', backend: 'glsl', backend_name: 'WebGL2', passes: 3, is_compiling: false, generation: 4 },
)
assert.equal(staleGraph.status, 'mismatch')
assert.equal(staleGraph.graph.status, 'stale')

// The backend-switch hazard: the configured label says webgpu but the page
// stayed on webgl2 (the upstream silent setBackend timeout).
const residualBackend = classifyIdentity(
    { effect: 'synth/noise', backend: 'webgpu', backend_switch: { status: 'timeout' } },
    { effect_id: 'synth/noise', backend: 'glsl', backend_name: 'WebGL2', passes: 3, is_compiling: false, generation: 9 },
)
assert.equal(residualBackend.status, 'mismatch')
assert.equal(residualBackend.backend.status, 'mismatch')
assert.equal(residualBackend.backend_switch.status, 'timeout')

// Configured label vs live pipeline getName() disagreement (a switch caught
// mid-flight: renderer label flipped, pipeline still the old backend).
const mixedBackend = classifyIdentity(
    { effect: 'synth/noise', backend: 'webgpu' },
    { effect_id: 'synth/noise', backend: 'wgsl', backend_name: 'WebGL2', passes: 3, is_compiling: false, generation: 9 },
)
assert.equal(mixedBackend.status, 'mismatch')
assert.equal(mixedBackend.backend.status, 'match')
assert.equal(mixedBackend.backend_name.status, 'mismatch')

// The still-compiling hazard: the result arrived before the load finished.
const stillCompiling = classifyIdentity(
    { effect: 'synth/noise', backend: 'webgl2' },
    { effect_id: 'synth/noise', backend: 'glsl', backend_name: 'WebGL2', passes: 3, is_compiling: true, generation: 5 },
)
assert.equal(stillCompiling.status, 'mismatch')
assert.equal(stillCompiling.graph.status, 'compiling')

// An unreadable page is unknown everywhere, never an invented match.
const unreadable = classifyIdentity(
    { effect: 'synth/noise', backend: 'webgl2' },
    null,
)
assert.equal(unreadable.status, 'unknown')
assert.equal(unreadable.effect.status, 'unknown')
assert.equal(unreadable.backend.status, 'unknown')
assert.equal(unreadable.graph.status, 'unknown')

// A page snapshot with missing fields degrades per-check, not wholesale.
const partialPage = classifyIdentity(
    { effect: 'synth/noise', backend: 'webgl2' },
    { effect_id: 'synth/noise' },
)
assert.equal(partialPage.effect.status, 'match')
assert.equal(partialPage.backend.status, 'unknown')
assert.equal(partialPage.graph.status, 'unknown')
assert.equal(partialPage.status, 'unknown')

// Parity requests carry no backend label (the verb switches internally):
// the backend check is unknown, never a false mismatch.
const parityLike = classifyIdentity(
    { effect: 'synth/noise', backend: null, generation_before: 4 },
    { effect_id: 'synth/noise', backend: 'wgsl', backend_name: 'WebGPU', passes: 2, is_compiling: false, generation: 5 },
)
assert.equal(parityLike.effect.status, 'match')
assert.equal(parityLike.backend.status, 'unknown')
assert.equal(parityLike.backend_name.status, 'unknown')
assert.equal(parityLike.status, 'unknown')

// An unrecognized backend switch outcome is unknown, not silently match.
assert.equal(
    classifyIdentity(
        { effect: 'synth/noise', backend: 'webgl2', backend_switch: { status: 'bogus' } },
        { effect_id: 'synth/noise', backend: 'glsl', backend_name: 'WebGL2', passes: 1, is_compiling: false, generation: 2 },
    ).backend_switch.status,
    'unknown',
)

// Missing request fields degrade to unknown, never match.
assert.equal(classifyIdentity({}, { effect_id: 'synth/noise', backend: 'glsl', backend_name: 'WebGL2', passes: 1, is_compiling: false, generation: 2 }).status, 'unknown')
assert.equal(classifyIdentity(null, null).status, 'unknown')

// The record is serializable (safe for JSON tool-result surfaces).
assert.equal(JSON.stringify(matching).includes('"status":"match"'), true)

// ---------------------------------------------------------------------------
// annotateIdentity: additive-only annotation; arrays are never annotated.
// ---------------------------------------------------------------------------

const plain = { status: 'ok', metrics: {} }
assert.equal('identity_check' in plain, false)
annotateIdentity(plain, matching)
assert.equal(plain.status, 'ok')
assert.equal(plain.identity_check, matching)
assert.deepEqual(plain.metrics, {})

// Null records and array (batched) results are left untouched.
const batched = [{ status: 'ok' }, { status: 'error' }]
assert.equal(annotateIdentity(batched, matching), batched)
assert.equal('identity_check' in batched, false)
assert.equal(annotateIdentity(null, matching), null)
assert.equal(annotateIdentity(plain, null), plain)

// ---------------------------------------------------------------------------
// strictIdentityFailed: the gate fires only for a classified mismatch.
// ---------------------------------------------------------------------------

assert.equal(strictIdentityFailed({ status: 'mismatch' }), true)
assert.equal(strictIdentityFailed({ status: 'match' }), false)
assert.equal(strictIdentityFailed({ status: 'unknown' }), false)
assert.equal(strictIdentityFailed(null), false)
assert.equal(strictIdentityFailed(undefined), false)

// ---------------------------------------------------------------------------
// In-page predicates: pure functions of the injected globals/target. The
// functions run inside `page.evaluate`/`waitForFunction` in the browser;
// here they are re-instantiated in a sandbox with an injected `window` so
// the same serialized source is exercised.
// ---------------------------------------------------------------------------

const runInSandbox = (fn, sandboxWindow) => new Function('window', `return (${fn.toString()})`)(sandboxWindow)

const noisemakerGlobals = {
    canvasRenderer: '__noisemakerCanvasRenderer',
    renderingPipeline: '__noisemakerRenderingPipeline',
    currentBackend: '__noisemakerCurrentBackend',
    currentEffect: '__noisemakerCurrentEffect',
    setPaused: '__noisemakerSetPaused',
    setPausedTime: '__noisemakerSetPausedTime',
    frameCount: '__noisemakerFrameCount',
}

// collectPageIdentityInPage reads the viewer's test globals; missing globals
// yield nulls (unknown), never invented matches.
{
    const w = {}
    const collect = runInSandbox(collectPageIdentityInPage, w)
    const snapshot = collect({ globals: noisemakerGlobals })
    assert.deepEqual(snapshot, {
        effect_id: null,
        backend: null,
        backend_name: null,
        passes: null,
        is_compiling: null,
        generation: null,
    })

    w['__noisemakerCurrentEffect'] = { namespace: 'synth', name: 'noise' }
    w['__noisemakerCurrentBackend'] = () => 'wgsl'
    w['__noisemakerRenderingPipeline'] = {
        backend: { getName: () => 'WebGPU' },
        graph: { passes: [{}, {}, {}] },
        isCompiling: false,
    }
    w.__noisemakerPipelineGeneration = 7
    assert.deepEqual(collect({ globals: noisemakerGlobals }), {
        effect_id: 'synth/noise',
        backend: 'wgsl',
        backend_name: 'WebGPU',
        passes: 3,
        is_compiling: false,
        generation: 7,
    })
}

// identityReadyInPage: requested effect + generation advance + noncompiling
// nonempty graph; status text is never consulted.
{
    const w = {}
    const ready = (target) => runInSandbox(identityReadyInPage, w)({ globals: noisemakerGlobals, target })

    // Wrong effect: not ready even though the graph is.
    w['__noisemakerCurrentEffect'] = { namespace: 'filter', name: 'pixelSort' }
    w['__noisemakerRenderingPipeline'] = { graph: { passes: [{}] }, isCompiling: false }
    w.__noisemakerPipelineGeneration = 5
    assert.equal(ready({ effect: 'synth/noise', generation: 4 }), false)

    // Right effect but the generation did not advance (previous graph).
    w['__noisemakerCurrentEffect'] = { namespace: 'synth', name: 'noise' }
    assert.equal(ready({ effect: 'synth/noise', generation: 5 }), false)

    // Compiling: not ready.
    w.__noisemakerPipelineGeneration = 6
    w['__noisemakerRenderingPipeline'].isCompiling = true
    assert.equal(ready({ effect: 'synth/noise', generation: 4 }), false)

    // Empty graph: not ready.
    w['__noisemakerRenderingPipeline'].isCompiling = false
    w['__noisemakerRenderingPipeline'].graph = { passes: [] }
    assert.equal(ready({ effect: 'synth/noise', generation: 4 }), false)

    // Everything agrees: ready.
    w['__noisemakerRenderingPipeline'].graph = { passes: [{}] }
    assert.equal(ready({ effect: 'synth/noise', generation: 4 }), true)

    // Missing pipeline: never ready.
    delete w['__noisemakerRenderingPipeline']
    assert.equal(ready({ effect: 'synth/noise', generation: 4 }), false)
}

// ---------------------------------------------------------------------------
// Source guards: the harness must collect page identity, bind its readiness
// to the page-confirmed identity instead of status text, annotate its
// browser results, and gate only behind the explicit opt-in.
// ---------------------------------------------------------------------------

const harnessSource = fs.readFileSync(
    new URL('./test-harness.js', import.meta.url),
    'utf8',
)

// The harness imports the mirror.
assert.match(
    harnessSource,
    /import\s*\{[^}]*classifyIdentity[^}]*\}\s*from\s*'\.\/session-identity\.js'/,
)

// The renderEffectFrame wrapper's repository path confirms the backend
// switch and waits on identity-bound readiness, not status text.
assert.match(harnessSource, /await confirmBackendSwitch\(session\)/)
assert.match(
    harnessSource,
    /await page\.waitForFunction\(identityReadyInPage,\s*\{\s*globals: session\.globals,\s*target: \{ effect: effectId, generation: generationBefore \},?\s*\},?\s*\{ timeout: 300000 \}\)/,
)
assert.doesNotMatch(
    harnessSource,
    /text\.includes\('loaded'\) \|\| text\.includes\('compiled'\)/,
    'the wrapper readiness wait must not poll status text',
)

// Both wrapper paths annotate their result with the identity record.
assert.match(harnessSource, /annotateResultIdentity\(session, result, \{/)
assert.match(harnessSource, /generation_before: generationBefore,/)

// The upstream-verb path captures the generation marker BEFORE the verb call.
const upstreamCapture = harnessSource.indexOf('const generationBefore = await captureGeneration(session)')
const upstreamVerb = harnessSource.indexOf('result = await shadeRenderEffectFrame(session, effectId, options)')
assert.notEqual(upstreamCapture, -1)
assert.notEqual(upstreamVerb, -1)
assert.ok(upstreamCapture < upstreamVerb, 'generation marker must precede the upstream verb call')

// The effect loop reports compile and render identity and gates only behind
// the explicit opt-in.
assert.match(harnessSource, /results\.compileIdentity = classifyIdentity\(/)
assert.match(harnessSource, /results\.renderIdentity = renderResult\.identity_check \?\? null/)
assert.match(harnessSource, /if \(options\.strictIdentity\) results\.identityMismatch = true/)
assert.match(harnessSource, /--strict-identity/)

// The browser verbs are annotated at result time.
assert.match(harnessSource, /annotateVerbIdentity\(session, effectId, \(\) =>/)
assert.match(harnessSource, /testUniformResponsiveness\(session, effectId\)/)
assert.match(harnessSource, /testNoPassthrough\(session, effectId\)/)
assert.match(harnessSource, /testPixelParity\(session, effectId, \{ epsilon: 1 \}\), \{ backend: null \}/)

// The benchmark selection is identity-bound too.
assert.match(harnessSource, /const benchGenerationBefore = await captureGeneration\(session\)/)
assert.doesNotMatch(
    harnessSource,
    /const t = \(document\.getElementById\('status'\)\?\.textContent \|\| ''\)\.toLowerCase\(\)/,
    'the benchmark readiness wait must not poll status text',
)

// The pass/fail determination consumes the strict opt-in flag.
assert.match(harnessSource, /if \(r\.identityMismatch\) return false/)
assert.match(harnessSource, /if \(r\.identityMismatch\) return true/)

// The viewer publishes the pipeline generation counter alongside the
// pipeline global on every compiled pipeline.
const viewerSource = fs.readFileSync(
    new URL('../../demo/shaders/index.html', import.meta.url),
    'utf8',
)
const generationAssignments = viewerSource.match(
    /window\.__noisemakerPipelineGeneration = \(window\.__noisemakerPipelineGeneration \|\| 0\) \+ 1;/g,
)
assert.ok(generationAssignments && generationAssignments.length >= 2, 'both pipeline-publish sites must bump the generation counter')
const pipelineAssignments = viewerSource.match(/window\.__noisemakerRenderingPipeline = renderer\.pipeline;/g)
assert.ok(pipelineAssignments && generationAssignments.length === pipelineAssignments.length,
    'every pipeline publication must bump the generation counter')

console.log('PASS test_session_identity: 9 groups (backend normalization, effect ids, graph classification, identity record, stale/compiling/residual hazards, additive annotation, opt-in gate, in-page predicates, source guards)')
