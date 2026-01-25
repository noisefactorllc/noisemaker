# thresholdMix

Blend using threshold masking

## Description

Mixes two input textures using a threshold-based mask derived from one of the inputs. Areas below the threshold show source A, areas above show source B, with optional smooth blending across a range. Can operate on luminance or separate RGB channels, and supports quantization for posterized banding effects.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | - | Source B |
| mode | int | luminance | luminance/rgb | Threshold mode |
| quantize | int | 0 | 0-8 | Posterization bands (0 = disabled) |
| mapSource | int | sourceB | sourceA/sourceB | Which input provides threshold values |
| threshold | float | 0.5 | 0-1 | Threshold cutoff point |
| range | float | 0 | 0-1 | Soft blend range above threshold |
| thresholdR | float | 0.5 | 0-1 | Red channel threshold (RGB mode) |
| rangeR | float | 0 | 0-1 | Red channel blend range (RGB mode) |
| thresholdG | float | 0.5 | 0-1 | Green channel threshold (RGB mode) |
| rangeG | float | 0 | 0-1 | Green channel blend range (RGB mode) |
| thresholdB | float | 0.5 | 0-1 | Blue channel threshold (RGB mode) |
| rangeB | float | 0 | 0-1 | Blue channel blend range (RGB mode) |

## Notes

- **Luminance mode**: Uses overall brightness to determine mixing, creating uniform transitions
- **RGB mode**: Each color channel is thresholded independently, allowing for color separation effects
- **Quantize**: Reduces the threshold map to discrete bands before mixing, creating posterized/banded effects
- **Range**: When 0, creates hard edges; increase for smooth gradients between sources
- **mapSource**: Choose whether source A or B provides the threshold map; the other source will be mixed in based on that map
- Use a gradient or noise texture as the map source for creative masking effects
- Combine with quantize for retro/posterized looks
