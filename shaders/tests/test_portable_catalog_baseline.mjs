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
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { before, test } from 'node:test'

import { CanvasRenderer } from '../src/index.js'
import {
    BASELINE_RELATIVE,
    REPO_ROOT,
    check,
    compareCatalog,
    exportReferenceSource,
    firstDifference,
    loadCatalog,
    manifestEffectIds,
    rewriteEffects,
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
