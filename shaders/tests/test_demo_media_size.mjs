import assert from 'node:assert/strict'
import { UIController } from '../../demo/shaders/lib/demo-ui.js'
import { ProgramState } from '../../demo/shaders/lib/program-state.js'
import { extractEffectsFromDsl } from '../../demo/shaders/lib/dsl-utils.js'
import { registerEffect, registerOp, registerStarterOps, mergeIntoEnums, stdEnums } from '../src/index.js'
import Media from '../effects/synth/media/definition.js'

mergeIntoEnums(stdEnums)
const media = typeof Media === 'function' ? new Media() : Media
for (const key of [media.func, `synth.${media.func}`, 'synth/media']) registerEffect(key, media)
registerOp(`synth.${media.func}`, {
    name: media.func,
    args: Object.entries(media.globals).map(([name, spec]) => ({
        name,
        type: spec.type === 'vec4' ? 'color' : spec.type,
        default: spec.default,
        min: spec.min,
        max: spec.max,
        uniform: spec.uniform,
        choices: spec.choices,
        enum: spec.enum || (spec.choices ? `synth.${media.func}.${name}` : undefined)
    }))
})
registerStarterOps([`synth.${media.func}`])

const dsl = 'search synth\n\nmedia().write(o0)\nrender(o0)'
const state = new ProgramState({ renderer: {} })
state.fromDsl(dsl)

const ui = Object.assign(Object.create(UIController.prototype), {
    _programState: state,
    _renderer: { _pipeline: {}, updateTextureFromSource: () => ({ width: 256, height: 128 }) },
    _mediaInputs: new Map([[0, { source: {}, textureId: 'imageTex' }]]),
    _controlsContainer: {},
    _parsedDslStructure: extractEffectsFromDsl(dsl),
    _syncControlValuesFromState: () => {}
})

ui._updateMediaTexture(0)
assert.deepEqual(state.getValue('step_0', 'imageSize'), [256, 128], 'loading a still image sets its size')

assert.equal(ui.checkStructureAndApplyState(dsl), true)
assert.deepEqual(state.getValue('step_0', 'imageSize'), [256, 128],
    're-running the same program keeps the loaded image\'s size, since a still image is not uploaded again')
console.log('PASS re-running the same program keeps a loaded still image\'s size')
