import { lex } from '../src/lang/lexer.js'
import { parse } from '../src/lang/parser.js'
import { validate, registerStarterOps } from '../src/lang/validator.js'
import { registerOp } from '../src/lang/ops.js'

registerOp('synth.noise', {
    name: 'noise',
    args: [
        { name: 'scale', type: 'float', default: 10 },
        { name: 'seed', type: 'float', default: 1 }
    ]
})

registerOp('filter.kaleid', {
    name: 'kaleid',
    args: [
        { name: 'nSides', type: 'float', default: 4 }
    ]
})

registerOp('filter.bloom', {
    name: 'bloom',
    args: [
        { name: 'intensity', type: 'float', default: 0.5 }
    ]
})

registerStarterOps(['synth.noise'])

let failed = 0

function test(name, code, check) {
    try {
        console.log(`Running test: ${name}`)
        const tokens = lex(code)
        const ast = parse(tokens)
        const result = validate(ast)
        check(result)
        console.log(`PASS: ${name}`)
    } catch (e) {
        console.error(`FAIL: ${name}`)
        console.error(e)
        failed++
    }
}

process.on('exit', () => { if (failed > 0) process.exitCode = 1 })

test('Valid Chain', 'search synth, filter\nnoise(10).write(o0)', (result) => {
    if (result.diagnostics.length > 0) {
        throw new Error(`Expected no diagnostics, got ${JSON.stringify(result.diagnostics)}`)
    }
    if (result.plans.length !== 1) throw new Error('Expected 1 plan')
})

test('Unknown Function', 'search synth, filter\nunknown(10).write(o0)', (result) => {
    const diag = result.diagnostics.find(d => d.code === 'S001')
    if (!diag) throw new Error('Expected S001 (Unknown identifier)')
    // Verify the identifier name is included in the message
    if (!diag.identifier) throw new Error('Expected identifier field in diagnostic')
    if (diag.identifier !== 'unknown') throw new Error(`Expected identifier 'unknown', got '${diag.identifier}'`)
    if (!diag.message.includes('unknown')) throw new Error('Expected identifier name in message')
})

test('Missing Write', 'search synth, filter\nnoise(10)', (result) => {
    // S001 is the generic error for missing write(), S006 is more specific for starter chains
    // Without the effect registry loaded, we get S001
    const diag = result.diagnostics.find(d => d.code === 'S006' || d.code === 'S001')
    if (!diag) throw new Error('Expected S006 or S001 (Chain missing write)')
})

test('Argument Type Mismatch', 'search synth, filter\nnoise("string").write(o0)', (result) => {
    // Passing a string literal to a numeric param raises S001
    // ("String literal not allowed for numeric parameter '…'").
    const diag = result.diagnostics.find(d => d.code === 'S001')
    if (!diag) throw new Error('Expected S001 type-mismatch diagnostic, got: ' + JSON.stringify(result.diagnostics))
})

test('Illegal Chain Structure', 'search synth, filter\nbloom(0.5).write(o0)', (result) => {
    const diag = result.diagnostics.find(d => d.code === 'S005')
    if (!diag) throw new Error('Expected S005 (Illegal chain structure)')
})

// === Array literal — additive coercion for vec3/vec4 params ===

registerOp('synth.vecop', {
    name: 'vecop',
    args: [
        { name: 'pos3', type: 'vec3', default: [0, 0, 0] },
        { name: 'pos4', type: 'vec4', default: [0, 0, 0, 1] }
    ]
})
registerStarterOps(['synth.vecop'])

test('Array literal coerces to vec3 numeric array', 'search synth\nvecop(pos3: [0.1, 0.2, 0.3]).write(o0)', (result) => {
    if (result.diagnostics.length > 0) throw new Error('Unexpected diagnostics: ' + JSON.stringify(result.diagnostics))
    const args = result.plans[0].chain[0].args
    if (!(args.pos3?.[0] === 0.1 && args.pos3?.[1] === 0.2 && args.pos3?.[2] === 0.3)) {
        throw new Error('Wrong values: ' + JSON.stringify(args.pos3))
    }
})

test('Array literal coerces to vec4 numeric array', 'search synth\nvecop(pos4: [0.05, 0.5, 0.95, 1]).write(o0)', (result) => {
    if (result.diagnostics.length > 0) throw new Error('Diagnostics: ' + JSON.stringify(result.diagnostics))
    const args = result.plans[0].chain[0].args
    if (args.pos4.length !== 4 || args.pos4[0] !== 0.05 || args.pos4[3] !== 1) {
        throw new Error('Wrong: ' + JSON.stringify(args.pos4))
    }
})

test('Array literal — any length passes through unchanged', 'search synth\nvecop(pos3: [1, 2]).write(o0)', (result) => {
    // Length is NOT enforced. Whatever elements the source declared
    // get handed off to the runtime as-is.
    const args = result.plans[0].chain[0].args
    if (!Array.isArray(args.pos3)) throw new Error('Expected array, got: ' + JSON.stringify(args.pos3))
    if (args.pos3.length !== 2 || args.pos3[0] !== 1 || args.pos3[1] !== 2) {
        throw new Error('Expected [1, 2], got: ' + JSON.stringify(args.pos3))
    }
})

