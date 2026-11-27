// A legacy catalog definition with no definition.json, which the catalog
// reader runs only when allowed and only by ID.
import { Effect } from '../../../../../../src/runtime/effect.js'

export default new Effect({
    name: 'Fixture Legacy',
    namespace: 'synth',
    func: 'fixtureLegacy',
    description: 'A legacy catalog fixture read from its definition.js',
    tags: ['color'],
    uniformLayout: {
        speed: { slot: 0, components: 'x' }
    },
    globals: {
        speed: { type: 'float', default: 1, uniform: 'speed', min: 0, max: 4 },
        kind: {
            type: 'int',
            default: 0,
            define: 'FIXTURE_KIND',
            choices: { plain: 0, banded: 1 },
            ui: { label: 'kind', control: 'dropdown' }
        }
    },
    passes: [
        { name: 'main', program: 'main', inputs: {}, outputs: { fragColor: 'outputTex' } }
    ]
})
