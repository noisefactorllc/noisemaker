import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import test from 'node:test'
import { CanvasRenderer, compile, registerStarterOps, unparse } from '../src/index.js'
import { mergeIntoEnums } from '../src/lang/enums.js'
import { PIN_KEY, chanceFrom, drawU32, pickIndex, randColorFrom, randFrom, randIntFrom } from '../src/lang/draws.js'
import noise from '../effects/synth/noise/definition.js'
import sacredGeometry from '../effects/synth/sacredGeometry/definition.js'
import tint from '../effects/filter/tint/definition.js'
import blendMode from '../effects/mixer/blendMode/definition.js'

const renderer = new CanvasRenderer()
for (const [namespace, name, instance] of [['synth', 'Noise', noise], ['synth', 'SacredGeometry', sacredGeometry], ['filter', 'Tint', tint], ['mixer', 'BlendMode', blendMode]]) {
    const choices = renderer.registerEffectWithRuntime({ namespace, name, instance })
    if (choices && Object.keys(choices).length > 0) await mergeIntoEnums(choices)
}
registerStarterOps(['synth.noise', 'synth.sacredGeometry'])

const errors = c => c.diagnostics.filter(d => d.severity === 'error')
const codes = c => c.diagnostics.map(d => d.code)
const args = (c, plan = 0, step = 0) => c.plans[plan].chain[step].args
const plain = v => (v && typeof v === 'object' && '_varRef' in v ? v.value : v)

function parseError(src) {
    try {
        compile(src)
    } catch (error) {
        return error
    }
    assert.fail(`expected a parse error for:\n${src}`)
}

test('the seed directive sets the program seed and is unparsed after search', () => {
    const c = compile('search synth\nseed 4294967295\nnoise().write(o0)\nrender(o0)')
    assert.deepEqual(errors(c), [])
    assert.equal(c.seed, 4294967295)
    assert.match(unparse(c), /^search synth\nseed 4294967295\n/)

    const zero = compile('search synth\nseed 0\nnoise().write(o0)')
    assert.equal(zero.seed, 0)
    assert.match(unparse(zero), /^search synth\nseed 0\n/)
})

test('the seed directive rejects a second directive, a bad value and a late position', () => {
    for (const src of [
        'search synth\nseed 1\nseed 2\nnoise().write(o0)',
        'search synth\nseed 4294967296\nnoise().write(o0)',
        'search synth\nseed 1.5\nnoise().write(o0)',
        'search synth\nseed -1\nnoise().write(o0)',
        'search synth\nseed\nnoise().write(o0)',
        'search synth\nnoise().write(o0)\nseed 3',
        'seed 3\nsearch synth\nnoise().write(o0)'
    ]) {
        assert.equal(parseError(src).diagnostic?.code, 'P011', src)
    }
})

test('seed stays an ordinary name everywhere else', () => {
    const c = compile('search synth\nsacredGeometry(geometry: seed).write(o0)')
    assert.deepEqual(errors(c), [])
    assert.equal(args(c).geometry, 4)
    assert.equal(compile('search synth\nlet seed = 3\nnoise(octaves: seed).write(o0)').seed, undefined)
})

test('a program without a seed directive draws from seed 0', () => {
    const c = compile('search synth\nnoise(scaleY: rand(1, 10)).write(o0)')
    assert.deepEqual(errors(c), [])
    assert.equal(c.seed, undefined)
    assert.equal(args(c).scaleY, randFrom(drawU32(0, 'synth.noise@noise_1/scaleY'), 1, 10))
})

test('each construct draws from its key with the draw library', () => {
    const c = compile(`search synth, filter
seed 7
noise(scaleY: rand(1, 10), octaves: randInt(1, 4), ridges: chance(0.5), colorMode: pick(mono, rgb))
  .tint(color: randColor(s: 1, v: 1))
  .write(o0)`)
    assert.deepEqual(errors(c), [])
    const n = args(c)
    assert.equal(n.scaleY, randFrom(drawU32(7, 'synth.noise@noise_1/scaleY'), 1, 10))
    assert.equal(n.octaves, randIntFrom(drawU32(7, 'synth.noise@noise_1/octaves'), 1, 4))
    assert.equal(n.ridges, chanceFrom(drawU32(7, 'synth.noise@noise_1/ridges'), 0.5))
    assert.equal(n.colorMode, ['mono', 'rgb'].map(k => ({ mono: 0, rgb: 1 })[k])[pickIndex(drawU32(7, 'synth.noise@noise_1/colorMode'), 2)])
    const hex = randColorFrom(drawU32(7, 'filter.tint@tint_1/color'), { s: 1, v: 1 })
    const expected = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    assert.deepEqual(args(c, 0, 1).color.slice(0, 3), expected)
})