test('Existing vec3() Call still produces same value', 'search synth\nvecop(pos3: vec3(0.1, 0.2, 0.3)).write(o0)', (result) => {
    if (result.diagnostics.length > 0) throw new Error('Diagnostics: ' + JSON.stringify(result.diagnostics))
    const args = result.plans[0].chain[0].args
    if (args.pos3[0] !== 0.1 || args.pos3[1] !== 0.2 || args.pos3[2] !== 0.3) {
        throw new Error('Wrong: ' + JSON.stringify(args.pos3))
    }
})

test('Existing hex Color still produces same value for vec4', 'search synth\nvecop(pos4: #ff8800).write(o0)', (result) => {
    if (result.diagnostics.length > 0) throw new Error('Diagnostics: ' + JSON.stringify(result.diagnostics))
    const args = result.plans[0].chain[0].args
    if (args.pos4.length !== 4) throw new Error('Wrong arity: ' + JSON.stringify(args.pos4))
    // Hex #ff8800 → [1, 0x88/255, 0, 1.0]
    const expectR = 1
    const expectG = 0x88 / 255
    if (Math.abs(args.pos4[0] - expectR) > 1e-6 || Math.abs(args.pos4[1] - expectG) > 1e-6) {
        throw new Error('Hex color path changed: ' + JSON.stringify(args.pos4))
    }
})

// ---------------------------------------------------------------------------
// Mixed positional/keyword argument binding.
//
// Relaxing the "positional and keyword arguments are mutually exclusive" rule
// (needed so scene() can carry settings as keywords beside child nodes as
// positionals) left the binding loop indexing the dense positional list by
// parameter slot. Once a keyword fills a slot, every later positional shifts
// and falls off the end.
// ---------------------------------------------------------------------------

registerOp('filter.blur', {
    name: 'blur',
    args: [
        { name: 'amount', type: 'float', default: 0.1 },
        { name: 'angle', type: 'float', default: 0 },
        { name: 'quality', type: 'float', default: 1 }
    ]
})

registerOp('filter.tint', {
    name: 'tint',
    args: [
        { name: 'r', type: 'float', default: 1 },
        { name: 'g', type: 'float', default: 1 },
        { name: 'b', type: 'float', default: 1 },
        { name: 'alpha', type: 'float', default: 1 }
    ]
})

function argsOf(result, op) {
    const step = result.plans[0].chain.find(s => s.op === op)
    if (!step) throw new Error(`no '${op}' step in chain: ${result.plans[0].chain.map(s => s.op).join(', ')}`)
    return step.args
}

test('positional after keyword binds to the next unfilled slot',
    'search synth, filter\nnoise().blur(0.9, angle: 0.5, 4).write(o0)', (result) => {
        const a = argsOf(result, 'filter.blur')
        if (a.amount !== 0.9) throw new Error(`amount: expected 0.9, got ${a.amount}`)
        if (a.angle !== 0.5) throw new Error(`angle: expected 0.5, got ${a.angle}`)
        if (a.quality !== 4) throw new Error(`quality: expected 4, got ${a.quality} (positional was dropped)`)
    })

test('keyword first, then positionals fill remaining slots in order',
    'search synth, filter\nnoise().blur(angle: 0.5, 0.9, 4).write(o0)', (result) => {
        const a = argsOf(result, 'filter.blur')
        if (a.amount !== 0.9) throw new Error(`amount: expected 0.9, got ${a.amount}`)
        if (a.angle !== 0.5) throw new Error(`angle: expected 0.5, got ${a.angle}`)
        if (a.quality !== 4) throw new Error(`quality: expected 4, got ${a.quality}`)
    })

test('excess positional arguments are reported as a warning, and the call keeps its filled slots',
    'search synth, filter\nnoise().kaleid(4, 9, 9).write(o0)', (result) => {
        const diag = result.diagnostics.find(d => /too many|excess|positional/i.test(d.message || ''))
        if (!diag) {
            throw new Error(`Expected a diagnostic for excess positionals, got ${JSON.stringify(result.diagnostics)}`)
        }
        if (diag.code !== 'S009') throw new Error(`Expected S009, got ${diag.code}`)
        if (diag.severity !== 'warning') throw new Error(`Expected a warning, got ${diag.severity}`)
        if (diag.message !== "Too many positional arguments for kaleid(): 'kaleid' takes 1") {
            throw new Error(`Unexpected message: ${diag.message}`)
        }
        // A program that passes them compiled before the report existed, so
        // nothing here may be an error.
        const errors = result.diagnostics.filter(d => d.severity === 'error')
        if (errors.length) throw new Error(`Expected no error, got ${JSON.stringify(errors)}`)
        const a = argsOf(result, 'filter.kaleid')
        if (a.nSides !== 4) throw new Error(`nSides: expected 4, got ${a.nSides}`)
    })

test('hex color still splats across r/g/b when another keyword is present',
    'search synth, filter\nnoise().tint(#ff8000, alpha: 0.5).write(o0)', (result) => {
        const a = argsOf(result, 'filter.tint')
        if (Math.abs(a.r - 1) > 1e-6) throw new Error(`r: expected 1, got ${a.r}`)
        if (Math.abs(a.g - 0.502) > 0.01) throw new Error(`g: expected ~0.502, got ${a.g}`)
        if (Math.abs(a.b - 0) > 1e-6) throw new Error(`b: expected 0, got ${a.b}`)
        if (a.alpha !== 0.5) throw new Error(`alpha: expected 0.5, got ${a.alpha}`)
    })

