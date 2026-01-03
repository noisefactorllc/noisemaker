/*
 * Media input shader.
 * Normalizes camera or video textures and exposes crop controls while preserving aspect ratio.
 * Offset sliders are remapped prior to sampling so live adjustments never read outside the source texture.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D imageTex;
uniform vec2 imageSize;
uniform vec2 resolution;
uniform float time;
uniform int seed;
uniform int position;
uniform float rotation;
uniform float scaleAmt;
uniform float offsetX;
uniform float offsetY;
uniform int tiling;
uniform int flip;
uniform vec3 backgroundColor;
uniform float backgroundOpacity;

out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

vec2 rotate2D(vec2 st, float rot) {
    rot = map(rot, -180.0, 180.0, 0.5, -0.5);
    float angle = rot * TAU * -1.0;

    // Handle aspect ratio of input media
    vec2 size = imageSize;
    float aspect = size.x / size.y;
    st -= vec2(0.5 * aspect, 0.5);
    st = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * st;
    st += vec2(0.5 * aspect, 0.5);
    return st;
}

vec2 tile(vec2 st) {
    if (tiling == 0) {
        // no tiling
        return st;
    } else if (tiling == 1) {
        // tile both
        return fract(st);
    } else if (tiling == 2) {
        // horiz only
        return vec2(fract(st.x), st.y);
    } else if (tiling == 3) {
        // vert only
        return vec2(st.x, fract(st.y));
    }
    return st;
}

vec4 getImage(vec2 st) {
    vec2 size = imageSize;
    st = gl_FragCoord.xy / size;
    st.y = 1.0 - st.y;

    float scale = 100.0 / scaleAmt;
    
    if (scale == 0.0) {
        scale = 1.0;
    }
    st *= scale;
    
    // Position adjustments based on anchor point
    if (position == 0) {
        // top left
        st.y += (resolution.y / size.y * scale) - (scale - (1.0 / size.y * scale));
    } else if (position == 1) {
        // top center
        st.x -= (resolution.x / size.x * scale * 0.5) - (0.5 - (1.0 / size.x * scale));
        st.y += (resolution.y / size.y * scale) - (scale - (1.0 / size.y * scale));
    } else if (position == 2) {
        // top right
        st.x -= (resolution.x / size.x * scale) - (1.0 - (1.0 / size.x * scale));
        st.y += (resolution.y / size.y * scale) - (scale - (1.0 / size.y * scale));
    } else if (position == 3) {
        // mid left
        st.y += (resolution.y / size.y * scale * 0.5) + (0.5 - (1.0 / size.y * scale)) - (scale);
    } else if (position == 4) {
        // mid center
        st.x -= (resolution.x / size.x * scale * 0.5) - (0.5 - (1.0 / size.x * scale));
        st.y += (resolution.y / size.y * scale * 0.5) + (0.5 - (1.0 / size.y * scale)) - (scale);
    } else if (position == 5) {
        // mid right
        st.x -= (resolution.x / size.x * scale) - (1.0 - (1.0 / size.x * scale));
        st.y += (resolution.y / size.y * scale * 0.5) + (0.5 - (1.0 / size.y * scale)) - (scale);
    } else if (position == 6) {
        // bottom left
        st.y += 1.0 - (scale - (1.0 / size.y * scale));
    } else if (position == 7) {
        // bottom center
        st.x -= (resolution.x / size.x * scale * 0.5) - (0.5 - (1.0 / size.x * scale));
        st.y += 1.0 - (scale - (1.0 / size.y * scale));
    } else if (position == 8) {
        // bottom right
        st.x -= (resolution.x / size.x * scale) - (1.0 - (1.0 / size.x * scale));
        st.y += 1.0 - (scale - (1.0 / size.y * scale));
    }

    st.x -= map(offsetX, -100.0, 100.0, -resolution.x / size.x * scale, resolution.x / size.x * scale) * 1.5;
    st.y -= map(offsetY, -100.0, 100.0, -resolution.y / size.y * scale, resolution.y / size.y * scale) * 1.5;

    // Correct for aspect ratio before rotation
    st.x *= size.x / size.y;
    st = rotate2D(st, rotation);
    st.x /= size.x / size.y;

    st = tile(st);

    // Nudge 1px up and left to center properly
    st += 1.0 / size;

    // Flip and mirror operations
    if (flip == 1) {
       // flip both
       st.x = 1.0 - st.x;
       st.y = 1.0 - st.y;
    } else if (flip == 2) {
       // flip h
       st.x = 1.0 - st.x;
    } else if (flip == 3) {
       // flip v
       st.y = 1.0 - st.y;
    } else if (flip == 11) {
       // mirror lr
       if (st.x > 0.5) {
           st.x = 1.0 - st.x;
       }
    } else if (flip == 12) {
       // mirror rl
       if (st.x < 0.5) {
           st.x = 1.0 - st.x;
       }
    } else if (flip == 13) {
       // mirror ud
       if (st.y > 0.5) {
           st.y = 1.0 - st.y;
       }
    } else if (flip == 14) {
       // mirror du
       if (st.y < 0.5) {
           st.y = 1.0 - st.y;
       }
    } else if (flip == 15) {
       // mirror lr ud
       if (st.x > 0.5) {
           st.x = 1.0 - st.x;
       }
       if (st.y > 0.5) {
           st.y = 1.0 - st.y;
       }
    } else if (flip == 16) {
       // mirror lr du
       if (st.x > 0.5) {
           st.x = 1.0 - st.x;
       }
       if (st.y < 0.5) {
           st.y = 1.0 - st.y;
       }
    } else if (flip == 17) {
       // mirror rl ud
       if (st.x < 0.5) {
           st.x = 1.0 - st.x;
       }
       if (st.y > 0.5) {
           st.y = 1.0 - st.y;
       }
    } else if (flip == 18) {
       // mirror rl du
       if (st.x < 0.5) {
           st.x = 1.0 - st.x;
       }
       if (st.y < 0.5) {
           st.y = 1.0 - st.y;
       }
    }
    
    vec4 text = texture(imageTex, st);
    
    if (st.x < 0.0 || st.x > 1.0 || st.y < 0.0 || st.y > 1.0) {
        // Don't draw texture if out of coordinate bounds
        return vec4(backgroundColor, backgroundOpacity * 0.01);
    }

    // Premultiply texture alpha
    text.rgb = text.rgb * text.a;
    
    return text;
}


void main() {
    vec2 st = gl_FragCoord.xy / resolution;
    st.y = 1.0 - st.y;

    fragColor = getImage(st);
}