test('choices() lists a parameter\'s choices for pick()', () => {
    const c = compile('search synth\nseed 3\nsacredGeometry(geometry: pick(choices(sacredGeometry, geometry))).write(o0)')
    assert.deepEqual(errors(c), [])
    const names = Object.keys(sacredGeometry.globals.geometry.choices)
    const chosen = names[pickIndex(drawU32(3, 'synth.sacredGeometry@sacredGeometry_1/geometry'), names.length)]
    assert.equal(args(c).geometry, sacredGeometry.globals.geometry.choices[chosen])
    assert.ok(codes(compile('search synth\nsacredGeometry(geometry: choices(sacredGeometry, geometry)).write(o0)')).includes('S012'))
})

test('a random let draws once, and every use shares its value', () => {
    const c = compile('search synth\nseed 11\nlet size = randInt(2, 6) * 10\nnoise(scaleX: size, scaleY: size).write(o0)')
    assert.deepEqual(errors(c), [])
    const expected = randIntFrom(drawU32(11, 'let:size/o0'), 2, 6) * 10
    assert.equal(plain(args(c).scaleX), expected)
    assert.equal(plain(args(c).scaleY), expected)
})

test('a redeclared let gets its own key', () => {
    const c = compile('search synth\nseed 5\nlet a = rand(1, 10)\nnoise(scaleX: a).write(o0)\nlet a = rand(1, 10)\nnoise(scaleX: a).write(o1)')
    assert.deepEqual(errors(c), [])
    assert.equal(plain(args(c, 0).scaleX), randFrom(drawU32(5, 'let:a'), 1, 10))
    assert.equal(plain(args(c, 1).scaleX), randFrom(drawU32(5, 'let:a#2'), 1, 10))
})

test('arithmetic and vectors locate their calls by structure', () => {
    const c = compile('search synth\nseed 9\nnoise(scaleX: rand(1, 2) + rand(1, 2), scaleY: 20 + -rand(1, 2)).write(o0)')
    assert.deepEqual(errors(c), [])
    const key = 'synth.noise@noise_1'
    assert.equal(args(c).scaleX, randFrom(drawU32(9, `${key}/scaleX/o0`), 1, 2) + randFrom(drawU32(9, `${key}/scaleX/o1`), 1, 2))
    assert.equal(args(c).scaleY, 20 + -randFrom(drawU32(9, `${key}/scaleY/o1/o0`), 1, 2))
})

test('elements are named by occurrence, and adding a draw changes no other draw', () => {
    const before = compile('search synth\nseed 2\nnoise().write(o0)\nnoise(scaleY: rand(1, 10)).write(o1)')
    assert.equal(args(before, 1).scaleY, randFrom(drawU32(2, 'synth.noise@noise_2/scaleY'), 1, 10))
    const after = compile('search synth\nseed 2\nnoise(octaves: randInt(1, 4)).write(o0)\nnoise(scaleY: rand(1, 10)).write(o1)')
    assert.equal(args(after, 1).scaleY, args(before, 1).scaleY)
})

// The occurrence name the last noise() of a program draws its scaleY under.
const lastNoiseKey = (body) => {
    const c = compile(`search synth, mixer\nseed 1\n${body}\nnoise(scaleY: rand(1, 10)).write(o3)`)
    assert.deepEqual(errors(c), [], body)
    const drawn = args(c, c.plans.length - 1).scaleY
    for (let n = 1; n <= 6; n++) {
        if (drawn === randFrom(drawU32(1, `synth.noise@noise_${n}/scaleY`), 1, 10)) return `noise_${n}`
    }
    assert.fail(`no occurrence name gives ${drawn} for:\n${body}`)
}

