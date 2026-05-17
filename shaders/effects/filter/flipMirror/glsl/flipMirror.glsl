/*
 * Flip/Mirror effect
 * Apply horizontal/vertical flipping and various mirroring modes
 */

#ifdef GL_ES
precision highp float;
#endif

uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform sampler2D inputTex;
uniform int flipMode;

out vec4 fragColor;

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 globalUV = globalCoord / fullResolution;

    vec2 warpedUV = globalUV;

    if (flipMode == 1) {
        // flip both
        warpedUV.x = 1.0 - warpedUV.x;
        warpedUV.y = 1.0 - warpedUV.y;
    } else if (flipMode == 2) {
        // flip horizontal
        warpedUV.x = 1.0 - warpedUV.x;
    } else if (flipMode == 3) {
        // flip vertical
        warpedUV.y = 1.0 - warpedUV.y;
    } else if (flipMode == 11) {
        // mirror left to right
        if (warpedUV.x > 0.5) {
            warpedUV.x = 1.0 - warpedUV.x;
        }
    } else if (flipMode == 12) {
        // mirror right to left
        if (warpedUV.x < 0.5) {
            warpedUV.x = 1.0 - warpedUV.x;
        }
    } else if (flipMode == 13) {
        // mirror up to down
        if (warpedUV.y > 0.5) {
            warpedUV.y = 1.0 - warpedUV.y;
        }
    } else if (flipMode == 14) {
        // mirror down to up
        if (warpedUV.y < 0.5) {
            warpedUV.y = 1.0 - warpedUV.y;
        }
    } else if (flipMode == 15) {
        // mirror left to right, up to down
        if (warpedUV.x > 0.5) {
            warpedUV.x = 1.0 - warpedUV.x;
        }
        if (warpedUV.y > 0.5) {
            warpedUV.y = 1.0 - warpedUV.y;
        }
    } else if (flipMode == 16) {
        // mirror left to right, down to up
        if (warpedUV.x > 0.5) {
            warpedUV.x = 1.0 - warpedUV.x;
        }
        if (warpedUV.y < 0.5) {
            warpedUV.y = 1.0 - warpedUV.y;
        }
    } else if (flipMode == 17) {
        // mirror right to left, up to down
        if (warpedUV.x < 0.5) {
            warpedUV.x = 1.0 - warpedUV.x;
        }
        if (warpedUV.y > 0.5) {
            warpedUV.y = 1.0 - warpedUV.y;
        }
    } else if (flipMode == 18) {
        // mirror right to left, down to up
        if (warpedUV.x < 0.5) {
            warpedUV.x = 1.0 - warpedUV.x;
        }
        if (warpedUV.y < 0.5) {
            warpedUV.y = 1.0 - warpedUV.y;
        }
    }

    vec2 localUV = fract((warpedUV * fullResolution - tileOffset) / vec2(texSize));
    fragColor = texture(inputTex, localUV);
}