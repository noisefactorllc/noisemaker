# text

Text overlay renderer

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| seed | int | 1 | 1-100 | Seed |
| glyphUV1 | vec2 | 0,0 | - | Glyph uv1 |
| glyphUV2 | vec2 | 1,1 | - | Glyph uv2 |
| font | member | sansSerif | cursive/fantasy/monospace/nunito/sansSerif/serif/vcr | Font |
| text | member | 0 | - | Text |
| position | int | midCenter | topLeft/topCenter/topRight/midLeft/midCenter/midRight/bottomLeft/bottomCenter/bottomRight | Position |
| color | vec3 | 1,1,1 | - | Text color |
| size | float | 200 | 10-1500 | Scale |
| rotation | int | 0 | -180-180 | Rotate |
| offsetX | int | 0 | -100-100 | Offset x |
| offsetY | int | 0 | -100-100 | Offset y |
| backgroundColor | vec4 | 0,0,0,1 | - | Bkg color |
| backgroundOpacity | float | 100 | 0-100 | Bkg opacity |
