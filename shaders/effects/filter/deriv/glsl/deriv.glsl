/*
 * Derivative-based edge detection
 * Computes image derivatives to highlight edges
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float amount;

out vec4 fragColor;

vec3 desaturate(vec3 color) {
    float avg = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    return vec3(avg);
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 resolution = vec2(texSize);
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 texelSize = 1.0 / resolution;
    
    vec4 color = texture(inputTex, uv);
    
    // Sample neighbors for derivative calculation
    vec3 center = desaturate(color.rgb);
    vec3 right = desaturate(texture(inputTex, uv + vec2(texelSize.x * amount, 0.0)).rgb);
    vec3 bottom = desaturate(texture(inputTex, uv + vec2(0.0, texelSize.y * amount)).rgb);
    
    // Compute derivatives
    vec3 dx = center - right;
    vec3 dy = center - bottom;
    
    float dist = distance(dx, dy) * 2.5;
    
    fragColor = vec4(clamp(color.rgb * dist, 0.0, 1.0), color.a);
}
