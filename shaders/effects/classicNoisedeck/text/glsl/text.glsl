#version 300 es

/*
 * Text blit shader.
 * Draws the pre-rendered glyph atlas directly to the framebuffer so layout matches the CPU text engine.
 * Normalized coordinates ensure upstream transforms can reposition text without introducing GPU drift.
 */


precision highp float;
precision highp int;

uniform sampler2D textTex;
uniform vec2 resolution;
uniform float time;
uniform int seed;
uniform vec2 glyphUV1;
uniform vec2 glyphUV2;
uniform float scale;
uniform vec2 offset;
uniform vec3 color;
out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718


void main() {
    vec2 st = gl_FragCoord.xy / resolution;
    st = glyphUV1 + st * (glyphUV2 - glyphUV1);
    st = (st - 0.5) / scale + 0.5 + offset;
	st.y = 1.0 - st.y;

	fragColor = texture(textTex, st) * vec4(color, 1.0);
}
