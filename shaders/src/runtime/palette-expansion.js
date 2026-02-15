/**
 * Legacy classicNoisedeck palette expansion — DO NOT USE FOR NEW EFFECTS.
 *
 * This module exists solely to support the classicNoisedeck namespace, whose
 * shaders were extracted from noisedeck-pro and bake palette math directly
 * into each effect. Programs built in the modern namespaces should use
 * filter/palette or another colorization filter instead — they handle
 * palette rendering in a single composable pass with no per-effect wiring.
 *
 * How it works: classicNoisedeck shaders accept individual vec3 uniforms
 * (paletteOffset, paletteAmp, paletteFreq, palettePhase) plus an integer
 * paletteMode, but the UI only sets a palette index. This module maps that
 * 1-based index to the concrete uniform values so the shaders can render
 * the correct palette.
 *
 * Integration points (program-state._applyToPipeline and Pipeline.setUniform)
 * detect type:"palette" params and call expandPalette() automatically. Effect
 * authors do not need to interact with this module.
 *
 * The palette data is duplicated here from the filter/palette shader const
 * array so this module has zero imports.
 *
 * Mode mapping (filter/palette -> classicNoisedeck):
 *   filter 0 (rgb)   -> classic 3
 *   filter 1 (hsv)   -> classic 1
 *   filter 2 (oklab) -> classic 2
 */

