#!/usr/bin/env node
/**
 * The catalog baseline of the Portable migration.
 *
 * Before any built-in effect is converted, this records the exact catalog and
 * then checks every later tree against it:
 * - the effect IDs, derived from the tree, from the tracked manifest and from
 *   the published 1.x reference release;
 * - each definition's export kind (a default class or a default instance);
 * - a snapshot of each definition's metadata, read through the engine's own
 *   loader, with the ephemeral `state` and `uniforms` left out.
 *
 *   node scripts/audit-portable-migration.mjs --record --reference <1.x version> [--replace-baseline]
 *   node scripts/audit-portable-migration.mjs --record --effects <IDs> --commit <sha> [--reason <text>]
 *   node scripts/audit-portable-migration.mjs --record --consumers
 *   node scripts/audit-portable-migration.mjs --check
 *   node scripts/audit-portable-migration.mjs --realms --versions <published versions>
 *   node scripts/audit-portable-migration.mjs --pins (--record | --check) [--effects <IDs>]
 *   node scripts/audit-portable-migration.mjs --perf (--record [--replace-budgets] | --check) [--effects <IDs>]
 *
 * `--record` reads the reference release's `deployment-meta.json` and
 * `SHA256SUMS`. `--check` reads no network: it compares the committed tree
 * and the tracked manifest with the baseline and with its stored copy of the
 * published list, and refuses a tree whose effects differ from HEAD. A
 * difference from the published list passes only when `explainedDifferences`
 * names it, with the commit that made it. `--realms` is evidence, not a gate:
 * it measures older cores in browser realms (see `realms()`).
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { matchesTargetEffectPass } from './lib/shader-parity-attestation.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const BASELINE_RELATIVE = 'shaders/tests/fixtures/portable/catalog-baseline.json'
export const WAVES_RELATIVE = 'shaders/tests/fixtures/portable/waves.json'
export const SHADE_PROJECTION_RELATIVE = 'shaders/tests/fixtures/portable/consumers/shade-projection.json'
export const LAYERS_SOURCE_RELATIVE = 'shaders/tests/fixtures/portable/consumers/layers-source.json'
export const RENDER_CASES_RELATIVE = 'shaders/tests/fixtures/portable/render-cases.json'
export const PINS_RELATIVE = 'shaders/tests/fixtures/portable/pins'
const PIN_TOOL_RELATIVE = 'shaders/scripts/pin-effect-pixels.mjs'
export const REFERENCE_ORIGIN = 'https://shaders.noisedeck.app'
export const MAIN_REF = 'origin/main'
export const LINE_REF = 'origin/2.x'

const CHANGES = ['added', 'removed', 'changed']

function git(repo, args) {
    return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/** True when `ancestor` is an ancestor of (or equal to) `descendant`. */
export function isAncestor(repo, ancestor, descendant) {
    const result = spawnSync('git', ['-C', repo, 'merge-base', '--is-ancestor', ancestor, descendant])
    if (result.status === 0) return true
    if (result.status === 1) return false
    throw new Error(`git merge-base --is-ancestor ${ancestor} ${descendant} failed: ${String(result.stderr).trim()}`)
}

function compareIds(a, b) {
    return a < b ? -1 : a > b ? 1 : 0
}

/** The `definition.js` IDs of a commit's tree, in JavaScript's default sort order. */
export function treeEffectIds(repo, rev = 'HEAD') {
    return git(repo, ['ls-tree', '-r', '--name-only', rev, '--', 'shaders/effects'])
        .split('\n')
        .map(line => line.match(/^shaders\/effects\/([^/]+\/[^/]+)\/definition\.js$/)?.[1])
        .filter(Boolean)
        .sort(compareIds)
}

/** The keys of the tracked manifest, sorted. */
export function manifestEffectIds(repo) {
    return Object.keys(readManifest(repo)).sort(compareIds)
}

function readManifest(repo) {
    return JSON.parse(fs.readFileSync(path.join(repo, 'shaders/effects/manifest.json'), 'utf8'))
}

/** The per-effect bundle IDs that a release's `SHA256SUMS` lists, sorted. */
export function referenceIdsFromSums(text) {
    return text.split('\n')
        .map(line => line.match(/^[0-9a-f]+ {2}effects\/([^/]+\/[^/]+)\.js$/)?.[1])
        .filter(Boolean)
        .sort(compareIds)
}

/** Every Effect class between an instance and `Effect` itself, nearest first. */
function classChain(instance, EffectClass) {
    const chain = []
    for (let proto = Object.getPrototypeOf(instance); proto; proto = Object.getPrototypeOf(proto)) {
        chain.push(proto.constructor?.name ?? null)
        if (proto === EffectClass.prototype || proto === Object.prototype) break
    }
    return chain
}

/** The methods each class below `Effect` declares, in declaration order. */
function customMethods(instance, EffectClass) {
    const methods = []
    for (let proto = Object.getPrototypeOf(instance); proto && proto !== EffectClass.prototype && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
        const own = Object.getOwnPropertyNames(proto).filter(name => {
            if (name === 'constructor') return false
            const descriptor = Object.getOwnPropertyDescriptor(proto, name)
            return typeof descriptor.value === 'function' || descriptor.get || descriptor.set
        })
        methods.push({ class: proto.constructor?.name ?? null, methods: own })
    }
    return methods
}

/**
 * The metadata of one loaded definition: everything it declares, the facts
 * the loader derives from it, its manifest entry and where its shaders and
 * help are attached.
 */
export function metadataSnapshot({ id, effect, manifestEntry, files, engine }) {
    const { instance } = effect
    const [directoryNamespace] = id.split('/')
    const passes = Array.isArray(instance.passes) ? instance.passes : []
    return {
        id,
        namespace: { directory: directoryNamespace, declared: instance.namespace ?? null },
        func: instance.func ?? null,
        starter: { manifest: manifestEntry?.starter === true, loader: engine.isStarterEffect(effect) },
        derived: {
            hasTexSurfaceParam: engine.hasTexSurfaceParam(effect),
            hasExplicitTexParam: engine.hasExplicitTexParam(effect),
            needsInputTex3d: engine.needsInputTex3d(effect),
            is3dGenerator: !!engine.is3dGenerator(effect),
            is3dProcessor: !!engine.is3dProcessor(effect),
            volGeoParams: engine.getVolGeoParams(effect),
        },
        classes: classChain(instance, engine.Effect),
        customMethods: customMethods(instance, engine.Effect),
        passOrder: passes.map(pass => [pass.name ?? null, pass.program ?? null, pass.type ?? null]),
        // The values of `state` and `uniforms` are ephemeral; their keys at load are not.
        ephemeral: { state: Object.keys(instance.state || {}), uniforms: Object.keys(instance.uniforms || {}) },
        manifest: manifestEntry ?? null,
        attachments: files,
        definition: engine.definitionSchema(instance),
    }
}

async function loadEngine(repo) {
    const url = file => pathToFileURL(path.join(repo, file)).href
    const index = await import(url('shaders/src/index.js'))
    const canvas = await import(url('shaders/src/renderer/canvas.js'))
    const registry = await import(url('shaders/src/runtime/registry.js'))
    const schema = await import(url('shaders/tests/definition-schema.js'))
    return {
        CanvasRenderer: index.CanvasRenderer,
        Effect: index.Effect,
        getEffect: registry.getEffect,
        isStarterEffect: canvas.isStarterEffect,
        hasTexSurfaceParam: canvas.hasTexSurfaceParam,
        hasExplicitTexParam: canvas.hasExplicitTexParam,
        needsInputTex3d: canvas.needsInputTex3d,
        is3dGenerator: canvas.is3dGenerator,
        is3dProcessor: canvas.is3dProcessor,
        getVolGeoParams: canvas.getVolGeoParams,
        definitionSchema: schema.definitionSchema,
        loadUpstreamProjection: schema.loadUpstreamProjection,
        serializeSchemaValue: schema.serializeSchemaValue,
    }
}

// The cross-backend parity gate's own files. They are recorded by that gate,
// not by the catalog, so adding a missing parity case changes no snapshot.
const PARITY_FILES = new Set(['parity-case.json', 'parity-attestation.json'])

