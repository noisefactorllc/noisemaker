import { Effect } from '../../../src/runtime/effect.js'

export default class UserDefinitionWave extends Effect {
    name = 'User Definition Wave'
    namespace = 'user'
    func = 'userDefinitionWave'
    description = 'Synthetic fixture effect'
    tags = ['pattern']
    globals = {
        speed: { type: 'float', default: 1, min: 0, max: 4, uniform: 'speed', ui: { label: 'speed', control: 'slider' } }
    }
    passes = [
        { name: 'main', program: 'userDefinitionWave', inputs: {}, outputs: { color: 'outputTex' } }
    ]
}
