// Element ids: the optional `_id:` meta keyword on a chain element.
//
// A chain element is an effect call, inline starters included, or one of the
// builtins read, read3d, write and write3d. The parser keeps `_id:`, the
// validator checks it, and the unparser writes it back, first among the
// keywords. A program without `_id:` compiles and unparses as before.
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
const codes = result => result.diagnostics.map(d => d.code)
// Every compiled step, the branches of control flow included.
const allSteps = node => !node || typeof node !== 'object' ? []
    : Array.isArray(node) ? node.flatMap(allSteps)
        : [...(Array.isArray(node.chain) ? node.chain : []), ...['then', 'elif', 'else', 'body'].flatMap(key => allSteps(node[key]))]
const steps = result => allSteps(result.plans)
const ids = result => steps(result).map(step => [step.op, step.args?._id])
const semantics = result => steps(result).map(({ op, args, from, temp, idDuplicate }) => ({ op, args, from, temp, idDuplicate }))

for (const id of ['synth/noise', 'filter/invert', 'mixer/blendMode', 'synth3d/noise3d', 'render/render3d']) await register(id)

const HEAD = 'search synth, filter, mixer, synth3d, render\n'

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
    const read = compile(`${HEAD}read(o1, _id: "r").invert(_id: "i").write(o0)`)
    for (const cleared of [null, undefined]) {
        assert.ok(!unparse(read, { 0: { _id: cleared }, 1: { _id: cleared } }, options).includes('_id'), String(cleared))
    }
})

test('a skipped read keeps its _id: first among the keywords', () => {
    const result = compile(`${HEAD}read(surface: o1, _skip: true, _id: "r").write(o0)`)
    assert.deepEqual(errors(result), [])
    assert.ok(unparse(result, {}, options).includes('read(_id: "r", surface: o1, _skip: true)'))
})

test('an _id: value is a string of letters, digits and _ that starts with a letter', () => {
    const good = compile(`${HEAD}noise(_id: "a1_b").write(o0)`)
    assert.deepEqual(good.diagnostics, [])
    // Columns are 1-based: the value in `noise(_id: 5)` starts at column 12.
    for (const value of ['5', '"9a"', '"a-b"', '""', 'pond', '"_a"']) {
        const col = 12
        const result = compile(`${HEAD}noise(_id: ${value}).write(o0)`)
        const diagnostic = errors(result).find(d => d.message.includes('_id'))
        assert.ok(diagnostic, `_id: ${value} gives an error`)
        assert.equal(diagnostic.code, 'S001')
        assert.deepEqual(diagnostic.location, { line: 2, column: col }, `_id: ${value} is reported where it is written`)
        assert.equal(steps(result).find(s => s.op === 'synth.noise')?.args?._id, undefined)
    }
    // A string bound by a `let` is not a literal, written directly or inside a `let` value.
    for (const source of [`${HEAD}let k = "abc"\nnoise(_id: k).write(o0)`, `${HEAD}let k = "abc"\nlet y = noise(_id: k)\ny().write(o0)`]) {
        const result = compile(source)
        assert.ok(errors(result).some(d => d.code === 'S001' && d.message.includes('_id')), `${source}: ${JSON.stringify(result.diagnostics)}`)
    }
    const write = compile(`${HEAD}noise().write(o0, _id: 7)`)
    assert.ok(errors(write).some(d => d.message.includes('_id') && d.location?.line === 2))
})

test('S010 warns on a repeated _id:, and the first element in traversal order keeps it', () => {
    const result = compile(`${HEAD}noise(_id: "a").write(o0)
noise(_id: "a").invert().write(o1)`)
    assert.deepEqual(errors(result), [])
    const warning = result.diagnostics.find(d => d.code === 'S010')
    assert.ok(warning, 'S010 is reported')
    assert.equal(warning.severity, 'warning')
    assert.equal(warning.location?.line, 3)
    assert.deepEqual(codes(result), ['S010'])
    // Both keep the written id, so the program round-trips; the later one is
    // marked to keep its position key.
    const noises = steps(result).filter(s => s.op === 'synth.noise')
    assert.deepEqual(noises.map(s => [s.args._id, s.idDuplicate]), [['a', undefined], ['a', true]])
    assert.equal(unparse(result, {}, options).match(/_id: "a"/g)?.length, 2)
})

