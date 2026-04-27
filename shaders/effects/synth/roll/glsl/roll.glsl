#version 300 es
precision highp float;

uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float time;
uniform float deltaTime;
uniform vec3 lineColor;
uniform float gain;
uniform float speed;
uniform float midiClockCount;

uniform sampler2D feedbackTex;
uniform sampler2D noteGridTex;

out vec4 fragColor;

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 uv = globalCoord / fullResolution;

    // Scroll: sample feedback shifted right (notes enter at left, scroll right)
    float scrollAmount = speed * deltaTime * 0.5;
    vec2 scrollUv = vec2(uv.x - scrollAmount, uv.y);
    vec4 prev = vec4(0.0);
    if (scrollUv.x >= 0.0) {
        prev = texture(feedbackTex, scrollUv);
        prev *= 0.997;
    }

    // 16 MIDI channels as horizontal swim lanes
    float laneF = uv.y * 16.0;
    int channel = int(floor(laneF));
    float laneLocal = fract(laneF);

    // Each lane maps to MIDI keys 36-84 (C2-C6, 4 octaves)
    int keyLow = 36;
    int keyRange = 48;
    float keyExact = float(keyLow) + laneLocal * float(keyRange);
    int key = int(floor(keyExact));
    float keyFrac = fract(keyExact);

    // Sample note grid for this key and its neighbor
    float maxVel = 0.0;
    float lanePixels = fullResolution.y / 16.0;
    float keysPerPixel = float(keyRange) / lanePixels;
    int spread = max(1, int(ceil(keysPerPixel)));

    for (int dk = -spread; dk <= spread; dk++) {
        int k = clamp(key + dk, 0, 127);
        vec2 gridUv = vec2((float(k) + 0.5) / 128.0, (float(channel) + 0.5) / 16.0);
        vec4 noteData = texture(noteGridTex, gridUv);
        if (noteData.g > 0.5) {
            maxVel = max(maxVel, noteData.r);
        }
    }

    // Write new note data at the left edge
    float edgeWidth = 4.0 / fullResolution.x;
    float noteVal = 0.0;
    if (uv.x < edgeWidth && maxVel > 0.0) {
        noteVal = maxVel * gain;
    }

    // Lane separator lines
    float laneSep = 0.0;
    float laneEdge = fract(uv.y * 16.0);
    if (laneEdge < 0.02 || laneEdge > 0.98) {
        laneSep = 0.2;
    }

    // Combine
    float prevBright = max(prev.r, max(prev.g, prev.b));
    float brightness = max(prevBright, max(noteVal, laneSep));
    vec3 col = lineColor * brightness;

    fragColor = vec4(col, 1.0);
}