test('an element held by a let is counted once, at the let, however the let holds it', () => {
    assert.equal(lastNoiseKey('noise().write(o0)'), 'noise_2')
    // One call, read by calling the let's name or as a value.
    assert.equal(lastNoiseKey('let y = noise()\ny().write(o0)\ny().write(o1)'), 'noise_2')
    assert.equal(lastNoiseKey('let y = noise()\nnoise().blendMode(tex: y).write(o0)'), 'noise_3')
    // A chain of calls.
    assert.equal(lastNoiseKey('let y = noise().blendMode()\nnoise().blendMode(tex: y).write(o0)'), 'noise_3')
    // A let built from another let, and from a name that aliases an effect.
    assert.equal(lastNoiseKey('let y = noise()\nlet z = y().blendMode()\nnoise().blendMode(tex: z).write(o0)'), 'noise_3')
    assert.equal(lastNoiseKey('let y = noise()\nlet z = y\nnoise().blendMode(tex: z).write(o0)'), 'noise_3')
    assert.equal(lastNoiseKey('let f = noise\nlet z = f().blendMode()\nnoise().blendMode(tex: z).write(o0)'), 'noise_3')
})

test('an effect passed as a value inside a let is counted once, at the let', () => {
    assert.equal(lastNoiseKey('noise().blendMode(tex: noise()).write(o0)'), 'noise_3')
    assert.equal(lastNoiseKey('let c = noise().blendMode(tex: noise())\nnoise().blendMode(tex: c).write(o0)\nnoise().blendMode(tex: c).write(o1)'), 'noise_5')
    assert.equal(lastNoiseKey('let c = blendMode(tex: noise())\nnoise().c().write(o0)\nnoise().c().write(o1)'), 'noise_4')
    // An effect written where the let is called is counted there.
    assert.equal(lastNoiseKey('let b = blendMode()\nnoise().b(tex: noise()).write(o0)'), 'noise_3')
})

test('an element from a let draws under the let\'s key, or its _id:', () => {
    const noiseSteps = c => c.plans.map(plan => plan.chain.find(step => step.op === 'synth.noise').args)
    const scaleY = key => randFrom(drawU32(1, key), 1, 10)
    // Two lets draw apart, under let:<name>/<element>.
    const two = compile('search synth\nseed 1\nlet a = noise()\nlet b = noise(octaves: 2)\na(scaleY: rand(1, 10)).write(o0)\nb(scaleY: rand(1, 10)).write(o1)')
    assert.deepEqual(errors(two), [])
    assert.deepEqual(noiseSteps(two).map(a => a.scaleY), [scaleY('let:a/synth.noise@noise_1/scaleY'), scaleY('let:b/synth.noise@noise_2/scaleY')])
    assert.notEqual(noiseSteps(two)[0].seed, noiseSteps(two)[1].seed)
    // A redeclared let has its own key.
    const again = compile('search synth\nseed 1\nlet a = noise()\na(scaleY: rand(1, 10)).write(o0)\nlet a = noise()\na(scaleY: rand(1, 10)).write(o1)')
    assert.deepEqual(noiseSteps(again).map(a => a.scaleY), [scaleY('let:a/synth.noise@noise_1/scaleY'), scaleY('let:a#2/synth.noise@noise_2/scaleY')])
    // An _id: where the let is called names the element.
    const ids = compile('search synth\nseed 1\nlet a = noise()\na(_id: "left", scaleY: rand(1, 10)).write(o0)\na(_id: "right", scaleY: rand(1, 10)).write(o1)')
    assert.deepEqual(noiseSteps(ids).map(a => a.scaleY), [scaleY('let:a/synth.noise@left/scaleY'), scaleY('let:a/synth.noise@right/scaleY')])
    assert.notEqual(noiseSteps(ids)[0].seed, noiseSteps(ids)[1].seed)
})

test('a name that aliases itself through a use argument does not stop the compiler', () => {
    const c = compile('search synth, mixer\npart p {\n    let x = noise\n    let w = x().blendMode()\n    w()\n}\nuse(p, x: x).write(o0)')
    assert.deepEqual(codes(c), ['S001', 'S005'])
})

// The scaleY and seed of every noise step, in plan order, through if branches.
const allSteps = plans => plans.flatMap(plan => [...(plan.chain || []), ...allSteps([...(plan.then || []), ...(plan.else || []), ...(plan.elif || []).flatMap(e => e.then || [])])])
const noiseDraws = src => {
    const c = compile(src)
    assert.deepEqual(errors(c), [], src)
    return allSteps(c.plans).filter(step => step.op === 'synth.noise').map(step => [step.args.scaleY, step.args.seed])
}