test('S010 settles a repeated _id: in traversal order, an inline starter before the call that holds it', () => {
    const result = compile(`${HEAD}noise().blendMode(_id: "x", tex: noise(_id: "x")).write(o0)`)
    const warning = result.diagnostics.find(d => d.code === 'S010')
    // blendMode's value `"x"` starts at column 24.
    assert.deepEqual(warning?.location, { line: 2, column: 24 })
    assert.deepEqual(steps(result).filter(s => s.args?._id === 'x').map(s => [s.op, s.idDuplicate]),
        [['synth.noise', undefined], ['mixer.blendMode', true]])
})

test('a repeated _id: from a let value keeps the same owner after a round trip', () => {
    const marks = result => steps(result).filter(s => s.args?._id === 'n').map(s => [s.temp, s.idDuplicate])
    for (const [source, expected] of [
        [`${HEAD}let y = noise(_id: "n")\nnoise(_id: "n").write(o0)\ny().write(o1)`, [[0, undefined], [2, true]]],
        [`${HEAD}let t = noise(_id: "n")\nnoise(_id: "n").write(o0)\nnoise().blendMode(_id: "b", tex: t).write(o1)`, [[0, undefined], [3, true]]],
        [`${HEAD}noise(_id: "n").write(o0)\nlet t = noise(_id: "n")\nnoise().blendMode(_id: "b", tex: t).write(o1)`, [[0, undefined], [3, true]]],
    ]) {
        const first = compile(source)
        assert.deepEqual(marks(first), expected, source)
        const again = compile(unparse(first, {}, options))
        assert.deepEqual(marks(again), expected, `${source}\nafter a round trip`)
    }
})

test('ids in the branches of control flow are one namespace', () => {
    const result = compile(`${HEAD}if (true) {
  noise(_id: "a").write(o0)
} else {
  noise(_id: "a").write(o1)
}`)
    assert.deepEqual(errors(result), [])
    assert.deepEqual(result.diagnostics.map(d => [d.code, d.location?.line]), [['S010', 5]])
    assert.deepEqual(steps(result).filter(s => s.args?._id === 'a').map(s => s.idDuplicate), [undefined, true])
})

test('a program with no repeated _id: marks no element', () => {
    const result = compile(`${HEAD}noise(_id: "a").invert(_id: "b").write(o0, _id: "c")`)
    assert.ok(steps(result).every(s => s.idDuplicate === undefined))
})

test('_id: values are a namespace of their own, apart from subchain and scene ids', () => {
    const result = compile(`${HEAD}noise(_id: "k").subchain(name: "s", id: "k") {
  .invert(_id: "s")
}.write(o0)`)
    assert.deepEqual(result.diagnostics, [])
})

test('S011 is an error for an _id: inside a let value used more than once', () => {
    const twice = compile(`${HEAD}let y = noise(_id: "n")
y().write(o0)
y().invert().write(o1)`)
    assert.ok(errors(twice).some(d => d.code === 'S011'), JSON.stringify(twice.diagnostics))
    assert.ok(!codes(twice).includes('S010'), 'the repeated id is reported once, as S011')
    const asValue = compile(`${HEAD}let t = noise(_id: "t")
noise().blendMode(tex: t).write(o0)
noise().blendMode(tex: t).write(o1)`)
    assert.ok(errors(asValue).some(d => d.code === 'S011'), JSON.stringify(asValue.diagnostics))
    const once = compile(`${HEAD}let y = noise(_id: "n")
y().write(o0)`)
    assert.deepEqual(once.diagnostics, [])
    const ownIds = compile(`${HEAD}let y = noise(octaves: 2)
y(_id: "a").write(o0)
y(_id: "b").write(o1)`)
    assert.deepEqual(ownIds.diagnostics, [])
})

