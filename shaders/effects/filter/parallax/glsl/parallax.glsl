/*
 * Pseudo-3D perspective shift driven by a height map
 * Ray-marched parallax occlusion mapping with a configurable pivot height
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform sampler2D heightMap;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform vec3 direction;
uniform float pivot;

out vec4 fragColor;

const int MARCH_STEPS = 32;
const float SHIFT_SCALE = 0.15;

// Convert RGB to luminosity
float getLuminosity(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

float getHeight(vec2 uv) {
    vec2 mapSize = vec2(textureSize(heightMap, 0));
    vec2 localUV = (uv * fullResolution - tileOffset) / mapSize;
    return getLuminosity(textureLod(heightMap, localUV, 0.0).rgb);
}

vec4 getInput(vec2 uv) {
    vec2 texSize = vec2(textureSize(inputTex, 0));
    vec2 localUV = (uv * fullResolution - tileOffset) / texSize;
    return textureLod(inputTex, localUV, 0.0);
}

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 uv = globalCoord / fullResolution;

    vec3 v = length(direction) > 0.0 ? normalize(direction) : vec3(0.0, 0.0, 1.0);
    vec2 shift = v.xy * SHIFT_SCALE;

    // Tile rendering: clamp the ray-march shift to the tile overlap budget
    // (absolute pixels in fullResolution space) so displaced samples never
    // leave the tile's rendered region. No-op when tileOffset is zero.
    bool isTileRendering = length(tileOffset) > 0.0;
    if (isTileRendering) {
        float maxDispPixels = 256.0;
        float dispPixels = length(shift * fullResolution);
        if (dispPixels > maxDispPixels) {
            shift *= maxDispPixels / dispPixels;
        }
    }

    // View ray crosses this fragment's UV at height == pivot
    float t = 1.0;
    vec2 rayUV = uv + shift * (1.0 - pivot);
    float f = t - getHeight(rayUV);

    if (f > 0.0) {
        float stepSize = 1.0 / float(MARCH_STEPS);
        for (int i = 1; i <= MARCH_STEPS; i++) {
            float prevF = f;
            vec2 prevUV = rayUV;
            t = 1.0 - float(i) * stepSize;
            rayUV = uv + shift * (t - pivot);
            f = t - getHeight(rayUV);
            if (f <= 0.0) {
                // Refine: interpolate between the straddling samples
                float w = f / (f - prevF);
                rayUV = mix(rayUV, prevUV, w);
                break;
            }
        }
    }

    fragColor = getInput(rayUV);
}
