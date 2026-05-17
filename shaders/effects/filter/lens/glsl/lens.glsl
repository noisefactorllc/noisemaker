/*
 * Lens distortion (barrel/pincushion)
 * Warps sample coordinates radially around the frame center
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float lensDisplacement;
uniform bool aspectLens;
uniform bool antialias;

out vec4 fragColor;

const float HALF_FRAME = 0.5;

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 tileDims = vec2(texSize);
    vec2 dims = fullResolution.x > 0.0 ? fullResolution : tileDims;
    vec2 uv = (gl_FragCoord.xy + tileOffset) / dims;

    // Zoom for negative displacement (pincushion)
    float zoom = (lensDisplacement < 0.0) ? (lensDisplacement * -0.25) : 0.0;

    // Distance from center, optionally aspect-corrected for circular distortion
    float aspect = dims.x / dims.y;
    vec2 dist = uv - HALF_FRAME;
    vec2 aDist = dist;
    if (aspectLens) { aDist.x *= aspect; }

    float maxDist = length(vec2(aspectLens ? aspect * 0.5 : 0.5, 0.5));
    float distFromCenter = length(aDist);
    float normalizedDist = clamp(distFromCenter / maxDist, 0.0, 1.0);

    // Stronger effect near edges, weaker at center
    float centerWeight = 1.0 - normalizedDist;
    float centerWeightSq = centerWeight * centerWeight;

    // Apply radial distortion in aspect-corrected space
    vec2 displacement = aDist * zoom + aDist * centerWeightSq * lensDisplacement;

    // Convert displacement back to UV space
    if (aspectLens) { displacement.x /= aspect; }

    bool isTileRendering = length(tileOffset) > 0.0;
    
    // For tile rendering, limit displacement to stay within overlap
    if (isTileRendering) {
        float maxDispPixels = 256.0;
        float dispPixels = length(displacement * dims);
        if (dispPixels > maxDispPixels) {
            displacement *= maxDispPixels / dispPixels;
        }
    }

    // Non-tiling keeps the fract() wrap so normal-size output is
    // byte-identical to the pre-tile-aware shader (zero baseline
    // regression). Tiling drops the wrap (displacement is clamped above so
    // the sample stays within the tile overlap).
    vec2 warpedGlobalUV = isTileRendering ? (uv - displacement) : fract(uv - displacement);
    vec2 offset = (warpedGlobalUV * dims - tileOffset) / tileDims;
    
    vec2 sampledUV = offset;

    if (antialias) {
        vec2 dx = dFdx(sampledUV);
        vec2 dy = dFdy(sampledUV);
        vec4 col = vec4(0.0);
        
        col += texture(inputTex, sampledUV + dx * -0.375 + dy * -0.125);
        col += texture(inputTex, sampledUV + dx *  0.125 + dy * -0.375);
        col += texture(inputTex, sampledUV + dx *  0.375 + dy *  0.125);
        col += texture(inputTex, sampledUV + dx * -0.125 + dy *  0.375);
        
        fragColor = col * 0.25;
    } else {
        fragColor = texture(inputTex, sampledUV);
    }
}