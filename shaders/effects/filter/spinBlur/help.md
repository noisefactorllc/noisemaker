# spinBlur

Rotational blur around a center point (Radial Blur, Spin mode)

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| amount | float | 15 | 1-90 | Total arc span in degrees; taps are spread evenly across [-amount/2, +amount/2] around the center |
| centerX | float | 0.5 | 0-1 | Horizontal center of rotation, in normalized image coordinates |
| centerY | float | 0.5 | 0-1 | Vertical center of rotation, in normalized image coordinates |

## Notes

- Averages a fixed 32-tap comb; each tap resamples the input after rotating the pixel's offset from (centerX, centerY) by an angle evenly spaced across the `amount`-degree arc.
- Blur strength grows with distance from the center (arc length = radius x angle), so the image stays sharp near the center and smears into curved streaks farther out - the signature look of Radial Blur in Spin mode.
- Each pixel's tap comb is shifted by a random per-pixel offset (up to half an angular step) to hide banding from the fixed tap count.
- Sampling clamps at the image edges (no wrap/mirror/repeat option).
- Distinct from `filter/zoomBlur`, which covers Radial Blur Zoom mode (blur radiating outward from center) rather than Spin mode (blur curving around center).
