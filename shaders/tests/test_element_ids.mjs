// Element ids on Noisemaker 1.x: the optional `_id:` meta keyword on a chain
// element.
//
// Noisemaker 2 keys an element's state by its `_id:`. Noisemaker 1.x keys
// state by position, so an id has no effect here: the parser keeps it, the
// validator keeps it in the step, and the unparser writes it back in
// Noisemaker 2's position and form, first among the keywords. A program saved
// with ids keeps them, and compiles to the same graph as without them.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { compile, unparse } from '../src/lang/index.js'
import { registerEffect, registerOp, registerStarterOps, mergeIntoEnums, stdEnums } from '../src/index.js'
import { compileGraph } from '../src/runtime/compiler.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'shaders/effects/manifest.json'), 'utf8'))
const definitions = new Map()

mergeIntoEnums(stdEnums)

async function register(id) {
    if (definitions.has(id)) return
    const file = path.join(repoRoot, 'shaders/effects', id, 'definition.js')
    const { default: definition } = await import(pathToFileURL(file))
    const effect = typeof definition === 'function' ? new definition() : definition
    const namespace = id.slice(0, id.lastIndexOf('/'))
    const name = `${namespace}.${effect.func}`
    definitions.set(id, effect)
    definitions.set(name, effect)
    registerEffect(name, effect)
    registerEffect(effect.func, effect)
    const choices = {}
    const args = Object.entries(effect.globals || {}).map(([key, spec]) => {
        const enumPath = spec.enum || spec.enumPath || (spec.choices ? `${namespace}.${effect.func}.${key}` : undefined)
        if (spec.choices) {
            choices[key] = Object.fromEntries(Object.entries(spec.choices)
                .filter(([label]) => !label.endsWith(':'))
                .map(([label, value]) => [label, { type: 'Number', value }]))
        }
        return {
            name: key, type: spec.type === 'vec4' ? 'color' : spec.type,
            default: spec.default, enum: enumPath, enumPath,
            min: spec.min, max: spec.max, uniform: spec.uniform, choices: spec.choices
        }
    })
    registerOp(name, { name: effect.func, args })
    if (Object.keys(choices).length) mergeIntoEnums({ [namespace]: { [effect.func]: choices } })
    if (effect.enums) mergeIntoEnums(effect.enums)
    if (manifest[id]?.starter) registerStarterOps([name])
}

const options = { getEffectDef: name => definitions.get(name) }
const errors = result => result.diagnostics.filter(d => d.severity === 'error')
// Every compiled step, the branches of control flow included.
const allSteps = node => !node || typeof node !== 'object' ? []
    : Array.isArray(node) ? node.flatMap(allSteps)
        : [...(Array.isArray(node.chain) ? node.chain : []), ...['then', 'elif', 'else', 'body'].flatMap(key => allSteps(node[key]))]
const steps = result => allSteps(result.plans)
const ids = result => steps(result).map(step => [step.op, step.args?._id])
const withoutIds = source => source.replace(/_id: "[^"]*", /g, '').replace(/, _id: "[^"]*"/g, '').replace(/_id: "[^"]*"/g, '')

for (const id of ['synth/noise', 'filter/invert', 'mixer/blendMode', 'synth3d/noise3d']) await register(id)

const HEAD = 'search synth, filter, mixer, synth3d\n'

test('an effect call keeps its _id:, and the unparser writes it first among the keywords', () => {
    const result = compile(`${HEAD}noise(octaves: 3, _id: "pond").invert(_id: "flip").write(o0)`)
    assert.deepEqual(result.diagnostics, [])
    assert.deepEqual(ids(result), [['synth.noise', 'pond'], ['filter.invert', 'flip'], ['_write', undefined]])
    const text = unparse(result, {}, options)
    assert.match(text, /noise\(_id: "pond", octaves: 3\)/)
    assert.match(text, /\.invert\(_id: "flip"\)/)
})

test('an inline starter passed as a value keeps its _id:', () => {
    const result = compile(`${HEAD}noise(_id: "base").blendMode(tex: noise(_id: "over", octaves: 5)).write(o0)`)
    assert.deepEqual(errors(result), [])
    const byId = Object.fromEntries(steps(result).filter(s => s.args?._id).map(s => [s.args._id, s.op]))
    assert.deepEqual(byId, { base: 'synth.noise', over: 'synth.noise' })
    assert.match(unparse(result, {}, options), /noise\(_id: "over", octaves: 5\)/)
})

