# halftone

Rotated-screen reproduction with subtractive color rosettes or monochrome dot, line, and circle patterns.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| mode | int | 0 | color:0, mono:1 | color separates the source into subtractive inks; mono screens luminance between the chosen paper and ink colors |
| pattern | int | 0 | dot:0, line:1, circle:2 | Mono-only shape: round dots, parallel lines, or concentric rings |
| frequency | float | 24 | 4-128 | Screen cell size in pixels; smaller values produce a finer screen |
| cyanAngle | float | 108 | -180-180 | Color-only cyan screen rotation in degrees |
| magentaAngle | float | 162 | -180-180 | Color-only magenta screen rotation in degrees |
| yellowAngle | float | 90 | -180-180 | Color-only yellow screen rotation in degrees |
| blackAngle | float | 45 | -180-180 | Color-only black screen rotation in degrees |
| monoAngle | float | 45 | -180-180 | Mono dot/line rotation in degrees; circle is unrotated |
| sharpness | float | 80 | 0-100 | Edge transition width; higher values give crisper marks |
| inkColor | color | [0.05, 0.05, 0.05] | - | Mono-only ink color |
| paperColor | color | [0.98, 0.96, 0.9] | - | Mono-only paper color |

## Notes

- Color mode uses under-color removal, so neutral RGB is carried by the black screen instead of colored fringes.
- Light tones grow round ink dots from cell centers. Darker tones continue growing those same circles to a radius capped inside the screen cell, preserving round edges without clipping dots into squares.
- Per-cell tone is sampled from a light local blur at the rotated cell center, giving each printed mark one stable size.
- Global pixel coordinates keep screen geometry aligned across export tiles.