// Each entry: { amp, freq, offset, phase, mode }
// mode is already mapped to classicNoisedeck convention (0=none, 1=hsv, 2=oklab, 3=rgb)
const PALETTES = [
    // 1: seventiesShirt (rgb)
    { amp: [0.76, 0.88, 0.37], freq: [1.0, 1.0, 1.0], offset: [0.93, 0.97, 0.52], phase: [0.21, 0.41, 0.56], mode: 3 },
    // 2: fiveG (rgb)
    { amp: [0.56851584, 0.7740668, 0.23485267], freq: [1.0, 1.0, 1.0], offset: [0.5, 0.5, 0.5], phase: [0.727029, 0.08039695, 0.10427457], mode: 3 },
    // 3: afterimage (rgb)
    { amp: [0.5, 0.5, 0.5], freq: [1.0, 1.0, 1.0], offset: [0.5, 0.5, 0.5], phase: [0.3, 0.2, 0.2], mode: 3 },
    // 4: barstow (rgb)
    { amp: [0.45, 0.2, 0.1], freq: [1.0, 1.0, 1.0], offset: [0.7, 0.2, 0.2], phase: [0.5, 0.4, 0.0], mode: 3 },
    // 5: bloob (rgb)
    { amp: [0.09, 0.59, 0.48], freq: [1.0, 1.0, 1.0], offset: [0.2, 0.31, 0.98], phase: [0.88, 0.4, 0.33], mode: 3 },
    // 6: blueSkies (rgb)
    { amp: [0.5, 0.5, 0.5], freq: [1.0, 1.0, 1.0], offset: [0.1, 0.4, 0.7], phase: [0.1, 0.1, 0.1], mode: 3 },
    // 7: brushedMetal (rgb)
    { amp: [0.5, 0.5, 0.5], freq: [1.0, 1.0, 1.0], offset: [0.5, 0.5, 0.5], phase: [0.0, 0.1, 0.2], mode: 3 },
    // 8: burningSky (rgb)
    { amp: [0.7259015, 0.7004237, 0.9494409], freq: [1.0, 1.0, 1.0], offset: [0.63290054, 0.37883538, 0.29405284], phase: [0.0, 0.1, 0.2], mode: 3 },
    // 9: california (rgb)
    { amp: [0.94, 0.33, 0.27], freq: [1.0, 1.0, 1.0], offset: [0.74, 0.37, 0.73], phase: [0.44, 0.17, 0.88], mode: 3 },
    // 10: columbia (rgb)
    { amp: [1.0, 0.7, 1.0], freq: [1.0, 1.0, 1.0], offset: [1.0, 0.4, 0.9], phase: [0.4, 0.5, 0.6], mode: 3 },
    // 11: cottonCandy (rgb)
    { amp: [0.51, 0.39, 0.41], freq: [1.0, 1.0, 1.0], offset: [0.59, 0.53, 0.94], phase: [0.15, 0.41, 0.46], mode: 3 },
    // 12: darkSatin (hsv)
    { amp: [0.0, 0.0, 0.51], freq: [1.0, 1.0, 1.0], offset: [0.0, 0.0, 0.43], phase: [0.0, 0.0, 0.36], mode: 1 },
    // 13: dealerHat (rgb)
    { amp: [0.83, 0.45, 0.19], freq: [1.0, 1.0, 1.0], offset: [0.79, 0.45, 0.35], phase: [0.28, 0.91, 0.61], mode: 3 },
    // 14: dreamy (rgb)
    { amp: [0.5, 0.5, 0.5], freq: [1.0, 1.0, 1.0], offset: [0.5, 0.5, 0.5], phase: [0.0, 0.2, 0.25], mode: 3 },
    // 15: eventHorizon (rgb)
    { amp: [0.5, 0.5, 0.5], freq: [1.0, 1.0, 1.0], offset: [0.22, 0.48, 0.62], phase: [0.1, 0.3, 0.2], mode: 3 },
    // 16: ghostly (hsv)
    { amp: [0.02, 0.92, 0.76], freq: [1.0, 1.0, 1.0], offset: [0.51, 0.49, 0.51], phase: [0.71, 0.23, 0.66], mode: 1 },
    // 17: grayscale (rgb)
    { amp: [0.5, 0.5, 0.5], freq: [2.0, 2.0, 2.0], offset: [0.5, 0.5, 0.5], phase: [1.0, 1.0, 1.0], mode: 3 },
    // 18: hazySunset (rgb)
    { amp: [0.79, 0.56, 0.22], freq: [1.0, 1.0, 1.0], offset: [0.96, 0.5, 0.49], phase: [0.15, 0.98, 0.87], mode: 3 },
    // 19: heatmap (rgb)
    { amp: [0.75804377, 0.62868536, 0.2227562], freq: [1.0, 1.0, 1.0], offset: [0.35536355, 0.12935615, 0.17060602], phase: [0.0, 0.25, 0.5], mode: 3 },
    // 20: hypercolor (rgb)
    { amp: [0.79, 0.5, 0.23], freq: [1.0, 1.0, 1.0], offset: [0.75, 0.47, 0.45], phase: [0.08, 0.84, 0.16], mode: 3 },
    // 21: jester (rgb)
    { amp: [0.7, 0.81, 0.73], freq: [1.0, 1.0, 1.0], offset: [0.1, 0.22, 0.27], phase: [0.99, 0.12, 0.94], mode: 3 },
    // 22: justBlue (rgb)
    { amp: [0.5, 0.5, 0.5], freq: [0.0, 0.0, 1.0], offset: [0.5, 0.5, 0.5], phase: [0.5, 0.5, 0.5], mode: 3 },
    // 23: justCyan (rgb)
    { amp: [0.5, 0.5, 0.5], freq: [0.0, 1.0, 1.0], offset: [0.5, 0.5, 0.5], phase: [0.5, 0.5, 0.5], mode: 3 },
    // 24: justGreen (rgb)
    { amp: [0.5, 0.5, 0.5], freq: [0.0, 1.0, 0.0], offset: [0.5, 0.5, 0.5], phase: [0.5, 0.5, 0.5], mode: 3 },
    // 25: justPurple (rgb)
    { amp: [0.5, 0.5, 0.5], freq: [1.0, 0.0, 1.0], offset: [0.5, 0.5, 0.5], phase: [0.5, 0.5, 0.5], mode: 3 },
    // 26: justRed (rgb)
    { amp: [0.5, 0.5, 0.5], freq: [1.0, 0.0, 0.0], offset: [0.5, 0.5, 0.5], phase: [0.5, 0.5, 0.5], mode: 3 },
    // 27: justYellow (rgb)
    { amp: [0.5, 0.5, 0.5], freq: [1.0, 1.0, 0.0], offset: [0.5, 0.5, 0.5], phase: [0.5, 0.5, 0.5], mode: 3 },
    // 28: mars (rgb)
    { amp: [0.74, 0.33, 0.09], freq: [1.0, 1.0, 1.0], offset: [0.62, 0.2, 0.2], phase: [0.2, 0.1, 0.0], mode: 3 },
    // 29: modesto (rgb)
    { amp: [0.56, 0.68, 0.39], freq: [1.0, 1.0, 1.0], offset: [0.72, 0.07, 0.62], phase: [0.25, 0.4, 0.41], mode: 3 },
    // 30: moss (rgb)
    { amp: [0.78, 0.39, 0.07], freq: [1.0, 1.0, 1.0], offset: [0.0, 0.53, 0.33], phase: [0.94, 0.92, 0.9], mode: 3 },
    // 31: neptune (rgb)
    { amp: [0.5, 0.5, 0.5], freq: [1.0, 1.0, 1.0], offset: [0.2, 0.64, 0.62], phase: [0.15, 0.2, 0.3], mode: 3 },
    // 32: netOfGems (rgb)
    { amp: [0.5, 0.5, 0.5], freq: [1.0, 1.0, 1.0], offset: [0.64, 0.12, 0.84], phase: [0.1, 0.25, 0.15], mode: 3 },
    // 33: organic (rgb)
    { amp: [0.42, 0.42, 0.04], freq: [1.0, 1.0, 1.0], offset: [0.47, 0.27, 0.27], phase: [0.41, 0.14, 0.11], mode: 3 },
    // 34: papaya (rgb)
    { amp: [0.65, 0.4, 0.11], freq: [1.0, 1.0, 1.0], offset: [0.72, 0.45, 0.08], phase: [0.71, 0.8, 0.84], mode: 3 },
    // 35: radioactive (rgb)
    { amp: [0.62, 0.79, 0.11], freq: [1.0, 1.0, 1.0], offset: [0.22, 0.56, 0.17], phase: [0.15, 0.1, 0.25], mode: 3 },
    // 36: royal (rgb)
    { amp: [0.5, 0.5, 0.5], freq: [1.0, 1.0, 1.0], offset: [0.41, 0.22, 0.67], phase: [0.2, 0.25, 0.2], mode: 3 },
    // 37: santaCruz (rgb)
    { amp: [0.5, 0.5, 0.5], freq: [1.0, 1.0, 1.0], offset: [0.5, 0.5, 0.5], phase: [0.25, 0.5, 0.75], mode: 3 },
    // 38: sherbet (rgb)
    { amp: [0.6059281, 0.17591387, 0.17166573], freq: [1.0, 1.0, 1.0], offset: [0.5224456, 0.3864609, 0.36020845], phase: [0.0, 0.25, 0.5], mode: 3 },
    // 39: sherbetDouble (rgb)
    { amp: [0.6059281, 0.17591387, 0.17166573], freq: [2.0, 2.0, 2.0], offset: [0.5224456, 0.3864609, 0.36020845], phase: [0.0, 0.25, 0.5], mode: 3 },
    // 40: silvermane (oklab)
    { amp: [0.42, 0.0, 0.0], freq: [2.0, 2.0, 2.0], offset: [0.45, 0.5, 0.42], phase: [0.63, 1.0, 1.0], mode: 2 },
    // 41: skykissed (rgb)
    { amp: [0.5, 0.5, 0.5], freq: [1.0, 1.0, 1.0], offset: [0.83, 0.6, 0.63], phase: [0.3, 0.1, 0.0], mode: 3 },
    // 42: solaris (rgb)
    { amp: [0.5, 0.5, 0.5], freq: [1.0, 1.0, 1.0], offset: [0.6, 0.4, 0.1], phase: [0.3, 0.2, 0.1], mode: 3 },
    // 43: spooky (oklab)
    { amp: [0.46, 0.73, 0.19], freq: [1.0, 1.0, 1.0], offset: [0.27, 0.79, 0.78], phase: [0.27, 0.16, 0.04], mode: 2 },
    // 44: springtime (rgb)
    { amp: [0.67, 0.25, 0.27], freq: [1.0, 1.0, 1.0], offset: [0.74, 0.48, 0.46], phase: [0.07, 0.79, 0.39], mode: 3 },
    // 45: sproingtime (rgb)
    { amp: [0.9, 0.43, 0.34], freq: [1.0, 1.0, 1.0], offset: [0.56, 0.69, 0.32], phase: [0.03, 0.8, 0.4], mode: 3 },
    // 46: sulphur (rgb)
    { amp: [0.73, 0.36, 0.52], freq: [1.0, 1.0, 1.0], offset: [0.78, 0.68, 0.15], phase: [0.74, 0.93, 0.28], mode: 3 },
    // 47: summoning (rgb)
    { amp: [1.0, 0.0, 0.8], freq: [1.0, 1.0, 1.0], offset: [0.0, 0.0, 0.0], phase: [0.0, 0.5, 0.1], mode: 3 },
    // 48: superhero (rgb)
    { amp: [1.0, 0.25, 0.5], freq: [0.5, 0.5, 0.5], offset: [0.0, 0.0, 0.25], phase: [0.5, 0.0, 0.0], mode: 3 },
    // 49: toxic (rgb)
    { amp: [0.5, 0.5, 0.5], freq: [1.0, 1.0, 1.0], offset: [0.26, 0.57, 0.03], phase: [0.0, 0.1, 0.3], mode: 3 },
    // 50: tropicalia (oklab)
    { amp: [0.28, 0.08, 0.65], freq: [1.0, 1.0, 1.0], offset: [0.48, 0.6, 0.03], phase: [0.1, 0.15, 0.3], mode: 2 },
    // 51: tungsten (rgb)
    { amp: [0.65, 0.93, 0.73], freq: [1.0, 1.0, 1.0], offset: [0.31, 0.21, 0.27], phase: [0.43, 0.45, 0.48], mode: 3 },
    // 52: vaporwave (rgb)
    { amp: [0.9, 0.76, 0.63], freq: [1.0, 1.0, 1.0], offset: [0.0, 0.19, 0.68], phase: [0.43, 0.23, 0.32], mode: 3 },
    // 53: vibrant (rgb)
    { amp: [0.78, 0.63, 0.68], freq: [1.0, 1.0, 1.0], offset: [0.41, 0.03, 0.16], phase: [0.81, 0.61, 0.06], mode: 3 },
    // 54: vintage (rgb)
    { amp: [0.97, 0.74, 0.23], freq: [1.0, 1.0, 1.0], offset: [0.97, 0.38, 0.35], phase: [0.34, 0.41, 0.44], mode: 3 },
    // 55: vintagePhoto (rgb)
    { amp: [0.68, 0.79, 0.57], freq: [1.0, 1.0, 1.0], offset: [0.56, 0.35, 0.14], phase: [0.73, 0.9, 0.99], mode: 3 },
];

/**
 * Expand a 1-based palette index into the concrete uniform values expected
 * by classicNoisedeck shaders.
 *
 * @param {number} index - 1-based palette index
 * @returns {{ paletteOffset: number[], paletteAmp: number[], paletteFreq: number[], palettePhase: number[], paletteMode: number } | null}
 *   The uniform values, or null if the index is out of range (including <= 0).
 */
export function expandPalette(index) {
    if (index <= 0 || index > PALETTES.length) {
        return null;
    }

    const entry = PALETTES[index - 1];

    return {
        paletteOffset: entry.offset.slice(),
        paletteAmp: entry.amp.slice(),
        paletteFreq: entry.freq.slice(),
        palettePhase: entry.phase.slice(),
        paletteMode: entry.mode,
    };
}
