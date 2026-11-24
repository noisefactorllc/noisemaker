// Saved programs keep their meaning under seeded randomization. Over the
// regression corpus, a program without a seed directive or random calls gets
// no seed field in its compiled graph, every effect seed keeps its authored
// value or its default, and the program unparses to text that compiles to the
// same graph.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CanvasRenderer, compile, registerStarterOps, unparse } from '../src/index.js'
import { mergeIntoEnums } from '../src/lang/enums.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const corpus = JSON.parse(fs.readFileSync(path.join(root, 'shaders/tests/fixtures/wide-gamut/corpus.json'), 'utf8'))
const cases = corpus.cases.filter(entry => entry.case.endsWith('.json'))
    .map(entry => ({ id: entry.id, ...JSON.parse(fs.readFileSync(path.join(root, entry.case), 'utf8')) }))
    .filter(entry => typeof entry.dsl === 'string')

const renderer = new CanvasRenderer()
const definitions = new Map()
for (const id of new Set(cases.flatMap(entry => entry.effects || []))) {
    const file = path.join(root, 'shaders/effects', id, 'definition.js')
    if (!fs.existsSync(file)) continue
    const { default: exported } = await import(pathToFileURL(file))
    const instance = typeof exported === 'function' ? new exported() : exported
    const namespace = id.slice(0, id.lastIndexOf('/'))
    definitions.set(`${namespace}.${instance.func}`, instance)
    const choices = renderer.registerEffectWithRuntime({ namespace, name: instance.name, instance })
    if (choices && Object.keys(choices).length > 0) await mergeIntoEnums(choices)
    if (instance.starter) registerStarterOps([`${namespace}.${instance.func}`])
}

const errors = c => c.diagnostics.filter(d => d.severity === 'error')
const stepsOf = plans => plans.flatMap(plan => [...(plan.chain || []), ...stepsOf([...(plan.then || []), ...(plan.else || []), ...(plan.elif || []).flatMap(e => e.then || [])])])
const SEED_FIELDS = ['randomSources', 'inheritedSeeds', 'authoredSeeds']

test('the corpus holds no seeded construct', () => {
    assert.ok(cases.length > 0)
    for (const entry of cases) {
        assert.doesNotMatch(entry.dsl, /^\s*seed\s+\d/m, entry.id)
        assert.doesNotMatch(entry.dsl, /\b(rand|randInt|pick|chance|randColor|choices|maybe|use)\(|\bpart\s+\w+\s*\{|_seed\s*:/, entry.id)
    }
})

test('a corpus program gets no seed field, and its effect seeds keep their values', () => {
    let seeds = 0
    for (const entry of cases) {
        const result = compile(entry.dsl)
        assert.equal(result.seed, undefined, entry.id)
        assert.equal(result.parts, undefined, entry.id)
        for (const step of stepsOf(result.plans)) {
            for (const field of SEED_FIELDS) assert.equal(step[field], undefined, `${entry.id} ${step.op} ${field}`)
            const def = definitions.get(step.op)
            for (const [name, spec] of Object.entries(def?.globals || {})) {
                if (name !== 'seed' && !spec.inheritsSeed) continue
                const raw = step.rawKwargs?.[name]
                const value = step.args?.[name]
                if (raw?.type === 'Number') assert.equal(value?.value ?? value, raw.value, `${entry.id} ${step.op}.${name}`)
                else if (raw === undefined) assert.equal(value, spec.default, `${entry.id} ${step.op}.${name}`)
                seeds++
            }
        }
    }
    assert.ok(seeds > 0)
})

test('a corpus program unparses to stable text that keeps its values', () => {
    let checked = 0
    for (const entry of cases) {
        const first = compile(entry.dsl)
        if (errors(first).length) continue
        const text = unparse(first)
        const again = compile(text)
        assert.equal(unparse(again), text, entry.id)
        // Scene steps carry source locations; the values of every other step match.
        const values = c => stepsOf(c.plans).filter(s => !s.scene).map(s => [s.op, s.args])
        assert.deepEqual(values(again), values(first), entry.id)
        checked++
    }
    assert.ok(checked > 0)
})