/**
 * A value as its JSON file stores it. A key whose value is undefined is not
 * written, so the comparison must not see it either.
 */
function asStored(value) {
    return JSON.parse(JSON.stringify(value))
}

/** Where an effect's definition, shaders and help are attached: its tracked files. */
function effectFiles(repo, id) {
    const prefix = `shaders/effects/${id}/`
    return git(repo, ['ls-files', '--', prefix]).split('\n').filter(Boolean)
        .map(file => file.slice(prefix.length))
        .filter(file => !PARITY_FILES.has(file))
        .sort(compareIds)
}

/**
 * Load every listed ID through the engine's own loader and register it, as
 * the renderer does. An ID that does not load or register fails the run.
 * Returns the export kinds and the metadata snapshots, in ID order.
 */
export async function loadCatalog(repo, ids) {
    const engine = await loadEngine(repo)
    const renderer = new engine.CanvasRenderer({ basePath: pathToFileURL(path.join(repo, 'shaders')).href })
    const manifest = readManifest(repo)
    const exportKinds = []
    const metadata = {}
    const failures = []
    const quiet = console.error
    for (const id of ids) {
        const [namespace, name] = id.split('/')
        try {
            const mod = await import(pathToFileURL(path.join(repo, 'shaders/effects', namespace, name, 'definition.js')).href)
            if (!mod.default) throw new Error('no default export')
            const kind = typeof mod.default === 'function' ? 'class' : 'instance'
            console.error = () => {}
            let effect
            try {
                effect = await renderer.loadEffectDefinition(namespace, name)
            } finally {
                console.error = quiet
            }
            metadata[id] = asStored(metadataSnapshot({ id, effect, manifestEntry: manifest[id], files: effectFiles(repo, id), engine }))
            renderer.registerEffectWithRuntime(effect)
            if (engine.getEffect(id) !== effect.instance) throw new Error('the loader did not register it under its ID')
            exportKinds.push([id, kind])
        } catch (err) {
            failures.push(`${id}: ${err.message}`)
        }
    }
    if (failures.length) throw new Error(`Effects that do not load and register:\n  ${failures.join('\n  ')}`)
    return { exportKinds, metadata }
}

/** Shade's projection of each listed effect, read by the vendored shade-mcp parser. */
export async function loadShadeProjections(repo, ids) {
    const engine = await loadEngine(repo)
    const projections = {}
    for (const id of ids) {
        const projection = await engine.loadUpstreamProjection(path.join(repo, 'shaders/effects', id))
        const { effectDir, ...portable } = projection
        projections[id] = asStored(engine.serializeSchemaValue(portable))
    }
    return projections
}

/**
 * The test reference's source: the baseline's `sourceSha`, exported with
 * `git archive` into `dir`, which must not exist yet. It is never a stored
 * copy, and never a Git worktree. Returns `dir`.
 */
export function exportReferenceSource(repo, sha, dir) {
    if (!/^[0-9a-f]{40}$/.test(sha || '')) throw new Error('exportReferenceSource needs a full commit SHA')
    if (fs.existsSync(dir)) throw new Error(`${dir} already exists`)
    fs.mkdirSync(dir, { recursive: true })
    const archive = execFileSync('git', ['-C', repo, 'archive', '--format=tar', sha], { maxBuffer: 1024 * 1024 * 1024 })
    execFileSync('tar', ['-x', '-C', dir], { input: archive })
    return dir
}

/**
 * The test reference's bundles: a published version directory, checked
 * against its own `SHA256SUMS`. Fetches each listed path (all of them when
 * `paths` is omitted) and returns `{ files, sums }`, with each file's bytes.
 */
export async function fetchReferenceBundle(version, paths) {
    const { createHash } = await import('node:crypto')
    const base = `${REFERENCE_ORIGIN}/${version}`
    const sums = new Map(
        (await fetchText(`${base}/SHA256SUMS`)).split('\n').map(line => line.match(/^([0-9a-f]{64}) {2}(.+)$/)).filter(Boolean).map(match => [match[2], match[1]])
    )
    const wanted = paths ?? [...sums.keys()]
    const files = new Map()
    for (const file of wanted) {
        const expected = sums.get(file)
        if (!expected) throw new Error(`${base}/SHA256SUMS does not list ${file}`)
        const response = await fetch(`${base}/${file}`)
        if (!response.ok) throw new Error(`${base}/${file}: HTTP ${response.status}`)
        const bytes = Buffer.from(await response.arrayBuffer())
        const actual = createHash('sha256').update(bytes).digest('hex')
        if (actual !== expected) throw new Error(`${base}/${file} has sha256 ${actual}, and SHA256SUMS lists ${expected}`)
        files.set(file, bytes)
    }
    return { files, sums }
}

/**
 * What the Layers source override reads for each listed effect, from a plain
 * checkout at `root`: it imports `definition.js` (constructing a class
 * export), and reads `glsl/<program>.glsl` and `wgsl/<program>.wgsl` for each
 * pass program, with no fallback. Returns the files each ID lacks; an empty
 * list means the override loads that effect.
 */
export async function loadLayersSource(root, ids) {
    const lacking = {}
    for (const id of ids) {
        const dir = path.join(root, 'shaders/effects', id)
        const mod = await import(pathToFileURL(path.join(dir, 'definition.js')).href)
        const instance = typeof mod.default === 'function' ? new mod.default() : mod.default
        if (!Array.isArray(instance?.passes)) {
            lacking[id] = ['passes']
            continue
        }
        const programs = [...new Set(instance.passes.map(pass => pass.program).filter(Boolean))]
        lacking[id] = programs.flatMap(program => [`glsl/${program}.glsl`, `wgsl/${program}.wgsl`])
            .filter(file => !fs.existsSync(path.join(dir, file)))
    }
    return lacking
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

/** True once the migration is closed (`closed` in `waves.json`). */
export function migrationClosed(repo) {
    const file = path.join(repo, WAVES_RELATIVE)
    return fs.existsSync(file) && readJson(file).closed === true
}

function difference(a, b) {
    const other = new Set(b)
    return a.filter(id => !other.has(id))
}

function sameList(a, b) {
    return a.length === b.length && a.every((value, index) => value === b[index])
}

function listProblems(label, actual, expected) {
    if (sameList(actual, expected)) return []
    const missing = difference(expected, actual)
    const extra = difference(actual, expected)
    const parts = []
    if (missing.length) parts.push(`missing ${missing.join(', ')}`)
    if (extra.length) parts.push(`not in the baseline ${extra.join(', ')}`)
    if (!parts.length) parts.push('the same IDs in another order')
    return [`${label} differs from the baseline's effectIds: ${parts.join('; ')}`]
}

/** The first path at which two JSON values differ, key order included. */
export function firstDifference(actual, expected, where = '') {
    if (actual === expected) return null
    const kind = value => Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value
    if (kind(actual) !== kind(expected)) return where || '(root)'
    if (kind(actual) === 'array') {
        if (actual.length !== expected.length) return `${where}.length`
        for (let i = 0; i < actual.length; i++) {
            const found = firstDifference(actual[i], expected[i], `${where}[${i}]`)
            if (found) return found
        }
        return null
    }
    if (kind(actual) === 'object') {
        const ka = Object.keys(actual)
        const kb = Object.keys(expected)
        for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
            if (ka[i] !== kb[i]) return `${where}.{key order or set, at ${JSON.stringify(ka[i] ?? null)} / ${JSON.stringify(kb[i] ?? null)}}`
            const found = firstDifference(actual[ka[i]], expected[kb[i]], `${where}.${ka[i]}`)
            if (found) return found
        }
        return null
    }
    return where || '(root)'
}

/**
 * Every way the observed catalog fails the baseline. Empty when it passes.
 *
 * `observed` holds `treeIds`, `manifestIds`, `exportKinds` and `metadata`.
 * `context` holds `mergeBaseIds` (the `definition.js` IDs of
 * `git merge-base HEAD origin/main`), `closed`, and `commitOn(sha)`, which
 * returns `{ main, published, line }`: whether the commit is on
 * `origin/main`, whether it is on `origin/2.x`, and whether it is on
 * `origin/2.x` or below `HEAD`. The baseline's source must be published.
 */