test('read, read3d, write and write3d keep their _id:', () => {
    const result = compile(`${HEAD}noise(_id: "n").write(o1, _id: "w1")
read(o1, _id: "r").invert().write(o0, _id: "w0")
noise3d().write3d(vol0, geo0, _id: "w3")
read3d(vol0, geo0, _id: "r3").write(o2)`)
    assert.deepEqual(errors(result), [])
    const byOp = steps(result).filter(s => s.args?._id).map(s => [s.op, s.args._id])
    assert.deepEqual(byOp, [['synth.noise', 'n'], ['_write', 'w1'], ['_read', 'r'], ['_write', 'w0'],
        ['_write3d', 'w3'], ['_read3d', 'r3']])
    const text = unparse(result, {}, options)
    // read and read3d write the keyword form, so no call mixes positional and keyword arguments.
    for (const form of ['write(o1, _id: "w1")', 'read(_id: "r", surface: o1)', 'write(o0, _id: "w0")',
        'write3d(vol0, geo0, _id: "w3")', 'read3d(_id: "r3", tex3d: vol0, geo: geo0)']) {
        assert.ok(text.includes(form), `unparse writes ${form}:\n${text}`)
    }
})

test('an _id override replaces or removes an element id', () => {
    const result = compile(`${HEAD}noise(_id: "pond").write(o0, _id: "out")`)
    const replaced = unparse(result, { 0: { _id: 'lake' }, 1: { _id: 'sink' } }, options)
    assert.ok(replaced.includes('noise(_id: "lake")') && replaced.includes('write(o0, _id: "sink")'), replaced)
    for (const cleared of [null, undefined]) {
        const removed = unparse(result, { 0: { _id: cleared }, 1: { _id: cleared } }, options)
        assert.ok(!removed.includes('_id'), `${cleared}: ${removed}`)
        assert.deepEqual(compile(removed).diagnostics, [])
    }
})

test('a skipped read keeps its _id: first among the keywords', () => {
    const result = compile(`${HEAD}read(surface: o1, _skip: true, _id: "r").write(o0)`)
    assert.deepEqual(errors(result), [])
    assert.ok(unparse(result, {}, options).includes('read(_id: "r", surface: o1, _skip: true)'))
})

test('1.x raises no diagnostic for an _id:, and keeps only the form Noisemaker 2 accepts', () => {
    for (const value of ['5', '"9a"', '"a-b"', '""', 'pond', '"_a"']) {
        const result = compile(`${HEAD}noise(_id: ${value}).write(o0)`)
        assert.ok(!result.diagnostics.some(d => d.message.includes('_id')), `_id: ${value}: ${JSON.stringify(result.diagnostics)}`)
        assert.equal(steps(result).find(s => s.op === 'synth.noise')?.args?._id, undefined, `_id: ${value} is not kept`)
    }
    const write = compile(`${HEAD}noise().write(o0, _id: 7)`)
    assert.deepEqual(errors(write), [])
    assert.ok(!unparse(write, {}, options).includes('_id'))
})

test('1.x keeps a repeated _id: as authored, with neither S010 nor S011', () => {
    const repeated = compile(`${HEAD}noise(_id: "a").write(o0)
noise(_id: "a").invert().write(o1)`)
    assert.deepEqual(repeated.diagnostics, [])
    assert.deepEqual(steps(repeated).filter(s => s.op === 'synth.noise').map(s => [s.args._id, s.idDuplicate]), [['a', undefined], ['a', undefined]])
    assert.equal(unparse(repeated, {}, options).match(/_id: "a"/g)?.length, 2)

    const sharedLet = compile(`${HEAD}let y = noise(_id: "n")
y().write(o0)
y().invert().write(o1)`)
    assert.deepEqual(sharedLet.diagnostics, [])
    assert.deepEqual(steps(sharedLet).filter(s => s.op === 'synth.noise').map(s => s.args._id), ['n', 'n'])
    // 1.x writes each use of a let value back in place, so each element writes its id.
    const text = unparse(sharedLet, {}, options)
    assert.ok(text.includes('let y = noise(_id: "n")'), text)
    assert.deepEqual(steps(compile(text)).filter(s => s.op === 'synth.noise').map(s => s.args._id), ['n', 'n'], text)
})

test('a write() with anything but _id: after its target fails as it did before element ids', () => {
    for (const [source, message] of [['noise().write(o0, o1)', "Expect ')' at line 2 col 17"], ['noise().write(o0,)', "Expect ')' at line 2 col 17"],
        ['noise().write(o0, foo: "x")', "Expect ')' at line 2 col 17"], ['noise3d().write3d(vol0, geo0, vol1)', "Expect ')' at line 2 col 29"]]) {
        assert.throws(() => compile(`search synth, synth3d\n${source}`), { message })
    }
})

test('subchain keeps its own keywords', () => {
    const subchain = compile(`${HEAD}noise().subchain(name: "s", id: "k", _id: "x") {
  .invert()
}.write(o0)`)
    assert.ok(subchain.diagnostics.some(d => d.code === 'P008' && d.message.includes("'_id'")))
    assert.ok(!steps(subchain).some(s => s.args?._id !== undefined))
})