// ---------------------------------------------------------------------------
// Scene names are only chain elements as `scene()` itself.
//
// camera/mesh/light/group/material/solid/surface/pbr/emit/environment are
// children *inside* a scene() call, preserved as AST and never reaching the
// chain loop. Letting them pass through at any chain position turned an
// "Unknown effect" typo into a silent no-op that renders nothing.
// ---------------------------------------------------------------------------

test('a scene child name used as a chain element is an unknown effect',
    'search synth, filter\nnoise().camera(fov: 60).write(o0)', (result) => {
        const diag = result.diagnostics.find(d => d.code === 'S001'
            && /camera/.test(d.message || '')
            && /only valid inside scene\(\)/.test(d.message || ''))
        if (!diag) throw new Error(`Expected S001 naming 'camera' and the scene() constraint, got ${JSON.stringify(result.diagnostics)}`)
    })

test('volume() used as a chain element is an unknown effect',
    'search synth, filter\nnoise().volume(vol0).write(o0)', (result) => {
        const diag = result.diagnostics.find(d => d.code === 'S001'
            && /volume/.test(d.message || '')
            && /only valid inside scene\(\)/.test(d.message || ''))
        if (!diag) throw new Error(`Expected S001 naming 'volume' and the scene() constraint, got ${JSON.stringify(result.diagnostics)}`)
    })

test('solid() with no synth in scope is still an unknown effect',
    'search filter\nsolid(r: 1).write(o0)', (result) => {
        const diag = result.diagnostics.find(d => d.code === 'S001'
            && /solid/.test(d.message || '')
            && /only valid inside scene\(\)/.test(d.message || ''))
        if (!diag) throw new Error(`Expected S001 naming 'solid' and the scene() constraint, got ${JSON.stringify(result.diagnostics)}`)
    })

// ---------------------------------------------------------------------------
// Diagnostics report a usable column.
//
// The parser writes `loc.col`; pushDiag read `loc.column`, so every location
// it built carried `column: undefined` and the demo UI printed "col undefined".
// ---------------------------------------------------------------------------

test('a diagnostic carries a numeric column',
    'search synth, filter\nnoise().bogusEffect(1).write(o0)', (result) => {
        const diag = result.diagnostics.find(d => d.code === 'S001')
        if (!diag) throw new Error(`Expected S001, got ${JSON.stringify(result.diagnostics)}`)
        if (!diag.location) throw new Error(`Expected a location on ${JSON.stringify(diag)}`)
        if (typeof diag.location.line !== 'number') throw new Error(`line: expected a number, got ${diag.location.line}`)
        if (typeof diag.location.column !== 'number') throw new Error(`column: expected a number, got ${diag.location.column}`)
    })

// ---------------------------------------------------------------------------
// A positional hex colour fills exactly the r/g/b slots no keyword claimed.
//
// The splat used to stand down entirely when g: or b: was present, dropping
// the Color into the float path: r clamped to 1, b left at its default, and a
// bogus S002 about 'r' on top. The colour the author typed simply vanished.
// ---------------------------------------------------------------------------

test('hex splat fills only the r/g/b slots no keyword claimed',
    'search synth, filter\nnoise().tint(#804020, g: 0.25).write(o0)', (result) => {
        const a = argsOf(result, 'filter.tint')
        if (Math.abs(a.r - 0.502) > 0.01) throw new Error(`r: expected ~0.502 from the hex, got ${a.r}`)
        if (a.g !== 0.25) throw new Error(`g: expected the keyword 0.25 to win, got ${a.g}`)
        if (Math.abs(a.b - 0.125) > 0.01) throw new Error(`b: expected ~0.125 from the hex, got ${a.b}`)
        if (result.diagnostics.length > 0) {
            throw new Error(`Expected no diagnostics, got ${JSON.stringify(result.diagnostics)}`)
        }
    })

test('a bare hex splat still fills all three slots',
    'search synth, filter\nnoise().tint(#804020).write(o0)', (result) => {
        const a = argsOf(result, 'filter.tint')
        if (Math.abs(a.r - 0.502) > 0.01) throw new Error(`r: expected ~0.502, got ${a.r}`)
        if (Math.abs(a.g - 0.251) > 0.01) throw new Error(`g: expected ~0.251, got ${a.g}`)
        if (Math.abs(a.b - 0.125) > 0.01) throw new Error(`b: expected ~0.125, got ${a.b}`)
        if (result.diagnostics.length > 0) {
            throw new Error(`Expected no diagnostics, got ${JSON.stringify(result.diagnostics)}`)
        }
    })

// ---------------------------------------------------------------------------
// scene() is a generator and must start its chain.
//
// Mid-chain it compiled clean and silently discarded the incoming surface, so
// `noise().scene(...).write(o0)` rendered the scene and threw the noise away
// with nothing said about it.
// ---------------------------------------------------------------------------

