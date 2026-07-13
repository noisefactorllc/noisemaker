# median

Exact dense brightness-ranked median with a Dust & Scratches threshold gate.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| radius | int | 3 | 1-3 | Dense integer radius: 1, 2, and 3 select exact 3x3, 5x5, and 7x7 neighborhoods |
| threshold | float | 0 | 0-100 | Dust & Scratches gate: 0 always uses the median; above 0, the center is replaced only when its maximum RGB difference from the median is at least `threshold / 100` |

## Notes

- Every pixel in the selected square neighborhood is sampled at a clamped integer coordinate. There is no sparse or repeated approximation tier.
- Samples are ranked by Rec.709 brightness. The selected sample's complete RGB triplet is preserved, avoiding colors that were not present in the neighborhood.
- Alpha always comes from the original center pixel.
