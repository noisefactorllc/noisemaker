#version 300 es
precision highp float;
precision highp int;

// Standard uniforms
uniform float time;
uniform vec2 resolution;

// Effect parameters
uniform int maxIter;
uniform int minIter;
uniform int mode;
uniform float centerX;
uniform float centerY;
uniform float zoom;

// Input textures
uniform sampler2D xyzTex;
uniform sampler2D velTex;
uniform sampler2D rgbaTex;

// MRT outputs (3 — matches pointsEmit layout)
layout(location = 0) out vec4 outXYZ;
layout(location = 1) out vec4 outVel;
layout(location = 2) out vec4 outRGBA;

uint hash_uint(uint s) {
    uint state = s * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

float hash(uint s) {
    return float(hash_uint(s)) / 4294967295.0;
}

// Map complex z to screen [0,1] — rotated CW 90° for traditional Buddhabrot orientation
vec2 complexToScreen(vec2 z) {
    return vec2(
        (z.y - centerY) * zoom * zoom * 0.2 + 0.5,
        (centerX - z.x) * zoom * zoom * 0.2 + 0.5
    );
}

// Cardioid + period-2 bulb test
bool inMandelbrotInterior(float cRe, float cIm) {
    float y2 = cIm * cIm;
    float q = (cRe - 0.25) * (cRe - 0.25) + y2;
    if (q * (q + (cRe - 0.25)) <= 0.25 * y2) return true;
    float xp1 = cRe + 1.0;
    return xp1 * xp1 + y2 <= 0.0625;
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 texSize = textureSize(xyzTex, 0);
    int stateSize = texSize.x;

    vec4 pos = texelFetch(xyzTex, coord, 0);
    vec4 vel = texelFetch(velTex, coord, 0);
    vec4 col = texelFetch(rgbaTex, coord, 0);

    if (pos.w < 0.5) {
        outXYZ = pos;
        outVel = vel;
        outRGBA = col;
        return;
    }

    // Seed varies per agent and per respawn cycle via time
    uint agentSeed = hash_uint(uint(coord.x + coord.y * stateSize))
                   ^ uint(time * 65536.0)
                   ^ uint(vel.z * 137.0);

    bool needsInit = pos.z < 0.25;

    if (needsInit) {
        float cRe = hash(agentSeed) * 3.5 - 2.5;
        float cIm = hash(agentSeed + 1u) * 3.0 - 1.5;

        // Cardioid + bulb rejection for standard mode
        if (mode == 0 && inMandelbrotInterior(cRe, cIm)) {
            outXYZ = vec4(pos.xy, 0.0, 0.0);
            outVel = vel;
            outRGBA = vec4(0.0, 0.0, 0.0, 0.0);
            return;
        }

        // Test orbit to classify
        vec2 z = vec2(0.0);
        int escapeAt = 0;
        int iterCap = min(maxIter, 2048);

        for (int i = 0; i < 2048; i++) {
            if (i >= iterCap) break;
            float zr = z.x * z.x - z.y * z.y + cRe;
            float zi = 2.0 * z.x * z.y + cIm;
            z = vec2(zr, zi);
            if (dot(z, z) > 4.0) {
                escapeAt = i + 1;
                break;
            }
        }

        bool escaped = escapeAt > 0;
        float escapeStep = 0.0;
        float brightness = 0.0;

        if (mode == 0) {
            if (escaped && escapeAt >= minIter) {
                escapeStep = float(escapeAt);
                brightness = 0.03;
            }
        } else {
            if (!escaped) {
                escapeStep = float(iterCap);
                brightness = 0.03;
            }
        }

        // Non-qualifying orbit — signal death for pointsEmit respawn
        if (brightness == 0.0) {
            outXYZ = vec4(pos.xy, 0.0, 0.0);
            outVel = vel;
            outRGBA = vec4(0.0, 0.0, 0.0, 0.0);
            return;
        }

        // Start deposit at z₁ = c
        vec2 screen = complexToScreen(vec2(cRe, cIm));

        outXYZ = vec4(screen, 0.5, 1.0);
        outVel = vec4(cRe, cIm, 1.0, escapeStep);
        outRGBA = vec4(brightness, brightness, brightness, 1.0);
        return;
    }

    // ---- Active deposit phase ----
    // Recompute z from scratch using c and step count (no texture dependency)

    float cRe = vel.x;
    float cIm = vel.y;
    float step = vel.z;
    float escapeStep = vel.w;

    // Recompute z to current step from z₀ = 0
    vec2 z = vec2(0.0);
    int currentStep = int(step);
    for (int i = 0; i < 2048; i++) {
        if (i >= currentStep) break;
        float zr = z.x * z.x - z.y * z.y + cRe;
        float zi = 2.0 * z.x * z.y + cIm;
        z = vec2(zr, zi);
    }

    // Advance 8 more steps
    for (int s = 0; s < 8; s++) {
        step += 1.0;

        if (step >= escapeStep) {
            outXYZ = vec4(pos.xy, 0.0, 0.0);
            outVel = vec4(0.0, 0.0, step, 0.0);
            outRGBA = vec4(0.0, 0.0, 0.0, 0.0);
            return;
        }

        float zr = z.x * z.x - z.y * z.y + cRe;
        float zi = 2.0 * z.x * z.y + cIm;
        z = vec2(zr, zi);
    }

    vec2 screen = complexToScreen(z);

    outXYZ = vec4(screen, 0.5, 1.0);
    outVel = vec4(cRe, cIm, step, escapeStep);
    outRGBA = col;
}