test('scene() mid-chain is diagnosed instead of eating its input',
    'search synth, filter\nnoise().scene(camera(fov: 60)).write(o0)', (result) => {
        const diag = result.diagnostics.find(d => d.code === 'S001' && /scene\(\)/.test(d.message || ''))
        if (!diag) throw new Error(`Expected S001 for a mid-chain scene(), got ${JSON.stringify(result.diagnostics)}`)
    })

test('a second scene() in the same chain is diagnosed',
    'search synth, filter\nscene(camera(fov: 60)).scene(camera(fov: 30)).write(o0)', (result) => {
        const diag = result.diagnostics.find(d => d.code === 'S001' && /scene\(\)/.test(d.message || ''))
        if (!diag) throw new Error(`Expected S001 for a second scene(), got ${JSON.stringify(result.diagnostics)}`)
    })

test('scene() itself still passes through to the scene compiler',
    'search synth, filter\nscene(camera(fov: 60)).write(o0)', (result) => {
        const step = result.plans[0].chain.find(s => s.op === '_scene.scene')
        if (!step) throw new Error(`Expected a _scene.scene step, got ${result.plans[0].chain.map(s => s.op).join(', ')}`)
        if (!step.args || !step.args._ast) throw new Error('Expected the original AST to be preserved on the step')
        if (result.diagnostics.length > 0) {
            throw new Error(`Expected a chain-initial scene() to be clean, got ${JSON.stringify(result.diagnostics)}`)
        }
    })

// ---------------------------------------------------------------------------
// `let` bindings inside an animation descriptor.
//
// substitute() rebuilds Oscillator nodes so a `let`-bound value reaches the
// descriptor's fields, but Midi and Audio nodes were returned untouched. The
// binding then never resolved: the 2D path's resolveMidiParam/resolveAudioParam
// see an Ident, return undefined, and fall back to the parameter's DEFAULT — so
// `let ch = 5; midi(channel: ch)` silently played channel 1. In a scene() the
// same node reaches the scene compiler and throws
// `midi() channel must be a number`.
// ---------------------------------------------------------------------------

registerOp('synth.descarg', {
    name: 'descarg',
    args: [{ name: 'scale', type: 'float', default: 1, min: 0, max: 100 }]
})
registerStarterOps(['synth.noise', 'synth.descarg'])

test('a let binding resolves inside midi()',
    'search synth\nlet ch = 5\ndescarg(scale: midi(channel: ch)).write(o0)', (result) => {
        const step = result.plans[0].chain.find(s => s.op === 'synth.descarg')
        const value = step.args.scale
        if (value?.type !== 'Midi') throw new Error(`Expected a Midi descriptor, got ${JSON.stringify(value)}`)
        if (value.channel !== 5) throw new Error(`Expected channel 5 from the let binding, got ${value.channel}`)
    })

test('a let binding resolves inside midi() mode',
    'search synth\nlet m = midiMode.gateNote\ndescarg(scale: midi(channel: 2, mode: m)).write(o0)', (result) => {
        const value = result.plans[0].chain.find(s => s.op === 'synth.descarg').args.scale
        if (value?.mode !== 1) throw new Error(`Expected midiMode.gateNote (1) from the let binding, got ${value?.mode}`)
    })

test('a let binding resolves inside audio()',
    'search synth\nlet lo = 0.25\ndescarg(scale: audio(band: audioBand.low, min: lo)).write(o0)', (result) => {
        const value = result.plans[0].chain.find(s => s.op === 'synth.descarg').args.scale
        if (value?.type !== 'Audio') throw new Error(`Expected an Audio descriptor, got ${JSON.stringify(value)}`)
        if (value.min !== 0.25) throw new Error(`Expected min 0.25 from the let binding, got ${value.min}`)
    })

// ---------------------------------------------------------------------------
// A positional hex colour splatting across an r/g/b triple.
//
// The splat was detected only when the 'r' slot was filled by that positional,
// so naming `r:` as a keyword stood the splat down: the Color fell through to
// the 'g' float slot, which defaulted g AND b and reported a bogus S002 about
// 'g'. The colour claims the whole triple; a keyword overrides its own member.
// ---------------------------------------------------------------------------

registerOp('synth.rgbprobe', {
    name: 'rgbprobe',
    args: [
        { name: 'r', type: 'float', default: 1, min: 0, max: 1 },
        { name: 'g', type: 'float', default: 1, min: 0, max: 1 },
        { name: 'b', type: 'float', default: 1, min: 0, max: 1 }
    ]
})

function rgbOf(result) {
    const step = result.plans[0].chain.find(s => s.op === 'synth.rgbprobe')
    return [step.args.r, step.args.g, step.args.b]
}
const HEX = [0x80 / 255, 0x40 / 255, 0x20 / 255]
const near = (a, b) => Math.abs(a - b) < 1e-9

test('a positional hex colour splats across r/g/b',
    'search synth\nnoise().rgbprobe(#804020).write(o0)', (result) => {
        const [r, g, b] = rgbOf(result)
        if (!near(r, HEX[0]) || !near(g, HEX[1]) || !near(b, HEX[2])) {
            throw new Error(`Expected the hex components, got ${JSON.stringify([r, g, b])}`)
        }
        if (result.diagnostics.length > 0) throw new Error(`Expected no diagnostics, got ${JSON.stringify(result.diagnostics)}`)
    })