export function compareCatalog(baseline, observed, context) {
    const problems = []
    problems.push(...listProblems('The tree', observed.treeIds, baseline.effectIds))
    problems.push(...listProblems('The tracked manifest', observed.manifestIds, baseline.effectIds))

    const source = context.commitOn(baseline.sourceSha)
    if (!source.published) problems.push(`sourceSha ${baseline.sourceSha} is not a commit on ${LINE_REF}`)

    const reference = baseline.referenceEffectIds || []
    const differences = [
        ...difference(observed.treeIds, reference).map(effectId => ({ effectId, change: 'added' })),
        ...difference(reference, observed.treeIds).map(effectId => ({ effectId, change: 'removed' })),
    ]
    const entries = baseline.explainedDifferences || []
    for (const entry of entries) {
        if (!CHANGES.includes(entry.change)) problems.push(`explainedDifferences entry for ${entry.effectId} has an unknown change ${JSON.stringify(entry.change)}`)
        const on = context.commitOn(entry.commit)
        const accepted = on.main || (context.closed && on.line && typeof entry.reason === 'string' && entry.reason.trim() !== '')
        if (!accepted) {
            problems.push(`explainedDifferences entry for ${entry.effectId} names ${entry.commit}, which is not a commit on ${MAIN_REF}`
                + (context.closed ? ', nor a 2.x commit with a reason' : ''))
        }
    }
    for (const found of differences) {
        if (!entries.some(entry => entry.effectId === found.effectId && entry.change === found.change)) {
            problems.push(`${found.effectId} is ${found.change === 'added' ? 'in the tree but not in' : 'in the published list but not in the tree of'} the reference release ${baseline.reference?.version}, and explainedDifferences does not name it`)
        }
    }

    if (!context.closed) {
        problems.push(...listProblems(`The definition.js list of the merge base with ${MAIN_REF}`, context.mergeBaseIds, baseline.effectIds))
    }

    const kindProblems = listKinds(observed.exportKinds, baseline.exportKinds)
    problems.push(...kindProblems)

    for (const id of baseline.effectIds) {
        if (!(id in (observed.metadata || {}))) continue
        const found = firstDifference(observed.metadata[id], baseline.metadata?.[id])
        if (found) problems.push(`The metadata of ${id} differs from the baseline at ${found}`)
    }
    return problems
}

function listKinds(actual, expected) {
    const problems = []
    const a = new Map(actual)
    const b = new Map(expected)
    for (const [id, kind] of expected) {
        if (!a.has(id)) continue
        if (a.get(id) !== kind) problems.push(`The export kind of ${id} is ${a.get(id)}, and the baseline has ${kind}`)
    }
    if (!sameList(actual.map(([id]) => id), expected.map(([id]) => id))) {
        const missing = [...b.keys()].filter(id => !a.has(id))
        const extra = [...a.keys()].filter(id => !b.has(id))
        problems.push(`The export kinds list other IDs than the baseline${missing.length ? `: missing ${missing.join(', ')}` : ''}${extra.length ? `; not in the baseline ${extra.join(', ')}` : ''}`)
    }
    return problems
}

function commitOnFor(repo) {
    return sha => {
        if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) return { main: false, published: false, line: false }
        if (spawnSync('git', ['-C', repo, 'cat-file', '-e', `${sha}^{commit}`]).status !== 0) return { main: false, published: false, line: false }
        return {
            main: isAncestor(repo, sha, MAIN_REF),
            published: isAncestor(repo, sha, LINE_REF),
            line: isAncestor(repo, sha, LINE_REF) || isAncestor(repo, sha, 'HEAD'),
        }
    }
}

/** `--check`: every way the tree fails the stored baseline. Reads no network. */
export async function check(repo = REPO_ROOT) {
    const baseline = readJson(path.join(repo, BASELINE_RELATIVE))
    // The ID list is the committed tree's, and the definitions are read from
    // the working tree, so the two must agree before the comparison means anything.
    const status = git(repo, ['status', '--porcelain', '--', 'shaders/effects']).trim()
    if (status) return [`shaders/effects differs from HEAD; commit or restore it before the check:\n${status}`]
    const treeIds = treeEffectIds(repo)
    const { exportKinds, metadata } = await loadCatalog(repo, treeIds)
    const mergeBase = git(repo, ['merge-base', 'HEAD', MAIN_REF]).trim()
    return compareCatalog(baseline, { treeIds, manifestIds: manifestEffectIds(repo), exportKinds, metadata }, {
        mergeBaseIds: treeEffectIds(repo, mergeBase),
        closed: migrationClosed(repo),
        commitOn: commitOnFor(repo),
    })
}

async function fetchText(url) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
    return response.text()
}

/** The reference release's identity and its published effect list. */
export async function readReferenceRelease(version) {
    const base = `${REFERENCE_ORIGIN}/${version}`
    const meta = JSON.parse(await fetchText(`${base}/deployment-meta.json`))
    if (meta.version !== version) throw new Error(`${base}/deployment-meta.json names version ${meta.version}`)
    if (!/^[0-9a-f]{40}$/.test(meta.git_hash || '')) throw new Error(`${base}/deployment-meta.json has no git_hash`)
    return { version: meta.version, git_hash: meta.git_hash, effectIds: referenceIdsFromSums(await fetchText(`${base}/SHA256SUMS`)) }
}

// The snapshot depends on these as well as on the effects: the loader and
// Effect, the schema projection, and the vendored Shade parser.
const RECORD_INPUTS = ['shaders/effects', 'shaders/src', 'shaders/tests/definition-schema.js', 'vendor/shade-mcp']

function requireClean(repo) {
    const status = git(repo, ['status', '--porcelain', '--', ...RECORD_INPUTS]).trim()
    if (status) throw new Error(`The record's inputs differ from HEAD; record from a clean tree:\n${status}`)
}

/**
 * `--record`: write the baseline of the whole catalog at HEAD. The baseline is
 * the migration's test reference, so it never replaces an existing one unless
 * `replace` is set (`--replace-baseline`).
 */
export async function record(repo, referenceVersion, { replace = false } = {}) {
    if (!referenceVersion) throw new Error('--record needs --reference <the 1.x version of the reference release>')
    if (fs.existsSync(path.join(repo, BASELINE_RELATIVE)) && !replace) {
        throw new Error(`${BASELINE_RELATIVE} exists. It is the test reference; rewrite listed IDs with --record --effects, or replace it with --replace-baseline`)
    }
    requireClean(repo)
    // The source is a published commit. When HEAD holds unpublished commits on
    // top of origin/2.x, the source is their published base, and the record's
    // inputs must be identical in the two.
    const head = git(repo, ['rev-parse', 'HEAD']).trim()
    const sourceSha = isAncestor(repo, head, LINE_REF) ? head : git(repo, ['merge-base', 'HEAD', LINE_REF]).trim()
    if (sourceSha !== head && spawnSync('git', ['-C', repo, 'diff', '--quiet', sourceSha, head, '--', ...RECORD_INPUTS]).status !== 0) {
        throw new Error(`HEAD changes the record's inputs since ${sourceSha}, its published base on ${LINE_REF}; the baseline's source must be published`)
    }
    const treeIds = treeEffectIds(repo)
    const manifestIds = manifestEffectIds(repo)
    if (!sameList(treeIds, manifestIds)) throw new Error(listProblems('The tracked manifest', manifestIds, treeIds).join('\n'))
    const reference = await readReferenceRelease(referenceVersion)
    if (!isAncestor(repo, reference.git_hash, sourceSha)) throw new Error(`The reference release's git_hash ${reference.git_hash} is not an ancestor of ${sourceSha}`)
    const file = path.join(repo, BASELINE_RELATIVE)
    const previous = fs.existsSync(file) ? readJson(file) : null
    const { exportKinds, metadata } = await loadCatalog(repo, treeIds)
    const baseline = {
        sourceSha,
        reference: { version: reference.version, git_hash: reference.git_hash },
        effectIds: treeIds,
        referenceEffectIds: reference.effectIds,
        explainedDifferences: previous?.explainedDifferences ?? [],
        exportKinds,
        metadata,
    }
    writeJson(file, baseline)
    await recordConsumers(repo, treeIds)
    return baseline
}

