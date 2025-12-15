# BC (Brightness/Contrast)

Adjust image brightness and/or contrast.

## Parameters

- **Brightness** (0-10, default 1): Multiplies pixel values. Values < 1 darken, values > 1 brighten.
- **Contrast** (0-1, default 0.5): Controls contrast. 0 = no contrast, 0.5 = normal, 1 = maximum.

## Usage

```javascript
bc({ brightness: 1.2, contrast: 0.6 })
```