test('a g: keyword overrides only its own member of a splatted hex colour',
    'search synth\nnoise().rgbprobe(#804020, g: 0.25).write(o0)', (result) => {
        const [r, g, b] = rgbOf(result)
        if (!near(r, HEX[0]) || g !== 0.25 || !near(b, HEX[2])) {
            throw new Error(`Expected r/b from the hex and g from the keyword, got ${JSON.stringify([r, g, b])}`)
        }
        if (result.diagnostics.length > 0) throw new Error(`Expected no diagnostics, got ${JSON.stringify(result.diagnostics)}`)
    })

test('an r: keyword overrides only its own member of a splatted hex colour',
    'search synth\nnoise().rgbprobe(#804020, r: 0.25).write(o0)', (result) => {
        const [r, g, b] = rgbOf(result)
        if (r !== 0.25 || !near(g, HEX[1]) || !near(b, HEX[2])) {
            throw new Error(`Expected g/b from the hex and r from the keyword, got ${JSON.stringify([r, g, b])}`)
        }
        if (result.diagnostics.length > 0) throw new Error(`Expected no diagnostics, got ${JSON.stringify(result.diagnostics)}`)
    })

// ---------------------------------------------------------------------------
// Names inside an array literal.
//
// Outside scene() the elements of an array literal stay as written, as in
// 1.x: a name is not a number there, so the element is reported and binds 0.
// Inside scene() a name resolves to the value it had where the literal was
// written.
// ---------------------------------------------------------------------------

registerOp('synth.vecprobe', {
    name: 'vecprobe',
    args: [
        { name: 'v', type: 'vec3', default: [1, 1, 1] }
    ]
})

function expectNoMarks(result) {
    if (JSON.stringify(result.plans).includes('_resolvedElements')) {
        throw new Error('Expected no compiled plan to carry the resolved elements of an array literal')
    }
}

