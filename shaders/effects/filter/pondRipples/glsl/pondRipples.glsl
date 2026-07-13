/*
 * Pond Ripples - concentric ring distortion around the fixed image center.
 *
 * r = distance from center (aspect-corrected, tile-aware global UV);
 * phase = r * ridges * 2*PI; w = sin(phase) * amountGain * 0.05 *
 * (1 - r) is the per-ring wave displacement, damped toward the image
 * edge - and exactly 0 at r=0 (the center pixel) regardless of the
 * damping term, since sin(0)=0, which keeps the polar reconstruction
 * singularity-free.
 *
 * aroundCenter (style 0) rotates the sample's angular position by
 * w*2*PI*0.25 with the radius unchanged (tangential swirl).
 * outFromCenter (style 1) adds w to the radius with the angle unchanged
 * (radial compression/expansion). pondRipples (style 2) does both at
 * half strength for a combined diagonal ripple.
 *
 * The rotation is expressed as GLSL's mat2(co,-s,s,co) * dir, which is
 * the R(-angle) rotation matrix (GLSL mat2 constructors are
 * column-major: mat2(co,-s,s,co) has column0=(co,-s), column1=(s,co),
 * i.e. the matrix [[co,s],[-s,co]]). See pondRipples.wgsl for why the
 * WGSL port must use the manual expansion
 * (co*p.x + s*p.y, -s*p.x + co*p.y), not the naive-looking
 * (co*p.x - s*p.y, s*p.x + co*p.y), to match this numerically.
 *
 * Wrap mode and antialiasing match filter/pinch.
 */

#ifdef GL_ES
precision highp float;
#endif

// STYLE and WRAP are compile-time defines injected by the runtime (see
// definition.js `globals.style.define` / `globals.wrap.define`). The
// #ifndef guards below are only a standalone-compile fallback.
#ifndef STYLE
#define STYLE 2
#endif

#ifndef WRAP
#define WRAP 0
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float amount;
uniform int ridges;
uniform bool antialias;

out vec4 fragColor;

#define PI 3.14159265359

void main() {
    float aspectRatio = fullResolution.x / fullResolution.y;
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 uv = globalCoord / fullResolution;

    uv -= 0.5;
    uv.x *= aspectRatio;

    float r = length(uv);
    float phase = r * float(ridges) * 2.0 * PI;
    // Clamp the damping term at 0 so corners beyond r=1 (aspect ratios
    // wider/taller than ~1.73:1) don't invert phase and amplify instead
    // of damping.
    float damping = max(0.0, 1.0 - r);
    float w;
    if (amount <= 30.0) {
        // Preserve the original 0..30 response, including the exact shipped
        // default expression at amount=30.
        w = sin(phase) * (amount / 100.0) * 0.05 * damping;
    } else {
        // Continue smoothly from the original default slope, then accelerate
        // toward a 2.0 gain at amount=100 (twice the previous maximum).
        float x = (amount - 30.0) / 70.0;
        float amountGain = 0.3 + 0.7 * x + x * x;
        w = sin(phase) * amountGain * 0.05 * damping;
    }

    // Per-style effective displacement: rotDelta feeds the angular
    // rotation, rDelta feeds the radial extension. aroundCenter uses
    // only rotation, outFromCenter uses only radius, pondRipples splits
    // w evenly across both for a diagonal ripple.
    float rotDelta = 0.0;
    float rDelta = 0.0;
#if STYLE==0
    // aroundCenter
    rotDelta = w;
#elif STYLE==1
    // outFromCenter
    rDelta = w;
#else
    // pondRipples: both at half strength
    rotDelta = w * 0.5;
    rDelta = w * 0.5;
#endif

    // r>0.0 guard avoids a 0/0 direction at the exact center pixel; w is
    // always exactly 0 there (see header), so any direction would do,
    // but this keeps the math NaN-free rather than relying on that.
    vec2 dir = (r > 0.0) ? uv / r : vec2(0.0);

    float rot = rotDelta * 2.0 * PI * 0.25;
    float s = sin(rot);
    float co = cos(rot);
    vec2 rotatedDir = mat2(co, -s, s, co) * dir;

    uv = rotatedDir * (r + rDelta);

    uv.x /= aspectRatio;
    uv += 0.5;

    // Apply wrap mode
#if WRAP==0
    // mirror
    uv = abs(mod(uv + 1.0, 2.0) - 1.0);
#elif WRAP==1
    // repeat
    uv = mod(uv, 1.0);
#else
    // clamp
    uv = clamp(uv, 0.0, 1.0);
#endif

    // Convert distorted global UV back to tile-local for texture sampling.
    // Clamp to tile bounds so wrap modes don't sample past tile coverage.
    vec2 sampleUV = clamp((uv * fullResolution - tileOffset) / resolution, 0.0, 1.0);

    if (antialias) {
        vec2 dx = dFdx(sampleUV);
        vec2 dy = dFdy(sampleUV);
        vec4 col = vec4(0.0);
        col += texture(inputTex, sampleUV + dx * -0.375 + dy * -0.125);
        col += texture(inputTex, sampleUV + dx *  0.125 + dy * -0.375);
        col += texture(inputTex, sampleUV + dx *  0.375 + dy *  0.125);
        col += texture(inputTex, sampleUV + dx * -0.125 + dy *  0.375);
        fragColor = col * 0.25;
    } else {
        fragColor = texture(inputTex, sampleUV);
    }
}
