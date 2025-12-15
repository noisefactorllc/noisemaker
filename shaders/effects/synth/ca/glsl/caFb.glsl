#version 300 es

/*
 * Cellular automata feedback pass.
 *
 * This shader advances the ping-pong buffer by evaluating a neighbourhood
 * count against a curated ruleset or custom birth/survival tables provided
 * by the UI.  When `source` is set, the previous compositing stage is sampled
 * and luminance blended into the automata to support audio/video driven
 * perturbations without breaking the automata's binary storage format.
 */

precision highp float;
precision highp int;

uniform float time;
uniform float deltaTime;
uniform int frame;
uniform sampler2D bufTex;
uniform sampler2D seedTex;
uniform vec2 resolution;
uniform int ruleIndex;
uniform float speed;
uniform float weight;
uniform float seed;
uniform bool resetState;

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

uniform bool useCustom;

uniform int source;

out vec4 fragColor;

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

float lum(vec3 color) {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

/*
Rulesets

Name                    Born                Survive
-----------------------------------------------------
Classic Life            3                   23
Highlife                36                  23
Seeds                   2                   -
Coral                   38                  23
Day & Night             3678                34678
Life Without Death      3                   012345678
Replicator              1357                1357
Amoeba                  357                 1358
Maze                    3                   12345
Glider Walk             25                  4
Diamoeba                35678               5678
2x2                     36                  125
Morley                  368                 245
Anneal                  4678                35678
34 Life                 34                  34

Simple Replicator       368                 12578       
Waffles                 36                  245
Pond Life               37                  23
*/


// Determine if cell should be born based on state of neighbors (n)
bool shouldBeBorn(int n) {
    bool should = false;

    if (ruleIndex == 0 || ruleIndex == 5 || ruleIndex == 8) {
        should = n == 3;                                        // Classic Life, Life w/o Death, Maze: B3
    } else if (ruleIndex == 1 || ruleIndex == 11 || ruleIndex == 16) {
        should = n == 3 || n == 6;                              // Highlife, 2x2, Waffles: B36
    } else if (ruleIndex == 2) {
        should = n == 2;                                        // Seeds: B2
    } else if (ruleIndex == 3) {
        should = n == 3 || n == 8;                              // Coral: B38 
    } else if (ruleIndex == 4) {
        should = n == 3 || n == 6 || n == 7 || n == 8;          // Day & Night: B3678  
    } else if (ruleIndex == 6) {
        should = n == 1 || n == 3 || n == 5 || n == 7;          // Replicator: B1357
    } else if (ruleIndex == 7) {
        should = n == 3 || n == 5 || n == 7;                    // Amoeba: B357
    } else if (ruleIndex == 9) {
        should = n == 2 || n == 5;                              // Glider Walk: B25 
    } else if (ruleIndex == 10) {
        should = n == 3 || n >= 5;                              // Diamoeba: B35678
    } else if (ruleIndex == 12) {
        should = n == 3 || n == 6 || n == 8;                    // Morley: B368 
    } else if (ruleIndex == 13) {
        should = n == 4 || n == 6 || n == 7 || n == 8;          // Anneal: B4678 
    } else if (ruleIndex == 14) {
        should = n == 3 || n == 4;                              // 34 Life: B34
    } else if (ruleIndex == 15) {
        should = n == 3 || n == 6 || n == 8;                    // Simple Replicator: B368
    } else if (ruleIndex == 17) {
        should = n == 3 || n == 7;                              // Pond Life: B37
    }

    //should = n == 2 || n == 8;

    return should;
}

// Determine if cell should survive based on state of neighbors (n)
bool shouldSurvive(int n, float current) {
    bool should = false;

    if (ruleIndex == 0 || ruleIndex == 1 || ruleIndex == 3 || ruleIndex == 17) {
        should = n == 2 || n == 3;                              // Classic Life, Highlife, Coral, Pond Life: S23
    } else if (ruleIndex == 2) {
        should = false;                                         // Seeds: no survival
    } else if (ruleIndex == 4) {
        should = n == 3 || n == 4 || n == 6 || n == 7 || n == 8;  // Day & Night: S34678
    } else if (ruleIndex == 5) {
        should = true;                                          // Life w/o Death: S012345678
    } else if (ruleIndex == 6) {
        should = n == 1 || n == 3 || n == 5 || n == 7;          // Replicator: S1357
    } else if (ruleIndex == 7) {
        should = n == 1 || n == 3 || n == 5 || n == 8;          // Amoeba: S1358
    } else if (ruleIndex == 8) {
        should = n >= 1 && n <= 5;                              // Maze: S12345
    } else if (ruleIndex == 9) {
        should = n == 4;                                        // Glider Walk: S4
    } else if (ruleIndex == 10) {
        should = n >= 5;                                        // Diamoeba: S5678
    } else if (ruleIndex == 11) {
        should = n == 1 || n == 2 || n == 5;                    // 2x2: S125
    } else if (ruleIndex == 12 || ruleIndex == 16) {
        should = n == 2 || n == 4 || n == 5;                    // Morley, Waffles: S245
    } else if (ruleIndex == 13) {
        should = n == 3 || n >= 5;                              // Anneal: S35678
    } else if (ruleIndex == 14) {
        should = n == 3 || n == 4;                              // 34 Life: S34
    } else if (ruleIndex == 15) {
        should = n == 1 || n == 2 || n == 5 || n >= 7;          // Simple Replicator: S12578
    }

    //should = true;

    if (current < 0.5) should = false;

    return should;
}


int countNeighbors(vec2 uv, vec2 texelSize) {
    int count = 0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            if (x == 0 && y == 0) continue;
            vec2 offset = vec2(float(x), float(y)) * texelSize;
            float n = texture(bufTex, uv + offset).r;
            count += int(n > 0.5);
        }
    }
    return count;
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

    int neighbors = countNeighbors(uv, texelSize);

    float newState = state;

    if (shouldBeBorn(neighbors)) {
        newState = 1.0;
    } else if (shouldSurvive(neighbors, state)) {
        newState = 1.0;
    } else {
        newState = 0.0;
    }

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