test('the uses of a let draw alike in any scope, and a _seed: part repeats its draws', () => {
    const scoped = noiseDraws('search synth\nseed 1\nlet a = noise()\na(scaleY: rand(1, 10)).write(o0)\nif (true) {\n    a(scaleY: rand(1, 10)).write(o1)\n}')
    assert.equal(scoped.length, 2)
    assert.deepEqual(scoped[1], scoped[0])
    const parts = noiseDraws('search synth\npart p {\n    let x = noise()\n    x(scaleY: rand(1, 10)).write(o0)\n}\nuse(p, _seed: 5)\nuse(p, _seed: 5)')
    assert.equal(parts.length, 2)
    assert.deepEqual(parts[1], parts[0])
})

test('a let of effects does not move the key of a random let of the same name', () => {
    const c = compile('search synth\nseed 1\nlet a = noise()\na().write(o0)\nlet a = rand(1, 10)\nnoise(scaleY: a).write(o1)')
    assert.deepEqual(errors(c), [])
    assert.equal(plain(args(c, 1).scaleY), randFrom(drawU32(1, 'let:a'), 1, 10))
})

test('a repeated _id: where a let is called falls back to the let\'s name, and use arguments draw under their lets', () => {
    const repeated = noiseDraws('search synth\nseed 1\nlet a = noise()\na(_id: "left", scaleY: rand(1, 10)).write(o0)\na(_id: "left", scaleY: rand(1, 10)).write(o1)\na(scaleY: rand(1, 10)).write(o2)')
    assert.notDeepEqual(repeated[1], repeated[0])
    assert.deepEqual(repeated[2], repeated[1])
    // An _id: equal to the let's own name for the element draws apart from it.
    const own = compile('search synth\nseed 1\nlet a = noise()\na(_id: "noise_1", scaleY: rand(1, 10)).write(o0)\na(scaleY: rand(1, 10)).write(o1)')
    assert.ok(codes(own).includes('S014'))
    assert.notEqual(args(own, 0).scaleY, args(own, 1).scaleY)
    // A part's let that holds effects in one use and a value in the next.
    const stale = noiseDraws('search synth\nseed 1\nlet y = noise()\npart p {\n    let x = y\n    x(scaleY: rand(1, 10)).write(o0)\n}\nuse(p, x: noise())\nlet y = 5\nuse(p, x: noise())')
    assert.equal(stale.length, 2)
    assert.notDeepEqual(stale[1], stale[0])
    const overrides = noiseDraws('search synth\nseed 1\npart p {\n    let x = noise()\n    let z = noise()\n    x(scaleY: rand(1, 10)).write(o0)\n    z(scaleY: rand(1, 10)).write(o1)\n}\nuse(p, x: noise(), z: noise())')
    assert.equal(overrides.length, 2)
    assert.notDeepEqual(overrides[1], overrides[0])
})

test('a let used in a part draws apart in each instance, and the names a let gives stay apart', () => {
    const instances = noiseDraws('search synth\nseed 1\nlet a = noise()\npart p {\n    a(scaleY: rand(1, 10)).write(o0)\n}\nuse(p)\nuse(p)')
    assert.equal(instances.length, 2)
    assert.notDeepEqual(instances[1], instances[0])
    // The last two noise steps are the two effect values that must draw apart.
    const distinctSeeds = draws => assert.notEqual(draws.at(-1)[1], draws.at(-2)[1], JSON.stringify(draws))
    // An _id: in the let equal to another element's occurrence name.
    distinctSeeds(noiseDraws('search synth, mixer\nseed 1\nlet y = noise().blendMode(_id: "blendMode_2", tex: noise()).blendMode(tex: noise())\nnoise().blendMode(tex: y).write(o0)'))
    // An _id: where the let is called equal to the _id: in the let.
    const same = noiseDraws('search synth\nseed 1\nlet a = noise(_id: "x")\na(scaleY: rand(1, 10)).write(o0)\na(_id: "x", scaleY: rand(1, 10)).write(o1)')
    assert.notDeepEqual(same[1], same[0])
    // A use argument with the same effect twice.
    distinctSeeds(noiseDraws('search synth, mixer\nseed 1\npart p {\n    let x = noise()\n    noise().blendMode(tex: x).write(o0)\n}\nuse(p, x: noise().blendMode(tex: noise()).blendMode(tex: noise()))'))
})

