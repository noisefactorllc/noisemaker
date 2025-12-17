/*
 * Flip/Mirror effect
 * Apply horizontal/vertical flipping and various mirroring modes
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform int flipMode;

out vec4 fragColor;

void main() {
    ivec2 texSize = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);

    if (flipMode == 1) {
        // flip both
        uv.x = 1.0 - uv.x;
        uv.y = 1.0 - uv.y;
    } else if (flipMode == 2) {
        // flip horizontal
        uv.x = 1.0 - uv.x;
    } else if (flipMode == 3) {
        // flip vertical
        uv.y = 1.0 - uv.y;
    } else if (flipMode == 11) {
        // mirror left to right
        if (uv.x > 0.5) {
            uv.x = 1.0 - uv.x;
        }
    } else if (flipMode == 12) {
        // mirror right to left
        if (uv.x < 0.5) {
            uv.x = 1.0 - uv.x;
        }
    } else if (flipMode == 13) {
        // mirror up to down
        if (uv.y > 0.5) {
            uv.y = 1.0 - uv.y;
        }
    } else if (flipMode == 14) {
        // mirror down to up
        if (uv.y < 0.5) {
            uv.y = 1.0 - uv.y;
        }
    } else if (flipMode == 15) {
        // mirror left to right, up to down
        if (uv.x > 0.5) {
            uv.x = 1.0 - uv.x;
        }
        if (uv.y > 0.5) {
            uv.y = 1.0 - uv.y;
        }
    } else if (flipMode == 16) {
        // mirror left to right, down to up
        if (uv.x > 0.5) {
            uv.x = 1.0 - uv.x;
        }
        if (uv.y < 0.5) {
            uv.y = 1.0 - uv.y;
        }
    } else if (flipMode == 17) {
        // mirror right to left, up to down
        if (uv.x < 0.5) {
            uv.x = 1.0 - uv.x;
        }
        if (uv.y > 0.5) {
            uv.y = 1.0 - uv.y;
        }
    } else if (flipMode == 18) {
        // mirror right to left, down to up
        if (uv.x < 0.5) {
            uv.x = 1.0 - uv.x;
        }
        if (uv.y < 0.5) {
            uv.y = 1.0 - uv.y;
        }
    }

    fragColor = texture(inputTex, uv);
}
