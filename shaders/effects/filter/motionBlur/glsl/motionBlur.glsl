/*
 * Motion Blur - Simple frame blending shader.
 * Mixes current input with previous frame for a motion blur effect.
 * Amount 0-100 maps to mix factor (stronger at higher values).
 */

#ifdef GL_ES
precision highp float;
precision highp int;
#endif

uniform sampler2D inputTex;   // Live input from previous effect
uniform sampler2D selfTex;    // Feedback buffer (previous frame output)
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float amount;
uniform bool resetState;

out vec4 fragColor;

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 uv = gl_FragCoord.xy / resolution;

    // If resetState is true, bypass feedback and return input directly
    if (resetState) {
        fragColor = texture(inputTex, uv);
        return;
    }

    vec4 current = texture(inputTex, uv);
    vec4 previous = texture(selfTex, uv);
    
    // Map amount 0-100 to 0-0.8 (clamped)
    float mixFactor = clamp(amount * 0.008, 0.0, 0.98);
    
    fragColor = mix(current, previous, mixFactor);
}