/**
 * `--record --consumers`: rewrite the recorded consumer projections alone
 * (Shade's projection and what the Layers override reads) for every
 * baseline ID, as after a merge that updates the vendored Shade parser.
 */
export async function recordConsumers(repo, ids) {
    requireClean(repo)
    // Only a change to the vendored Shade parser re-records them on their own;
    // a changed projection is otherwise the signal the consumer test exists for.
    const projectionFile = path.join(repo, SHADE_PROJECTION_RELATIVE)
    if (ids === undefined && fs.existsSync(projectionFile)) {
        const last = git(repo, ['log', '-1', '--format=%H', '--', SHADE_PROJECTION_RELATIVE]).trim()
        const changed = last && spawnSync('git', ['-C', repo, 'diff', '--quiet', last, 'HEAD', '--', 'vendor/shade-mcp']).status === 1
        if (!changed) throw new Error(`vendor/shade-mcp is unchanged since ${last || 'the projection was written'}; --record --consumers is for a vendored Shade update`)
    }
    const list = ids ?? readJson(path.join(repo, BASELINE_RELATIVE)).effectIds
    writeJson(path.join(repo, SHADE_PROJECTION_RELATIVE), await loadShadeProjections(repo, list))
    writeJson(path.join(repo, LAYERS_SOURCE_RELATIVE), await loadLayersSource(repo, list))
    return list
}

/**
 * The baseline after rewriting the listed IDs alone, from the catalog at
 * HEAD, with an `explainedDifferences` entry for each that names `commit`.
 * A commit that is not on `origin/main` is a 2.x commit, and needs a reason.
 */
export function rewriteEffects(baseline, { ids, commit, reason, onMain, present, exportKinds, metadata }) {
    if (!onMain && !(typeof reason === 'string' && reason.trim())) {
        throw new Error(`${commit} is a 2.x commit: --record --effects needs --reason <text>, the public reason of every entry it adds`)
    }
    if (onMain && reason !== undefined && reason !== null) {
        throw new Error(`${commit} is a main commit; its entries name the commit alone, so --reason is for a 2.x commit only`)
    }
    const known = new Set(baseline.effectIds)
    const unknown = ids.filter(id => !present.has(id) && !known.has(id))
    if (unknown.length) throw new Error(`Neither the tree nor the baseline has ${unknown.join(', ')}`)
    const next = structuredClone(baseline)
    const reference = new Set(next.referenceEffectIds)
    for (const id of ids) {
        const has = present.has(id)
        const ids = new Set(next.effectIds)
        if (has) ids.add(id)
        else ids.delete(id)
        next.effectIds = [...ids].sort(compareIds)
        const kinds = new Map(next.exportKinds)
        if (has) kinds.set(id, exportKinds.get(id))
        else kinds.delete(id)
        next.exportKinds = next.effectIds.filter(effectId => kinds.has(effectId)).map(effectId => [effectId, kinds.get(effectId)])
        const meta = {}
        for (const effectId of next.effectIds) {
            if (effectId === id) {
                if (has) meta[effectId] = metadata[id]
            } else if (next.metadata[effectId]) {
                meta[effectId] = next.metadata[effectId]
            }
        }
        next.metadata = meta
        const change = has && !reference.has(id) ? 'added' : !has && reference.has(id) ? 'removed' : 'changed'
        const entry = { effectId: id, change, commit, ...(onMain ? {} : { reason: reason.trim() }) }
        next.explainedDifferences = [
            ...next.explainedDifferences.filter(old => !(old.effectId === id && old.commit === commit)),
            entry,
        ]
    }
    return next
}

/** `--record --effects <IDs> --commit <sha> [--reason <text>]`. */
export async function recordEffects(repo, { ids, commit, reason }) {
    if (!ids.length) throw new Error('--effects needs at least one effect ID')
    if (!/^[0-9a-f]{40}$/.test(commit || '')) throw new Error('--commit needs a full 40-character commit SHA')
    if (!isAncestor(repo, commit, 'HEAD')) throw new Error(`${commit} is not an ancestor of HEAD`)
    requireClean(repo)
    // The commit an entry names must be the one that changed that effect.
    for (const id of ids) {
        const touched = git(repo, ['diff-tree', '--no-commit-id', '--name-only', '-r', '--diff-merges=first-parent', '--root', commit, '--', `shaders/effects/${id}/`]).trim()
        if (!touched) throw new Error(`${commit} changes nothing under shaders/effects/${id}/`)
    }
    const file = path.join(repo, BASELINE_RELATIVE)
    const baseline = readJson(file)
    const present = new Set(treeEffectIds(repo))
    const loadable = ids.filter(id => present.has(id))
    const { exportKinds, metadata } = await loadCatalog(repo, loadable)
    const next = rewriteEffects(baseline, {
        ids, commit, reason, onMain: isAncestor(repo, commit, MAIN_REF), present,
        exportKinds: new Map(exportKinds), metadata,
    })
    writeJson(file, next)
    const projectionsFile = path.join(repo, SHADE_PROJECTION_RELATIVE)
    const projections = fs.existsSync(projectionsFile) ? readJson(projectionsFile) : {}
    const fresh = await loadShadeProjections(repo, loadable)
    const merged = {}
    for (const id of next.effectIds) merged[id] = id in fresh ? fresh[id] : projections[id]
    writeJson(projectionsFile, merged)
    const layersFile = path.join(repo, LAYERS_SOURCE_RELATIVE)
    const layers = fs.existsSync(layersFile) ? readJson(layersFile) : {}
    const freshLayers = await loadLayersSource(repo, loadable)
    const mergedLayers = {}
    for (const id of next.effectIds) mergedLayers[id] = id in freshLayers ? freshLayers[id] : layers[id]
    writeJson(layersFile, mergedLayers)
    return next
}

/**
 * A package directory as the products hand it to the engine: its
 * `definition.json`, with `shaders` built from its files, as their importers
 * build it: `glsl/<program>.glsl` and `wgsl/<program>.wgsl` become
 * `shaders[program].glsl` and `.wgsl`. Other files are not shaders.
 */
export function readPackageDir(dir) {
    const definition = readJson(path.join(dir, 'definition.json'))
    if (definition.shaders) return definition
    const shaders = {}
    for (const language of ['glsl', 'wgsl']) {
        const folder = path.join(dir, language)
        if (!fs.existsSync(folder)) continue
        for (const name of fs.readdirSync(folder).sort(compareIds)) {
            const match = name.match(new RegExp(`^(.+)\\.${language}$`))
            if (!match) continue
            shaders[match[1]] ??= {}
            shaders[match[1]][language] = fs.readFileSync(path.join(folder, name), 'utf8')
        }
    }
    return { ...definition, shaders }
}

const PROBE_GLSL = '#version 300 es\nprecision highp float;\nuniform float amount;\nout vec4 fragColor;\nvoid main() { fragColor = vec4(vec3(amount), 1.0); }\n'
const PROBE_WGSL = '@group(0) @binding(0) var<uniform> amount: f32;\n@fragment fn main() -> @location(0) vec4<f32> { return vec4<f32>(vec3<f32>(amount), 1.0); }\n'

/**
 * Candidate shapes of a version 2 package. Each one is a valid v1 package
 * plus one v2 marker or v2-only feature, so a realm shows whether a core
 * rejects it or renders it without that feature.
 */
