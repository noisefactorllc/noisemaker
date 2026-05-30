#version 300 es

/*
 * Temporal Chromatic Aberration - shift pass (one stage of the delay line).
 *
 * Copies the source stage into the destination stage, advancing the bucket-brigade shift
 * register by one frame. Alpha is preserved unchanged so the "filled" frontier (alpha 1
 * from the live input vs. alpha 0 from never-written stages) propagates exactly one stage
 * per frame, which the read pass uses for its ramp-in fallback.
 *
 * On reset, every stage is filled from the live frame instead, instantly clearing trails.
 */

precision highp float;
precision highp int;

uniform sampler2D srcTex;
uniform sampler2D liveTex;
uniform bool resetState;

out vec4 fragColor;

void main() {
    ivec2 texSize = textureSize(srcTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);

    if (resetState) {
        fragColor = texture(liveTex, uv);
        return;
    }

    fragColor = texture(srcTex, uv);
}
