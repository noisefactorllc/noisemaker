## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| text | string | "Hello World" | — | Text content to display (supports multiline) |
| font | string | "Nunito" | nunito, sans-serif, serif, monospace, cursive, fantasy | Font family |
| size | float | 0.1 | 0.01–1.0 | Text size relative to canvas |
| posX | float | 0.5 | 0.0–1.0 | Horizontal position (0=left, 1=right) |
| posY | float | 0.5 | 0.0–1.0 | Vertical position (0=top, 1=bottom) |
| rotation | float | 0 | 0–360 | Text rotation in degrees |
| color | color | #ffffff | — | Text color |
| bgColor | color | #000000 | — | Background color |
| bgOpacity | float | 0 | 0.0–1.0 | Background opacity |
| justify | string | "center" | left, center, right | Text alignment |

## Notes

Text is rendered on the CPU side and passed to the shader as a texture overlay.
