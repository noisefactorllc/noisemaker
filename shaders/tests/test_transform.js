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
registerOp('synth.noise', {
    name: 'noise',
    args: [
        { name: 'scale', type: 'float', default: 10 },
        { name: 'seed', type: 'float', default: 1 }
    ]
})

registerOp('synth.voronoi', {
    name: 'voronoi',
    args: [
        { name: 'scale', type: 'float', default: 10 },
        { name: 'jitter', type: 'float', default: 0.5 }
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

registerOp('filter.blur', {
    name: 'blur',
    args: [
        { name: 'radius', type: 'float', default: 5 }
    ]
})

registerOp('synth.gradient', {
    name: 'gradient',
    args: [
        { name: 'angle', type: 'float', default: 0 }
    ]
})

// Register effects in a different namespace for cross-namespace tests
registerOp('synth3d.fractal', {
    name: 'fractal',
    args: [
        { name: 'scale', type: 'float', default: 10 },
        { name: 'octaves', type: 'float', default: 4 }
    ]
})

registerOp('synth3d.distort', {
    name: 'distort',
    args: [
        { name: 'amount', type: 'float', default: 0.5 }
    ]
})

// Register a starter with surface-type params (like heightmap3d)
registerOp('synth3d.heightmap', {
    name: 'heightmap',
    args: [
        { name: 'heightTex', type: 'surface', default: 'none' },
        { name: 'tex', type: 'surface', default: 'none' },
        { name: 'scale', type: 'float', default: 1 }
    ]
})

registerOp('synth.solid', {
    name: 'solid',
    args: [
        { name: 'color', type: 'color', default: '#ff0000' }
    ]
})

// Register starters
registerStarterOps(['synth.noise', 'synth.voronoi', 'synth.gradient', 'synth3d.fractal', 'synth3d.heightmap', 'synth.solid'])

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
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)

    assertEqual(steps.length, 2, 'Should have 2 steps')
    assertEqual(steps[0].stepIndex, 0, 'First effect should keep its compiled step index')
    assertEqual(steps[1].stepIndex, 1, 'Second effect should keep its compiled step index')

    // First step is noise (starter)
    assertEqual(steps[0].effectName, 'synth.noise', 'First step should be noise')
    assertTrue(steps[0].isStarterPosition, 'First step should be in starter position')
    assertTrue(steps[0].canReplaceWithStarter, 'First step can be replaced with starter')
    assertFalse(steps[0].canReplaceWithNonStarter, 'First step cannot be replaced with non-starter')

    // Second step is kaleid (non-starter)
    assertEqual(steps[1].effectName, 'filter.kaleid', 'Second step should be kaleid')
    assertFalse(steps[1].isStarterPosition, 'Second step should not be in starter position')
    assertFalse(steps[1].canReplaceWithStarter, 'Second step cannot be replaced with starter')
    assertTrue(steps[1].canReplaceWithNonStarter, 'Second step can be replaced with non-starter')
})