function expectNameIsNotANumber(result, expected) {
    expectNoMarks(result)
    const value = result.plans[0].chain.find(s => s.op === 'synth.vecprobe').args.v
    if (JSON.stringify(value) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`)
    }
    const diags = result.diagnostics
    if (diags.length !== 1 || diags[0].code !== 'S002' || diags[0].severity !== 'warning' ||
        diags[0].message !== "Array element must be a number for 'v' in vecprobe()") {
        throw new Error(`Expected one S002 warning about the element, got ${JSON.stringify(diags)}`)
    }
}

test('a let name inside an array literal is not a number outside scene()',
    'search synth\nlet a = 0.5\nnoise().vecprobe(v: [a, 1, 0.25]).write(o0)', (result) => {
        expectNameIsNotANumber(result, [0, 1, 0.25])
    })

test('a let name inside a positional array literal is not a number outside scene()',
    'search synth\nlet a = 0.5\nnoise().vecprobe([a, 1, 0.25]).write(o0)', (result) => {
        expectNameIsNotANumber(result, [0, 1, 0.25])
    })

test('a let name inside a let-bound array literal is not a number outside scene()',
    'search synth\nlet a = 0.5\nlet v = [a, 1, 0.25]\nnoise().vecprobe(v: v).write(o0)', (result) => {
        expectNameIsNotANumber(result, [0, 1, 0.25])
    })

test('an array literal that names its own let compiles outside scene()',
    'search synth\nlet p = [p, 0, 5]\nnoise().vecprobe(v: p).write(o0)', (result) => {
        expectNameIsNotANumber(result, [0, 0, 5])
    })

function scenePosition(result) {
    if (result.diagnostics.length > 0) throw new Error(`Expected no diagnostics, got ${JSON.stringify(result.diagnostics)}`)
    const step = result.plans[0].chain.find(s => s.scene)
    if (JSON.stringify(step.args).includes('_resolvedElements')) {
        throw new Error('Expected the scene AST to carry only the elements it uses')
    }
    const camera = step.args._ast.args.find(a => a.name === 'camera')
    return camera.kwargs.pos.elements.map(el => el.type === 'Number' ? el.value : el.type)
}

function expectScenePosition(result, expected) {
    const position = scenePosition(result)
    if (JSON.stringify(position) !== JSON.stringify(expected)) {
        throw new Error(`Expected camera position ${JSON.stringify(expected)}, got ${JSON.stringify(position)}`)
    }
}

test('a let name inside an array literal resolves inside scene()',
    'search synth\nlet x = 0.5\nscene(camera(pos: [x, 0, 5]), mesh("sphere")).write(o0)', (result) => {
        expectScenePosition(result, [0.5, 0, 5])
    })

test('a let-bound array literal resolves its names inside scene()',
    'search synth\nlet x = 0.5\nlet p = [x, 0, 5]\nscene(camera(pos: p), mesh("sphere")).write(o0)', (result) => {
        expectScenePosition(result, [0.5, 0, 5])
    })

test('a let-bound scene node resolves the names in its array literals',
    'search synth\nlet x = 0.5\nlet cam = camera(pos: [x, 0, 5])\nscene(cam, mesh("sphere")).write(o0)', (result) => {
        expectScenePosition(result, [0.5, 0, 5])
    })

test('a let-bound scene node called with more arguments resolves the names in its array literals',
    'search synth\nlet x = 0.5\nlet cam = camera(pos: [x, 0, 5])\nscene(cam(fov: 40), mesh("sphere")).write(o0)', (result) => {
        expectScenePosition(result, [0.5, 0, 5])
    })

test('a let-bound scene() resolves the names in its array literals',
    'search synth\nlet x = 0.5\nlet s = scene(camera(pos: [x, 0, 5]), mesh("sphere"))\ns().write(o0)', (result) => {
        expectScenePosition(result, [0.5, 0, 5])
    })

test('a let-bound array literal in scene() takes the value a later let gives its name',
    'search synth\nlet p = [x, 0, 5]\nlet x = 0.5\nscene(camera(pos: p), mesh("sphere")).write(o0)', (result) => {
        expectScenePosition(result, [0.5, 0, 5])
    })

test('a let-bound scene node takes the value a later let gives a name in its array literal',
    'search synth\nlet cam = camera(pos: [x, 0, 5], fov: f)\nlet x = 0.5\nlet f = 33\nscene(cam, mesh("sphere")).write(o0)', (result) => {
        expectScenePosition(result, [0.5, 0, 5])
    })

test('an array literal in scene() reads the earlier let of the name it is bound to',
    'search synth\nlet s = 2\nlet s = [s, s, s]\nscene(camera(pos: s), mesh("sphere")).write(o0)', (result) => {
        expectScenePosition(result, [2, 2, 2])
    })

test('an array literal that names its own let compiles inside scene() and keeps the name',
    'search synth\nlet p = [p, 0, 5]\nscene(camera(pos: p), mesh("sphere")).write(o0)', (result) => {
        expectScenePosition(result, ['Ident', 0, 5])
    })

test('an object literal that names its own let compiles',
    'search synth\nlet m = { a: m }\nnoise().vecprobe(v: m).write(o0)', (result) => {
        if (result.plans.length !== 1) throw new Error('Expected the program to compile to one plan')
    })

registerOp('synth.vecsource', {
    name: 'vecsource',
    args: [
        { name: 'v', type: 'vec3', default: [1, 1, 1] }
    ]
})
registerStarterOps(['synth.vecsource'])

registerOp('filter.texprobe', {
    name: 'texprobe',
    args: [
        { name: 'tex', type: 'surface', default: 'none' }
    ]
})

test('the raw keywords of a let-bound call keep an array literal as written',
    'search synth, filter\nlet a = 0.5\nlet e = vecsource(v: [1, 8, a])\nnoise().texprobe(e).write(o0)', (result) => {
        expectNoMarks(result)
        const step = result.plans[0].chain.find(s => s.op === 'synth.vecsource')
        const written = step.rawKwargs.v.elements.map(el => el.type === 'Number' ? el.value : el.name)
        if (JSON.stringify(written) !== '[1,8,"a"]') {
            throw new Error(`Expected the elements as written, got ${JSON.stringify(step.rawKwargs.v)}`)
        }
        if (JSON.stringify(step.args.v) !== '[1,8,0]') throw new Error(`Expected [1,8,0], got ${JSON.stringify(step.args.v)}`)
    })

test('a returned array literal keeps only its elements as written',
    'search synth\nlet a = 0.5\nreturn [a, 2]', (result) => {
        expectNoMarks(result)
        const value = result.plans[0].value
        if (value.type !== 'ArrayLiteral' || value.elements[0].type !== 'Ident' || value.elements[1].value !== 2) {
            throw new Error(`Expected the literal as written, got ${JSON.stringify(value)}`)
        }
    })

// A program that does not name scene() leaves an array literal untouched, as
// 1.x does: its elements are not read until the literal is used.
registerOp('filter.vecfilter', {
    name: 'vecfilter',
    args: [
        { name: 'v', type: 'vec3', default: [1, 1, 1] }
    ]
})

test('an array literal that holds a chain is not read before it is used',
    'search synth, filter\nnoise().vecprobe(v: [read(o1).vecfilter(), 2, 3]).write(o0)', (result) => {
        expectNameIsNotANumber(result, [0, 2, 3])
    })

test('an unused let that holds an array literal with a chain reports nothing',
    'search synth, filter\nlet unused = [read(o1).vecfilter(), 2, 3]\nnoise().vecprobe(v: [1, 2, 3]).write(o0)', (result) => {
        if (result.diagnostics.length > 0) throw new Error(`Expected no diagnostics, got ${JSON.stringify(result.diagnostics)}`)
    })

{
    const lets = ['let a0 = [1, 2]']
    for (let i = 1; i <= 20; i++) lets.push(`let a${i} = [a${i - 1}, a${i - 1}]`)
    const started = Date.now()
    test('array literals nested through lets are not read where no scene() takes them',
        `search synth\n${lets.join('\n')}\nnoise().vecprobe(v: [1, 2, 3]).write(o0)`, (result) => {
            if (result.diagnostics.length > 0) throw new Error(`Expected no diagnostics, got ${JSON.stringify(result.diagnostics)}`)
            const elapsed = Date.now() - started
            if (elapsed > 2000) throw new Error(`Expected the lets to compile at once, took ${elapsed} ms`)
        })
}

registerOp('filter.markprobe', {
    name: 'markprobe',
    args: [
        { name: 'positionalsByIndex', type: 'float', default: 0 },
        { name: '_resolvedElements', type: 'float', default: 0 }
    ]
})

test('an effect parameter may have the name of one of the validator\'s own marks',
    'search synth, filter\nnoise().markprobe(0.7, 0.8).write(o0)', (result) => {
        const args = result.plans[0].chain.find(s => s.op === 'filter.markprobe').args
        if (args.positionalsByIndex !== 0.7 || args._resolvedElements !== 0.8) {
            throw new Error(`Expected both arguments in the plan, got ${JSON.stringify(args)}`)
        }
    })

test('an array literal in scene() keeps the value a name had where the literal was written',
    'search synth\nlet x = 0.25\nlet p = [x, 0, 5]\nlet x = 0.75\nscene(camera(pos: p), mesh("sphere")).write(o0)', (result) => {
        expectScenePosition(result, [0.25, 0, 5])
    })

// ---------------------------------------------------------------------------
// Positionals after a positional hex colour.
//
// A call with no keyword binds each positional to the slot at its own index,
// as in 1.x. A hex colour stands in the places of r, g and b, so the next
// slot takes the fourth positional and the two between bind to nothing. A
// call that also has keywords counts the colour as one positional.
// ---------------------------------------------------------------------------

registerOp('synth.rgbaprobe', {
    name: 'rgbaprobe',
    args: [
        { name: 'r', type: 'float', default: 1, min: 0, max: 1 },
        { name: 'g', type: 'float', default: 1, min: 0, max: 1 },
        { name: 'b', type: 'float', default: 1, min: 0, max: 1 },
        { name: 'a', type: 'float', default: 0.9, min: 0, max: 1 },
        { name: 'x', type: 'float', default: 0.8, min: 0, max: 1 }
    ]
})

function expectAfterColour(result, a, x) {
    const args = result.plans[0].chain.find(s => s.op === 'synth.rgbaprobe').args
    if (!near(args.r, HEX[0]) || !near(args.g, HEX[1]) || !near(args.b, HEX[2])) {
        throw new Error(`Expected r/g/b from the hex colour, got ${JSON.stringify(args)}`)
    }
    if (args.a !== a || args.x !== x) {
        throw new Error(`Expected a ${a} and x ${x}, got ${JSON.stringify(args)}`)
    }
    if (result.diagnostics.length > 0) throw new Error(`Expected no diagnostics, got ${JSON.stringify(result.diagnostics)}`)
}

test('the positional after a hex colour does not reach the slot after b',
    'search synth\nnoise().rgbaprobe(#804020, 0.5).write(o0)', (result) => {
        expectAfterColour(result, 0.9, 0.8)
    })

test('the fourth positional binds to the slot after the r/g/b of a hex colour',
    'search synth\nnoise().rgbaprobe(#804020, 0.5, 0.6, 0.7).write(o0)', (result) => {
        expectAfterColour(result, 0.7, 0.8)
    })

test('a let-bound hex colour stands in the places of r, g and b too',
    'search synth\nlet c = #804020\nnoise().rgbaprobe(c, 0.5, 0.6, 0.7, 0.3).write(o0)', (result) => {
        expectAfterColour(result, 0.7, 0.3)
    })

test('a hex colour is one positional in a call that also has keywords',
    'search synth\nnoise().rgbaprobe(#804020, 0.5, x: 0.3).write(o0)', (result) => {
        expectAfterColour(result, 0.5, 0.3)
    })

// ---------------------------------------------------------------------------
// A let-bound call with keywords, called with positionals.
//
// 1.x parses this, because the keywords and the positionals are written in
// two calls and meet only when the let is applied. There each positional
// belongs to the slot at its own index, and one whose slot a keyword holds
// binds to nothing. A call written in the mixed form binds its positionals in
// order to the slots no keyword holds.
// ---------------------------------------------------------------------------

registerOp('synth.slotprobe', {
    name: 'slotprobe',
    args: [
        { name: 'first', type: 'float', default: 10 },
        { name: 'second', type: 'float', default: 1 },
        { name: 'third', type: 'float', default: 4 }
    ]
})

function expectSlots(result, expected, diagnosticCodes = []) {
    const args = result.plans[0].chain.find(s => s.op === 'synth.slotprobe').args
    const slots = [args.first, args.second, args.third]
    if (JSON.stringify(slots) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(slots)}`)
    }
    const codes = result.diagnostics.map(d => d.code)
    if (JSON.stringify(codes) !== JSON.stringify(diagnosticCodes)) {
        throw new Error(`Expected diagnostics ${JSON.stringify(diagnosticCodes)}, got ${JSON.stringify(result.diagnostics)}`)
    }
}

