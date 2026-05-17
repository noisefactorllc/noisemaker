/*
 * Chroma isolation effect
 * Isolate specific color with range and feathering
 * Outputs mono mask based on hue distance from target
 */

#ifdef GL_ES
precision highp float;
#endif

uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform sampler2D inputTex;
uniform float targetHue;
uniform float range;
uniform float feather;

out vec4 fragColor;

vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

float hueDistance(float h1, float h2) {
    float d = abs(h1 - h2);
    return min(d, 1.0 - d);
}

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);
    vec4 color = texture(inputTex, uv);

    vec3 hsv = rgb2hsv(color.rgb);
    float hue = hsv.x;
    float sat = hsv.y;

    float dist = hueDistance(hue, targetHue);
    
    // Apply range and feather to create smooth mask
    float inner = range;
    float outer = range + feather;
    float mask = 1.0 - smoothstep(inner, outer, dist);
    
    // Scale by saturation - desaturated colors don't have meaningful hue
    mask *= sat;

    fragColor = vec4(vec3(mask), color.a);
}
