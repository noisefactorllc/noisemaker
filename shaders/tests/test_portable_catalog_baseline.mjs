#!/usr/bin/env node
/**
 * The catalog baseline of the Portable migration
 * (shaders/tests/fixtures/portable/catalog-baseline.json).
 *
 * The catalog at HEAD must equal the baseline: the same effect IDs in the
 * same order, the same export kinds, and metadata equal key for key, in key
 * order. Each deliberate mutation below must fail the comparison: an ID
 * deleted and another inserted so that the number of entries stays the same,
 * an enum value changed, choices reordered, and a class export turned into an
 * instance. The assertions compare identity sets and ordered structures,
 * never counts.
 *
 * The parity cases, the attestations and the IDs that the attestation
 * verifier registers must each equal the baseline ID set. A deleted case or
 * attestation, and an ID put in place of another, must fail that comparison.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { before, test } from 'node:test'

import { CanvasRenderer } from '../src/index.js'
import { registeredParityEffectIds, timelineTimes } from '../../scripts/lib/shader-parity-attestation.mjs'
import { pinCaseErrors } from '../scripts/pin-baselines.mjs'
import {
    BASELINE_RELATIVE,
    REPO_ROOT,
    check,
    compareCatalog,
    exportReferenceSource,
    firstDifference,
    loadCatalog,
    manifestEffectIds,
    parityGateProblems,
    PERF_POLICY,
    caseVariants,
    describeCase,
    programErrors,
    runsTarget,
    perfBudget,
    pinPath,
    pinTargets,
    RENDER_CASES_RELATIVE,
    rewriteEffects,
    treeEffectFileIds,
    treeEffectIds,
} from '../../scripts/audit-portable-migration.mjs'

const baseline = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, BASELINE_RELATIVE), 'utf8'))
const MAIN_COMMIT = 'a'.repeat(40)
const LINE_COMMIT = 'b'.repeat(40)
const UNKNOWN_COMMIT = 'c'.repeat(40)

let observed

function context(overrides = {}) {
    return {
        mergeBaseIds: baseline.effectIds,
        closed: false,
        commitOn: sha => ({
            main: sha === MAIN_COMMIT,
            published: sha === MAIN_COMMIT || sha === baseline.sourceSha,
            line: sha === LINE_COMMIT || sha === MAIN_COMMIT || sha === baseline.sourceSha,
        }),
        ...overrides,
    }
}

function copy() {
    return structuredClone(observed)
}

function choicesOf(metadata) {
    const out = []
    for (const [id, snapshot] of Object.entries(metadata)) {
        for (const [name, spec] of Object.entries(snapshot.definition.globals || {})) {
            if (spec && spec.choices && typeof spec.choices === 'object') out.push([id, name, Object.entries(spec.choices)])
        }
    }
    return out
}

before(async () => {
    const treeIds = treeEffectIds(REPO_ROOT)
    const { exportKinds, metadata } = await loadCatalog(REPO_ROOT, treeIds)
    observed = { treeIds, manifestIds: manifestEffectIds(REPO_ROOT), exportKinds, metadata }
})

test('the catalog at HEAD is the baseline: IDs, export kinds, metadata and choices, in order', () => {
    assert.deepEqual(observed.treeIds, baseline.effectIds)
    assert.deepEqual(observed.manifestIds, baseline.effectIds)
    assert.deepEqual(observed.exportKinds.map(([id]) => id), baseline.effectIds)
    assert.deepEqual(observed.exportKinds, baseline.exportKinds)
    assert.deepEqual(Object.keys(observed.metadata), baseline.effectIds)
    for (const id of baseline.effectIds) {
        assert.equal(firstDifference(observed.metadata[id], baseline.metadata[id]), null, id)
    }
    // Order and values, as entry lists: an object comparison alone ignores key order.
    assert.deepEqual(choicesOf(observed.metadata), choicesOf(baseline.metadata))
    assert.deepEqual(compareCatalog(baseline, observed, context()), [])
})

// Every field of a render case outside the pin case shape. Any other is refused,
// so that a misspelt timeline or midiMessages cannot pass as an untimed case.
const RENDER_CASE_FIELDS = ['source', 'times', 'backends', 'comparison', 'warmup', 'orientation', 'withoutTarget', 'seeds', 'parameters', 'expectedAlpha', 'performance']

test('every baseline ID has a render case, and every render case is a baseline ID', () => {
    const renderCases = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, RENDER_CASES_RELATIVE), 'utf8')).cases
    assert.deepEqual(Object.keys(renderCases).sort(), baseline.effectIds)
    for (const [id, renderCase] of Object.entries(renderCases)) {
        assert.ok(renderCase.effects.includes(id), `${id}: its case renders it`)
        assert.match(renderCase.surface, /^o[0-7]$/, `${id}: it reads a user surface`)
        assert.ok(renderCase.dsl.includes(`.write(${renderCase.surface})`), `${id}: its program writes the surface it reads`)
        assert.deepEqual(renderCase.times, renderCase.timeline ? timelineTimes(renderCase.timeline) : [0], id)
        assert.deepEqual(renderCase.backends, ['webgl2', 'webgpu'], id)
        assert.equal(renderCase.comparison, 'exact', id)
        assert.ok(['parity-case', 'authored'].includes(renderCase.source), id)
        assert.equal(renderCase.orientation, 'readback', id)
        assert.deepEqual(renderCase.warmup, { afterCompile: 1, beforeEachReading: 2 }, id)
        // The fields a render case shares with a parity case mean what they mean there.
        assert.deepEqual(pinCaseErrors(renderCase, id, RENDER_CASE_FIELDS), [], id)
        for (const field of ['control', 'steps', 'midiNotes']) assert.equal(renderCase[field], undefined, `${id}: a render case has no ${field}`)
        assert.ok(renderCase.withoutTarget === null || typeof renderCase.withoutTarget === 'string', `${id}: withoutTarget is a program or null`)
        assert.equal(caseVariants(id, renderCase).problem, undefined, id)
    }
    assert.deepEqual(pinCaseErrors({ ...renderCases['synth/roll'], timelines: { frames: [0, 1, 2] } }, 'synth/roll', RENDER_CASE_FIELDS), ['pin case has an unknown field timelines'])
    // A timed case with too few frames, or an input after its second frame, has no first-frames variant.
    const timed = { withoutTarget: null, timeline: { frames: [0, 1] } }
    assert.match(caseVariants('synth/roll', timed).problem, /at least three frames/)
    assert.match(caseVariants('synth/roll', { ...timed, timeline: { frames: [0, 1, 2] }, midiMessages: [{ afterFrame: 2, data: [0x90, 60, 100] }] }).problem, /after its second frame/)
    assert.deepEqual(Object.keys(caseVariants('synth/roll', { ...timed, timeline: { frames: [0, 1, 2] }, audio: 'ramps' }).variants).sort(), ['firstFrames', 'withoutInputs'])
    // A missing case fails the pin run before any render.
    const dropped = baseline.effectIds[3]
    const { [dropped]: _gone, ...rest } = renderCases
    assert.deepEqual(pinTargets({ baselineIds: baseline.effectIds, cases: rest }).problems, [`${dropped} has no render case`])
    assert.deepEqual(pinTargets({ baselineIds: baseline.effectIds, cases: renderCases, listed: ['filter/noSuchEffect'] }).problems, ['filter/noSuchEffect is listed and has no render case'])
})

function parityLists(root = REPO_ROOT, rev = 'HEAD') {
    return {
        cases: treeEffectFileIds(root, 'parity-case.json', rev),
        attestations: treeEffectFileIds(root, 'parity-attestation.json', rev),
        registered: registeredParityEffectIds(root),
    }
}

const PARITY_LABELS = {
    cases: 'The list of parity cases',
    attestations: 'The list of parity attestations',
    registered: 'The list of IDs that the attestation verifier registers',
}

test('the parity cases, the attestations and the IDs that the verifier registers each equal the baseline ID set', () => {
    const lists = parityLists()
    assert.deepEqual(lists.cases, baseline.effectIds)
    assert.deepEqual(lists.attestations, baseline.effectIds)
    assert.deepEqual(lists.registered, baseline.effectIds)
    assert.deepEqual(parityGateProblems(baseline.effectIds, lists), [])
})

test('deleting a parity case or an attestation, or putting one ID in place of another, fails the parity gate', () => {
    const lists = parityLists()
    const removed = baseline.effectIds[0]
    const inserted = `${removed}Substitute`
    for (const [field, label] of Object.entries(PARITY_LABELS)) {
        const deleted = { ...lists, [field]: lists[field].filter(id => id !== removed) }
        assert.deepEqual(parityGateProblems(baseline.effectIds, deleted), [`${label} differs from the baseline's effectIds: missing ${removed}`])
        const substituted = { ...lists, [field]: lists[field].map(id => (id === removed ? inserted : id)).sort() }
        assert.deepEqual(new Set(substituted[field]).size, new Set(lists[field]).size)
        assert.deepEqual(parityGateProblems(baseline.effectIds, substituted), [`${label} differs from the baseline's effectIds: missing ${removed}; not in the baseline ${inserted}`])
    }
    assert.deepEqual(parityGateProblems(baseline.effectIds, parityLists()), [])
})

test('the parity lists are read from the tree: a missing case and a missing attestation fail the gate', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-parity-'))
    try {
        const [noCase, noAttestation] = baseline.effectIds
        for (const id of baseline.effectIds) {
            const dir = path.join(root, 'shaders/effects', ...id.split('/'))
            fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(path.join(dir, 'definition.js'), '')
            if (id !== noCase) fs.writeFileSync(path.join(dir, 'parity-case.json'), '{}')
            if (id !== noAttestation) fs.writeFileSync(path.join(dir, 'parity-attestation.json'), '{}')
        }
        execFileSync('git', ['-C', root, 'init', '-q'])
        execFileSync('git', ['-C', root, 'add', '-A'])
        const tree = execFileSync('git', ['-C', root, 'write-tree'], { encoding: 'utf8' }).trim()
        assert.deepEqual(treeEffectIds(root, tree), baseline.effectIds)
        assert.deepEqual(parityGateProblems(baseline.effectIds, parityLists(root, tree)), [
            `${PARITY_LABELS.cases} differs from the baseline's effectIds: missing ${noCase}`,
            `${PARITY_LABELS.attestations} differs from the baseline's effectIds: missing ${noAttestation}`,
            `${PARITY_LABELS.registered} differs from the baseline's effectIds: missing ${noCase}`,
        ])
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})

test('a performance budget is the frozen factor times the worst round median, never below the floor', () => {
    assert.deepEqual(PERF_POLICY, { warmupFrames: 10, measuredFrames: 30, rounds: 3, frame: 'stepFrame', budgetFactor: 3, budgetFloorMs: 2 })
    assert.equal(perfBudget([1, 2, 1.5]), 6)
    assert.equal(perfBudget([0.1, 0.2, 0.3]), 2)
    assert.equal(perfBudget([0.9, 0.7, 0.8]), 2.7)
})

test('each render case records what its program sets, its expected alpha and its budgets, and they hold', async () => {
    const doc = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, RENDER_CASES_RELATIVE), 'utf8'))
    assert.deepEqual(doc.performancePolicy, { ...PERF_POLICY })
    for (const [id, renderCase] of Object.entries(doc.cases)) {
        // The seeds (defaults included) and the target's arguments are those of the compiled program.
        assert.deepEqual({ seeds: renderCase.seeds, parameters: renderCase.parameters }, await describeCase(REPO_ROOT, id, renderCase), id)
        if (renderCase.withoutTarget) {
            assert.deepEqual(await programErrors(REPO_ROOT, renderCase.withoutTarget), [], `${id}: its withoutTarget program compiles`)
            assert.equal(await runsTarget(REPO_ROOT, id, renderCase.withoutTarget), false, `${id}: its withoutTarget program leaves the target out`)
        }
        const pin = JSON.parse(fs.readFileSync(pinPath(REPO_ROOT, id), 'utf8'))
        assert.equal(pin.case, `${RENDER_CASES_RELATIVE}#${id}`, id)
        assert.deepEqual(pin.resolution, renderCase.resolution, id)
        const gpus = Object.keys(pin.baselines)
        assert.ok(gpus.length >= 1, `${id}: its pin holds a GPU`)
        const gpu = renderCase.performance?.gpu
        assert.ok(gpus.includes(gpu), `${id}: its budgets were measured on a GPU its pin holds`)
        for (const backend of ['webgl2', 'webgpu']) {
            assert.deepEqual(renderCase.expectedAlpha?.[backend], pin.baselines[gpu][backend].alpha, `${id} ${backend} alpha`)
            assert.ok(pin.baselines[gpu][backend].nonzeroRgbPixels > 0, `${id} ${backend} is lit`)
            assert.ok(Number.isFinite(renderCase.performance[backend]?.budgetMs) && renderCase.performance[backend].budgetMs >= PERF_POLICY.budgetFloorMs, `${id} ${backend} budget`)
        }
        assert.deepEqual(Object.keys(renderCase.performance).sort(), ['gpu', 'webgl2', 'webgpu'], `${id}: only budgets are stored, not measurements`)
    }
})

test('the baseline names its source, its reference release and the published list', () => {
    assert.match(baseline.sourceSha, /^[0-9a-f]{40}$/)
    assert.match(baseline.reference.version, /^1\.\d+\.\d+$/)
    assert.match(baseline.reference.git_hash, /^[0-9a-f]{40}$/)
    // The published list agrees with the tree, or each difference is explained.
    const explained = new Set(baseline.explainedDifferences.map(entry => entry.effectId))
    const published = new Set(baseline.referenceEffectIds)
    const tree = new Set(baseline.effectIds)
    assert.deepEqual(baseline.effectIds.filter(id => !published.has(id) && !explained.has(id)), [])
    assert.deepEqual(baseline.referenceEffectIds.filter(id => !tree.has(id) && !explained.has(id)), [])
})

test('deleting one ID and inserting another, with the same number of entries, fails', () => {
    const mutated = copy()
    const removed = mutated.treeIds[0]
    const inserted = `${removed}Substitute`
    const rename = id => (id === removed ? inserted : id)
    mutated.treeIds = mutated.treeIds.map(rename).sort()
    mutated.manifestIds = mutated.manifestIds.map(rename).sort()
    mutated.exportKinds = mutated.exportKinds.map(([id, kind]) => [rename(id), kind])
    mutated.metadata = Object.fromEntries(Object.entries(mutated.metadata).map(([id, value]) => [rename(id), value]))
    assert.deepEqual(new Set(mutated.treeIds).size, new Set(observed.treeIds).size)
    const problems = compareCatalog(baseline, mutated, context())
    assert.ok(problems.some(problem => problem.includes(`missing ${removed}`)), problems.join('\n'))
    assert.ok(problems.some(problem => problem.includes(inserted)), problems.join('\n'))
})

test('changing an enum value fails', () => {
    const [id, name, entries] = choicesOf(observed.metadata).find(([, , list]) => list.some(([, value]) => typeof value === 'number'))
    const mutated = copy()
    const choices = mutated.metadata[id].definition.globals[name].choices
    const [key] = entries.find(([, value]) => typeof value === 'number')
    choices[key] = choices[key] + 1000
    const problems = compareCatalog(baseline, mutated, context())
    assert.ok(problems.some(problem => problem.includes(`metadata of ${id}`) && problem.includes(`globals.${name}.choices`)), problems.join('\n'))
})

test('reordering choices fails, with the same keys and values', () => {
    const [id, name, entries] = choicesOf(observed.metadata).find(([, , list]) => list.length >= 2)
    const mutated = copy()
    const global = mutated.metadata[id].definition.globals[name]
    global.choices = Object.fromEntries([...entries].reverse())
    assert.deepEqual(new Set(Object.keys(global.choices)), new Set(entries.map(([key]) => key)))
    const problems = compareCatalog(baseline, mutated, context())
    assert.ok(problems.some(problem => problem.includes(`metadata of ${id}`)), problems.join('\n'))
})

test('turning a class export into an instance fails', () => {
    const mutated = copy()
    const index = mutated.exportKinds.findIndex(([, kind]) => kind === 'class')
    assert.ok(index >= 0, 'the catalog has a class export')
    const [id] = mutated.exportKinds[index]
    mutated.exportKinds[index] = [id, 'instance']
    const problems = compareCatalog(baseline, mutated, context())
    assert.ok(problems.some(problem => problem.includes(`export kind of ${id} is instance`)), problems.join('\n'))
})

test('the restored catalog passes again', () => {
    assert.deepEqual(compareCatalog(baseline, copy(), context()), [])
})

test('a difference from the published list passes only when explainedDifferences names it with a main commit', () => {
    const removed = baseline.effectIds[1]
    const mutated = copy()
    mutated.treeIds = mutated.treeIds.filter(id => id !== removed)
    mutated.manifestIds = mutated.manifestIds.filter(id => id !== removed)
    mutated.exportKinds = mutated.exportKinds.filter(([id]) => id !== removed)
    delete mutated.metadata[removed]
    const next = rewriteEffects(baseline, {
        ids: [removed], commit: MAIN_COMMIT, onMain: true, present: new Set(mutated.treeIds),
        exportKinds: new Map(), metadata: {},
    })
    assert.deepEqual(next.explainedDifferences.at(-1), { effectId: removed, change: 'removed', commit: MAIN_COMMIT })
    assert.equal(next.effectIds.includes(removed), false)
    assert.equal(removed in next.metadata, false)
    const withoutMergeBase = context({ mergeBaseIds: next.effectIds })
    assert.deepEqual(compareCatalog(next, mutated, withoutMergeBase), [])

    const unexplained = structuredClone(next)
    unexplained.explainedDifferences = []
    assert.ok(compareCatalog(unexplained, mutated, withoutMergeBase).some(problem => problem.includes(`${removed} is in the published list`)))

    const notOnMain = structuredClone(next)
    notOnMain.explainedDifferences.at(-1).commit = UNKNOWN_COMMIT
    assert.ok(compareCatalog(notOnMain, mutated, withoutMergeBase).some(problem => problem.includes(`names ${UNKNOWN_COMMIT}`)))
})

test('until the migration is closed, the IDs must equal the merge base\'s; once closed, a 2.x commit needs a reason', () => {
    const changed = baseline.effectIds[2]
    assert.ok(compareCatalog(baseline, copy(), context({ mergeBaseIds: baseline.effectIds.slice(1) }))
        .some(problem => problem.includes('merge base')))
    assert.deepEqual(compareCatalog(baseline, copy(), context({ mergeBaseIds: baseline.effectIds.slice(1), closed: true })), [])

    assert.throws(() => rewriteEffects(baseline, {
        ids: [changed], commit: LINE_COMMIT, onMain: false, present: new Set(baseline.effectIds),
        exportKinds: new Map(baseline.exportKinds), metadata: baseline.metadata,
    }), /needs --reason/)
    const withReason = rewriteEffects(baseline, {
        ids: [changed], commit: LINE_COMMIT, reason: 'regenerated meshes', onMain: false, present: new Set(baseline.effectIds),
        exportKinds: new Map(baseline.exportKinds), metadata: baseline.metadata,
    })
    assert.deepEqual(withReason.explainedDifferences.at(-1), { effectId: changed, change: 'changed', commit: LINE_COMMIT, reason: 'regenerated meshes' })
    assert.deepEqual(withReason.effectIds, baseline.effectIds)
    // Before the migration is closed, only a main commit explains an entry.
    assert.ok(compareCatalog(withReason, copy(), context()).some(problem => problem.includes(`names ${LINE_COMMIT}`)))
    assert.deepEqual(compareCatalog(withReason, copy(), context({ closed: true })), [])
    const noReason = structuredClone(withReason)
    delete noReason.explainedDifferences.at(-1).reason
    assert.ok(compareCatalog(noReason, copy(), context({ closed: true })).some(problem => problem.includes(`names ${LINE_COMMIT}`)))
})

test('the baseline\'s source must be a commit on origin/2.x itself, not only below HEAD', () => {
    const problems = compareCatalog(baseline, copy(), context({ commitOn: () => ({ main: false, published: false, line: true }) }))
    assert.ok(problems.some(problem => problem.includes(`sourceSha ${baseline.sourceSha}`)), problems.join('\n'))
})

test('--record --effects refuses a mistyped ID, and a reason with a main commit', () => {
    const fields = { present: new Set(baseline.effectIds), exportKinds: new Map(baseline.exportKinds), metadata: baseline.metadata }
    assert.throws(() => rewriteEffects(baseline, { ids: ['filter/noSuchEffect'], commit: MAIN_COMMIT, onMain: true, ...fields }), /Neither the tree nor the baseline has filter\/noSuchEffect/)
    assert.throws(() => rewriteEffects(baseline, { ids: [baseline.effectIds[0]], commit: MAIN_COMMIT, onMain: true, reason: 'a reason', ...fields }), /--reason is for a 2.x commit only/)
})

test('--check reads no network', async () => {
    const saved = globalThis.fetch
    globalThis.fetch = () => { throw new Error('--check must not use the network') }
    try {
        assert.deepEqual(await check(REPO_ROOT), [])
    } finally {
        globalThis.fetch = saved
    }
})

test('state and uniforms: each class export load is a fresh instance with its own containers; an instance export is one shared instance', async () => {
    const renderer = new CanvasRenderer({ basePath: pathToFileURL(path.join(REPO_ROOT, 'shaders')).href })
    for (const [id, kind] of baseline.exportKinds) {
        const [namespace, name] = id.split('/')
        const first = (await renderer.loadEffectDefinition(namespace, name)).instance
        const second = (await renderer.loadEffectDefinition(namespace, name)).instance
        for (const key of ['state', 'uniforms']) {
            assert.equal(typeof first[key], 'object', `${id} ${key}`)
            assert.notEqual(first[key], null, `${id} ${key}`)
        }
        if (kind === 'class') {
            assert.notEqual(first, second, id)
            assert.notEqual(first.state, second.state, `${id} shares state between loads`)
            assert.notEqual(first.uniforms, second.uniforms, `${id} shares uniforms between loads`)
        } else {
            assert.equal(first, second, id)
        }
    }
})

test('the test reference is the baseline\'s source, exported with git archive and never a stored copy', () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'portable-reference-')), 'source')
    try {
        exportReferenceSource(REPO_ROOT, baseline.sourceSha, dir)
        assert.equal(fs.existsSync(path.join(dir, '.git')), false, 'the export is not a checkout or a worktree')
        const ids = execFileSync('git', ['-C', REPO_ROOT, 'ls-tree', '-r', '--name-only', baseline.sourceSha, '--', 'shaders/effects'], { encoding: 'utf8' })
            .split('\n').map(line => line.match(/^shaders\/effects\/([^/]+\/[^/]+)\/definition\.js$/)?.[1]).filter(Boolean).sort()
        const exported = ids.filter(id => fs.existsSync(path.join(dir, 'shaders/effects', id, 'definition.js')))
        assert.deepEqual(exported, ids)
        assert.deepEqual(ids, baseline.effectIds)
        assert.throws(() => exportReferenceSource(REPO_ROOT, baseline.sourceSha, dir), /already exists/)
    } finally {
        fs.rmSync(path.dirname(dir), { recursive: true, force: true })
    }
})