test('a positional whose slot a let-bound keyword holds binds to nothing',
    'search synth\nlet n = slotprobe(first: 3)\nnoise().n(7).write(o0)', (result) => {
        expectSlots(result, [3, 1, 4])
    })

test('positionals applied to a let-bound call with a keyword bind by index',
    'search synth\nlet n = slotprobe(first: 3)\nnoise().n(7, 8).write(o0)', (result) => {
        expectSlots(result, [3, 8, 4])
    })

test('a let-bound keyword in a middle slot leaves the positionals at their own indexes',
    'search synth\nlet n = slotprobe(second: 3)\nnoise().n(7, 8, 9).write(o0)', (result) => {
        expectSlots(result, [7, 3, 9])
    })

test('a let-bound call applied through a second let still binds by index',
    'search synth\nlet n = slotprobe(first: 3)\nlet m = n(7)\nnoise().m(8, 9).write(o0)', (result) => {
        expectSlots(result, [3, 8, 9])
    })

// The merged call binds by index wherever its let is used afterwards: applied
// with no argument, held by another let, given as an argument, or merged into
// another let-bound call.
registerOp('synth.slotsource', {
    name: 'slotsource',
    args: [
        { name: 'first', type: 'float', default: 10 },
        { name: 'second', type: 'float', default: 1 },
        { name: 'third', type: 'float', default: 4 }
    ]
})
registerStarterOps(['synth.slotsource'])

