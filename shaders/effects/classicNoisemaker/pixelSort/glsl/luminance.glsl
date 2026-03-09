#version 300 es
precision highp float;
precision highp int;

// GPGPU Pass 1: Compute luminance for each pixel
// Output: R = luminance, G = original x coordinate (normalized), B = 0, A = 1

uniform sampler2D inputTex;

out vec4 fragColor;

float srgb_to_lin(float value) {
    return value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4);
}

float oklab_l(vec3 rgb) {
    float r = srgb_to_lin(clamp(rgb.r, 0.0, 1.0));
    float g = srgb_to_lin(clamp(rgb.g, 0.0, 1.0));
    float b = srgb_to_lin(clamp(rgb.b, 0.0, 1.0));
    
    float l = 0.4121656120 * r + 0.5362752080 * g + 0.0514575653 * b;
    float m = 0.2118591070 * r + 0.6807189584 * g + 0.1074065790 * b;
    float s = 0.0883097947 * r + 0.2818474174 * g + 0.6302613616 * b;
    
    float l_c = pow(abs(l), 1.0 / 3.0);
    float m_c = pow(abs(m), 1.0 / 3.0);
    float s_c = pow(abs(s), 1.0 / 3.0);
    
    return 0.2104542553 * l_c + 0.7936177850 * m_c - 0.0040720468 * s_c;
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 size = textureSize(inputTex, 0);
    
    vec4 texel = texelFetch(inputTex, coord, 0);
    float lum = oklab_l(texel.rgb);
    
    // Store: luminance, normalized x position, 0, 1
    fragColor = vec4(lum, float(coord.x) / float(size.x - 1), 0.0, 1.0);
}
