#version 300 es
precision highp float;

// Wormhole Deposit Vertex Shader
// Each pixel scatters to a destination based on OKLab L channel

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float kink;
uniform float stride;
uniform float rotation;
uniform int wrap;

out vec4 vColor;

const float TAU = 6.28318530717959;

// OKLab L channel extraction (matches JS rgbToOklab -> L)
float oklabL(vec3 rgb) {
    vec3 c = clamp(rgb, 0.0, 1.0);
    float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
    float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
    float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
    float l_ = pow(max(l, 0.0), 1.0 / 3.0);
    float m_ = pow(max(m, 0.0), 1.0 / 3.0);
    float s_ = pow(max(s, 0.0), 1.0 / 3.0);
    return 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
}

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    int w = texSize.x;
    int h = texSize.y;

    if (gl_VertexID >= w * h) {
        gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
        gl_PointSize = 0.0;
        vColor = vec4(0.0);
        return;
    }

    int srcX = gl_VertexID % w;
    int srcY = gl_VertexID / w;

    vec4 src = texelFetch(inputTex, ivec2(srcX, srcY), 0);
    float lum = oklabL(src.rgb);

    // JS: deg = valuesArr[idx] * TAU * kink
    float angle = lum * TAU * kink + radians(rotation);

    // JS: stride = 1024 * inputStride
    float pixelStride = 1024.0 * stride;

    // JS: xo = (cos(deg) + 1) * stride, yo = (sin(deg) + 1) * stride
    float ox = (cos(angle) + 1.0) * pixelStride;
    float oy = (sin(angle) + 1.0) * pixelStride;

    int destX = int(floor(float(srcX) + ox));
    int destY = int(floor(float(srcY) + oy));

    // Branchless wrap modes (critical for vertex shader performance)
    if (wrap == 0) {
        // Mirror
        int mx = ((destX % (w * 2)) + w * 2) % (w * 2);
        int my = ((destY % (h * 2)) + h * 2) % (h * 2);
        destX = w - 1 - abs(mx - w + 1);
        destY = h - 1 - abs(my - h + 1);
    } else if (wrap == 2) {
        // Clamp
        destX = clamp(destX, 0, w - 1);
        destY = clamp(destY, 0, h - 1);
    } else {
        // Repeat (default)
        destX = ((destX % w) + w) % w;
        destY = ((destY % h) + h) % h;
    }

    // Convert to clip space
    float clipX = (float(destX) + 0.5) / float(w) * 2.0 - 1.0;
    float clipY = (float(destY) + 0.5) / float(h) * 2.0 - 1.0;

    gl_Position = vec4(clipX, clipY, 0.0, 1.0);
    gl_PointSize = 1.0;

    // JS: out[dest + k] += src[base + k] * lum * lum (RGB only)
    vColor = vec4(src.rgb * lum * lum, 0.0);
}
