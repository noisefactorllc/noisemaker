import { EffectHarness } from './harness_effect.js'
import TestEffect from './fixtures/test_effect.js'

function test() {
    console.log('Testing Effect Harness with TestEffect...')

    const harness = new EffectHarness(TestEffect)

    try {
        harness.validate()
        console.log('Validation: PASS')
    } catch (e) {
        console.error('Validation: FAIL')
        console.error(e.message)
        process.exit(1)
    }

    harness.mount()
    console.log('Mount: PASS')

    // Run a few frames
    for (let i = 0; i < 5; i++) {
        const uniforms = harness.update(0.1)
        console.log(`Frame ${i}: time=${harness.context.time.toFixed(2)}, counter=${uniforms.counter.toFixed(2)}, pulse=${uniforms.pulse.toFixed(2)}`)

        // Verify logic
        // Speed is 1.0. Delta is 0.1. Counter should increase by 0.1 each frame.
        const expectedCounter = (i + 1) * 0.1
        if (Math.abs(uniforms.counter - expectedCounter) > 0.0001) {
            throw new Error(`Logic Error: Expected counter ${expectedCounter}, got ${uniforms.counter}`)
        }
    }

    harness.destroy()
    console.log('Destroy: PASS')
}

test()
