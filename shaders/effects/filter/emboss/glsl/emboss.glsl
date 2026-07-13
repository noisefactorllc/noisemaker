/*
 * Emboss relief with two explicit visual contracts:
 *   0 color       - the shipped color convolution, preserved exactly
 *   1 gray  - neutral-gray directional relief with edge-local chroma
 */

#ifdef GL_ES
precision highp float;
#endif

// STYLE is a compile-time define injected by the runtime (definition.js
// globals.style.define). Baking it lets the compiler drop the unused color or
// gray path entirely instead of carrying both through a runtime branch.
#ifndef STYLE
#define STYLE 0
#endif

uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform sampler2D inputTex;
uniform float amount;
uniform float angle;
uniform float height;
uniform float colorAmount;
uniform float renderScale;

out vec4 fragColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 sampleGlobal(vec2 globalUV) {
    vec2 localUV = (globalUV * fullResolution - tileOffset) / vec2(textureSize(inputTex, 0));
    return texture(inputTex, localUV).rgb;
}

vec3 colorDefaultEmboss(vec2 uv, vec2 texelSize) {
    float kernel[9];
    kernel[0] = -2.0; kernel[1] = -1.0; kernel[2] = 0.0;
    kernel[3] = -1.0; kernel[4] = 1.0;  kernel[5] = 1.0;
    kernel[6] = 0.0;  kernel[7] = 1.0;  kernel[8] = 2.0;

    // COLOR_DEFAULT_EXACT_BEGIN
    // Copied from the pre-angle/height shader: literal offsets and arithmetic
    // order intentionally stay intact so defaults never depend on trig folding.
    vec2 offsets[9];
    offsets[0] = vec2(-texelSize.x, -texelSize.y);
    offsets[1] = vec2(0.0, -texelSize.y);
    offsets[2] = vec2(texelSize.x, -texelSize.y);
    offsets[3] = vec2(-texelSize.x, 0.0);
    offsets[4] = vec2(0.0, 0.0);
    offsets[5] = vec2(texelSize.x, 0.0);
    offsets[6] = vec2(-texelSize.x, texelSize.y);
    offsets[7] = vec2(0.0, texelSize.y);
    offsets[8] = vec2(texelSize.x, texelSize.y);

    vec3 conv = vec3(0.0);
    for (int i = 0; i < 9; i++) {
        vec3 texSample = texture(inputTex, ((uv + offsets[i] * amount * renderScale) * fullResolution - tileOffset) / vec2(textureSize(inputTex, 0))).rgb;
        conv += texSample * kernel[i];
    }
    // COLOR_DEFAULT_EXACT_END
    return conv;
}

vec3 colorGeneralEmboss(vec2 uv, vec2 texelSize) {
    float kernel[9];
    kernel[0] = -2.0; kernel[1] = -1.0; kernel[2] = 0.0;
    kernel[3] = -1.0; kernel[4] = 1.0;  kernel[5] = 1.0;
    kernel[6] = 0.0;  kernel[7] = 1.0;  kernel[8] = 2.0;

    vec2 baseOffsetsPx[9];
    baseOffsetsPx[0] = vec2(-1.0, -1.0);
    baseOffsetsPx[1] = vec2( 0.0, -1.0);
    baseOffsetsPx[2] = vec2( 1.0, -1.0);
    baseOffsetsPx[3] = vec2(-1.0,  0.0);
    baseOffsetsPx[4] = vec2( 0.0,  0.0);
    baseOffsetsPx[5] = vec2( 1.0,  0.0);
    baseOffsetsPx[6] = vec2(-1.0,  1.0);
    baseOffsetsPx[7] = vec2( 0.0,  1.0);
    baseOffsetsPx[8] = vec2( 1.0,  1.0);

    float theta = radians(angle - 135.0);
    float ct = cos(theta);
    float st = sin(theta);
    vec3 conv = vec3(0.0);
    for (int i = 0; i < 9; i++) {
        vec2 basePx = baseOffsetsPx[i];
        vec2 rotatedPx = vec2(ct * basePx.x + st * basePx.y, -st * basePx.x + ct * basePx.y) * height;
        vec2 offsetUV = rotatedPx * texelSize * amount * renderScale;
        vec3 texSample = texture(inputTex, ((uv + offsetUV) * fullResolution - tileOffset) / vec2(textureSize(inputTex, 0))).rgb;
        conv += texSample * kernel[i];
    }
    return conv;
}

vec3 grayEmboss(vec2 uv, vec3 centerRGB) {
    float theta = radians(angle);
    // This direction is a backend-independent sample delta, so GLSL and WGSL
    // use the same constant-vector expansion.
    vec2 direction = vec2(cos(theta), sin(theta));
    vec2 offsetUV = direction * (height * renderScale) / fullResolution;
    float positiveLuma = dot(sampleGlobal(uv + offsetUV), LUMA);
    float negativeLuma = dot(sampleGlobal(uv - offsetUV), LUMA);
    float signedEdge = positiveLuma - negativeLuma;
    float edgeMagnitude = abs(signedEdge);
    float relief = 0.5 + 0.5 * signedEdge;

    float centerLuma = dot(centerRGB, LUMA);
    vec3 sourceChroma = centerRGB - vec3(centerLuma);
    vec3 tracedColor = sourceChroma * edgeMagnitude * clamp(colorAmount / 100.0, 0.0, 1.0);
    return vec3(relief) + tracedColor;
}

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 resolution = vec2(textureSize(inputTex, 0));
    vec2 uv = globalCoord / fullResolution;
    vec2 texelSize = 1.0 / resolution;
    vec4 origColor = texture(inputTex, gl_FragCoord.xy / resolution);
    bool fullFrame = all(equal(tileOffset, vec2(0.0))) && all(equal(fullResolution, resolution));
    // Preserve the shipped full-frame sample delta exactly. A tiled input's
    // local texture is smaller than the print canvas, so only that path uses
    // the full-resolution pixel delta before mapping back to local UVs.
    vec2 colorTexelSize = fullFrame ? texelSize : 1.0 / fullResolution;

    vec3 result;
#if STYLE == 0
    if (angle == 135.0 && height == 1.0) {
        result = colorDefaultEmboss(uv, colorTexelSize);
    } else {
        result = colorGeneralEmboss(uv, colorTexelSize);
    }
#else
    result = grayEmboss(uv, origColor.rgb);
#endif

    fragColor = vec4(clamp(result, 0.0, 1.0), origColor.a);
}
