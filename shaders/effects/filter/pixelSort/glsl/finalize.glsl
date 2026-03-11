#version 300 es
precision highp float;

uniform sampler2D inputTex; // sorted
uniform sampler2D originalTex; // original
uniform vec2 resolution;
uniform float angled;
uniform bool darkest;
uniform float wrap;
uniform float alpha;

out vec4 fragColor;

const float PI = 3.141592653589793;

vec2 applyWrap(vec2 coord, vec2 size) {
    vec2 uv = coord / size;
    int mode = int(wrap);
    if (mode == 0) {
        uv = abs(mod(uv + 1.0, 2.0) - 1.0);  // mirror
    } else if (mode == 1) {
        uv = fract(uv);  // repeat
    } else {
        uv = clamp(uv, 0.0, 1.0);  // clamp
    }
    return uv;
}

void main() {
    vec2 texSize = vec2(textureSize(inputTex, 0));
    vec2 center = texSize * 0.5;
    vec2 pixelCoord = gl_FragCoord.xy - center;
    
    float angle = angled;
    float rad = angle * PI / 180.0;
    float c = cos(rad);
    float s = sin(rad);
    
    // Inverse Rotate
    vec2 srcCoord;
    srcCoord.x = c * pixelCoord.x - s * pixelCoord.y;
    srcCoord.y = s * pixelCoord.x + c * pixelCoord.y;
    
    srcCoord += center;
    
    vec4 originalColor = texture(originalTex, gl_FragCoord.xy / resolution);
    vec2 wrappedUV = applyWrap(srcCoord, texSize);
    vec4 sortedColor = texture(inputTex, wrappedUV);
    
    vec4 working_source = originalColor;
    vec4 working_sorted = sortedColor;
    
    if (darkest) {
        working_source = vec4(vec3(1.0) - working_source.rgb, working_source.a);
        working_sorted = vec4(vec3(1.0) - working_sorted.rgb, working_sorted.a);
    }
    
    vec4 blended = max(working_source * alpha, working_sorted);
    blended = clamp(blended, 0.0, 1.0);
    blended.a = working_source.a;

    if (darkest) {
        blended = vec4(vec3(1.0) - blended.rgb, originalColor.a);
    } else {
        blended.a = originalColor.a;
    }

    fragColor = blended;
}