test('an outer let and a use argument stay apart from the part\'s own names', () => {
    const shadowed = noiseDraws('search synth\nseed 1\nlet a = noise()\npart p {\n    a(scaleY: rand(1, 10)).write(o0)\n    let a = noise()\n    a(scaleY: rand(1, 10)).write(o1)\n}\nuse(p)')
    assert.equal(shadowed.length, 2)
    assert.notDeepEqual(shadowed[1], shadowed[0])
    const callId = noiseDraws('search synth\nseed 1\npart p {\n    let x = sacredGeometry()\n    x(_id: "noise_1", scaleY: rand(1, 10)).write(o0)\n    x(scaleY: rand(1, 10)).write(o1)\n}\nuse(p, _id: "u", x: noise())')
    assert.equal(callId.length, 2)
    assert.notDeepEqual(callId[1], callId[0])
    const argIds = noiseDraws('search synth, mixer\nseed 2\npart p {\n    let x = noise()\n    noise().blendMode(tex: x).write(o0)\n}\nuse(p, _id: "u", x: noise().blendMode(_id: "blendMode_2", tex: noise(scaleY: rand(1, 10))).blendMode(tex: noise(scaleY: rand(1, 10))))')
    assert.notDeepEqual(argIds.at(-1), argIds.at(-2))
})

test('use arguments with ids or for a redeclared let, and values written where a let is called', () => {
    const ownId = compile('search synth\nseed 1\npart p {\n    let x = noise()\n    x(scaleY: rand(1, 10)).write(o0)\n    x(scaleY: rand(1, 10)).write(o1)\n}\nuse(p, _id: "u", x: noise(_id: "foo"))')
    // As for an _id: written in the let itself: S011, and no S014.
    assert.deepEqual(codes(ownId), ['S011'])
    const shared = allSteps(ownId.plans).filter(step => step.op === 'synth.noise').map(step => [step.args.scaleY, step.args.seed])
    assert.deepEqual(shared[1], shared[0])
    const redeclared = noiseDraws('search synth\nseed 1\npart p {\n    let x = noise()\n    x(scaleY: rand(1, 10)).write(o0)\n    let x = noise()\n    x(scaleY: rand(1, 10)).write(o1)\n}\nuse(p, x: noise())')
    assert.notDeepEqual(redeclared[1], redeclared[0])
    const branches = noiseDraws('search synth, mixer\nseed 1\nlet b = blendMode()\nif (true) {\n    noise().b(tex: noise(scaleY: rand(1, 10))).write(o0)\n} else {\n    noise().b(tex: noise(scaleY: rand(1, 10))).write(o1)\n}')
    assert.equal(branches.length, 4)
    assert.notDeepEqual(branches[3], branches[1])
    const twice = compile('search synth\nseed 1\npart p {\n    let x = noise()\n    x(_id: "noise_1", scaleY: rand(1, 10)).write(o0)\n}\nuse(p, _id: "u")\nuse(p, _id: "v")')
    assert.equal(codes(twice).filter(code => code === 'S014').length, 1)
})

test('a value written where a let is called, and an _id: on an outer let in a use argument, draw under their keys', () => {
    const inPart = compile('search synth, mixer\nseed 1\npart p {\n    let b = blendMode()\n    noise().b(tex: noise(scaleY: rand(1, 10))).write(o0)\n}\nuse(p)')
    assert.deepEqual(errors(inPart), [])
    const value = allSteps(inPart.plans).filter(step => step.op === 'synth.noise').at(-1)
    assert.equal(value.args.scaleY, randFrom(drawU32(1, 'use@use_1/let:b/mixer.blendMode@blendMode_1/tex/e:synth.noise/scaleY'), 1, 10))
    const outerId = compile('search synth\nseed 1\nlet a = noise()\npart p {\n    let x = noise()\n    x(scaleY: rand(1, 10)).write(o0)\n}\nuse(p, _id: "u", x: a(_id: "left"))')
    const step = allSteps(outerId.plans).find(s => s.op === 'synth.noise')
    assert.equal(step.args.scaleY, randFrom(drawU32(1, 'use@u/outer/let:a/synth.noise@left/scaleY'), 1, 10))
})