export function v2Probes() {
    const base = func => ({
        name: func, func,
        description: 'Portable format probe',
        globals: { amount: { type: 'float', default: 0.5, min: 0, max: 1, uniform: 'amount' } },
        passes: [{ name: 'main', program: 'main', inputs: {}, outputs: { fragColor: 'outputTex' } }],
        shaders: { main: { glsl: PROBE_GLSL, wgsl: PROBE_WGSL } },
    })
    const marker = { format: 'noisemaker-portable-effect', version: 2 }
    return [
        { probe: 'v1 control', definition: base('probeV1') },
        { probe: 'v2 marker', definition: { ...marker, ...base('probeMarker') }, watch: ['format', 'version'] },
        { probe: 'v2 marker, unknown major', definition: { ...base('probeMajor'), format: 'noisemaker-portable-effect', version: 3 }, watch: ['format', 'version'] },
        { probe: 'v2 top-level field', definition: { ...marker, ...base('probeTopLevel'), capabilities: [{ name: 'probe.capability' }] }, watch: ['capabilities'] },
        {
            probe: 'v2 pass field',
            definition: { ...marker, ...base('probePassField'), passes: [{ name: 'main', program: 'main', inputs: {}, outputs: { fragColor: 'outputTex' }, capability: 'probe.capability' }] },
            watchPass: ['capability'],
        },
        { probe: 'v2 global of an unknown type', definition: { ...marker, ...base('probeGlobalType'), globals: { amount: { type: 'probeType', default: 0.5, uniform: 'amount' } } } },
        { probe: 'v2 passes keyed by name', definition: { ...marker, ...base('probePassMap'), passes: { main: { program: 'main', inputs: {}, outputs: { fragColor: 'outputTex' } } } } },
        { probe: 'v2 shaders by file reference', definition: { ...marker, ...base('probeShaderFiles'), shaders: { main: { glsl: { file: 'glsl/main.glsl' }, wgsl: { file: 'wgsl/main.wgsl' } } } } },
    ]
}

/**
 * `--realms`: what each supported older core, and the source-loaded core,
 * does with the consumer packages and with candidate v2 packages. Each core
 * runs in its own browser context, from bytes checked against its release's
 * `SHA256SUMS`, served from a local origin; nothing routes a product to it.
 * Prints the report as JSON. It is evidence, not a gate.
 */
export async function realms(repo, versions) {
    const http = await import('node:http')
    const { chromium } = await import('playwright')
    const served = new Map()
    const bundles = {}
    for (const version of versions) {
        // Every published file of the release, each checked against its SHA256SUMS.
        const { files, sums } = await fetchReferenceBundle(version)
        for (const [file, bytes] of files) served.set(`/release/${version}/${file}`, bytes)
        bundles[version] = {
            core: { file: 'noisemaker-shaders-core.esm.js', sha256: sums.get('noisemaker-shaders-core.esm.js') },
            topLevelFiles: [...sums.keys()].filter(file => !file.includes('/')).sort(compareIds),
        }
    }
    const requested = new Set()
    const consumerRoot = path.join(repo, 'shaders/tests/fixtures/portable/consumers')
    const consumers = fs.existsSync(consumerRoot)
        ? fs.readdirSync(consumerRoot).filter(name => name.endsWith('-v1') && fs.existsSync(path.join(consumerRoot, name, 'definition.json'))).sort()
            .map(name => ({ probe: `consumer ${name}`, definition: readPackageDir(path.join(consumerRoot, name)) }))
        : []
    const packages = [...consumers, ...v2Probes()]
    const missing = new Set()
    const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.glsl': 'text/plain', '.wgsl': 'text/plain', '.vert': 'text/plain', '.frag': 'text/plain' }
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://local')
        requested.add(url.pathname)
        let bytes = served.get(url.pathname)
        if (!bytes && url.pathname === '/blank.html') bytes = Buffer.from('<!doctype html><title>realm</title>')
        if (!bytes && url.pathname.startsWith('/source/')) {
            const file = path.join(repo, decodeURIComponent(url.pathname.slice('/source/'.length)))
            // The source core imports from shaders/, share/ and demo/shaders/lib/.
            if (['shaders', 'share', 'demo'].some(root => file.startsWith(path.join(repo, root) + path.sep))) {
                if (fs.existsSync(file) && fs.statSync(file).isFile()) bytes = fs.readFileSync(file)
            }
        }
        if (!bytes) {
            missing.add(url.pathname)
            response.writeHead(404)
            response.end()
            return
        }
        response.writeHead(200, { 'content-type': types[path.extname(url.pathname)] || 'application/octet-stream' })
        response.end(bytes)
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    const cores = [
        ...versions.map(version => ({
            core: `published ${version}`,
            coreUrl: `${origin}/release/${version}/noisemaker-shaders-core.esm.js`,
            options: { basePath: `${origin}/release/${version}`, useBundles: true, bundlePath: `${origin}/release/${version}/effects` },
        })),
        { core: 'source at HEAD', coreUrl: `${origin}/source/shaders/src/index.js`, options: { basePath: `${origin}/source/shaders` } },
    ]
    const browser = await chromium.launch({ headless: true })
    const results = []
    try {
        for (const core of cores) {
            const context = await browser.newContext()
            try {
                const page = await context.newPage()
                await page.goto(`${origin}/blank.html`)
                missing.clear()
                requested.clear()
                let result
                try {
                    result = await page.evaluate(runRealm, { coreUrl: core.coreUrl, options: core.options, packages })
                } catch (err) {
                    result = { error: String(err?.message || err).split('\n')[0] }
                }
                results.push({ core: core.core, coreUrl: core.coreUrl.replace(origin, ''), ...result, requestedShapes: requestShapes(requested), notServed: [...missing].sort() })
            } finally {
                await context.close()
            }
        }
    } finally {
        await browser.close()
        server.close()
    }
    return { releases: bundles, results }
}

