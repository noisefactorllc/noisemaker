## Arguments

### `type`
- **Type:** Dropdown (linear, radial, conic, fourCorners).
- **Default:** `linear`.
- **Description:** The gradient style to apply.
  - **linear**: A smooth gradient transitioning through all 4 colors vertically.
  - **radial**: A circular gradient emanating from the center.
  - **conic**: An angular/sweep gradient rotating around the center.
  - **fourCorners**: Bilinear interpolation with each color at a corner.

### `rotation`
- **Type:** Number.
- **Default:** `0`.
- **Range:** 0–360.
- **Description:** Rotation angle in degrees. Rotates the gradient pattern.

### `repeat`
- **Type:** Integer.
- **Default:** `1`.
- **Range:** 1–4.
- **Description:** Number of times to repeat the gradient pattern.

### `color1`
- **Type:** Color (RGBA).
- **Default:** Red `[1, 0, 0, 1]`.
- **Description:** First gradient color. In four corners mode, this is the top-left corner.

### `color2`
- **Type:** Color (RGBA).
- **Default:** Yellow `[1, 1, 0, 1]`.
- **Description:** Second gradient color. In four corners mode, this is the top-right corner.

### `color3`
- **Type:** Color (RGBA).
- **Default:** Green `[0, 1, 0, 1]`.
- **Description:** Third gradient color. In four corners mode, this is the bottom-right corner.

### `color4`
- **Type:** Color (RGBA).
- **Default:** Blue `[0, 0, 1, 1]`.
- **Description:** Fourth gradient color. In four corners mode, this is the bottom-left corner.
