#version 300 es

/*
 * Displace mixer shader.
 * Offsets the input feed using auxiliary textures or noise maps to create refractive motion.
 * Displacement magnitude is clamped relative to resolution to avoid sampling outside texture bounds.
 */

precision highp float;
precision highp int;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform float time;
uniform float intensity;
uniform float direction;
uniform int mode;
uniform int mapSource;
uniform int wrap;
uniform float smoothing;
uniform float aberration;
out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718
#define aspectRatio resolution.x / resolution.y


float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

// generate a normal map using a smoothed Sobel filter
vec3 smoothedSobel(vec2 st, sampler2D mapTex) {
    float kernelX[9] = float[9](
        -1.0, 0.0, 1.0,
        -2.0, 0.0, 2.0,
        -1.0, 0.0, 1.0
    );

    float kernelY[9] = float[9](
        -1.0, -2.0, -1.0,
        0.0,  0.0,  0.0,
        1.0,  2.0,  1.0
    );

    // Gaussian weights for blurring
    float blurWeights[9] = float[9](
        0.06, 0.098, 0.06,
        0.098, 0.162, 0.098,
        0.06, 0.098, 0.06
    );

    vec2 texelSize = 1.0 / vec2(textureSize(mapTex, 0));
    vec4 tex;

    float gx = 0.0;
    float gy = 0.0;
    float weightSum = 0.0;
    float blurStrength = map(smoothing, 1.0, 100.0, 2.0, 0.1);

    for (int i = -1; i <= 1; i++) {
        for (int j = -1; j <= 1; j++) {
            vec2 offset = vec2(float(i), float(j)) * texelSize;
            tex = texture(mapTex, st + offset);
            float lum = 0.3 * tex.r + 0.59 * tex.g + 0.11 * tex.b;
            int index = (i + 1) * 3 + (j + 1);

            // scale the Gaussian blur weights based on blur strength
            float adjustedWeight = blurWeights[index] * blurStrength;

            gx += kernelX[index] * lum * adjustedWeight;
            gy += kernelY[index] * lum * adjustedWeight;
            weightSum += blurWeights[index];
        }
    }

    // normalize gradients by the sum of weights
    gx /= weightSum;
    gy /= weightSum;

    vec3 normal = normalize(vec3(gx, gy, 1.0));
    return normal;
}

vec4 refractMap(vec2 st, sampler2D mapTex, sampler2D mainTex) {
    // use smoothed Sobel filtering to generate a normal map
    vec3 normal = smoothedSobel(st, mapTex);

    // convert to 2D texture offset
    vec2 refractionOffset = normal.xy * (intensity * 0.25);
    vec4 refractedColor = texture(mainTex, st + refractionOffset);
    return refractedColor;
}


vec4 reflectMap(vec2 st, sampler2D mapTex, sampler2D mainTex) {
    // use smoothed Sobel filtering to generate a normal map
    vec3 normal = smoothedSobel(st, mapTex);

    // calculate incident vector for reflection, from center of image
    vec3 incident = vec3(normalize(st - 0.5), 100.0);

    // calculate reflection vector
    vec3 reflection = reflect(incident, normal);
    //reflection = step(0.5, reflection); // interesting
    //reflection = sin(reflection * 2.0) * 0.5 + 0.5;

    // convert to 2D texture offset
    vec2 reflectionOffset = reflection.xy * (intensity * 0.0005);
    //vec4 reflectedColor = texture(mainTex, st + reflectionOffset);
    //return reflectedColor;

    // chromatic aberration
    float chromaticIntensity = aberration * 0.001;

    vec2 redOffset = reflectionOffset * (1.0 + chromaticIntensity);
    vec2 greenOffset = reflectionOffset; // keep the green channel as the baseline
    vec2 blueOffset = reflectionOffset * (1.0 - chromaticIntensity);

    float redChannel = texture(mainTex, st + redOffset).r;
    float greenChannel = texture(mainTex, st + greenOffset).g;
    float blueChannel = texture(mainTex, st + blueOffset).b;
    float alphaChannel = texture(mainTex, st + reflectionOffset).a;

    vec4 reflectedColor = vec4(redChannel, greenChannel, blueChannel, alphaChannel);
    return reflectedColor;
}

vec2 wrapCoords(vec2 st) {
    if (wrap == 0) {
        // mirror (default)
        st = st;
    } else if (wrap == 1) {
        // repeat
        st = mod(st, 1.0);
    } else if (wrap == 2) {
        // clamp
        st = clamp(st, 0.0, 1.0);
    }
    return st;
}

void main() {
    vec4 color = vec4(0.0, 0.0, 1.0, 1.0);
    vec2 st = gl_FragCoord.xy / resolution;

    vec4 color1 = texture(inputTex, st);
    vec4 color2 = texture(tex, st);

    float lum = 0.0;
    vec2 uv = st;

    if (mode == 0) {
        // displace
        if (mapSource == 0) {
            lum = 0.3 * color1.r + 0.59 * color1.g + 0.11 * color1.b;
            float len = length(color1.rgb) + direction / 360.0;
            uv.x += cos(len * TAU) * (intensity * 0.001);
            uv.y += sin(len * TAU) * (intensity * 0.001);
            uv = wrapCoords(uv);
            color = texture(tex, uv);
        } else {
            lum = 0.3 * color2.r + 0.59 * color2.g + 0.11 * color2.b;
            float len = length(color2.rgb) + direction / 360.0;
            uv.x += cos(len * TAU) * (intensity * 0.001);
            uv.y += sin(len * TAU) * (intensity * 0.001);
            uv = wrapCoords(uv);
            color = texture(inputTex, uv);
        }
    } else if (mode == 1) {
        // refract
        if (mapSource == 0) {
            color = refractMap(st, inputTex, tex);
        } else {
            color = refractMap(st, tex, inputTex);
        }
    } else if (mode == 2) {
        // reflect
        if (mapSource == 0) {
            color = reflectMap(st, inputTex, tex);
        } else {
            color = reflectMap(st, tex, inputTex);
        }
    }

    fragColor = color;
}
