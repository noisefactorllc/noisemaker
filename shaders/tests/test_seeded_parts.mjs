import assert from 'node:assert/strict'
import test from 'node:test'
import { CanvasRenderer, compile, registerStarterOps, unparse } from '../src/index.js'
import { mergeIntoEnums } from '../src/lang/enums.js'
import { chanceFrom, drawU32, pickIndex, randFrom, randIntFrom } from '../src/lang/draws.js'

const renderer = new CanvasRenderer()
for (const [namespace, name, path] of [['synth', 'Noise', 'synth/noise'], ['synth', 'Cell', 'synth/cell'], ['filter', 'Posterize', 'filter/posterize'], ['filter', 'Edge', 'filter/edge']]) {
    const instance = (await import(`../effects/${path}/definition.js`)).default
    const choices = renderer.registerEffectWithRuntime({ namespace, name, instance })
    if (choices && Object.keys(choices).length > 0) await mergeIntoEnums(choices)
}
registerStarterOps(['synth.noise', 'synth.cell'])

const errors = c => c.diagnostics.filter(d => d.severity === 'error')
const codes = c => c.diagnostics.map(d => d.code)
const steps = (c, plan = 0) => c.plans[plan].chain
const opsOf = (c, plan = 0) => steps(c, plan).map(s => s.op)
const HEAD = 'search synth, filter\nseed 3\n'
const EDGE = 'part edgePass {\n    .edge(amount: rand(1, 3))\n}\n'

test('each use of a part draws separately, keyed by its use site', () => {
    const c = compile(`${HEAD}${EDGE}noise().use(edgePass).use(edgePass).write(o0)`)
    assert.deepEqual(errors(c), [])
    const [, first, second] = steps(c)
    assert.equal(first.args.amount, randFrom(drawU32(3, 'use@use_1/filter.edge@edge_1/amount'), 1, 3))
    assert.equal(second.args.amount, randFrom(drawU32(3, 'use@use_2/filter.edge@edge_1/amount'), 1, 3))
    assert.notEqual(first.args.amount, second.args.amount)
})

test('a part draws the same wherever it is declared', () => {
    const a = compile(`${HEAD}${EDGE}noise().use(edgePass).write(o0)`)
    const b = compile(`${HEAD}part other {\n    .edge(amount: 2)\n}\n${EDGE}noise().edge().use(edgePass).write(o0)`)
    assert.deepEqual(errors(b), [])
    assert.equal(steps(b).at(-2).args.amount, steps(a).at(-2).args.amount)
})

test('_seed on a use names one portable variation of the part', () => {
    const a = compile(`search synth, filter\n${EDGE}noise().use(edgePass, _seed: 12).write(o0)`)
    const b = compile(`${HEAD}${EDGE}cell().use(edgePass).use(edgePass, _seed: 12).write(o1)`)
    assert.deepEqual(errors(a), [])
    const expected = randFrom(drawU32(12, 'part:edgePass/filter.edge@edge_1/amount'), 1, 3)
    assert.equal(steps(a).at(-2).args.amount, expected)
    assert.equal(steps(b).at(-2).args.amount, expected)
})

test('use arguments replace a part let, and draw where the use is written', () => {
    const part = 'part cellBase {\n    let scale = randInt(40, 90)\n    cell(scale: scale)\n}\n'
    const fixed = compile(`${HEAD}${part}use(cellBase, scale: 70).write(o0)`)
    assert.deepEqual(errors(fixed), [])
    assert.equal(steps(fixed)[0].args.scale.value ?? steps(fixed)[0].args.scale, 70)
    const drawn = compile(`${HEAD}${part}use(cellBase, scale: randInt(1, 9)).write(o0)`)
    const value = steps(drawn)[0].args.scale
    assert.equal(value.value ?? value, randIntFrom(drawU32(3, 'use@use_1/arg:scale'), 1, 9))
    const own = compile(`${HEAD}${part}use(cellBase).write(o0)`)
    const ownValue = steps(own)[0].args.scale
    assert.equal(ownValue.value ?? ownValue, randIntFrom(drawU32(3, 'use@use_1/let:scale'), 40, 90))
})

test('a replaced default is still validated', () => {
    const c = compile(`${HEAD}part p {\n    let n = randInt(1.5, 3)\n    cell(scale: n)\n}\nuse(p, n: 4).write(o0)`)
    assert.ok(codes(c).includes('S012'))
})