test('the unparser keeps an _id: inside a let value', () => {
    const result = compile(`${HEAD}let y = noise(_id: "n", octaves: 5)
y().write(o0)`)
    assert.deepEqual(result.diagnostics, [])
    const text = unparse(result, {}, options)
    assert.ok(text.includes('let y = noise(_id: "n", octaves: 5)'), text)
    const again = compile(text)
    assert.deepEqual(errors(again), [])
    assert.deepEqual(steps(again).filter(s => s.args?._id).map(s => s.args._id), ['n'])
})

// No effect here declares a volume or geometry parameter, so a probe op does.
registerOp('synth.volumeProbe', { name: 'volumeProbe', args: [{ name: 'volume', type: 'volume' }, { name: 'geometry', type: 'geometry' }] })
registerStarterOps(['synth.volumeProbe'])

test('a read() passed as a value takes no _id:', () => {
    for (const source of [`${HEAD}noise().blendMode(tex: read(o1, _id: "r")).write(o0)`,
        `${HEAD}let r = read(o1, _id: "r")\nnoise().blendMode(tex: r).write(o0)`,
        `${HEAD}noise().blendMode(tex: read3d(vol0, geo0, _id: "r")).write(o0)`,
        `${HEAD}volumeProbe(volume: read3d(vol0, _id: "r")).write(o0)`,
        `${HEAD}volumeProbe(volume: read3d(vol0, geo0, _id: "r")).write(o0)`,
        `${HEAD}volumeProbe(geometry: read3d(geo0, _id: "r")).write(o0)`,
        `${HEAD}volumeProbe(volume: read(o1, _id: "r")).write(o0)`,
        `${HEAD}volumeProbe(geometry: read(o1, _id: "r")).write(o0)`]) {
        const result = compile(source)
        const diagnostic = errors(result).find(d => d.code === 'S001' && d.message.includes('_id'))
        assert.ok(diagnostic, `${source}: ${JSON.stringify(result.diagnostics)}`)
        assert.ok(diagnostic.message.endsWith('is not one'), diagnostic.message)
    }
})

test('a write() with anything but _id: after its target fails as it did before element ids', () => {
    for (const [source, message] of [['noise().write(o0, o1)', "Expect ')' at line 2 col 17"], ['noise().write(o0,)', "Expect ')' at line 2 col 17"],
        ['noise().write(o0, foo: "x")', "Expect ')' at line 2 col 17"], ['noise3d().write3d(vol0, geo0, vol1)', "Expect ')' at line 2 col 29"]]) {
        assert.throws(() => compile(`search synth, synth3d\n${source}`), { message })
    }
})

test('the expanded graph carries no _id uniform', () => {
    const graph = compileGraph(`${HEAD}noise(_id: "pond").invert(_id: "flip").write(o0, _id: "out")\nrender(o0)`)
    assert.ok(graph.passes.length > 0)
    for (const pass of graph.passes) assert.ok(!('_id' in (pass.uniforms || {})), JSON.stringify(pass.uniforms))
})

test('scene() and subchain keep their own keywords: neither takes an element _id:', () => {
    const subchain = compile(`${HEAD}noise().subchain(name: "s", id: "k", _id: "x") {
  .invert()
}.write(o0)`)
    assert.ok(subchain.diagnostics.some(d => d.code === 'P008' && d.message.includes("'_id'")))
    assert.ok(!steps(subchain).some(s => s.args?._id !== undefined))
    const scene = compile(`${HEAD}scene(_id: "a").write(o0)
noise(_id: "a").write(o1)`)
    assert.ok(!codes(scene).includes('S010'), 'a scene keyword is not an element id')
    assert.ok(!steps(scene).some(s => s.op !== 'synth.noise' && s.args?._id !== undefined))
    // The scene compiler, which reads scene()'s keywords, refuses it.
    assert.throws(() => compileGraph(`${HEAD}scene(_id: "a").write(o0)\nrender(o0)`), /Unknown keyword '_id' for scene\(\)/)
})

