#!/usr/bin/env node
/**
 * GAP-024 auditable mirror: requested-effect / compiled-graph / actual-backend
 * identity binding for the repository's browser test-harness paths
 * (shaders/tests/test-harness.js).
 *
 * The upstream Shade MCP browser verbs (`vendor/shade-mcp/harness/index.js`,
 * built from `src/tools/browser/*.ts` and `src/harness/browser-session.ts`)
 * poll status text for readiness, dispatch effect selection without awaiting
 * the asynchronous load, and exit silently when the `setBackend()` poll times
 * out — so any browser `ok` result, including parity, can describe a
 * previously ready graph or an unintended backend, and no result field makes
 * those identity mismatches uniformly diagnosable. This module pins the
 * repository-side resolution: every result the harness's browser paths
 * produce carries an additive `identity_check` record that classifies the
 * page-confirmed effect id, page-confirmed backend (both the renderer's
 * backend label and the live pipeline backend's `getName()`), and the
 * compiled graph (pipeline generation advanced past the request plus a
 * noncompiling, nonempty graph). No result `status` is changed and no
 * previously accepted call is rejected — acting on a mismatch happens only
 * behind the harness's explicit `--strict-identity` opt-in.
 */

/**
 * Normalize any backend spelling to `webgl2` | `webgpu`, or null when the
 * value is not a recognizable backend name. Accepts the harness session
 * labels (`webgl2`/`webgpu`), the viewer's renderer backend labels
 * (`glsl`/`wgsl`), and the live backend `getName()` values
 * (`WebGL2`/`WebGPU`). An unknown value is never invented into a match.
 */
export function normalizeBackendName(value) {
    if (value == null) return null
    if (typeof value === 'object') {
        if (typeof value.getName === 'function') value = value.getName()
        else return null
    }
    if (typeof value !== 'string') return null
    const name = value.trim().toLowerCase()
    if (name === 'webgl2' || name === 'glsl') return 'webgl2'
    if (name === 'webgpu' || name === 'wgsl') return 'webgpu'
    return null
}

/**
 * The effect id a page current-effect entry carries: `namespace/name` from
 * the viewer's `{ namespace, name }` entry object, or a literal string id
 * containing a `/`. Anything else is null (an unidentifiable page state is
 * never invented into a match).
 */
export function pageEffectId(entry) {
    if (entry == null) return null
    if (typeof entry === 'string') {
        const id = entry.trim()
        return id.includes('/') && id ? id : null
    }
    if (typeof entry === 'object') {
        const namespace = entry.namespace
        const name = entry.name
        if (typeof namespace === 'string' && namespace &&
            typeof name === 'string' && name) return `${namespace}/${name}`
    }
    return null
}

/**
 * Classify one sub-check where both sides are known. `requested` and
 * `observed` are already-normalized comparable values (or null).
 */
function compareIdentity(requested, observed) {
    if (requested == null || observed == null) {
        return { requested, observed, status: 'unknown' }
    }
    return { requested, observed, status: requested === observed ? 'match' : 'mismatch' }
}

/**
 * Classify the compiled-graph half of the identity record from a collected
 * page snapshot and the request's pre-selection generation marker.
 *
 * - `ready`: the page reports a noncompiling pipeline with at least one pass,
 *   and (when a pre-request generation was captured) the pipeline generation
 *   advanced past it, so the graph was compiled by this request rather than
 *   left over from an earlier one.
 * - `stale`: the graph looks ready but the generation did not advance past
 *   the request's marker — the result may describe the previous graph.
 * - `compiling` / `empty` / `missing`: the page's own reported states.
 * - `unknown`: no comparable page snapshot (never invented).
 */
export function classifyGraph(page, generationBefore) {
    if (!page || typeof page !== 'object') {
        return { status: 'unknown', passes: null, generation_before: generationBefore ?? null, generation_after: null, advanced: null }
    }
    const passes = Number.isInteger(page.passes) && page.passes >= 0 ? page.passes : null
    const generationAfter = Number.isInteger(page.generation) && page.generation >= 0 ? page.generation : null
    const before = Number.isInteger(generationBefore) && generationBefore >= 0 ? generationBefore : null
    const advanced = before != null && generationAfter != null ? generationAfter > before : null
    let status
    if (page.is_compiling === true) status = 'compiling'
    else if (passes == null) status = 'unknown'
    else if (passes === 0) status = 'empty'
    else if (page.is_compiling === false && advanced === false) status = 'stale'
    else if (page.is_compiling === false) status = 'ready'
    else status = 'unknown'
    return { status, passes, generation_before: before, generation_after: generationAfter, advanced }
}

/**
 * Build the full identity record for one browser result.
 *
 * `request` carries what the caller asked for: `effect` (id string),
 * `backend` (session label), optional `generation_before` (the pipeline
 * generation marker captured before the request's own selection), and
 * optional `backend_switch` (`{ status: 'match' | 'timeout' }` from the
 * wrapper's own post-switch confirmation).
 *
 * `page` is the collected page snapshot (or null when the page could not be
 * read — every sub-check then reports `unknown` rather than inventing one).
 * The overall `status` is `match` only when the page-confirmed effect id,
 * both backend confirmations, and the compiled graph all agree with the
 * request; `mismatch` when any of them provably disagrees; `unknown`
 * otherwise.
 */
