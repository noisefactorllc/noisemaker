#version 300 es

/*
 * Media mixer shader.
 * Samples the configured media texture as a luminance mask for interpolating between two synth inputs.
 * Placement controls map UI scale, offset, and tiling into normalized coordinates so the mask stays aligned across aspect ratios.
 */


precision highp float;
precision highp int;

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform sampler2D imageTex;
uniform vec2 imageSize;
uniform int source;
uniform vec2 resolution;
uniform float time;
uniform float seed;
uniform int mixDirection;
uniform float cutoff;
uniform int position;
uniform float rotation;
uniform float scaleAmt;
uniform float offsetX;
uniform float offsetY;
uniform int tiling;
out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

vec2 rotate2D(vec2 st, float rot) {
    rot = map(rot, -180.0, 180.0, 0.5, -0.5);
    float angle = rot * TAU * -1.0;
    // angle = PI * time * 2.0; // animate rotation

    // extra code here to handle aspect ratio of camera output
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
}

vec4 getImage(vec2 st) {
    vec2 size = imageSize;
    st = gl_FragCoord.xy / size;    
    st.x += 1.0 / resolution.x;
    st.y -= 1.0 / resolution.y;
    st.y = 1.0 - st.y;
    
    float scale = 100.0 / scaleAmt; // 25 - 400 maps to 100 / 25 (4) to 100 / 400 (0.25)
    
    if (scale == 0.0) {
        scale = 1.0;
    }
    st *= scale;
    
    // need to subtract 50% of image width and height 
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
    vec4 text = texture(imageTex, st);
    
    if (st.x < 0.0 || st.x > 1.0 || st.y < 0.0 || st.y > 1.0) {
        // don't draw texture if out of coordinate bounds
        return vec4(0.0);
    } 
    
    return text;
}

void main() {
    vec4 color = vec4(0.0, 0.0, 1.0, 1.0);
    vec2 st = gl_FragCoord.xy / resolution;
    st.y = 1.0 - st.y;

    vec4 color1 = texture(inputTex, st);
    vec4 color2 = texture(tex, st);
    vec4 mixer = getImage(st);

    float luminosity = 0.2126 * mixer.r + 0.7152 * mixer.g + 0.0722 * mixer.b;
    luminosity *= (cutoff * 0.01);
    if (mixDirection == 0) {
        color = mix(color1, color2, luminosity);
    } else {
        color = mix(color2, color1, luminosity);
    }

    fragColor = color;
}
