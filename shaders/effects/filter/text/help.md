# text

Overlay text onto the image

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| text | string | Hello World | - | - |
| font | string | nunito | nunito/sansSerif/serif/monospace/cursive/fantasy | - |
| size | float | 0.1 | 0.01-1 | - |
| posX | float | 0.5 | 0-1 | - |
| posY | float | 0.5 | 0-1 | - |
| rotation | float | 0 | -180-180 | - |
| color | color | #ffffff | - | - |
| matteColor | color | #000000 | - | - |
| matteOpacity | float | 0 | 0-1 | - |
| justify | string | center | left/center/right | - |

## Notes

Text is rendered on the CPU side and passed to the shader as a texture overlay.
