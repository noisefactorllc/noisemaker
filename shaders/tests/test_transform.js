/**
 * Tests for the transform module (replaceEffect, listSteps, getCompatibleReplacements)
 */

import { lex } from '../src/lang/lexer.js'
import { parse } from '../src/lang/parser.js'
import { validate, registerStarterOps } from '../src/lang/validator.js'
import { registerOp } from '../src/lang/ops.js'
import { replaceEffect, listSteps, getCompatibleReplacements } from '../src/lang/transform.js'
import { unparse } from '../src/lang/unparser.js'

// Register test effects
registerOp('basics.noise', {
    name: 'noise',
    args: [
        { name: 'scale', type: 'float', default: 10 },
        { name: 'seed', type: 'float', default: 1 }
    ]
})

registerOp('basics.voronoi', {
    name: 'voronoi',
    args: [
        { name: 'scale', type: 'float', default: 10 },
        { name: 'jitter', type: 'float', default: 0.5 }
    ]
})

registerOp('basics.kaleid', {
    name: 'kaleid',
    args: [
        { name: 'nSides', type: 'float', default: 4 }
    ]
})

registerOp('basics.bloom', {
    name: 'bloom',
    args: [
        { name: 'intensity', type: 'float', default: 0.5 }
    ]
})

registerOp('basics.blur', {
    name: 'blur',
    args: [
        { name: 'radius', type: 'float', default: 5 }
    ]
})

registerOp('basics.gradient', {
    name: 'gradient',
    args: [
        { name: 'angle', type: 'float', default: 0 }
    ]
})

// Register effects in a different namespace for cross-namespace tests
registerOp('vol.fractal', {
    name: 'fractal',
    args: [
        { name: 'scale', type: 'float', default: 10 },
        { name: 'octaves', type: 'float', default: 4 }
    ]
})

registerOp('vol.distort', {
    name: 'distort',
    args: [
        { name: 'amount', type: 'float', default: 0.5 }
    ]
})

// Register starters
registerStarterOps(['basics.noise', 'basics.voronoi', 'basics.gradient', 'vol.fractal'])

function compile(code) {
    const tokens = lex(code)
    const ast = parse(tokens)
    return validate(ast)
}

function test(name, fn) {
    try {
        console.log(`Running test: ${name}`)
        fn()
        console.log(`PASS: ${name}`)
    } catch (e) {
        console.error(`FAIL: ${name}`)
        console.error(e.message || e)
        process.exitCode = 1
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    }
}

function assertTrue(value, message) {
    if (!value) {
        throw new Error(`${message}: expected truthy value`)
    }
}

function assertFalse(value, message) {
    if (value) {
        throw new Error(`${message}: expected falsy value`)
    }
}

// ============================================================================
// listSteps tests
// ============================================================================

