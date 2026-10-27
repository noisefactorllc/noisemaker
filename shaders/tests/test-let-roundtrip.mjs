/**
 * Tests for let statement round-trip through compile/unparse
 * Run with: node shaders/tests/test-let-roundtrip.mjs
 */

import { compile, unparse, formatValue } from '../src/lang/index.js';
import { registerOp } from '../src/lang/ops.js';
import { registerStarterOps } from '../src/lang/validator.js';
import { CanvasRenderer } from '../src/renderer/canvas.js';
import { mergeIntoEnums } from '../src/lang/enums.js';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Register a minimal synth.noise op so the validator can resolve it
registerOp('synth.noise', {
    name: 'noise',
    args: [
        { name: 'scale', type: 'float', default: 75 },
        { name: 'rotation', type: 'float', default: 0 },
        { name: 'seed', type: 'int', default: 1 },
    ]
});
registerStarterOps(['synth.noise', 'noise']);

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (err) {
        console.error(`✗ ${name}`);
        console.error(`  ${err.message}`);
        failed++;
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`);
    }
}

function assertIncludes(str, substr, message) {
    if (!str.includes(substr)) {
        throw new Error(`${message}\n  String does not include: ${JSON.stringify(substr)}\n  Actual: ${JSON.stringify(str)}`);
    }
}

// Test 1: Automation variable round-trip
test('let with osc() round-trips through compile/unparse', () => {
    const src = `search synth

let wobble = osc(type: oscKind.sine, min: 0, max: 360)

noise(rotation: wobble)
  .write(o0)

render(o0)`;
    const compiled = compile(src);
    const result = unparse(compiled);
    assertIncludes(result, 'let wobble = osc(', 'Should include let declaration');
    assertIncludes(result, 'rotation: wobble', 'Should reference variable, not inline');
});

// Test 2: Numeric variable round-trip
test('let with numeric value round-trips', () => {
    const src = `search synth

let amount = 0.5

noise(scale: amount)
  .write(o0)

render(o0)`;
    const compiled = compile(src);
    const result = unparse(compiled);
    assertIncludes(result, 'let amount = 0.5', 'Should include let declaration');
    assertIncludes(result, 'scale: amount', 'Should reference variable');
});

// Test 3: Multiple let statements
test('multiple let statements round-trip', () => {
    const src = `search synth

let wobble = osc(type: oscKind.sine)
let amt = 0.5

noise(rotation: wobble, scale: amt)
  .write(o0)

render(o0)`;
    const compiled = compile(src);
    const result = unparse(compiled);
    assertIncludes(result, 'let wobble = osc(', 'Should include first let');
    assertIncludes(result, 'let amt = 0.5', 'Should include second let');
    assertIncludes(result, 'rotation: wobble', 'Should reference wobble');
    assertIncludes(result, 'scale: amt', 'Should reference amt');
});

// Test 4: Let with effect call (non-automation)
test('let with effect call round-trips', () => {
    const src = `search synth

let myScale = 3

noise(scale: myScale)
  .write(o0)

render(o0)`;
    const compiled = compile(src);
    const result = unparse(compiled);
    assertIncludes(result, 'let myScale = 3', 'Should include let declaration');
    assertIncludes(result, 'scale: myScale', 'Should reference variable');
});

// Test 5: Let with enum value
test('let with enum member round-trips', () => {
    const src = `search synth

let waveType = oscKind.sine
let wobble = osc(type: waveType)

noise(rotation: wobble)
  .write(o0)

render(o0)`;
    const compiled = compile(src);
    const result = unparse(compiled);
    assertIncludes(result, 'let waveType =', 'Should include enum let');
    assertIncludes(result, 'let wobble = osc(', 'Should include osc let');
    assertIncludes(result, 'type: waveType', 'Should use variable reference in osc type, not oscKind.waveType');
});

// Test 6: Let with midi
test('let with midi() round-trips', () => {
    const src = `search synth

let knob = midi(channel: 1)

noise(scale: knob)
  .write(o0)

render(o0)`;
    const compiled = compile(src);
    const result = unparse(compiled);
    assertIncludes(result, 'let knob = midi(', 'Should include midi let');
    assertIncludes(result, 'scale: knob', 'Should reference variable');
});

test('let with escaped MIDI device identity round-trips stably', () => {
    const name = 'Launch "Control" \\ XL';
    const id = 'port\\two';
    const src = `search synth

let knob = midi(name: ${JSON.stringify(name)}, id: ${JSON.stringify(id)}, channel: 1)

noise(scale: knob)
  .write(o0)

render(o0)`;
    const once = unparse(compile(src));
    const twice = unparse(compile(once));
    assertEqual(twice, once, 'MIDI identity must not grow escapes across round-trips');
    assertIncludes(once, `name: ${JSON.stringify(name)}`, 'Should preserve readable MIDI name');
    assertIncludes(once, `id: ${JSON.stringify(id)}`, 'Should preserve exact MIDI id');
});

test('let with numeric MIDI mode round-trips without changing mode', () => {
    for (let mode = 0; mode <= 4; mode++) {
        const src = `search synth

let knob = midi(channel: 1, mode: ${mode})

noise(scale: knob)
  .write(o0)

render(o0)`;
        const once = unparse(compile(src));
        const twice = unparse(compile(once));
        assertEqual(twice, once, `Numeric MIDI mode ${mode} should be stable`);
        if (mode !== 4) {
            assertIncludes(once, `mode: ${mode}`, `Numeric MIDI mode ${mode} should be preserved`);
        }
    }
});

test('single-quoted MIDI identity with quotes and slashes round-trips to valid DSL', () => {
    const name = 'Keys "Left" Controller\'s \\ Main';
    const id = 'port\\one';
    const src = String.raw`search synth

let knob = midi(name: 'Keys "Left" Controller\'s \\ Main', id: 'port\\one', channel: 1)

noise(scale: knob)
  .write(o0)

render(o0)`;
    const once = unparse(compile(src));
    const twice = unparse(compile(once));
    assertEqual(twice, once, 'Single-quoted MIDI identity should emit stable valid DSL');
    assertIncludes(once, `name: ${JSON.stringify(name)}`, 'Should preserve quotes, apostrophe, and slash');
    assertIncludes(once, `id: ${JSON.stringify(id)}`, 'Should preserve escaped id slash');
});

// Test 7: Let with audio
test('let with audio() round-trips', () => {
    const src = `search synth

let bass = audio(band: audioBand.low)

noise(scale: bass)
  .write(o0)

render(o0)`;
    const compiled = compile(src);
    const result = unparse(compiled);
    assertIncludes(result, 'let bass = audio(', 'Should include audio let');
    assertIncludes(result, 'scale: bass', 'Should reference variable');
});

test('let with selected raw audio device and channel round-trips stably', () => {
    const name = 'Expert "Sleepers" \\ ES-9';
    const id = 'audio\\port';
    const src = `search synth

let cv = audio(band: audioBand.raw, channel: 4, name: ${JSON.stringify(name)}, id: ${JSON.stringify(id)})

noise(scale: cv)
  .write(o0)

render(o0)`;
    const once = unparse(compile(src));
    const twice = unparse(compile(once));
    assertEqual(twice, once, 'Selected raw audio identity must stay stable');
    assertIncludes(once, 'band: audioBand.raw', 'Should preserve raw mode');
    assertIncludes(once, 'channel: 4', 'Should preserve one-based channel');
    assertIncludes(once, `name: ${JSON.stringify(name)}`, 'Should preserve readable audio device name');
    assertIncludes(once, `id: ${JSON.stringify(id)}`, 'Should preserve exact audio device id');
});

// Test 8: Double round-trip stability
test('double round-trip produces identical output', () => {
    const src = `search synth

let wobble = osc(type: oscKind.sine, min: 0, max: 360)
let amt = 0.5

noise(rotation: wobble, scale: amt)
  .write(o0)

render(o0)`;
    const compiled1 = compile(src);
    const unparsed1 = unparse(compiled1);
    const compiled2 = compile(unparsed1);
    const unparsed2 = unparse(compiled2);
    assertEqual(unparsed1, unparsed2, 'Double round-trip should be stable');
});

// String(1e-7) is "1e-7" and String(1e23) is "1e+23". The lexer reads
// neither as one number, so unparse must write every number in plain digits.
function assertNoErrors(compiled, message) {
    const errors = compiled.diagnostics.filter(d => d.severity === 'error').map(d => d.code);
    assertEqual(errors.join(','), '', message);
}

function assertSameNumber(actual, expected, message) {
    if (!Object.is(actual, expected)) {
        throw new Error(`${message}\n  Expected: ${String(expected)}\n  Actual:   ${String(actual)}`);
    }
}

function assertNumbersSurvive(body, read) {
    const src = `search synth\n\n${body}\n  .write(o0)\n\nrender(o0)`;
    const first = compile(src);
    assertNoErrors(first, `${body} must compile`);
    const output = unparse(first);
    const second = compile(output);
    assertNoErrors(second, `unparse output must compile:\n${output}`);
    const expected = read(first);
    const actual = read(second);
    for (const [field, value] of Object.entries(expected)) {
        if (value === undefined) throw new Error(`${field} of ${body} must compile to a value`);
        assertSameNumber(actual[field], value, `${field} changed after unparse:\n${output}`);
    }
    return expected;
}

test('let, osc(), midi() and audio() numbers survive compile → unparse → compile', () => {
    for (const text of ['0.0000001', '100000000000000000000000', '0.5']) {
        const values = assertNumbersSurvive(`let t = ${text}\nnoise(scale: t)`, c => ({
            let: c.vars[0].expr.value, scale: c.plans[0].chain[0].args.scale.value
        }));
        assertSameNumber(values.let, Number(text), `let t = ${text}`);
        assertSameNumber(values.scale, Number(text), `noise(scale: t) with t = ${text}`);
        assertNumbersSurvive(
            `noise(scale: osc(type: oscKind.noise1d, min: ${text}, max: ${text}, speed: ${text}, offset: ${text}, seed: ${text}))`,
            c => {
                const { min, max, speed, offset, seed } = c.plans[0].chain[0].args.scale;
                return { min, max, speed, offset, seed };
            });
        assertNumbersSurvive(
            `noise(scale: midi(channel: 1, min: ${text}, max: ${text}, sensitivity: ${text}))`,
            c => {
                const { min, max, sensitivity } = c.plans[0].chain[0].args.scale;
                return { min, max, sensitivity };
            });
        assertNumbersSurvive(
            `noise(scale: audio(band: audioBand.low, min: ${text}, max: ${text}))`,
            c => {
                const { min, max } = c.plans[0].chain[0].args.scale;
                return { min, max };
            });
    }
});

test('Automation descriptors without source text write numbers that compile', () => {
    for (const [value, expected] of [
        [{ type: 'Oscillator', oscType: 5, min: 1e-7, max: 0.5, speed: 1e23, offset: 1e-7, seed: 1e23 },
            ['min', 'max', 'speed', 'offset', 'seed']],
        [{ type: 'Midi', channel: 1, mode: 4, min: 1e-7, max: 0.5, sensitivity: 1e23 }, ['min', 'max', 'sensitivity']],
        [{ type: 'Audio', band: 0, min: 1e-7, max: 0.5 }, ['min', 'max']]
    ]) {
        const text = formatValue(value);
        const compiled = compile(`search synth\nnoise(scale: ${text}).write(o0)\nrender(o0)`);
        assertNoErrors(compiled, `${text} must compile`);
        for (const field of expected) {
            assertSameNumber(compiled.plans[0].chain[0].args.scale[field], value[field], `${field} of ${text}`);
        }
    }
});

test('let and literal values that are not finite unparse to DSL that compiles to the same value', () => {
    for (const expr of ['1 / 0', '-1 / 0', '0 / 0']) {
        assertNumbersSurvive(`let z = ${expr}\nnoise(scale: z)`, c => ({
            let: c.vars[0].expr.value, scale: c.plans[0].chain[0].args.scale.value
        }));
        assertNumbersSurvive(`noise(scale: ${expr})`, c => ({ scale: c.plans[0].chain[0].args.scale }));
    }
});

// Statement order. A chain sees only the lets written before it, and the
// latest assignment of a name wins. Lets may refer to later lets. The
// effects below are registered as CanvasRenderer.loadEffect() does.
const effectsDir = fileURLToPath(new URL('../effects/', import.meta.url));
const renderer = new CanvasRenderer();
for (const namespace of readdirSync(effectsDir)) {
    if (!statSync(path.join(effectsDir, namespace)).isDirectory()) continue;
    for (const name of readdirSync(path.join(effectsDir, namespace))) {
        const file = path.join(effectsDir, namespace, name, 'definition.js');
        if (!existsSync(file)) continue;
        const definition = (await import(pathToFileURL(file).href)).default;
        const effect = { namespace, name, instance: typeof definition === 'function' ? new definition() : definition };
        const choices = renderer.registerEffectWithRuntime(effect);
        if (choices && Object.keys(choices).length > 0) await mergeIntoEnums(choices);
        renderer.registerStarterOpForEffect(effect);
    }
}
const scaleXPerChain = compiled => compiled.plans.map(plan => {
    const value = plan.chain[0].args.scaleX;
    return typeof value === 'object' ? value.value : value;
});
const valuesPerChain = compiled => JSON.stringify(compiled.plans.map(plan => plan.chain?.map(step => [step.op, step.args])),
    (key, value) => typeof value === 'function' ? '<fn>' : value);

test('A chain that reads a variable before its let gets S003 with a location', () => {
    const compiled = compile('search synth\nnoise(scaleX: x).write(o0)\nlet x = 20\nrender(o0)');
    assertEqual(JSON.stringify(compiled.diagnostics.map(({ code, severity, message, location }) => ({ code, severity, message, location }))),
        JSON.stringify([{ code: 'S003', severity: 'error', message: "Variable used before assignment: 'x'", location: { line: 2, column: 15 } }]),
        'One S003 at the identifier');
});

test('Each chain uses the latest let before it', () => {
    const src = 'search synth\nlet x = 10\nnoise(scaleX: x).write(o0)\nlet x = 90\nnoise(scaleX: x).write(o1)\nrender(o1)';
    const compiled = compile(src);
    assertEqual(compiled.diagnostics.length, 0, 'No diagnostics');
    assertEqual(JSON.stringify(scaleXPerChain(compiled)), '[10,90]', 'scaleX per chain');
    const output = unparse(compiled);
    assertEqual(output, 'search synth\n\nlet x = 10\n\nnoise(scaleX: x)\n  .write(o0)\n\nlet x = 90\n\nnoise(scaleX: x)\n  .write(o1)\n\nrender(o1)',
        'unparse keeps statement order');
    const again = compile(output);
    assertEqual(again.diagnostics.length, 0, 'The unparse output compiles with no diagnostics');
    assertEqual(valuesPerChain(again), valuesPerChain(compiled), 'The unparse output gives the same values per chain');
});

test('unparse keeps statement order after a host removes a plan', () => {
    const compiled = compile('search synth\nnoise(scaleX: 5).write(o0)\nnoise(scaleX: 6).write(o1)\nlet y = 7\nnoise(scaleX: y).write(o2)\nrender(o2)');
    compiled.plans.splice(1, 1);
    const output = unparse(compiled);
    assertIncludes(output, 'let y = 7\n\nnoise(scaleX: y)', 'The let stays before the chain that follows it');
    assertEqual(compile(output).diagnostics.length, 0, 'The output compiles with no diagnostics');
});

test('Lets that refer to later lets compile in seven shipped example programs', () => {
    const programs = JSON.parse(readFileSync(new URL('./fixtures/let-order-programs.json', import.meta.url), 'utf8'));
    assertEqual(programs.length, 7, 'Seven programs');
    let forwardReads = 0;
    for (const { id, dsl } of programs) {
        const compiled = compile(dsl);
        assertEqual(JSON.stringify(compiled.diagnostics), '[]', `${id} compiles with no diagnostics`);
        // An osc() let reads an audio() let that comes after it as its speed.
        // Each chain that uses that oscillator gets the audio descriptor.
        const visit = value => {
            if (!value || typeof value !== 'object') return;
            if (value.type === 'Oscillator' && value._ast?.speed?._varRef) {
                forwardReads++;
                assertEqual(value.speed?.type, 'Audio', `${id} ${value._varRef} speed reads ${value._ast.speed._varRef}`);
            }
            for (const [key, child] of Object.entries(value)) if (key !== '_ast') visit(child);
        };
        visit(compiled.plans);
        const output = unparse(compiled);
        assertEqual(unparse(compile(output)), output, `${id} unparse is stable`);
        assertEqual(valuesPerChain(compile(output)), valuesPerChain(compiled), `${id} unparse gives the same values per chain`);
    }
    if (forwardReads === 0) throw new Error('No chain reads an oscillator whose speed comes from a later let');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
