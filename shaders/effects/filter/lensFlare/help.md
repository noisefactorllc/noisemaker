# lensFlare

Additive lens flare with ghost chain, halo, and four lens types (Lens Flare)

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| brightness | float | 100 | 10-300 | Overall flare intensity as a percent; Lens Flare has no true "off" - even the minimum (10) still adds a faint flare |
| centerX | float | 0.35 | 0-1 | Horizontal position of the flare source, in normalized image coordinates |
| centerY | float | 0.35 | 0-1 | Vertical position of the flare source, in normalized image coordinates |
| lensType | int | zoom50_300 | zoom50_300:0, prime35:1, prime105:2, moviePrime:3 | Selects the ghost-chain table and which extra elements (star, doubled streak, cooler tint) are active |
| tint | color | [1.0, 0.95, 0.85] | - | Multiplies every flare element (core, streak, star, halo, ghosts) uniformly |

## Notes

- Single pass, additive over the source image: `out = clamp(src + flare, 0, 1)`, alpha copied from the source. The effect never resamples the input at a displaced position, so there is no wrap mode or antialiasing control.
- All elements sit along the flare axis `A(t) = mix(flarePos, 1 - flarePos, t)`, where `flarePos = (centerX, centerY)` and `1 - flarePos` is `flarePos` reflected across the fixed image center - `t=0` is the flare itself, `t=1` is the mirrored point on the opposite side of center, and ghosts beyond `t=1` continue past it. Distances are measured in aspect-corrected UV space so circular and hexagonal elements stay round/regular regardless of image aspect ratio.
- Universal elements (present for every `lensType`): a bright core glow at `t=0`, a horizontal anamorphic streak through the core, and a rainbow-tinted halo ring at `t=1.0` (radius 0.28 around the mirrored point; hue cycles with radius via a 3-phase cosine palette).
- The 6-point star is only drawn for **zoom50_300** and **moviePrime**.
- Ghost chain by `lensType`:
  - **zoom50_300** - 6 circular ghosts marching from the flare toward and past the mirror point (warm, teal, violet, green, and orange filled discs, plus a larger hollow ring ghost for variety).
  - **prime35** - 4 small, tight hexagonal ghosts (warm/neutral tints), true to a 35mm prime's faceted iris.
  - **prime105** - 3 large ghosts with a wider, softer edge falloff than the other lens types.
  - **moviePrime** - reuses the zoom50_300 ghost table, doubles the anamorphic streak's intensity, and multiplies the whole flare by an additional cool tint (`x vec3(0.9, 0.95, 1.1)`) on top of the `tint` parameter - the wide cyan-blue streak look of anamorphic movie lenses.
- All shape math (core, streak, star, hexagon mask, circle/ring ghosts, halo band) is built from squared distances, `cos(6*phi)`, or a 3-axis `abs(dot(...))` max, all mirror-symmetric top-to-bottom by construction - only `flarePos` itself is orientation-sensitive.
