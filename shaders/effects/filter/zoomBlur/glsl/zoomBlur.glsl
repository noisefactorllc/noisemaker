/*
 * Zoom/radial blur effect
 * Creates a radial blur emanating from the center
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float strength;

out vec4 fragColor;

// PCG PRNG
uvec3 pcg(uvec3 v) {
    v = v * uint(1664525) + uint(1013904223);
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> uint(16);
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

vec3 prng(vec3 p) {
    return vec3(pcg(uvec3(p))) / float(uint(0xffffffff));
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 tileDims = vec2(texSize);
    vec2 fullRes = fullResolution.x > 0.0 ? fullResolution : tileDims;
    vec2 uv = gl_FragCoord.xy / tileDims;
    vec2 globalUV = (gl_FragCoord.xy + tileOffset) / fullRes;

    vec3 color = vec3(0.0);
    float total = 0.0;
    vec2 toCenter = globalUV - 0.5;
    
    // Randomize the lookup values to hide the fixed number of samples
    float offset = prng(vec3(12.9898, 78.233, 151.7182)).x;
    
    for (float t = 0.0; t <= 40.0; t++) {
        float percent = (t + offset) / 40.0;
        float weight = 4.0 * (percent - percent * percent);
        vec4 tex = texture(inputTex, uv + toCenter * percent * strength);
        color += tex.rgb * weight;
        total += weight;
    }
    
    color /= total;
    
    fragColor = vec4(color, 1.0);
}
