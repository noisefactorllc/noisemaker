import assert from 'node:assert/strict'
import test from 'node:test'
import { CanvasRenderer, compile, registerStarterOps, unparse } from '../src/index.js'
import { mergeIntoEnums } from '../src/lang/enums.js'
import { drawU32, randFrom } from '../src/lang/draws.js'

const renderer = new CanvasRenderer()
for (const [namespace, name, path] of [['synth', 'Noise', 'synth/noise'], ['filter', 'Edge', 'filter/edge']]) {
    const instance = (await import(`../effects/${path}/definition.js`)).default
    const choices = renderer.registerEffectWithRuntime({ namespace, name, instance })
    if (choices && Object.keys(choices).length > 0) await mergeIntoEnums(choices)
}
registerStarterOps(['synth.noise'])

const HEAD = 'search synth, filter\nseed 3\n'
const EDGE = 'part edgePass {\n    .edge(amount: rand(1, 3))\n}\n'
const errors = c => c.diagnostics.filter(d => d.severity === 'error')
const codes = c => c.diagnostics.map(d => d.code)
const scaleY = (c, plan) => c.plans[plan].chain[0].args.scaleY
const draw = key => randFrom(drawU32(3, key), 1, 10)

test('an _id: names the element in its draw keys', () => {
    const c = compile(`${HEAD}noise(_id: "pond", scaleY: rand(1, 10)).write(o0)`)
    assert.deepEqual(errors(c), [])
    assert.equal(scaleY(c, 0), draw('synth.noise@pond/scaleY'))
})

test('naming an element with its occurrence name changes no draw', () => {
    const before = compile(`${HEAD}noise(scaleY: rand(1, 10)).write(o0)\nnoise(scaleY: rand(1, 10)).write(o1)`)
    const after = compile(`${HEAD}noise(_id: "noise_1", scaleY: rand(1, 10)).write(o0)\nnoise(_id: "noise_2", scaleY: rand(1, 10)).write(o1)`)
    assert.deepEqual(errors(after), [])
    assert.equal(scaleY(after, 0), scaleY(before, 0))
    assert.equal(scaleY(after, 1), scaleY(before, 1))
})

test('an element whose occurrence name is another element’s _id: draws with a suffix, and a warning', () => {
    const c = compile(`${HEAD}noise(scaleY: rand(1, 10)).write(o0)\nnoise(_id: "noise_1", scaleY: rand(1, 10)).write(o1)`)
    assert.deepEqual(errors(c), [])
    assert.equal(scaleY(c, 0), draw("synth.noise@noise_1'/scaleY"))
    assert.equal(scaleY(c, 1), draw('synth.noise@noise_1/scaleY'))
    assert.ok(codes(c).includes('S014'))
})

test('a duplicate _id: draws by its occurrence name', () => {
    const c = compile(`${HEAD}noise(_id: "a", scaleY: rand(1, 10)).write(o0)\nnoise(_id: "a", scaleY: rand(1, 10)).write(o1)`)
    assert.ok(codes(c).includes('S010'))
    assert.equal(scaleY(c, 0), draw('synth.noise@a/scaleY'))
    assert.equal(scaleY(c, 1), draw('synth.noise@noise_2/scaleY'))
})

test('a use with an _id: keys its draws by that id', () => {
    const c = compile(`${HEAD}${EDGE}noise().use(edgePass, _id: "edges").write(o0)`)
    assert.deepEqual(errors(c), [])
    assert.equal(c.plans[0].chain[1].args.amount, randFrom(drawU32(3, 'use@edges/filter.edge@edge_1/amount'), 1, 3))
    assert.match(unparse(c), /use\(edgePass, _id: "edges"\)/)
})

test('ids inside a part are a namespace of their own for each use', () => {
    const part = 'part p {\n    .edge(_id: "e", amount: rand(1, 3))\n}\n'
    const c = compile(`${HEAD}${part}noise().use(p, _id: "a").use(p, _id: "b").write(o0)`)
    assert.deepEqual(errors(c), [])
    assert.ok(!codes(c).includes('S010'))
    const [, first, second] = c.plans[0].chain
    assert.equal(first.args.amount, randFrom(drawU32(3, 'use@a/filter.edge@e/amount'), 1, 3))
    assert.equal(second.args.amount, randFrom(drawU32(3, 'use@b/filter.edge@e/amount'), 1, 3))
})

test('an _id: inside a part needs an _id: on every use of it', () => {
    const part = 'part p {\n    .edge(_id: "e")\n}\n'
    assert.ok(codes(compile(`${HEAD}${part}noise().use(p).write(o0)`)).includes('S012'))
    assert.ok(codes(compile(`${HEAD}noise().use(edgePass, _id: 3).write(o0)\n`.replace('noise()', `${EDGE}noise()`))).includes('S001'))
})