test('listSteps - multiple chains', () => {
    const compiled = compile(`search synth, filter
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
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const noiseStepIndex = steps[0].stepIndex

    const result = replaceEffect(compiled, noiseStepIndex, 'voronoi', { scale: 20 })

    assertTrue(result.success, 'Replacement should succeed')
    assertEqual(result.program.plans[0].chain[0].op, 'synth.voronoi', 'Effect should be replaced')
    assertEqual(result.program.plans[0].chain[0].args.scale, 20, 'Args should be applied')
})

test('replaceEffect - non-starter with non-starter (valid)', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const kaleidStepIndex = steps[1].stepIndex

    const result = replaceEffect(compiled, kaleidStepIndex, 'bloom', { intensity: 0.8 })

    assertTrue(result.success, 'Replacement should succeed')
    assertEqual(result.program.plans[0].chain[1].op, 'filter.bloom', 'Effect should be replaced')
    assertEqual(result.program.plans[0].chain[1].args.intensity, 0.8, 'Args should be applied')
})

test('replaceEffect - starter with non-starter (invalid)', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const noiseStepIndex = steps[0].stepIndex

    const result = replaceEffect(compiled, noiseStepIndex, 'kaleid')

    assertFalse(result.success, 'Replacement should fail')
    assertTrue(result.error.includes('starter'), 'Error should mention starter')
    assertTrue(result.error.includes('non-starter'), 'Error should mention non-starter')
})

test('replaceEffect - non-starter with starter (invalid)', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const kaleidStepIndex = steps[1].stepIndex

    const result = replaceEffect(compiled, kaleidStepIndex, 'noise')

    assertFalse(result.success, 'Replacement should fail')
    assertTrue(result.error.includes('starter'), 'Error should mention starter')
})

test('replaceEffect - nonexistent effect', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)

    const result = replaceEffect(compiled, steps[0].stepIndex, 'nonexistent_effect')

    assertFalse(result.success, 'Replacement should fail')
    assertTrue(result.error.includes('not found'), 'Error should mention not found')
})

test('replaceEffect - invalid step index', () => {
    const compiled = compile('search synth, filter\nnoise(10).write(o0)')

    const result = replaceEffect(compiled, 999, 'voronoi')

    assertFalse(result.success, 'Replacement should fail')
    assertTrue(result.error.includes('not found'), 'Error should mention not found')
})

test('replaceEffect - builtin step index is not a replacement target', () => {
    const compiled = compile('search synth, filter\nnoise(10).write(o0)')
    const builtinStepIndex = compiled.plans[0].chain.find(step => step.builtin).temp

    const result = replaceEffect(compiled, builtinStepIndex, 'bloom')

    assertFalse(result.success, 'Replacement should fail')
    assertEqual(result.error, `Step with index ${builtinStepIndex} not found`, 'Builtin should use the existing not-found failure')
})

test('replaceEffect - immutability', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const originalOp = compiled.plans[0].chain[0].op

    const result = replaceEffect(compiled, steps[0].stepIndex, 'voronoi')

    assertTrue(result.success, 'Replacement should succeed')
    assertEqual(compiled.plans[0].chain[0].op, originalOp, 'Original should not be modified')
    assertEqual(result.program.plans[0].chain[0].op, 'synth.voronoi', 'New program should have replacement')
})

test('replaceEffect - default args applied', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
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
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const noiseStepIndex = steps[0].stepIndex

    const result = getCompatibleReplacements(compiled, noiseStepIndex)

    assertTrue(result.success, 'Should succeed')
    assertTrue(result.compatible.includes('synth.noise'), 'Should include noise as compatible')
    assertTrue(result.compatible.includes('synth.voronoi'), 'Should include voronoi as compatible')
    assertTrue(result.incompatible.includes('filter.kaleid'), 'Should include kaleid as incompatible')
})

test('getCompatibleReplacements - non-starter position', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const kaleidStepIndex = steps[1].stepIndex

    const result = getCompatibleReplacements(compiled, kaleidStepIndex)

    assertTrue(result.success, 'Should succeed')
    assertTrue(result.compatible.includes('filter.kaleid'), 'Should include kaleid as compatible')
    assertTrue(result.compatible.includes('filter.bloom'), 'Should include bloom as compatible')
    assertTrue(result.incompatible.includes('synth.noise'), 'Should include noise as incompatible')
})

test('getCompatibleReplacements - invalid step index', () => {
    const compiled = compile('search synth, filter\nnoise(10).write(o0)')

    const result = getCompatibleReplacements(compiled, 999)

    assertFalse(result.success, 'Should fail')
    assertTrue(result.error.includes('not found'), 'Error should mention not found')
})

test('getCompatibleReplacements - builtin step index is not a replacement target', () => {
    const compiled = compile('search synth, filter\nnoise(10).write(o0)')
    const builtinStepIndex = compiled.plans[0].chain.find(step => step.builtin).temp

    const result = getCompatibleReplacements(compiled, builtinStepIndex)

    assertFalse(result.success, 'Compatibility lookup should fail')
    assertEqual(result.error, `Step with index ${builtinStepIndex} not found`, 'Builtin should use the existing not-found failure')
})

// ============================================================================
// Cross-namespace replacement tests
// ============================================================================

test('replaceEffect - cross-namespace starter replacement', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const noiseStepIndex = steps[0].stepIndex

    // Replace synth.noise with synth3d.fractal (different namespace)
    const result = replaceEffect(compiled, noiseStepIndex, 'synth3d.fractal', { scale: 20 })

    assertTrue(result.success, 'Cross-namespace replacement should succeed')
    assertEqual(result.program.plans[0].chain[0].op, 'synth3d.fractal', 'Effect should be replaced')
    assertTrue(result.program.searchNamespaces.includes('synth3d'), 'New namespace should be added to searchNamespaces')
})

test('replaceEffect - cross-namespace filter replacement', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const kaleidStepIndex = steps[1].stepIndex

    // Replace filter.kaleid with synth3d.distort (different namespace)
    const result = replaceEffect(compiled, kaleidStepIndex, 'synth3d.distort', { amount: 0.8 })

    assertTrue(result.success, 'Cross-namespace replacement should succeed')
    assertEqual(result.program.plans[0].chain[1].op, 'synth3d.distort', 'Effect should be replaced')
    assertTrue(result.program.searchNamespaces.includes('synth3d'), 'New namespace should be added to searchNamespaces')
})

test('replaceEffect - cross-namespace unparse produces valid DSL', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const noiseStepIndex = steps[0].stepIndex

    // Replace with effect from different namespace
    const result = replaceEffect(compiled, noiseStepIndex, 'synth3d.fractal')

    assertTrue(result.success, 'Replacement should succeed')

    // Unparse and verify no namespace prefix in call (it should be stripped)
    const dsl = unparse(result.program)

    // The search directive should include both namespaces
    assertTrue(dsl.includes('search synth, filter, synth3d') || dsl.includes('search synth,filter,synth3d'),
        'Search directive should include both namespaces')

    // The effect call should NOT have namespace prefix (it gets stripped by unparser)
    assertFalse(dsl.includes('synth3d.fractal('), 'Effect call should not have namespace prefix')
    assertTrue(dsl.includes('fractal('), 'Effect call should use bare name')
})

test('replaceEffect - same namespace does not duplicate searchNamespaces', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)
    const noiseStepIndex = steps[0].stepIndex

    // Replace with effect from same namespace
    const result = replaceEffect(compiled, noiseStepIndex, 'synth.voronoi')

    assertTrue(result.success, 'Replacement should succeed')
    assertEqual(result.program.searchNamespaces.length, 2, 'Should not duplicate namespace')
    assertEqual(result.program.searchNamespaces[0], 'synth', 'Should keep original namespace')
})

// ============================================================================
// Inline surface producer tests (effects as texture params, e.g. heightTex: noise())
// ============================================================================

test('listSteps - inline surface producers are in starter position', () => {
    const compiled = compile('search synth, synth3d\nheightmap(heightTex: noise(), tex: gradient()).write(o0)')
    const steps = listSteps(compiled)

    const noiseStep = steps.find(s => s.effectName === 'synth.noise')
    const gradientStep = steps.find(s => s.effectName === 'synth.gradient')
    const heightmapStep = steps.find(s => s.effectName === 'synth3d.heightmap')

    assertTrue(noiseStep, 'Should find noise step')
    assertTrue(gradientStep, 'Should find gradient step')
    assertTrue(heightmapStep, 'Should find heightmap step')

    assertTrue(noiseStep.isStarterPosition, 'Inline noise producer should be in starter position')
    assertTrue(gradientStep.isStarterPosition, 'Inline gradient producer should be in starter position')
    assertTrue(heightmapStep.isStarterPosition, 'Heightmap (chain head) should be in starter position')

    assertTrue(noiseStep.canReplaceWithStarter, 'Inline noise producer should accept starter replacement')
    assertFalse(noiseStep.canReplaceWithNonStarter, 'Inline noise producer should reject non-starter replacement')
})

test('replaceEffect - replace inline surface producer starter with another starter (valid)', () => {
    const compiled = compile('search synth, synth3d\nheightmap(heightTex: noise(), tex: gradient()).write(o0)')
    const steps = listSteps(compiled)
    const gradientStep = steps.find(s => s.effectName === 'synth.gradient')

    const result = replaceEffect(compiled, gradientStep.stepIndex, 'solid')

    assertTrue(result.success, 'Replacing inline starter producer with another starter should succeed')
    const replacedStep = result.program.plans[0].chain.find(s => s.temp === gradientStep.stepIndex)
    assertEqual(replacedStep.op, 'synth.solid', 'Effect should be replaced to solid')
})

test('replaceEffect - replace inline surface producer starter with non-starter (invalid)', () => {
    const compiled = compile('search synth, synth3d, filter\nheightmap(heightTex: noise(), tex: gradient()).write(o0)')
    const steps = listSteps(compiled)
    const gradientStep = steps.find(s => s.effectName === 'synth.gradient')

    const result = replaceEffect(compiled, gradientStep.stepIndex, 'kaleid')

    assertFalse(result.success, 'Replacing inline starter producer with non-starter should fail')
    assertTrue(result.error.includes('starter'), 'Error should mention starter')
})

// ============================================================================
// Replacement preflight prediction tests (GAP-008)
// ============================================================================

import { registerEffect } from '../src/runtime/registry.js'

// Full effect instance for filter.grain, registered like the renderer does
registerOp('filter.grain', {
    name: 'grain',
    args: [
        { name: 'amount', type: 'float', default: 0.5, min: 0, max: 1 },
        { name: 'mode', type: 'int', default: 0, choices: { fine: 0, coarse: 1 } }
    ]
})

registerEffect('filter.grain', {
    name: 'Grain',
    namespace: 'filter',
    func: 'grain',
    globals: {
        amount: { type: 'float', default: 0.5, min: 0, max: 1 },
        mode: { type: 'int', default: 0, choices: { fine: 0, coarse: 1 } }
    },
    textures: {
        scratch: { width: 'resolution', height: 'resolution' }
    },
    passes: [
        {
            name: 'grain',
            program: 'grain',
            inputs: {},
            outputs: { color: 'outputTex' }
        }
    ]
})

const GRAIN_MANIFEST = {
    'filter/grain': {
        description: 'Grain',
        glsl: { grain: 'combined' },
        starter: false
        // no wgsl entry: WebGPU unsupported
    }
}

test('getCompatibleReplacements - predictions expose candidate dimensions', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)

    const result = getCompatibleReplacements(compiled, steps[1].stepIndex)

    assertTrue(result.success, 'Should succeed')
    assertTrue(result.predictions, 'Should return a predictions map')

    const grain = result.predictions['filter.grain']
    assertTrue(grain, 'Should predict filter.grain')
    assertEqual(grain.available, true, 'Registered instance should be available')
    assertEqual(grain.arguments.unknown.length, 0, 'No unknown arguments without provided args')
    assertEqual(grain.types.length, 0, 'No type mismatches without provided args')
    assertEqual(grain.ranges.length, 0, 'No range violations without provided args')
    assertEqual(grain.passes.passes[0].program, 'grain', 'Pass prediction should name the shader program')
    assertEqual(grain.passes.passes[0].outputs.color, 'outputTex', 'Pass prediction should list outputs')
    assertTrue(grain.samplerTopology.internalTextures.includes('scratch'), 'Sampler topology should list internal textures')
    assertEqual(grain.backendSupport, undefined, 'Backend support is unknown without a manifest')
})

test('getCompatibleReplacements - manifest predicts backend support', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)

    const result = getCompatibleReplacements(compiled, steps[1].stepIndex, { manifest: GRAIN_MANIFEST })
    const grain = result.predictions['filter.grain']

    assertEqual(grain.backendSupport.webgl2, true, 'GLSL-only manifest should mark WebGL2 supported')
    assertEqual(grain.backendSupport.webgpu, false, 'Missing WGSL entry should mark WebGPU unsupported')

    const missing = getCompatibleReplacements(compiled, steps[1].stepIndex, {
        manifest: { 'filter/grain': { glsl: {}, wgsl: {} } }
    })
    assertEqual(missing.predictions['filter.grain'].backendSupport.webgl2, false, 'Missing manifest entry is unsupported')
})

test('getCompatibleReplacements - default classification is unchanged', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)

    const result = getCompatibleReplacements(compiled, steps[1].stepIndex)

    assertTrue(result.compatible.includes('filter.bloom'), 'Bloom stays compatible without preflight opt-in')
    assertTrue(result.incompatible.includes('synth.noise'), 'Starters stay incompatible without preflight opt-in')
})

test('getCompatibleReplacements - preflight moves unavailable candidates to blocked', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)

    // The runtime registry is populated (filter.grain registered above), so
    // ops without a registered definition are predicted unavailable.
    const result = getCompatibleReplacements(compiled, steps[1].stepIndex, { preflight: true })

    assertFalse(result.compatible.includes('filter.bloom'), 'Bloom should leave compatible under preflight')
    assertTrue(result.compatible.includes('filter.grain'), 'Grain should stay compatible under preflight')
    assertTrue(result.blocked, 'Preflight should return a blocked list')
    const bloomBlock = result.blocked.find(b => b.effect === 'filter.bloom')
    assertTrue(bloomBlock, 'Bloom should be blocked')
    assertTrue(bloomBlock.issues.some(i => i.dimension === 'shader-availability'), 'Block reason should be shader availability')
})

test('replaceEffect - default behavior unchanged, prediction is attached', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)

    // Unknown argument, out-of-range value: previously accepted, must stay accepted
    const result = replaceEffect(compiled, steps[1].stepIndex, 'grain', { amnt: 9 })

    assertTrue(result.success, 'Previously accepted input must still succeed without opt-in')
    assertTrue(result.prediction, 'Success should carry the prediction')
    assertTrue(result.prediction.arguments.unknown.includes('amnt'), 'Prediction should report the unknown argument')
    assertEqual(result.prediction.ranges.length, 0, 'Unknown arguments have no declared range to check')
})

test('replaceEffect - preflight refuses unknown argument', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)

    const result = replaceEffect(compiled, steps[1].stepIndex, 'grain', { amnt: 0.9 }, { preflight: true })

    assertFalse(result.success, 'Preflight should refuse unknown arguments')
    assertTrue(result.error.includes('preflight'), 'Error should mention preflight')
    assertTrue(result.error.includes('amnt'), 'Error should name the unknown argument')
    assertEqual(result.program, undefined, 'No program should be produced on preflight failure')
})

test('replaceEffect - preflight refuses out-of-range value', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)

    const result = replaceEffect(compiled, steps[1].stepIndex, 'grain', { amount: 5 }, { preflight: true })

    assertFalse(result.success, 'Preflight should refuse out-of-range values')
    assertTrue(result.error.includes('outside range'), 'Error should mention the range')
})

test('replaceEffect - preflight refuses choice violation', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)

    const result = replaceEffect(compiled, steps[1].stepIndex, 'grain', { mode: 7 }, { preflight: true })

    assertFalse(result.success, 'Preflight should refuse invalid choice values')
    assertTrue(result.error.includes('not one of'), 'Error should mention the choices')
})

test('replaceEffect - preflight refuses type mismatch', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)

    const result = replaceEffect(compiled, steps[1].stepIndex, 'grain', { amount: 'high' }, { preflight: true })

    assertFalse(result.success, 'Preflight should refuse type mismatches')
    assertTrue(result.error.includes('expects float'), 'Error should mention the expected type')
})

test('replaceEffect - preflight passes valid replacement through with prediction', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)

    const result = replaceEffect(compiled, steps[1].stepIndex, 'grain', { amount: 0.75 }, { preflight: true })

    assertTrue(result.success, 'Valid preflight replacement should succeed')
    assertEqual(result.program.plans[0].chain[1].op, 'filter.grain', 'Effect should be replaced')
    assertEqual(result.program.plans[0].chain[1].args.amount, 0.75, 'Args should be applied')
    assertEqual(result.prediction.available, true, 'Prediction should mark the effect available')
    assertTrue(result.prediction.samplerTopology.internalTextures.includes('scratch'), 'Prediction should carry sampler topology')
})

// Param-alias awareness: deprecated names must not be predicted unknown
import { registerParamAliases } from '../src/lang/paramAliases.js'
registerParamAliases('filter.grain', { amt: 'amount' })

test('prediction - registered param alias is accepted with canonical checks', () => {
    const compiled = compile('search synth, filter\nnoise(10).kaleid(6).write(o0)')
    const steps = listSteps(compiled)

    // Supplied via deprecated alias: not unknown, range/type checked canonically
    const viaAlias = replaceEffect(compiled, steps[1].stepIndex, 'grain', { amt: 0.9 })
    assertTrue(viaAlias.success, 'Alias-supplied replacement should succeed without opt-in')
    assertTrue(viaAlias.prediction.arguments.unknown.length === 0, 'Alias name should not be predicted unknown')
    assertTrue(viaAlias.prediction.arguments.missing.length === 0, 'Canonical argument should count as provided via alias')

    const viaAliasPreflight = replaceEffect(compiled, steps[1].stepIndex, 'grain', { amt: 0.9 }, { preflight: true })
    assertTrue(viaAliasPreflight.success, 'Alias-supplied replacement should pass preflight')
    assertTrue(viaAliasPreflight.prediction.ranges.length === 0, 'Alias value within range should not be flagged')

    // Range violation through the alias still fires canonically
    const outOfRange = replaceEffect(compiled, steps[1].stepIndex, 'grain', { amt: 5 }, { preflight: true })
    assertFalse(outOfRange.success, 'Out-of-range value via alias should be refused under preflight')
    assertTrue(outOfRange.error.includes('amount'), 'Range error should name the canonical argument')
})

console.log('\nAll transform tests completed!')
