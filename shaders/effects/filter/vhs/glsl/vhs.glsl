#version 300 es

precision highp float;
precision highp int;

// VHS tracking effect - horizontal distortion with noise

uniform sampler2D inputTex;
uniform float time;
uniform float speed;

in vec2 v_texCoord;
out vec4 fragColor;

const float TAU = 6.28318530717959;

// Simple hash function
float hash(vec3 p) {
    vec3 p3 = fract(p * 0.1031);
    p3 = p3 + dot(p3, vec3(p3.y, p3.z, p3.x) + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Value noise
float valueNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    
    float c000 = hash(i);
    float c100 = hash(i + vec3(1.0, 0.0, 0.0));
    float c010 = hash(i + vec3(0.0, 1.0, 0.0));
    float c110 = hash(i + vec3(1.0, 1.0, 0.0));
    float c001 = hash(i + vec3(0.0, 0.0, 1.0));
    float c101 = hash(i + vec3(1.0, 0.0, 1.0));
    float c011 = hash(i + vec3(0.0, 1.0, 1.0));
    float c111 = hash(i + vec3(1.0, 1.0, 1.0));
    
    return mix(
        mix(mix(c000, c100, u.x), mix(c010, c110, u.x), u.y),
        mix(mix(c001, c101, u.x), mix(c011, c111, u.x), u.y),
        u.z
    );
}

float periodicValue(float t, float val) {
    return sin((t - val) * TAU) * 0.5 + 0.5;
}

float computeNoise(vec2 coord, vec2 freq, float t, float spd, vec3 baseOff, vec3 timeOff) {
    vec3 p = vec3(
        coord.x * freq.x + baseOff.x,
        coord.y * freq.y + baseOff.y,
        cos(t * TAU) * spd + baseOff.z
    );
    
    float val = valueNoise(p);
    
    if (spd != 0.0 && t != 0.0) {
        vec3 tp = vec3(
            coord.x * freq.x + timeOff.x,
            coord.y * freq.y + timeOff.y,
            timeOff.z
        );
        float timeVal = valueNoise(tp);
        float scaledTime = periodicValue(t, timeVal) * spd;
        val = periodicValue(scaledTime, val);
    }
    
    return clamp(val, 0.0, 1.0);
}

float gradValue(float yNorm, float freqY, float t, float spd) {
    float base = computeNoise(
        vec2(0.0, yNorm),
        vec2(1.0, freqY),
        t, spd,
        vec3(17.0, 29.0, 47.0),
        vec3(71.0, 113.0, 191.0)
    );
    float g = max(base - 0.5, 0.0);
    return min(g * 2.0, 1.0);
}

float scanNoise(vec2 coord, vec2 freq, float t, float spd) {
    return computeNoise(coord, freq, t, spd,
        vec3(37.0, 59.0, 83.0),
        vec3(131.0, 173.0, 211.0)
    );
}

void main() {
    vec2 dims = vec2(textureSize(inputTex, 0));
    float t = time;
    float spd = speed;
    
    float yNorm = v_texCoord.y;
    float xNorm = v_texCoord.x;
    vec2 destCoord = vec2(xNorm, yNorm);
    
    // Gradient noise (varies vertically)
    float gradDest = gradValue(yNorm, 5.0, t, spd);
    
    // Scan noise frequency
    float scanBase = floor(dims.y * 0.5) + 1.0;
    vec2 scanFreq;
    if (dims.y < dims.x) {
        scanFreq = vec2(scanBase * (dims.y / dims.x), scanBase);
    } else {
        scanFreq = vec2(scanBase, scanBase * (dims.x / dims.y));
    }
    
    // Scan noise at destination
    float scanDest = scanNoise(destCoord, scanFreq, t, spd * 100.0);
    
    // Horizontal shift
    float shiftAmount = floor(scanDest * dims.x * gradDest * gradDest);
    float srcX = v_texCoord.x - shiftAmount / dims.x;
    srcX = fract(srcX);  // Wrap
    
    vec2 srcCoord = vec2(srcX, v_texCoord.y);
    vec4 srcTexel = texture(inputTex, srcCoord);
    
    // Scan noise at source for blending
    float srcXNorm = srcX;
    float scanSource = scanNoise(vec2(srcXNorm, yNorm), scanFreq, t, spd * 100.0);
    float gradSource = gradValue(yNorm, 5.0, t, spd);
    
    // Blend with scan noise
    vec4 noiseColor = vec4(vec3(scanSource), 1.0);
    vec4 blended = mix(srcTexel, noiseColor, gradSource);
    
    fragColor = blended;
}
