# Alpha Mask

Alpha transparency blend between two surfaces using alpha channel values.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | — | Source B texture to blend with |
| mixAmt | float | 0 | -100–100 | Blend amount (0 = original, positive = more blend) |

## Usage

```
noise().alphaMask(tex: read(o1), mixAmt: 50).write(o0)
```