/** The shapes of the paths a core requested, with effect IDs and versions generalized. */
function requestShapes(paths) {
    return [...new Set([...paths].map(item => item
        .replace(/^\/release\/[^/]+\//, '<release>/')
        .replace(/^\/source\//, '<source>/')
        .replace(/\/effects\/[^/]+\/[^/]+\/(definition\.js|glsl\/[^/]+|wgsl\/[^/]+)$/, '/effects/<namespace>/<name>/$1')
        .replace(/(glsl|wgsl)\/[^/]+\.(glsl|wgsl|vert|frag)$/, '$1/<program>.$2')
        .replace(/\/effects\/[^/]+\/[^/]+\.js$/, '/effects/<namespace>/<name>.js')))].sort(compareIds)
}

/** Runs inside a page: one core, every effect its manifest lists, then every package. */
async function runRealm({ coreUrl, options, packages }) {
    const out = { exports: [], pairing: { listed: null, loadedAll: false, failed: [] }, packages: [] }
    const core = await import(coreUrl)
    out.exports = Object.keys(core).sort()
    out.registerPortableEffect = typeof core.CanvasRenderer?.prototype?.registerPortableEffect
    const renderer = new core.CanvasRenderer(options)
    try {
        await renderer.loadManifest()
    } catch (err) {
        out.manifestError = String(err?.message || err)
    }
    const ids = Object.keys(renderer.manifest || {}).sort()
    out.pairing.listed = ids.length
    for (const id of ids) {
        try {
            const effect = await renderer.loadEffect(id)
            if (!effect?.instance) throw new Error('no instance')
        } catch (err) {
            out.pairing.failed.push({ id, error: String(err?.message || err).split('\n')[0] })
        }
    }
    out.pairing.loadedAll = ids.length > 0 && out.pairing.failed.length === 0
    for (const item of packages) {
        if (out.registerPortableEffect !== 'function') {
            out.packages.push({ probe: item.probe, registered: false, error: 'this core has no registerPortableEffect' })
            continue
        }
        try {
            const effect = await renderer.registerPortableEffect(structuredClone(item.definition))
            const row = { probe: item.probe, registered: true, func: effect?.instance?.func ?? null, namespace: effect?.namespace ?? null }
            if (item.watch) row.keptOnInstance = Object.fromEntries(item.watch.map(key => [key, key in (effect?.instance || {})]))
            if (item.watchPass) row.keptOnPass = Object.fromEntries(item.watchPass.map(key => [key, key in (effect?.instance?.passes?.[0] || {})]))
            out.packages.push(row)
        } catch (err) {
            out.packages.push({ probe: item.probe, registered: false, error: String(err?.message || err) })
        }
    }
    return out
}

/** An effect's pin baseline: `pins/<namespace>/<name>.pin.json`. */
export function pinPath(repo, id) {
    return path.join(repo, PINS_RELATIVE, `${id}.pin.json`)
}

// A software rasterizer is not qualified GPU hardware (Section 1 of the plan):
// a pin or a budget recorded on one would gate nothing real.
const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i

function runPinTool(repo, caseFile, id, flag, file, extra = []) {
    const result = spawnSync(process.execPath, [path.join(repo, PIN_TOOL_RELATIVE), '--case', caseFile, '--entry', id, flag, file, ...extra],
        { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim().split('\n')
    const gpu = (result.stdout || '').match(/^Wrote .* for (.+)$/m)?.[1] ?? null
    return { ok: result.status === 0, detail: output.slice(-4).join(' | '), gpu }
}

/**
 * The IDs a pin or performance run renders, and the problems found before any
 * render: an ID of the baseline with no render case (on a whole run), and a
 * listed ID with no render case.
 */
export function pinTargets({ baselineIds, cases, listed }) {
    const problems = []
    if (!listed) problems.push(...baselineIds.filter(id => !cases[id]).map(id => `${id} has no render case`))
    for (const id of listed ?? []) if (!cases[id]) problems.push(`${id} is listed and has no render case`)
    const targets = (listed ?? Object.keys(cases).sort(compareIds)).filter(id => cases[id])
    return { targets, problems }
}

let compilerReady = null

/**
 * Registers every effect of the tree, its enums and the starter ops, as the
 * renderer's loadManifest() and loaders do, so that a render case's program
 * compiles in Node.
 */
async function prepareCompiler(repo) {
    compilerReady ??= (async () => {
        const url = file => pathToFileURL(path.join(repo, file)).href
        const index = await import(url('shaders/src/index.js'))
        const { mergeIntoEnums } = await import(url('shaders/src/lang/enums.js'))
        const { stdEnums } = await import(url('shaders/src/lang/std_enums.js'))
        const { isStarterEffect } = await import(url('shaders/src/renderer/canvas.js'))
        const renderer = new index.CanvasRenderer({ basePath: pathToFileURL(path.join(repo, 'shaders')).href })
        const manifest = readManifest(repo)
        const starters = []
        const quiet = console.error
        for (const id of treeEffectIds(repo)) {
            const [namespace, name] = id.split('/')
            console.error = () => {}
            let effect
            try { effect = await renderer.loadEffectDefinition(namespace, name) } finally { console.error = quiet }
            const choices = renderer.registerEffectWithRuntime(effect)
            if (choices) await mergeIntoEnums(choices)
            // The loader also counts as a starter an effect whose passes read no pipeline input.
            if (isStarterEffect(effect)) starters.push(name, `${namespace}.${name}`)
        }
        await mergeIntoEnums(stdEnums)
        index.registerStarterOps([...Object.entries(manifest).filter(([, entry]) => entry.starter).flatMap(([id]) => [id.split('/')[1], id.replace('/', '.')]), ...starters])
        return { compile: index.compile, getEffect: index.getEffect }
    })()
    return compilerReady
}

/**
 * What a render case's program sets, read from its compiled plan: every seed
 * of every step whose effect has one, defaults included, and the arguments the
 * program gives each step of the target. A program that does not compile, or
 * that never runs the target, is a problem.
 */
export async function describeCase(repo, id, renderCase) {
    const { compile, getEffect } = await prepareCompiler(repo)
    const compiled = compile(renderCase.dsl)
    const errors = (compiled.diagnostics || []).filter(diagnostic => diagnostic.severity === 'error')
    if (errors.length) throw new Error(`its program does not compile: ${errors.map(error => `${error.code} ${error.message}`).join('; ')}`)
    const target = id.replace('/', '.')
    const steps = compiled.plans.flatMap(plan => plan.chain)
    const seeds = steps.filter(step => getEffect(step.op)?.globals?.seed && step.args?.seed !== undefined).map(step => [step.op, step.args.seed])
    // Each argument the program sets on the target, by its resolved value.
    const parameters = steps.filter(step => step.op === target)
        .map(step => serializeArgs(Object.fromEntries(Object.keys(step.rawKwargs || {}).map(key => [key, step.args?.[key]]))))
    if (!parameters.length) throw new Error(`its program never runs ${target}`)
    return { seeds, parameters }
}

/** The diagnostics of errors in a program, compiled as the renderer compiles it. */
export async function programErrors(repo, dsl) {
    const { compile } = await prepareCompiler(repo)
    return (compile(dsl).diagnostics || []).filter(diagnostic => diagnostic.severity === 'error').map(error => `${error.code} ${error.message}`)
}

function serializeArgs(args) {
    return JSON.parse(JSON.stringify(args, (key, value) => (value && typeof value === 'object' && value.kind === 'output' ? `read(${value.name})` : value)))
}

function gpuOf(pinFile) {
    const gpus = Object.keys(pinFile.baselines || {})
    return gpus.length === 1 ? gpus[0] : null
}

function sameFrames(a, b) {
    return a.webgl2.sha256 === b.webgl2.sha256 || a.webgpu.sha256 === b.webgpu.sha256
}

/**
 * `--pins --record` and `--pins --check`, with `--effects <IDs>` to limit
 * either to the listed IDs. Each case renders on both backends through the pin
 * tool, and each backend is compared with its own pin for this GPU, byte for
 * byte. A check fails on a case with no baseline for this GPU, and on a blank
 * frame.
 *
 * A record writes each pin to a temporary file, renders the case a second time
 * and checks it against that file, and only then moves it into place. It
 * refuses a software rasterizer. It renders the case's control (its program
 * without the target, or null for a case whose target makes the frame) and
 * requires a different frame on both backends. Then it writes what the case
 * observes into render-cases.json: its seeds and parameters from the compiled
 * program, and its expected alpha from the pin.
 */
export async function pins(repo, { mode, listed, log = () => {} }) {
    const casesFile = path.join(repo, RENDER_CASES_RELATIVE)
    const baseline = readJson(path.join(repo, BASELINE_RELATIVE))
    const doc = readJson(casesFile)
    const cases = doc.cases
    const { targets, problems } = pinTargets({ baselineIds: baseline.effectIds, cases, listed })
    const rendered = []
    const scratch = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'portable-pins-'))
    try {
        for (const id of targets) {
            const file = pinPath(repo, id)
            const fail = reason => { problems.push(`${id}: ${reason}`); log(`FAILED ${id}`) }
            if (mode === 'check') {
                if (!fs.existsSync(file)) { fail(`it has no pin baseline (${path.relative(repo, file)})`); continue }
                const checked = runPinTool(repo, casesFile, id, '--check', file)
                if (!checked.ok) { fail(checked.detail); continue }
                rendered.push(id)
                log(`ok ${id}`)
                continue
            }
            const renderCase = cases[id]
            let described
            try { described = await describeCase(repo, id, renderCase) } catch (err) { fail(err.message); continue }
            const temporary = path.join(scratch, `${id.replace('/', '__')}.pin.json`)
            if (fs.existsSync(file)) fs.copyFileSync(file, temporary)
            const written = runPinTool(repo, casesFile, id, '--out', temporary)
            if (!written.ok) { fail(`no pin was recorded: ${written.detail}`); continue }
            const repeated = runPinTool(repo, casesFile, id, '--check', temporary)
            if (!repeated.ok) { fail(`a repeat render differs from the pin just recorded: ${repeated.detail}`); continue }
            const pinFile = readJson(temporary)
            const gpu = written.gpu
            if (!gpu || !pinFile.baselines?.[gpu]) { fail('the pin tool did not name the GPU it recorded'); continue }
            if (SOFTWARE_GPU.test(gpu)) { fail(`its GPU is a software rasterizer: ${gpu}`); continue }
            const frames = pinFile.baselines[gpu]
            if (renderCase.control === undefined) { fail('it declares no control (a program without the target, or null)'); continue }
            if (renderCase.control !== null) {
                const controlFile = path.join(scratch, `${id.replace('/', '__')}.control.json`)
                writeJson(controlFile, { cases: { [id]: { ...renderCase, dsl: renderCase.control } } })
                const controlPin = path.join(scratch, `${id.replace('/', '__')}.control.pin.json`)
                const control = runPinTool(repo, controlFile, id, '--out', controlPin, ['--allow-blank'])
                if (!control.ok) { fail(`its control does not render: ${control.detail}`); continue }
                const controlFrames = readJson(controlPin).baselines[control.gpu]
                if (sameFrames(frames, controlFrames)) { fail('its frame equals its control\'s, so the case does not show its target'); continue }
            }
            fs.mkdirSync(path.dirname(file), { recursive: true })
            fs.renameSync(temporary, file)
            Object.assign(renderCase, described, { expectedAlpha: { webgl2: frames.webgl2.alpha, webgpu: frames.webgpu.alpha } })
            rendered.push(id)
            log(`ok ${id}`)
        }
    } finally {
        fs.rmSync(scratch, { recursive: true, force: true })
    }
    for (const id of listed ?? []) {
        if (!rendered.includes(id) && !problems.some(problem => problem.startsWith(`${id} `) || problem.startsWith(`${id}:`))) problems.push(`${id} was listed and not rendered`)
    }
    if (mode === 'record' && rendered.length) writeJson(casesFile, doc)
    return { rendered, problems }
}

// The performance policy, frozen with the cases: a case's median frame time on
// a backend may not exceed its budget, which is this factor times the largest
// median of the recording's rounds, and never less than the floor. A frame is
// one stepFrame() of the stopped loop: one simulation step for a stateful
// effect. The round medians are evidence, so only the budgets are stored.
export const PERF_POLICY = Object.freeze({ warmupFrames: 10, measuredFrames: 30, rounds: 3, frame: 'stepFrame', budgetFactor: 3, budgetFloorMs: 2 })

/** A case's budget from its recorded round medians, by the frozen policy. */
export function perfBudget(roundMediansMs, policy = PERF_POLICY) {
    const worst = Math.max(...roundMediansMs)
    return Math.round(Math.max(policy.budgetFloorMs, worst * policy.budgetFactor) * 100) / 100
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Runs inside a page: one case on one backend, set up as the pin tool sets it up, then timed frame by frame. */
async function perfInPage({ baseUrl, pinCase, preferWebGPU, policy, matchesSource }) {
    const matchesTargetEffectPass = new Function(`return ${matchesSource}`)()
    const canvas = document.createElement('canvas')
    canvas.width = pinCase.resolution[0]
    canvas.height = pinCase.resolution[1]
    document.body.appendChild(canvas)
    const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/index.js`)
    const renderer = new CanvasRenderer({ canvas, width: canvas.width, height: canvas.height, basePath: `${baseUrl}/shaders`, preferWebGPU })
    await renderer.loadManifest()
    await renderer.loadEffects(pinCase.effects)
    if (pinCase.audio === 'ramps') {
        const audio = renderer.setAudioState()
        audio.waveform.set(Float32Array.from({ length: 128 }, (_, i) => i / 127))
        audio.spectrum.set(Float32Array.from({ length: 128 }, (_, i) => (127 - i) / 127))
    }
    if (pinCase.midiNotes?.length) {
        const midi = renderer.setMidiState()
        pinCase.midiNotes.forEach((held, index) => midi.channels[held.channel].noteOn(held.note, held.velocity, { time: 0, order: index + 1 }))
    }
    await renderer.compile(pinCase.dsl)
    renderer.stop()
    await renderer.render(0)
    for (const texture of pinCase.textureInputs || []) {
        const source = document.createElement('canvas')
        source.width = texture.width
        source.height = texture.height
        source.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(texture.data), texture.width, texture.height), 0, 0)
        const passes = renderer.pipeline.graph.passes.filter(pass => matchesTargetEffectPass(pass, texture.effect))
        if (!passes.length) throw new Error(`Texture fixture has no executing effect: ${texture.effect}`)
        for (const pass of passes) renderer.updateTextureFromSource(pass.inputs?.[texture.uniform], source, { flipY: false })
    }
    for (const mesh of pinCase.meshInputs || []) {
        const loaded = await renderer.loadOBJFromURL(`${baseUrl}/${mesh.path}`, mesh.mesh)
        if (!loaded.success) throw new Error(`Mesh fixture did not load: ${mesh.path}`)
    }
    const backend = renderer.pipeline.backend
    const gl = backend.gl
    const sync = async () => {
        if (backend.device?.queue?.onSubmittedWorkDone) return backend.device.queue.onSubmittedWorkDone()
        if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
    }
    const step = async () => { await renderer.stepFrame(); await sync() }
    for (let i = 0; i < policy.warmupFrames; i++) await step()
    const rounds = []
    for (let r = 0; r < policy.rounds; r++) {
        const times = []
        for (let i = 0; i < policy.measuredFrames; i++) {
            const t0 = performance.now()
            await step()
            times.push(performance.now() - t0)
        }
        rounds.push(times)
    }
    const probe = document.createElement('canvas').getContext('webgl2')
    const info = probe?.getExtension('WEBGL_debug_renderer_info')
    return { backend: backend.getName(), gpu: info ? probe.getParameter(info.UNMASKED_RENDERER_WEBGL) : '', rounds }
}

/**
 * `--perf --record` and `--perf --check`: each case's frame time on each
 * backend, by the frozen policy, in one browser session. A record stores each
 * case's budgets and the GPU they were measured on, and writes nothing unless
 * every case was measured; it refuses to replace budgets that exist unless
 * `replace` is set (`--replace-budgets`). A check refuses another GPU or
 * another policy, and fails a case whose median exceeds its budget. The
 * measurements themselves are returned, as evidence, and are not stored.
 */
export async function perf(repo, { mode, listed, replace = false, log = () => {} }) {
    const casesFile = path.join(repo, RENDER_CASES_RELATIVE)
    const doc = readJson(casesFile)
    const { targets, problems } = pinTargets({ baselineIds: readJson(path.join(repo, BASELINE_RELATIVE)).effectIds, cases: doc.cases, listed })
    if (mode === 'check' && JSON.stringify(doc.performancePolicy) !== JSON.stringify(PERF_POLICY)) {
        return { measured: [], measurements: {}, problems: [`render-cases.json holds the performance policy ${JSON.stringify(doc.performancePolicy ?? null)}, and this tool measures by ${JSON.stringify(PERF_POLICY)}`] }
    }
    if (mode === 'record' && !replace) {
        const existing = targets.filter(id => doc.cases[id].performance)
        if (existing.length) return { measured: [], measurements: {}, problems: [`budgets exist for ${existing.length} of the listed cases (first ${existing[0]}); replacing frozen budgets needs --replace-budgets`] }
    }
    process.env.SHADE_EFFECTS_DIR = path.join(repo, 'shaders/effects')
    process.env.SHADE_PROJECT_ROOT = repo
    const { acquireServer, releaseServer } = await import(pathToFileURL(path.join(repo, 'vendor/shade-mcp/harness/index.js')).href)
    const { chromium } = await import('playwright')
    const baseUrl = await acquireServer(undefined, repo, path.join(repo, 'shaders/effects'))
    const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=vulkan'] })
    const measured = []
    const measurements = {}
    const recorded = {}
    try {
        for (const id of targets) {
            const pinCase = doc.cases[id]
            const result = {}
            let gpu = null
            const started = new Date().toISOString()
            try {
                for (const [name, preferWebGPU] of [['webgl2', false], ['webgpu', true]]) {
                    const page = await browser.newPage({ viewport: { width: pinCase.resolution[0], height: pinCase.resolution[1] } })
                    const errors = []
                    page.on('pageerror', error => errors.push(error.message))
                    try {
                        await page.goto(`${baseUrl}/shaders/effects/manifest.json`)
                        const run = await page.evaluate(perfInPage, { baseUrl, pinCase, preferWebGPU, policy: PERF_POLICY, matchesSource: matchesTargetEffectPass.toString() })
                        if (run.backend.toLowerCase() !== name) throw new Error(`expected ${name}, ran ${run.backend}`)
                        if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`)
                        if (!run.gpu || SOFTWARE_GPU.test(run.gpu)) throw new Error(`not a qualified GPU: ${run.gpu || 'unidentified'}`)
                        if (gpu && run.gpu !== gpu) throw new Error(`the backends report different GPUs: ${gpu}, ${run.gpu}`)
                        gpu = run.gpu
                        result[name] = run.rounds.map(times => Math.round(median(times) * 1000) / 1000)
                    } finally {
                        await page.close()
                    }
                }
            } catch (err) {
                problems.push(`${id}: ${String(err?.message || err).split('\n')[0]}`)
                log(`FAILED ${id}`)
                continue
            }
            measurements[id] = { gpu, started, ended: new Date().toISOString(), roundMediansMs: result }
            if (mode === 'record') {
                recorded[id] = { gpu, ...Object.fromEntries(Object.entries(result).map(([name, medians]) => [name, { budgetMs: perfBudget(medians) }])) }
            } else {
                const budgets = pinCase.performance
                if (!budgets) problems.push(`${id}: it has no recorded budgets`)
                else if (budgets.gpu !== gpu) problems.push(`${id}: its budgets were measured on ${budgets.gpu}, and this GPU is ${gpu}`)
                else {
                    for (const [name, medians] of Object.entries(result)) {
                        const budget = budgets[name]?.budgetMs
                        const now = median(medians)
                        if (budget === undefined) problems.push(`${id}: no ${name} budget is recorded`)
                        else if (now > budget) problems.push(`${id}: the ${name} median frame time ${now} ms exceeds its budget ${budget} ms`)
                    }
                }
            }
            measured.push(id)
            log(`ok ${id} ${started} ${measurements[id].ended} ${JSON.stringify(result)}`)
        }
    } finally {
        await browser.close()
        releaseServer()
    }
    if (mode === 'record' && problems.length === 0) {
        for (const [id, budgets] of Object.entries(recorded)) doc.cases[id].performance = budgets
        doc.performancePolicy = { ...PERF_POLICY }
        writeJson(casesFile, doc)
    }
    return { measured, measurements, problems }
}

