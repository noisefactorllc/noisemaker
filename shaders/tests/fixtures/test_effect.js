import { Effect } from '../../src/runtime/effect.js'

export default class TestEffect extends Effect {
    name = "TestEffect"
    namespace = "test"
    func = "test_effect"

    globals = {
        "speed": {
            "type": "float",
            "default": 1.0
        }
    }

    passes = [
        {
            "type": "render",
            "program": "test.wgsl"
        }
    ]

    constructor() {
        super()
        this.counter = 0
    }

    onUpdate({ delta, uniforms }) {
        // uniforms contains globals like 'speed'
        const speed = uniforms.speed !== undefined ? uniforms.speed : 1.0
        this.counter += delta * speed

        return {
            counter: this.counter,
            pulse: Math.sin(this.counter)
        }
    }
}
