import { EffectHarness } from './harness_effect.js'
// The classic noisemaker effects this sample covered moved to filter/ or were
// superseded there (440ba64c, af2f77eb). filter/adjust carries the contrast,
// brightness, hue and saturation adjustments. nm/worms has no successor;
// points/physarum stands in as the complex multi-pass agent sample.
import Adjust from '../effects/filter/adjust/definition.js'
import Bloom from '../effects/filter/bloom/definition.js'
import Blur from '../effects/filter/blur/definition.js'
import Clouds from '../effects/filter/clouds/definition.js'
import Vignette from '../effects/filter/vignette/definition.js'
import Aberration from '../effects/filter/simpleAberration/definition.js'
import Grain from '../effects/filter/grain/definition.js'
import Physarum from '../effects/points/physarum/definition.js'

function testEffect(EffectClass, name) {
    console.log(`Testing ${name}...`)

    const harness = new EffectHarness(EffectClass)

    try {
        harness.validate()
    } catch (e) {
        console.error(`  Validation: FAIL - ${e.message}`)
        return false
    }

    try {
        harness.mount()
    } catch (e) {
        console.error(`  Mount: FAIL - ${e.message}`)
        return false
    }

    try {
        harness.update(0.1)
    } catch (e) {
        console.error(`  Update: FAIL - ${e.message}`)
        return false
    }

    console.log(`  ✓ ${name} passed`)
    return true
}

console.log('Testing NM Effects')
console.log('=' .repeat(60))

const effectsToTest = [
    [Adjust, 'Adjust (contrast, brightness, hue, saturation)'],
    [Bloom, 'Bloom'],
    [Blur, 'Blur'],
    [Clouds, 'Clouds'],
    [Vignette, 'Vignette'],
    [Aberration, 'Simple Aberration'],
    [Grain, 'Grain'],
    [Physarum, 'Physarum (complex multi-pass)'],
]

let passed = 0
let failed = 0

for (const [EffectClass, name] of effectsToTest) {
    if (testEffect(EffectClass, name)) {
        passed++
    } else {
        failed++
    }
}

console.log('=' .repeat(60))
console.log(`Results: ${passed} passed, ${failed} failed (out of ${effectsToTest.length} tested)`)
console.log(`Note: ${68 - effectsToTest.length} effects not tested in this sample`)

if (failed > 0) {
    process.exit(1)
}