function parseArgs(argv) {
    const args = { mode: null, effects: [], commit: null, reason: null, reference: null, versions: [], replace: false, consumers: false, pins: false, perf: false, replaceBudgets: false, effectsGiven: false }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--record' || arg === '--check' || arg === '--realms') {
            if (args.mode && args.mode !== arg.slice(2)) throw new Error('Give one of --record, --check and --realms')
            args.mode = arg.slice(2)
        } else if (arg === '--pins') {
            args.pins = true
        } else if (arg === '--perf') {
            args.perf = true
        } else if (arg === '--replace-budgets') {
            args.replaceBudgets = true
        } else if (arg === '--replace-baseline') {
            args.replace = true
        } else if (arg === '--consumers') {
            args.consumers = true
        } else if (arg === '--versions') {
            if (argv[i + 1] === undefined) throw new Error('--versions needs a value')
            args.versions.push(...argv[++i].split(',').filter(Boolean))
        } else if (arg === '--effects') {
            args.effectsGiven = true
            while (argv[i + 1] && !argv[i + 1].startsWith('--')) args.effects.push(...argv[++i].split(',').filter(Boolean))
        } else if (arg === '--commit' || arg === '--reason' || arg === '--reference') {
            if (argv[i + 1] === undefined) throw new Error(`${arg} needs a value`)
            args[arg.slice(2)] = argv[++i]
        } else {
            throw new Error(`Unknown argument ${arg}`)
        }
    }
    if (!args.mode) throw new Error('Give --record, --check or --realms')
    if (args.effectsGiven && !args.effects.length) throw new Error('--effects needs at least one effect ID')
    if (args.replaceBudgets && !(args.perf && args.mode === 'record')) throw new Error('--replace-budgets goes with --perf --record')
    if (args.pins && args.perf) throw new Error('Give one of --pins and --perf')
    if (args.pins || args.perf) {
        if (args.mode === 'realms' || args.commit || args.reason || args.reference || args.versions.length || args.replace || args.consumers) {
            throw new Error('--pins and --perf go with --record or --check, and take only --effects')
        }
        return args
    }
    if (args.mode === 'check' && (args.effects.length || args.commit || args.reason || args.reference || args.versions.length)) throw new Error('--check takes no other argument')
    if (args.mode === 'realms' && (args.effects.length || args.commit || args.reason || args.reference)) throw new Error('--realms takes only --versions')
    if (args.mode === 'realms' && !args.versions.length) throw new Error('--realms needs --versions <published versions>')
    if (args.mode !== 'realms' && args.versions.length) throw new Error('--versions goes with --realms')
    if ((args.replace || args.consumers) && args.mode !== 'record') throw new Error('--replace-baseline and --consumers go with --record')
    if (args.consumers && (args.effects.length || args.reference || args.replace)) throw new Error('--record --consumers takes no other argument')
    if (args.replace && args.effects.length) throw new Error('--replace-baseline goes with a whole --record, not with --effects')
    if (args.mode === 'record' && args.effects.length === 0 && (args.commit || args.reason)) throw new Error('--commit and --reason go with --effects')
    if (args.mode === 'record' && args.effects.length && args.reference) throw new Error('--reference goes with a whole --record, not with --effects')
    if (args.effects.length && !args.commit) throw new Error('--effects needs --commit <sha>')
    return args
}

