/*
 * Lens distortion (barrel/pincushion)
 * Warps sample coordinates radially around the frame center
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float lensDisplacement;
uniform bool aspectLens;

out vec4 fragColor;

const float HALF_FRAME = 0.5;

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 dims = vec2(texSize);
    vec2 uv = gl_FragCoord.xy / dims;

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

    vec2 offset = fract(uv - displacement);

    fragColor = texture(inputTex, offset);
}
