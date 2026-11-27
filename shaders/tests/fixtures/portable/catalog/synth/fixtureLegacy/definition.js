// A legacy catalog definition with no definition.json, which the catalog
// reader runs only when allowed and only by ID.
import { Effect } from '../../../../../../src/runtime/effect.js'

export default new Effect({
    name: 'Fixture Legacy',
    namespace: 'synth',
    func: 'fixtureLegacy',
    description: 'A legacy catalog fixture read from its definition.js',
    tags: ['color'],
    globals: {
        speed: { type: 'float', default: 1, uniform: 'speed', min: 0, max: 4 }
    },
    passes: [
        { name: 'main', program: 'main', inputs: {}, outputs: { fragColor: 'outputTex' } }
    ]
})
