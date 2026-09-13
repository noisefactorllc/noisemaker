import assert from 'node:assert/strict'
import { UIController } from '../../demo/shaders/lib/demo-ui.js'

const pending = []
const applied = []
const statuses = []
let dsl = 'perspective'
const ui = Object.assign(Object.create(UIController.prototype), {
    getDsl: () => dsl,
    _shaderOverrides: {},
    _renderer: { compile: () => new Promise(resolve => pending.push(resolve)) },
    checkStructureAndApplyState: value => { applied.push(value); return true },
    showStatus: value => statuses.push(value)
})

const first = ui._recompilePipeline()
dsl = 'ortho'
const second = ui._recompilePipeline()
pending[0]()
await first
assert.deepEqual(applied, [], 'an older compile must not restore stale control state')
assert.deepEqual(statuses, [], 'an older compile must not announce completion of the newer request')
pending[1]()
await second
assert.deepEqual(applied, ['ortho'])
assert.deepEqual(statuses, ['pipeline updated'])
console.log('PASS latest demo recompile owns control state and completion status')
