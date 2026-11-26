#version 300 es
precision highp float;

uniform vec2 resolution;
uniform float time;
uniform float speed;

out vec4 fragColor;

#define TAU 6.28318530718

// Etienne Jacob's periodic value: one smooth rise and fall per loop, offset by v
float periodicValue(float t, float v) {
    return (sin(mod(t - v, 1.0) * TAU) + 1.0) * 0.5;
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;

    // Rotate the gradient direction out and back over each loop
    // time loops 0→1 and the periodic value ends where it starts, so any speed loops cleanly
    float angle = periodicValue(time, 0.25) * TAU * speed;
    vec2 dir = vec2(cos(angle), sin(angle));

    // Project UV onto the rotating direction
    float t = dot(uv - 0.5, dir) + 0.5;

    // Map to a smooth color gradient
    vec3 color = vec3(t, t * 0.6 + 0.2, 1.0 - t);
    fragColor = vec4(color, 1.0);
}