const ID_PROGRAMS = [
    `${HEAD}noise(_id: "pond", octaves: 4).invert(_id: "flip").write(o0, _id: "out")`,
    `${HEAD}noise(_id: "base").blendMode(_id: "mix", tex: noise(_id: "over")).write(o0)`,
    `${HEAD}noise().write(o1)\nread(o1, _id: "again").invert(_id: "inv").write(o0)`,
    `${HEAD}noise3d(_id: "vol").write3d(vol0, geo0, _id: "w3")\nread3d(vol0, geo0, _id: "r3").write(o0)`,
    `${HEAD}noise(_id: "n").subchain(name: "s", id: "sc") {\n  .invert(_id: "inner")\n}.write(o0)`,
    `${HEAD}if (true) {\n  noise(_id: "t").write(o0)\n} else {\n  noise(_id: "f").write(o0)\n}`,
    `${HEAD}noise(_id: "a").write(o0)\nnoise(_id: "a").write(o1)`,
]

test('compile, unparse and recompile are lossless for every _id:', () => {
    for (const source of ID_PROGRAMS) {
        const first = compile(source)
        assert.deepEqual(errors(first), [], source)
        assert.ok(steps(first).some(s => s.args?._id), source)
        const text = unparse(first, {}, options)
        const second = compile(text)
        assert.deepEqual(semantics(second), semantics(first), text)
        assert.equal(unparse(second, {}, options), text, 'unparse is stable')
    }
})

const corpus = JSON.parse(fs.readFileSync(path.join(repoRoot, 'shaders/tests/fixtures/wide-gamut/corpus.json'), 'utf8'))
const corpusCases = corpus.cases.filter(entry => entry.case.endsWith('.json'))
    .map(entry => ({ id: entry.id, ...JSON.parse(fs.readFileSync(path.join(repoRoot, entry.case), 'utf8')) }))
    .filter(entry => typeof entry.dsl === 'string')
for (const entry of corpusCases) for (const id of entry.effects || []) await register(id)

const ID_OPS = new Set(['_read', '_read3d', '_write', '_write3d'])
const takesId = step => !step.scene && (ID_OPS.has(step.op) || !step.builtin)

// A curated program that calls a custom effect from its own source repository
// does not compile here, where only this repository's effects are registered.
const callsUnknownCustomEffect = result => errors(result).some(d => d.code === 'S001' && d.message.startsWith('Unknown effect:'))

test('the corpus round-trips with an _id: on every chain element', () => {
    assert.ok(corpusCases.length > 0)
    let checked = 0
    for (const entry of corpusCases) {
        const result = compile(entry.dsl)
        if (errors(result).length) {
            assert.ok(entry.id.startsWith('curated/') && callsUnknownCustomEffect(result), `${entry.id} compiles: ${JSON.stringify(errors(result))}`)
            continue
        }
        for (const step of steps(result)) if (takesId(step)) step.args = { ...step.args, _id: `e${step.temp}` }
        const expected = steps(result).filter(takesId).map(step => [step.op, step.args._id])
        const text = unparse(result, {}, options)
        const again = compile(text)
        assert.deepEqual(errors(again), [], `${entry.id}:\n${text}`)
        assert.deepEqual(steps(again).filter(takesId).map(step => [step.op, step.args?._id]), expected, `${entry.id}:\n${text}`)
        checked++
    }
    assert.ok(checked > 0)
})

test('in the corpus, a program without _id: gives no _id in its compiled graph', () => {
    for (const entry of corpusCases) {
        const result = compile(entry.dsl)
        assert.ok(!steps(result).some(step => step.args && '_id' in step.args), entry.id)
        assert.ok(!codes(result).some(code => code === 'S010' || code === 'S011'), entry.id)
    }
})

// Every effect's own default program, with an id on every chain element.
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
