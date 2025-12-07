import palettes from '../palettes.js'

// Generate palette enum from palettes.js definitions
const paletteEnum = {}
Object.keys(palettes).forEach((name, index) => {
    paletteEnum[name] = { type: 'Number', value: index }
})

// Oscillator kind enum for osc() function
const oscKindEnum = {
    sine: { type: 'Number', value: 0 },      // 0 -> 1 -> 0
    tri: { type: 'Number', value: 1 },       // 0 -> 1 -> 0 (linear)
    saw: { type: 'Number', value: 2 },       // 0 -> 1
    sawInv: { type: 'Number', value: 3 },    // 1 -> 0
    square: { type: 'Number', value: 4 },    // on/off
    noise: { type: 'Number', value: 5 }      // periodic 2D noise
}

export const stdEnums = {
    color: {
        mono: { type: 'Number', value: 0 },
        rgb: { type: 'Number', value: 1 },
        hsv: { type: 'Number', value: 2 }
    },
    oscType: {
        sine: { type: 'Number', value: 0 },
        linear: { type: 'Number', value: 1 },
        sawtooth: { type: 'Number', value: 2 },
        sawtoothInv: { type: 'Number', value: 3 },
        square: { type: 'Number', value: 4 },
        noise: { type: 'Number', value: 5 }
    },
    oscKind: oscKindEnum,
    palette: paletteEnum
}
