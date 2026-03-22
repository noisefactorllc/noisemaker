/*
 * Cel Shading - Edge Detection Pass
 * Sobel edge detection on quantized colors for outline generation
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D colorTex;
uniform float edgeWidth;
uniform float edgeThreshold;

out vec4 fragColor;

// Convert RGB to luminosity
float getLuminosity(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

int wrapCoord(int value, int size) {
    if (size <= 0) {
        return 0;
    }
    int wrapped = value % size;
    if (wrapped < 0) {
        wrapped += size;
    }
    return wrapped;
}

void main() {
    ivec2 texSize = textureSize(colorTex, 0);
    if (texSize.x == 0 || texSize.y == 0) {
        fragColor = vec4(0.0);
        return;
    }

    ivec2 coord = ivec2(gl_FragCoord.xy);

    // Sample 3x3 neighborhood with thickness scaling
    int offset = int(edgeWidth);
    float samples[9];
    int idx = 0;
    for (int ky = -1; ky <= 1; ++ky) {
        for (int kx = -1; kx <= 1; ++kx) {
            int sampleX = wrapCoord(coord.x + kx * offset, texSize.x);
            int sampleY = wrapCoord(coord.y + ky * offset, texSize.y);
            vec4 texel = texelFetch(colorTex, ivec2(sampleX, sampleY), 0);
            samples[idx] = getLuminosity(texel.rgb);
            idx++;
        }
    }

    // Sobel X kernel: [-1 0 1; -2 0 2; -1 0 1]
    float gx = -samples[0] + samples[2] - 2.0*samples[3] + 2.0*samples[5] - samples[6] + samples[8];

    // Sobel Y kernel: [-1 -2 -1; 0 0 0; 1 2 1]
    float gy = -samples[0] - 2.0*samples[1] - samples[2] + samples[6] + 2.0*samples[7] + samples[8];

    // Calculate edge magnitude
    float magnitude = sqrt(gx * gx + gy * gy);

    // Apply threshold with smoothstep for anti-aliased edges
    float edge = smoothstep(edgeThreshold * 0.5, edgeThreshold * 1.5, magnitude);

    fragColor = vec4(edge, edge, edge, 1.0);
}