test('a call-level seed draws under the constant key', () => {
    const c = compile('search synth\nseed 1\nnoise(scaleY: rand(1, 10, seed: 3150442103)).write(o0)')
    assert.deepEqual(errors(c), [])
    assert.equal(args(c).scaleY, randFrom(drawU32(3150442103, PIN_KEY), 1, 10))
    assert.ok(codes(compile('search synth\nnoise(scaleY: rand(1, 10, seed: randInt(1, 2))).write(o0)')).includes('S013'))
})

test('if branches and conditions have their own keys', () => {
    const c = compile(`search synth
seed 4
if (chance(1)) {
    noise(scaleY: rand(1, 10)).write(o0)
}`)
    assert.deepEqual(errors(c), [])
    assert.equal(c.plans[0].then[0].chain[0].args.scaleY, randFrom(drawU32(4, 'if_1/b0/synth.noise@noise_1/scaleY'), 1, 10))
})

test('invalid random calls are errors with their location', () => {
    for (const src of [
        'search synth\nnoise(octaves: randInt(1.5, 3)).write(o0)',
        'search synth\nnoise(ridges: chance(2)).write(o0)',
        'search synth\nnoise(scaleY: rand(1)).write(o0)',
        'search synth\nnoise(scaleY: rand(1, 2, 3)).write(o0)',
        'search synth\nnoise(scaleY: rand(low: 1)).write(o0)',
        'search synth\nlet rand = 1\nnoise(scaleY: rand(1, 2)).write(o0)',
        'search synth, filter\nnoise().tint(color: randColor(s: 2)).write(o0)'
    ]) {
        const c = compile(src)
        assert.ok(codes(c).includes('S012'), `${src}\n${JSON.stringify(c.diagnostics)}`)
        assert.ok(c.diagnostics.find(d => d.code === 'S012').location, src)
    }
})

test('random calls are refused where they cannot draw', () => {
    for (const src of [
        'search synth\nread(pick(o0, o1)).write(o2)',
        'search synth\nnoise(scaleY: () => rand(1, 2)).write(o0)',
        'search synth\nnoise(_skip: chance(0.5)).write(o0)',
        'search synth\nlet n = noise(scaleY: rand(1, 2))\nn().write(o0)'
    ]) {
        assert.ok(codes(compile(src)).includes('S013'), src)
    }
})

test('random calls unparse as written, and the round trip is lossless', () => {
    for (const src of [
        'search synth\nseed 7\n\nlet size = randInt(2, 6) * 10\n\nnoise(scaleX: size, scaleY: rand(1, 10))\n  .write(o0)\n\nrender(o0)',
        'search synth\nseed 1\n\nnoise(scaleX: (rand(1, 2) + 3) * 2)\n  .write(o0)',
        'search synth\nseed 1\n\nnoise(scaleX: 10 - (rand(1, 2) - 3))\n  .write(o0)'
    ]) {
        const c = compile(src)
        assert.deepEqual(errors(c), [], src)
        const once = unparse(c)
        const again = compile(once)
        assert.deepEqual(again.plans, c.plans, src)
        assert.equal(unparse(again), once, src)
    }
})

test('an authored seed equal to the default is kept only with a seed directive', () => {
    assert.match(unparse(compile('search synth\nseed 3\nnoise(seed: 1).write(o0)')), /seed: 1/)
    assert.doesNotMatch(unparse(compile('search synth\nnoise(seed: 1).write(o0)')), /seed: 1/)
})

test('an override that changes a drawn value replaces its call', () => {
    const c = compile('search synth\nseed 7\nnoise(scaleY: rand(1, 10)).write(o0)')
    assert.match(unparse(c, { 0: { scaleY: args(c).scaleY } }), /scaleY: rand\(1, 10\)/)
    assert.match(unparse(c, { 0: { scaleY: 4 } }), /scaleY: 4/)
})

test('no effect definition declares the reserved parameter _seed', async () => {
    const root = new URL('../effects/', import.meta.url)
    for (const ns of readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory())) {
        for (const effect of readdirSync(new URL(`${ns.name}/`, root), { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('_'))) {
            const url = new URL(`${ns.name}/${effect.name}/definition.js`, root)
            const mod = await import(url)
            const instance = typeof mod.default === 'function' ? new mod.default() : mod.default
            assert.ok(!Object.hasOwn(instance?.globals || {}, '_seed'), `${ns.name}/${effect.name}`)
        }
    }
})
