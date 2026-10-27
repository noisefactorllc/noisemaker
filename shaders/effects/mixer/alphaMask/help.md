# alphaMask

Alpha transparency blend

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | - | Source B |
| baseTex | surface | none | - | Background for grayscale masking; transparent by default. The mask interpolates premultiplied RGBA between this background and the input. |
| mix | float | 0 | -100-100 | Mix |
| maskMode | boolean | false | - | Use the mask's grayscale luminance instead of its alpha |