// Programs as a Noisemaker 2 host saves them, with an id on chain elements.
const SAVED = [
    `${HEAD}noise(_id: "pond", octaves: 4).invert(_id: "flip").write(o0, _id: "out")`,
    `${HEAD}noise(_id: "base").blendMode(_id: "mix", tex: noise(_id: "over")).write(o0)`,
    `${HEAD}noise().write(o1)\nread(_id: "again", surface: o1).invert(_id: "inv").write(o0)`,
    `${HEAD}noise3d(_id: "vol").write3d(vol0, geo0, _id: "w3")\nread3d(_id: "r3", tex3d: vol0, geo: geo0).write(o0)`,
    `${HEAD}noise(_id: "n").subchain(name: "s", id: "sc") {\n  .invert(_id: "inner")\n}.write(o0)`,
    `${HEAD}if (true) {\n  noise(_id: "t").write(o0)\n} else {\n  noise(_id: "f").write(o0)\n}`,
    `${HEAD}noise(_id: "a").write(o0)\nnoise(_id: "a").write(o1)`,
    `${HEAD}let y = noise(_id: "n", octaves: 5)\ny().write(o0)\ny().write(o1)`,
]
const idValues = text => [...text.matchAll(/_id: "([^"]*)"/g)].map(match => match[1])

test('a saved program survives parse, unparse and reparse, byte for byte for its _id: values', () => {
    for (const source of SAVED) {
        const first = compile(source)
        assert.deepEqual(first.diagnostics, [], source)
        const text = unparse(first, {}, options)
        // Each element writes back the bytes of its own value. 1.x also writes
        // each use of a let value in place, so a value can appear more often.
        assert.deepEqual(new Set(idValues(text)), new Set(idValues(source)), `${source}\n->\n${text}`)
        const second = compile(text)
        assert.deepEqual(second.diagnostics, [], text)
        assert.deepEqual(ids(second), ids(first), text)
        assert.equal(unparse(second, {}, options), text, 'unparse is stable')
    }
})

// A graph without its source text, its id (a hash of the source) and its
// compile timestamp.
function graphOf(source) {
    const graph = compileGraph(`${source}\nrender(o0)`)
    const { compiledAt: _compiledAt, id: _id, source: _source, ...rest } = graph
    return JSON.parse(JSON.stringify(rest, (key, value) => value instanceof Map ? [...value] : value instanceof Set ? [...value] : value))
}

test('a program with ids compiles to the same graph as the same program without them', () => {
    for (const source of SAVED) {
        const bare = withoutIds(source)
        assert.ok(!bare.includes('_id'), bare)
        // The 1.x runtime does not execute control flow: both forms then fail alike.
        const outcome = text => { try { return graphOf(text) } catch (error) { return { failed: error } } }
        assert.deepEqual(outcome(source), outcome(bare), source)
    }
})

test('the expanded graph carries no _id uniform', () => {
    const graph = compileGraph(`${HEAD}noise(_id: "pond").invert(_id: "flip").write(o0, _id: "out")\nrender(o0)`)
    assert.ok(graph.passes.length > 0)
    for (const pass of graph.passes) assert.ok(!('_id' in (pass.uniforms || {})), JSON.stringify(pass.uniforms))
})

// Every effect's own default program, with an id on every chain element.
const ID_OPS = new Set(['_read', '_read3d', '_write', '_write3d'])
const takesId = step => !step.scene && (ID_OPS.has(step.op) || !step.builtin)
for (const id of Object.keys(manifest)) await register(id)
const defaultPrograms = [...new Set(Object.keys(manifest).map(id => definitions.get(id)?.defaultProgram).filter(dsl => typeof dsl === 'string'))]

test('every default program round-trips with an _id: on every chain element', () => {
    assert.ok(defaultPrograms.length > 0)
    let checked = 0
    for (const dsl of defaultPrograms) {
        const result = compile(dsl)
        if (errors(result).length) continue
        for (const step of steps(result)) if (takesId(step)) step.args = { ...step.args, _id: `e${step.temp}` }
        const expected = steps(result).filter(takesId).map(step => [step.op, step.args._id])
        const text = unparse(result, {}, options)
        const again = compile(text)
        assert.deepEqual(errors(again), [], `${dsl}\n->\n${text}`)
        assert.deepEqual(steps(again).filter(takesId).map(step => [step.op, step.args?._id]), expected, text)
        checked++
    }
    assert.ok(checked > 0)
})

test('a default program without _id: compiles with no _id in its steps', () => {
    for (const dsl of defaultPrograms) {
        assert.ok(!steps(compile(dsl)).some(step => step.args && '_id' in step.args), dsl)
    }
})