async function main() {
    let args
    try {
        args = parseArgs(process.argv.slice(2))
    } catch (err) {
        console.error(err.message)
        process.exit(2)
    }
    try {
        if (args.perf) {
            const { measured, problems } = await perf(REPO_ROOT, { mode: args.mode, listed: args.effects.length ? args.effects : null, replace: args.replaceBudgets, log: line => console.log(line) })
            if (problems.length) {
                console.error(`The performance ${args.mode === 'record' ? 'was not measured for every case' : 'budgets do not hold'}:`)
                for (const problem of problems) console.error(`  - ${problem}`)
                process.exit(1)
            }
            console.log(`${args.mode === 'record' ? 'Measured and froze the budgets of' : 'Checked the budgets of'} ${measured.length} render cases on both backends`)
        } else if (args.pins) {
            const { rendered, problems } = await pins(REPO_ROOT, { mode: args.mode, listed: args.effects.length ? args.effects : null, log: line => console.log(line) })
            if (problems.length) {
                console.error(`The pins ${args.mode === 'record' ? 'were not all recorded' : 'do not hold'} (${problems.length} of the run's IDs):`)
                for (const problem of problems) console.error(`  - ${problem}`)
                process.exit(1)
            }
            console.log(`${args.mode === 'record' ? 'Recorded and repeated' : 'Checked'} the pins of ${rendered.length} render cases on both backends`)
        } else if (args.mode === 'check') {
            const problems = await check(REPO_ROOT)
            if (problems.length) {
                console.error(`The catalog fails its baseline (${BASELINE_RELATIVE}):`)
                for (const problem of problems) console.error(`  - ${problem}`)
                process.exit(1)
            }
            const baseline = readJson(path.join(REPO_ROOT, BASELINE_RELATIVE))
            console.log(`The catalog matches its baseline: ${baseline.effectIds.length} effects from ${baseline.sourceSha}, against the reference release ${baseline.reference.version}`)
        } else if (args.consumers) {
            const ids = await recordConsumers(REPO_ROOT)
            console.log(`Rewrote ${SHADE_PROJECTION_RELATIVE} and ${LAYERS_SOURCE_RELATIVE} for ${ids.length} effects`)
        } else if (args.mode === 'realms') {
            console.log(JSON.stringify(await realms(REPO_ROOT, args.versions), null, 2))
        } else if (args.effects.length) {
            const next = await recordEffects(REPO_ROOT, { ids: args.effects, commit: args.commit, reason: args.reason })
            console.log(`Rewrote ${args.effects.join(', ')} in ${BASELINE_RELATIVE} for ${args.commit}; it lists ${next.effectIds.length} effects`)
        } else {
            const baseline = await record(REPO_ROOT, args.reference, { replace: args.replace })
            console.log(`Wrote ${BASELINE_RELATIVE}: ${baseline.effectIds.length} effects from ${baseline.sourceSha}, against the reference release ${baseline.reference.version} (${baseline.reference.git_hash})`)
        }
    } catch (err) {
        console.error(err.message)
        process.exit(1)
    }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
    await main()
}