export function classifyIdentity(request = {}, page = null) {
    const requestedEffect = typeof request?.effect === 'string' && request.effect ? request.effect : null
    const requestedBackend = normalizeBackendName(request?.backend)
    const effect = compareIdentity(requestedEffect, page ? pageEffectId(page.effect_id ?? null) : null)
    const backend = compareIdentity(requestedBackend, page ? normalizeBackendName(page.backend) : null)
    const backendName = compareIdentity(requestedBackend, page ? normalizeBackendName(page.backend_name) : null)
    const graph = classifyGraph(page, request?.generation_before)
    const switchCheck = request?.backend_switch
    const backendSwitch = {
        requested: requestedBackend,
        status: switchCheck == null
            ? 'unchecked'
            : (switchCheck.status === 'match' ? 'match'
                : switchCheck.status === 'timeout' ? 'timeout' : 'unknown'),
    }

    const checks = [effect.status, backend.status, backendName.status, backendSwitch.status === 'timeout' ? 'mismatch' : backendSwitch.status]
    const statuses = new Set(checks)
    let overall
    if (statuses.has('mismatch') || graph.status === 'mismatch' || graph.status === 'stale' ||
        graph.status === 'compiling' || graph.status === 'empty' || graph.status === 'missing') {
        overall = 'mismatch'
    } else if (statuses.has('unknown') || graph.status === 'unknown') {
        overall = 'unknown'
    } else {
        overall = 'match'
    }

    return {
        status: overall,
        requested: { effect: requestedEffect, backend: requestedBackend },
        effect,
        backend,
        backend_name: backendName,
        graph,
        backend_switch: backendSwitch,
    }
}

/**
 * Additively annotate a browser result with the `identity_check` record.
 * The result object is returned unchanged (same reference) when the record
 * is null; otherwise only the additive `identity_check` field is attached —
 * `status`, `frame`, `metrics`, and every existing field are never modified.
 */
export function annotateIdentity(result, identityCheck) {
    if (identityCheck != null && result != null && typeof result === 'object' && !Array.isArray(result)) {
        result.identity_check = identityCheck
    }
    return result
}

/**
 * The opt-in gate predicate: true only for a classified `mismatch` (an
 * `unknown` — a page state that could not be read — is reported but never
 * gates). Default runs never reject on this; the harness's
 * `--strict-identity` flag is the single explicit opt-in.
 */
export function strictIdentityFailed(identityCheck) {
    return identityCheck?.status === 'mismatch'
}

/**
 * In-page collector (runs inside `page.evaluate`). Reads the viewer's test
 * globals and returns the page-confirmed identity snapshot: the current
 * effect entry's `namespace/name` id, the renderer's current backend label,
 * the live pipeline backend's `getName()`, the compiled graph's pass count
 * and compiling flag, and the pipeline generation counter. Nothing here
 * throws into the caller: missing globals yield nulls that classify as
 * `unknown`.
 */
export function collectPageIdentityInPage({ globals }) {
    const w = window
    const entry = w[globals.currentEffect]
    const effect_id = entry && typeof entry === 'object' &&
        typeof entry.namespace === 'string' && typeof entry.name === 'string'
        ? `${entry.namespace}/${entry.name}`
        : (typeof entry === 'string' ? entry : null)
    const backendValue = typeof w[globals.currentBackend] === 'function' ? w[globals.currentBackend]() : null
    const pipeline = w[globals.renderingPipeline] || null
    const backendObj = pipeline ? pipeline.backend : null
    return {
        effect_id,
        backend: typeof backendValue === 'string' ? backendValue : null,
        backend_name: backendObj && typeof backendObj.getName === 'function' ? backendObj.getName() : null,
        passes: pipeline && pipeline.graph && Array.isArray(pipeline.graph.passes) ? pipeline.graph.passes.length : null,
        is_compiling: pipeline ? pipeline.isCompiling === true : null,
        generation: typeof w.__noisemakerPipelineGeneration === 'number' ? w.__noisemakerPipelineGeneration : null,
    }
}

/**
 * The in-page readiness predicate for the wrapper's identity-bound
 * selection wait (runs inside `page.waitForFunction`): the page's current
 * effect id equals the requested one AND the pipeline global has been
 * replaced after the request's generation marker (the compiled graph belongs
 * to this selection, not the previous one) AND that pipeline is not
 * compiling and has at least one pass. Status text is never consulted.
 */
export function identityReadyInPage({ globals, target }) {
    const w = window
    const entry = w[globals.currentEffect]
    const id = entry && typeof entry === 'object' &&
        typeof entry.namespace === 'string' && typeof entry.name === 'string'
        ? `${entry.namespace}/${entry.name}`
        : (typeof entry === 'string' ? entry : null)
    if (id !== target.effect) return false
    const pipeline = w[globals.renderingPipeline]
    if (!pipeline) return false
    if (typeof w.__noisemakerPipelineGeneration === 'number' &&
        typeof target.generation === 'number' &&
        w.__noisemakerPipelineGeneration <= target.generation) return false
    if (pipeline.isCompiling) return false
    return !!(pipeline.graph && pipeline.graph.passes && pipeline.graph.passes.length > 0)
}
