# dither

Ordered dithering with classic patterns and retro color palettes

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| type | int | bayer4x4 | bayer2x2/bayer4x4/bayer8x8/dot/line/crosshatch/noise | Dithering pattern type |
| threshold | float | 0 | -0.5 to 0.5 | Threshold bias/offset for dither pattern |
| matrixScale | int | 2 | 1-8 | Scale of the dither pattern on screen |
| palette | int | input2bit | input1bit/input2bit/monochrome/dotMatrixGreen/amberMonitor/pico8/commodore64/cgaPalette1/zxSpectrum/appleII/ega | Color palette for quantization |
| mix | float | 1 | 0-1 | Blend between original input (0) and dithered output (1) |

## Dither Types

### Bayer Matrices
Classic ordered dithering using threshold matrices of various sizes:
- **2x2**: Coarse, visible pattern with 4 threshold levels
- **4x4**: Standard dithering with 16 threshold levels
- **8x8**: Fine dithering with 64 threshold levels (default)

### Pattern Types
- **dot**: Circular halftone-style pattern
- **line**: Horizontal line pattern
- **crosshatch**: Diagonal crosshatch pattern
- **noise**: Random noise dithering (animated)

## Palettes

### Input-based Quantization
- **input 1-bit**: 2 colors per channel (high contrast)
- **input 2-bit**: 4 colors per channel

### Preset Palettes
- **monochrome**: Pure black and white
- **dot matrix green**: Game Boy-style green tones
- **amber monitor**: Classic amber CRT monitor colors
- **pico8**: PICO-8 fantasy console 16-color palette
- **commodore 64**: C64 16-color palette
- **CGA palette 1**: Cyan, magenta, white, black
- **zx spectrum**: ZX Spectrum 15-color palette
- **apple II**: Apple II 16-color palette
- **EGA**: Enhanced Graphics Adapter 16-color palette

## Tips

- Use larger pattern scales for a more pronounced retro look
- Combine with the pixels filter for authentic low-resolution aesthetics
- The threshold parameter can help balance dark and light areas
- Noise dithering animates over time for a film grain-like effect
