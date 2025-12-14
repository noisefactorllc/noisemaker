#version 300 es

/*
 * Multi-neighbourhood cellular automata feedback pass.
 *
 * Evolves the automaton by sampling two concentric neighbourhoods and mapping
 * their averages through UI-configurable threshold windows. The luminance
 * blend mirrors the single-neighbourhood shader so modulation rules stay
 * consistent across module variants.
 */

precision highp float;
precision highp int;

uniform float time;
uniform float deltaTime;
uniform sampler2D bufTex;
uniform sampler2D seedTex;
uniform vec2 resolution;
uniform float speed;
uniform float weight;
uniform float seed;
uniform bool resetState;

uniform float n1v1;
uniform float n1v2;
uniform float n1v3;
uniform float n1v4;
uniform float n2v1;
uniform float n2v2;

uniform float n1r1;
uniform float n1r2;
uniform float n1r3;
uniform float n1r4;
uniform float n2r1;
uniform float n2r2;

out vec4 fragColor;

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

float lum(vec3 color) {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

// Neighbourhood 1 = circle with r = 3.
float neighborsAvgCircle(vec2 uv, vec2 texelSize) {
    float avg, total = 0.0;
    for (int y = -3; y <= 3; y++) {
        for (int x = -3; x <= 3; x++) {
            if (x == 0 && y == 0) continue;
            if (abs(x) == 3 && abs(y) > 1) continue;
            if (abs(y) == 3 && abs(x) > 1) continue;
            vec2 offset = vec2(float(x), float(y)) * texelSize;
            float n = texture(bufTex, uv + offset).r;
            total += n;
        }
    }

    avg = total / 36.0;

    return avg;
}

// Neighbourhood 2 = ring with inner r = 4 and outer r = 7.
float neighborsAvgRing(vec2 uv, vec2 texelSize) {
    float avg, total = 0.0;
    for (int y = -7; y <= 7; y++) {
        for (int x = -7; x <= 7; x++) {
            // ignore inner area
            if (abs(x) <= 3 && abs(y) <= 3) continue;
            if (abs(x) == 4 && abs(y) <= 2) continue;
            if (abs(y) == 4 && abs(x) <= 2) continue;
            // ignore outer corners 
            if (abs(x) == 7 && abs(y) > 2) continue;
            if (abs(x) == 6 && abs(y) > 4) continue;
            if (abs(x) == 5 && abs(y) > 5) continue;
            if (abs(x) > 2  && abs(y) > 6) continue;
            vec2 offset = vec2(float(x), float(y)) * texelSize;
            float n = texture(bufTex, uv + offset).r;
            total += n;
        }
    }

    avg = total / 108.0;

    return avg;
}

float getState(float avg1, float avg2, float state) {
    /*
    // from https://slackermanz.com/understanding-multiple-neighborhood-cellular-automata/
    if (avg1 >= 0.210 && avg1 <= 0.220) state = 1.0;
    if (avg1 >= 0.350 && avg1 <= 0.500) state = 0.0;
    if (avg1 >= 0.750 && avg1 <= 0.850) state = 0.0;
    if (avg2 >= 0.100 && avg2 <= 0.280) state = 0.0;
    if (avg2 >= 0.430 && avg2 <= 0.550) state = 1.0;
    if (avg1 >= 0.120 && avg1 <= 0.150) state = 0.0;
    */
    if (avg1 >= n1v1 * 0.01 && avg1 <= n1v1 * 0.01 + n1r1 * 0.01) state = 1.0;
    if (avg1 >= n1v2 * 0.01 && avg1 <= n1v2 * 0.01 + n1r2 * 0.01) state = 0.0;
    if (avg1 >= n1v3 * 0.01 && avg1 <= n1v3 * 0.01 + n1r3 * 0.01) state = 0.0;
    if (avg2 >= n2v1 * 0.01 && avg2 <= n2v1 * 0.01 + n2r1 * 0.01) state = 0.0;
    if (avg2 >= n2v2 * 0.01 && avg2 <= n2v2 * 0.01 + n2r2 * 0.01) state = 1.0;
    if (avg1 >= n1v4 * 0.01 && avg1 <= n1v4 * 0.01 + n1r4 * 0.01) state = 0.0;

    return state;
}


void main() {
    vec2 texSize = vec2(textureSize(bufTex, 0));
    vec2 uv = gl_FragCoord.xy / texSize;
    vec2 texelSize = 1.0 / texSize;

    float state = texture(bufTex, uv).r;
    
    // Sample all 4 channels to check if buffer is truly empty
    vec4 bufState = texture(bufTex, uv);
    bool bufferIsEmpty = (bufState.r == 0.0 && bufState.g == 0.0 && bufState.b == 0.0 && bufState.a == 0.0);

    // Initialize when reset button pressed or when buffer is completely empty (first load)
    if (resetState || bufferIsEmpty) {
        float r = random(uv + vec2(seed));
        float alive = step(0.5, r);
        fragColor = vec4(alive, alive, alive, 1.0);
        return;
    }

    vec3 prevFrame = texture(seedTex, uv).rgb;
    float prevLum = lum(prevFrame);

    float newState = state;
    float n1 = neighborsAvgCircle(uv, texelSize);
    float n2 = neighborsAvgRing(uv, texelSize);
    newState = getState(n1, n2, state);

    if (weight > 0.0) {
        newState = mix(newState, prevLum, weight * 0.01);
    }

    // The speed knob expresses human-friendly BPM-style values; remapping keeps
    // the integration step numerically stable across refresh rates.
    float animSpeed = map(speed, 1.0, 100.0, 0.1, 100.0);
    vec4 currentState = vec4(state, state, state, 1.0);
    vec4 nextState = vec4(newState, newState, newState, 1.0);
    fragColor = mix(currentState, nextState, min(1.0, deltaTime * animSpeed));
}
