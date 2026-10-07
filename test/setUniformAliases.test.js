import assert from 'assert'
import { Pipeline } from '../shaders/src/runtime/pipeline.js'

// setUniform reaches a shader uniform the pass feeds from the parameter
// under another name (uniforms: { mixAmt: "mix" }).
{
    const pass = { uniforms: { mixAmt: 0, other: 1 }, uniformAliases: { mixAmt: 'mix' } }
    const pipeline = new Pipeline({ passes: [pass], textures: new Map() }, { updateTextureFromSource: () => {} })
    pipeline.setUniform('mix', 42)
    assert.equal(pass.uniforms.mixAmt, 42, 'aliased shader uniform must follow its parameter')
    assert.equal(pass.uniforms.other, 1, 'unrelated uniforms must not change')
    assert.equal('mix' in pass.uniforms, false, 'the parameter name must not be added to the pass')
}

// A vector value is copied, not shared, and automation configs are kept.
{
    const automation = { type: 'Oscillator', speed: 1 }
    const pass = {
        uniforms: { splatColor: [0, 0, 0], held: automation },
        uniformAliases: { splatColor: 'color', held: 'color' }
    }
    const pipeline = new Pipeline({ passes: [pass], textures: new Map() }, { updateTextureFromSource: () => {} })
    const color = [1, 0.5, 0.25]
    pipeline.setUniform('color', color)
    assert.deepEqual(pass.uniforms.splatColor, color)
    assert.notEqual(pass.uniforms.splatColor, color, 'vector values must be copied')
    assert.equal(pass.uniforms.held, automation, 'automation configs must not be overwritten')
}

// setUniform('palette', n) writes the palette uniform itself as well as the
// classic palette expansion: filter/dither's palette is an ordinary choice.
{
    const dither = { uniforms: { palette: 0 } }
    const classic = { uniforms: { palette: 0, paletteOffset: [0, 0, 0] } }
    const pipeline = new Pipeline({ passes: [dither, classic], textures: new Map() }, { updateTextureFromSource: () => {} })
    pipeline.setUniform('palette', 2)
    assert.equal(dither.uniforms.palette, 2, 'the palette uniform must be written')
    assert.equal(classic.uniforms.palette, 2)
    assert.notDeepStrictEqual(classic.uniforms.paletteOffset, [0, 0, 0], 'the classic expansion must still apply')
}

console.log('setUniform alias tests passed')