test('use() errors: unknown part, unknown argument, late declaration, a cycle, a _ let', () => {
    for (const src of [
        `${HEAD}noise().use(missing).write(o0)`,
        `${HEAD}${EDGE}noise().use(edgePass, nope: 1).write(o0)`,
        `${HEAD}noise().use(edgePass).write(o0)\n${EDGE}`,
        `${HEAD}part a {\n    .use(b)\n}\npart b {\n    .use(a)\n}\nnoise().use(a).write(o0)`,
        `${HEAD}part p {\n    let _x = 1\n    .edge()\n}\nnoise().use(p).write(o0)`
    ]) {
        assert.ok(codes(compile(src)).includes('S012'), src)
    }
})

test('use(pick(...)) draws the part at the use key, and checks every candidate', () => {
    const parts = 'part a {\n    .edge(amount: 1)\n}\npart b {\n    .posterize()\n}\n'
    const c = compile(`${HEAD}${parts}noise().use(pick(a, b)).write(o0)`)
    assert.deepEqual(errors(c), [])
    const chosen = ['filter.edge', 'filter.posterize'][pickIndex(drawU32(3, 'use@use_1/part'), 2)]
    assert.equal(opsOf(c)[1], chosen)
    assert.ok(codes(compile(`${HEAD}${parts}noise().use(pick(a, b), amount: 2).write(o0)`)).includes('S012'))
})

test('maybe() includes its block by a keyed draw, and validates an untaken block', () => {
    const src = p => `${HEAD}noise()\nmaybe(${p}) {\n    .posterize(levels: randInt(3, 10))\n}\n.write(o0)`
    assert.deepEqual(opsOf(compile(src(1))), ['synth.noise', 'filter.posterize', '_write'])
    assert.deepEqual(opsOf(compile(src(0))), ['synth.noise', '_write'])
    const half = compile(src(0.5))
    const taken = chanceFrom(drawU32(3, 'maybe_1/decide'), 0.5)
    assert.equal(opsOf(half).includes('filter.posterize'), taken)
    if (taken) assert.equal(steps(half)[1].args.levels, randIntFrom(drawU32(3, 'maybe_1/filter.posterize@posterize_1/levels'), 3, 10))
    assert.ok(codes(compile(`${HEAD}noise()\nmaybe(0) {\n    .posterize(levels: randInt(1.5, 3))\n}\n.write(o0)`)).includes('S012'))
    assert.ok(codes(compile(`${HEAD}noise()\nmaybe(2) {\n    .posterize()\n}\n.write(o0)`)).includes('S012'))
})

test('a skipped maybe changes no later draw', () => {
    const tailDraw = p => steps(compile(`${HEAD}noise()\nmaybe(${p}) {\n    .posterize(levels: randInt(3, 10))\n}\n.edge(amount: rand(1, 3))\n.write(o0)`)).at(-2).args.amount
    assert.equal(tailDraw(0), tailDraw(1))
})

test('statement-level maybe and use of a part holding whole chains', () => {
    const c = compile(`${HEAD}part layer {\n    noise(scaleY: rand(1, 10)).write(o1)\n}\nuse(layer)\nmaybe(1) {\n    cell().write(o2)\n}`)
    assert.deepEqual(errors(c), [])
    assert.equal(c.plans[0].then[0].chain[0].args.scaleY, randFrom(drawU32(3, 'use@use_1/synth.noise@noise_1/scaleY'), 1, 10))
    assert.equal(c.plans[1].then[0].chain[0].op, 'synth.cell')
    assert.deepEqual(compile(`${HEAD}maybe(0) {\n    cell().write(o2)\n}`).plans[0].then, [])
})

test('parts, uses and maybes are written back as authored, and the round trip is stable', () => {
    const src = `${HEAD}${EDGE}part cellBase {\n    let scale = randInt(40, 90)\n    cell(scale: scale)\n}\nuse(cellBase, scale: 70)\nmaybe(0.5) {\n    .posterize(levels: randInt(3, 10))\n}\n.use(edgePass)\n.write(o0)\nmaybe(0.9) {\n    noise().write(o2)\n}`
    const c = compile(src)
    assert.deepEqual(errors(c), [])
    const once = unparse(c)
    for (const text of ['part edgePass {', 'part cellBase {', 'use(cellBase, scale: 70)', 'maybe(0.5) {', '.use(edgePass)', 'maybe(0.9) {']) {
        assert.ok(once.includes(text), `${text}\n${once}`)
    }
    assert.doesNotMatch(once, /\.edge\(amount: \d/)
    const again = compile(once)
    assert.deepEqual(errors(again), [])
    assert.deepEqual(again.plans.map(p => (p.chain || []).map(s => s.args)), c.plans.map(p => (p.chain || []).map(s => s.args)))
    assert.equal(unparse(again), once)
})
