# Media

Video/camera input with transform controls. Displays camera or uploaded media with positioning, tiling, flip/mirror, and transform options. Supports motion blur via feedback.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| position | int | mid center | top left/center/right, mid left/center/right, bottom left/center/right | Anchor position |
| tiling | int | none | none, horiz and vert, horiz only, vert only | Tiling mode |
| flip | int | none | none, all, horizontal, vertical, mirror l→r, mirror l←r, mirror u→d, mirror u←d, etc. | Flip/mirror mode |
| scaleAmt | float | 100 | 25–400 | Scale percentage |
| rotation | float | 0 | -180–180 | Rotation angle |
| offsetX | float | 0 | -100–100 | Horizontal offset |
| offsetY | float | 0 | -100–100 | Vertical offset |
| backgroundColor | vec3 | [0, 0, 0] | color | Background color |
| backgroundOpacity | float | 0 | 0–100 | Background opacity |
| motionBlur | float | 0 | 0–100 | Motion blur amount |

## Usage

```dsl
media(scaleAmt: 150, rotation: 45).write(o0)
```