test('listSteps - simple chain', () => {
    const compiled = compile('search basics\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)

    assertEqual(steps.length, 2, 'Should have 2 steps')

    // First step is noise (starter)
    assertEqual(steps[0].effectName, 'basics.noise', 'First step should be noise')
    assertTrue(steps[0].isStarterPosition, 'First step should be in starter position')
    assertTrue(steps[0].canReplaceWithStarter, 'First step can be replaced with starter')
    assertFalse(steps[0].canReplaceWithNonStarter, 'First step cannot be replaced with non-starter')

    // Second step is kaleid (non-starter)
    assertEqual(steps[1].effectName, 'basics.kaleid', 'Second step should be kaleid')
    assertFalse(steps[1].isStarterPosition, 'Second step should not be in starter position')
    assertFalse(steps[1].canReplaceWithStarter, 'Second step cannot be replaced with starter')
    assertTrue(steps[1].canReplaceWithNonStarter, 'Second step can be replaced with non-starter')
})

test('listSteps - multiple chains', () => {
    const compiled = compile(`search basics
noise(10).kaleid(6).write(o0)
voronoi(5).bloom(0.5).write(o1)
`)
    const steps = listSteps(compiled)

    assertEqual(steps.length, 4, 'Should have 4 steps total')

    // Verify plan indices
    assertEqual(steps[0].planIndex, 0, 'First step should be in plan 0')
    assertEqual(steps[1].planIndex, 0, 'Second step should be in plan 0')
    assertEqual(steps[2].planIndex, 1, 'Third step should be in plan 1')
    assertEqual(steps[3].planIndex, 1, 'Fourth step should be in plan 1')
})

// ============================================================================
// replaceEffect tests
// ============================================================================

test('replaceEffect - starter with starter (valid)', () => {
    const compiled = compile('search basics\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const noiseStepIndex = steps[0].stepIndex

    const result = replaceEffect(compiled, noiseStepIndex, 'voronoi', { scale: 20 })

    assertTrue(result.success, 'Replacement should succeed')
    assertEqual(result.program.plans[0].chain[0].op, 'basics.voronoi', 'Effect should be replaced')
    assertEqual(result.program.plans[0].chain[0].args.scale, 20, 'Args should be applied')
})

test('replaceEffect - non-starter with non-starter (valid)', () => {
    const compiled = compile('search basics\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const kaleidStepIndex = steps[1].stepIndex

    const result = replaceEffect(compiled, kaleidStepIndex, 'bloom', { intensity: 0.8 })

    assertTrue(result.success, 'Replacement should succeed')
    assertEqual(result.program.plans[0].chain[1].op, 'basics.bloom', 'Effect should be replaced')
    assertEqual(result.program.plans[0].chain[1].args.intensity, 0.8, 'Args should be applied')
})

test('replaceEffect - starter with non-starter (invalid)', () => {
    const compiled = compile('search basics\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const noiseStepIndex = steps[0].stepIndex

    const result = replaceEffect(compiled, noiseStepIndex, 'kaleid')

    assertFalse(result.success, 'Replacement should fail')
    assertTrue(result.error.includes('starter'), 'Error should mention starter')
    assertTrue(result.error.includes('non-starter'), 'Error should mention non-starter')
})

test('replaceEffect - non-starter with starter (invalid)', () => {
    const compiled = compile('search basics\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const kaleidStepIndex = steps[1].stepIndex

    const result = replaceEffect(compiled, kaleidStepIndex, 'noise')

    assertFalse(result.success, 'Replacement should fail')
    assertTrue(result.error.includes('starter'), 'Error should mention starter')
})

test('replaceEffect - nonexistent effect', () => {
    const compiled = compile('search basics\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)

    const result = replaceEffect(compiled, steps[0].stepIndex, 'nonexistent_effect')

    assertFalse(result.success, 'Replacement should fail')
    assertTrue(result.error.includes('not found'), 'Error should mention not found')
})

test('replaceEffect - invalid step index', () => {
    const compiled = compile('search basics\nnoise(10).write(o0)')

    const result = replaceEffect(compiled, 999, 'voronoi')

    assertFalse(result.success, 'Replacement should fail')
    assertTrue(result.error.includes('not found'), 'Error should mention not found')
})

test('replaceEffect - immutability', () => {
    const compiled = compile('search basics\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const originalOp = compiled.plans[0].chain[0].op

    const result = replaceEffect(compiled, steps[0].stepIndex, 'voronoi')

    assertTrue(result.success, 'Replacement should succeed')
    assertEqual(compiled.plans[0].chain[0].op, originalOp, 'Original should not be modified')
    assertEqual(result.program.plans[0].chain[0].op, 'basics.voronoi', 'New program should have replacement')
})

test('replaceEffect - default args applied', () => {
    const compiled = compile('search basics\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)

    const result = replaceEffect(compiled, steps[0].stepIndex, 'voronoi')

    assertTrue(result.success, 'Replacement should succeed')
    // voronoi has defaults: scale=10, jitter=0.5
    assertEqual(result.program.plans[0].chain[0].args.scale, 10, 'Default scale should be applied')
    assertEqual(result.program.plans[0].chain[0].args.jitter, 0.5, 'Default jitter should be applied')
})

// ============================================================================
// getCompatibleReplacements tests
// ============================================================================

test('getCompatibleReplacements - starter position', () => {
    const compiled = compile('search basics\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const noiseStepIndex = steps[0].stepIndex

    const result = getCompatibleReplacements(compiled, noiseStepIndex)

    assertTrue(result.success, 'Should succeed')
    assertTrue(result.compatible.includes('basics.noise'), 'Should include noise as compatible')
    assertTrue(result.compatible.includes('basics.voronoi'), 'Should include voronoi as compatible')
    assertTrue(result.incompatible.includes('basics.kaleid'), 'Should include kaleid as incompatible')
})

test('getCompatibleReplacements - non-starter position', () => {
    const compiled = compile('search basics\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const kaleidStepIndex = steps[1].stepIndex

    const result = getCompatibleReplacements(compiled, kaleidStepIndex)

    assertTrue(result.success, 'Should succeed')
    assertTrue(result.compatible.includes('basics.kaleid'), 'Should include kaleid as compatible')
    assertTrue(result.compatible.includes('basics.bloom'), 'Should include bloom as compatible')
    assertTrue(result.incompatible.includes('basics.noise'), 'Should include noise as incompatible')
})

test('getCompatibleReplacements - invalid step index', () => {
    const compiled = compile('search basics\nnoise(10).write(o0)')

    const result = getCompatibleReplacements(compiled, 999)

    assertFalse(result.success, 'Should fail')
    assertTrue(result.error.includes('not found'), 'Error should mention not found')
})

// ============================================================================
// Cross-namespace replacement tests
// ============================================================================

test('replaceEffect - cross-namespace starter replacement', () => {
    const compiled = compile('search basics\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const noiseStepIndex = steps[0].stepIndex

    // Replace basics.noise with vol.fractal (different namespace)
    const result = replaceEffect(compiled, noiseStepIndex, 'vol.fractal', { scale: 20 })

    assertTrue(result.success, 'Cross-namespace replacement should succeed')
    assertEqual(result.program.plans[0].chain[0].op, 'vol.fractal', 'Effect should be replaced')
    assertTrue(result.program.searchNamespaces.includes('vol'), 'New namespace should be added to searchNamespaces')
})

test('replaceEffect - cross-namespace filter replacement', () => {
    const compiled = compile('search basics\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const kaleidStepIndex = steps[1].stepIndex

    // Replace basics.kaleid with vol.distort (different namespace)
    const result = replaceEffect(compiled, kaleidStepIndex, 'vol.distort', { amount: 0.8 })

    assertTrue(result.success, 'Cross-namespace replacement should succeed')
    assertEqual(result.program.plans[0].chain[1].op, 'vol.distort', 'Effect should be replaced')
    assertTrue(result.program.searchNamespaces.includes('vol'), 'New namespace should be added to searchNamespaces')
})

test('replaceEffect - cross-namespace unparse produces valid DSL', () => {
    const compiled = compile('search basics\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const noiseStepIndex = steps[0].stepIndex

    // Replace with effect from different namespace
    const result = replaceEffect(compiled, noiseStepIndex, 'vol.fractal')

    assertTrue(result.success, 'Replacement should succeed')

    // Unparse and verify no namespace prefix in call (it should be stripped)
    const dsl = unparse(result.program)

    // The search directive should include both namespaces
    assertTrue(dsl.includes('search basics, vol') || dsl.includes('search basics,vol'),
        'Search directive should include both namespaces')

    // The effect call should NOT have namespace prefix (it gets stripped by unparser)
    assertFalse(dsl.includes('vol.fractal('), 'Effect call should not have namespace prefix')
    assertTrue(dsl.includes('fractal('), 'Effect call should use bare name')
})

test('replaceEffect - same namespace does not duplicate searchNamespaces', () => {
    const compiled = compile('search basics\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const noiseStepIndex = steps[0].stepIndex

    // Replace with effect from same namespace
    const result = replaceEffect(compiled, noiseStepIndex, 'basics.voronoi')

    assertTrue(result.success, 'Replacement should succeed')
    assertEqual(result.program.searchNamespaces.length, 1, 'Should not duplicate namespace')
    assertEqual(result.program.searchNamespaces[0], 'basics', 'Should keep original namespace')
})

console.log('\nAll transform tests completed!')