registerOp('filter.surfprobe', {
    name: 'surfprobe',
    args: [
        { name: 'tex', type: 'surface', default: 'none' },
        { name: 'amount', type: 'float', default: 0.5 }
    ]
})

for (const [label, program] of [
    ['applied with no argument', 'let m = n(7, 8)\nm().write(o0)'],
    ['held by another let', 'let m = n(7, 8)\nlet k = m\nk().write(o0)'],
    ['given as a surface argument by name', 'let m = n(7, 8)\nnoise().surfprobe(tex: m).write(o0)'],
    ['given as a surface argument where it is written', 'noise().surfprobe(tex: n(7, 8)).write(o0)'],
    ['held inside another let-bound call', 'let b = surfprobe(tex: n(7, 8))\nnoise().b().write(o0)']
]) {
    test(`a let-bound call merged with positionals binds by index when it is ${label}`,
        `search synth, filter\nlet n = slotsource(first: 3)\n${program}`, (result) => {
            const args = result.plans[0].chain.find(s => s.op === 'synth.slotsource').args
            const slots = [args.first, args.second, args.third]
            if (JSON.stringify(slots) !== '[3,8,4]') throw new Error(`Expected [3,8,4], got ${JSON.stringify(slots)}`)
            if (result.diagnostics.length > 0) throw new Error(`Expected no diagnostics, got ${JSON.stringify(result.diagnostics)}`)
            if (JSON.stringify(result.plans).includes('positionalsByIndex')) {
                throw new Error('Expected no compiled plan to carry the mark of a merged call')
            }
        })
}

test('a scene node merged through a let carries no mark of the merge',
    'search synth\nlet m = mesh(pos: [1, 0, 0])\nscene(camera(), m("sphere")).write(o0)', (result) => {
        if (result.diagnostics.length > 0) throw new Error(`Expected no diagnostics, got ${JSON.stringify(result.diagnostics)}`)
        if (JSON.stringify(result.plans).includes('positionalsByIndex')) {
            throw new Error('Expected the scene AST to carry no mark of a merged call')
        }
    })

test('a let that has the name of the effect it holds is applied to itself when given by name',
    'search synth, filter\nlet noise = noise(3)\nnoise(7).surfprobe(tex: noise).write(o0)', (result) => {
        const steps = result.plans[0].chain.filter(s => s.op === 'synth.noise').map(s => [s.args.scale, s.args.seed])
        if (JSON.stringify(steps) !== '[[3,7],[3,3]]') {
            throw new Error(`Expected the 1.x binding [[3,7],[3,3]], got ${JSON.stringify(steps)}`)
        }
    })

test('positionals past the last slot of a let-bound call are reported',
    'search synth\nlet n = slotprobe(first: 3)\nnoise().n(7, 8, 9, 10).write(o0)', (result) => {
        expectSlots(result, [3, 8, 9], ['S009'])
    })

test('a hex colour applied to a let-bound call with a keyword is not spread over r/g/b',
    'search synth\nlet t = rgbaprobe(x: 0.3)\nnoise().t(#804020).write(o0)', (result) => {
        const args = result.plans[0].chain.find(s => s.op === 'synth.rgbaprobe').args
        if (args.r !== 1 || args.g !== 1 || args.b !== 1 || args.a !== 0.9 || args.x !== 0.3) {
            throw new Error(`Expected the defaults for r/g/b/a and x from the keyword, got ${JSON.stringify(args)}`)
        }
        const diags = result.diagnostics
        if (diags.length !== 1 || diags[0].code !== 'S002' || diags[0].message !== "Argument out of range for 'r' in rgbaprobe()") {
            throw new Error(`Expected one S002 warning about r, got ${JSON.stringify(diags)}`)
        }
    })

test('a call written in the mixed form binds its positionals to the unfilled slots',
    'search synth\nnoise().slotprobe(first: 3, 7, 8).write(o0)', (result) => {
        expectSlots(result, [3, 7, 8])
    })

test('a let that holds a call written in the mixed form keeps that binding',
    'search synth\nlet n = slotprobe(first: 3, 7)\nnoise().n(8).write(o0)', (result) => {
        expectSlots(result, [3, 7, 8])
    })
