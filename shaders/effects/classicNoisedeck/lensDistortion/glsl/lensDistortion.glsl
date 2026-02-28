#version 300 es

/*
 * Lens distortion shader.
 * Applies barrel, pincushion, and chromatic aberration warps using calibrated coefficients.
 * Strength controls are normalized so the warp stays invertible even under automation.
 */

precision highp float;
precision highp int;

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float time;
uniform bool aspectLens;
uniform int shape;
uniform vec3 tint;
uniform float alpha;
uniform float vignetteAmt;
uniform float distortion;
uniform float speed;
uniform float loopScale;
uniform float aberration;
uniform float hueRotation;
uniform float hueRange;
uniform int mode;
uniform bool modulate;
uniform int blendMode;
uniform float saturation;
uniform float passthru;
out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718
#define aspectRatio resolution.x / resolution.y

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

vec3 hsv2rgb(vec3 hsv) {
    float h = fract(hsv.x);
    float s = hsv.y;
    float v = hsv.z;
    
    float c = v * s; // Chroma
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = v - c;

    vec3 rgb;

    if (0.0 <= h && h < 1.0/6.0) {
        rgb = vec3(c, x, 0.0);
    } else if (1.0/6.0 <= h && h < 2.0/6.0) {
        rgb = vec3(x, c, 0.0);
    } else if (2.0/6.0 <= h && h < 3.0/6.0) {
        rgb = vec3(0.0, c, x);
    } else if (3.0/6.0 <= h && h < 4.0/6.0) {
        rgb = vec3(0.0, x, c);
    } else if (4.0/6.0 <= h && h < 5.0/6.0) {
        rgb = vec3(x, 0.0, c);
    } else if (5.0/6.0 <= h && h < 1.0) {
        rgb = vec3(c, 0.0, x);
    } else {
        rgb = vec3(0.0, 0.0, 0.0);
    }

    return rgb + vec3(m, m, m);
}

vec3 rgb2hsv(vec3 rgb) {
    float r = rgb.r;
    float g = rgb.g;
    float b = rgb.b;
    
    float max = max(r, max(g, b));
    float min = min(r, min(g, b));
    float delta = max - min;

    float h = 0.0;
    if (delta != 0.0) {
        if (max == r) {
            h = mod((g - b) / delta, 6.0) / 6.0;
        } else if (max == g) {
            h = ((b - r) / delta + 2.0) / 6.0;
        } else if (max == b) {
            h = ((r - g) / delta + 4.0) / 6.0;
        }
    }
    
    float s = (max == 0.0) ? 0.0 : delta / max;
    float v = max;

    return vec3(h, s, v);
}

vec3 hsv2rgb2(vec3 hsv) {
    vec3 rgb = vec3(0.0);

    float c = hsv.z * hsv.y;
    float x = c * (1.0 - abs((mod(hsv.x * 6.0, 2.0) - 1.0)));
    float m = hsv.z - c;

    if (hsv.x < 1.0 / 6.0) {
        rgb = vec3(c, x, 0.0);
    } else if (hsv.x < 2.0 / 6.0) {
        rgb = vec3(x, c, 0.0);
    } else if (hsv.x < 3.0 / 6.0) {
        rgb = vec3(0.0, c, x);
    } else if (hsv.x < 4.0 / 6.0) {
        rgb = vec3(0.0, x, c);
    } else if (hsv.x < 5.0 / 6.0) {
        rgb = vec3(x, 0.0, c);
    } else {
        rgb = vec3(c, 0.0, x);
    }

    rgb += m;
    return rgb;
}


vec3 rgb2hsv2(vec3 rgb) {
    vec3 hsv = vec3(0.0);

    float maxC = max(max(rgb.r, rgb.g), rgb.b);
    float minC = min(min(rgb.r, rgb.g), rgb.b);
    float diff = maxC - minC;

    if (rgb.r == maxC) {
        hsv.x = (rgb.g - rgb.b) / diff;
    } else if (rgb.g == maxC) {
        hsv.x = (rgb.b - rgb.r) / diff + 2.0;
    } else {
        hsv.x = (rgb.r - rgb.g) / diff + 4.0;
    }

    hsv.x = mod(hsv.x, 6.0) / 6.0;
    hsv.y = max(0.0, diff / maxC);
    hsv.z = maxC;

    return hsv;
}

vec3 saturate(vec3 color) {
    float sat = map(saturation, -100.0, 100.0, -1.0, 1.0);
    float avg = (color.r + color.g + color.b) / 3.0;
    color -= (avg - color) * sat;
    return color;
}

float _distance(vec2 diff, vec2 uv) {
    uv.x *= aspectRatio;
    float dist = 1.0;

    if (shape == 0) {
        // Euclidean
        dist = length(diff);
    } else if (shape == 1) {
        // Manhattan
        dist = abs(uv.x - 0.5 * aspectRatio) + abs(uv.y - 0.5);
    } else if (shape == 2) {
        // hexagon
        dist = max(max(abs(diff.x) - diff.y * -0.5, -1.0 * diff.y), max(abs(diff.x) - diff.y * 0.5, 1.0 * diff.y));
    } else if (shape == 3) {
        // octagon
        dist = max((abs(uv.x - 0.5 * aspectRatio) + abs(uv.y - 0.5)) / sqrt(2.0), max(abs(uv.x - 0.5 * aspectRatio), abs(uv.y - 0.5)));
    } else if (shape == 4) {
        // Chebychev
        dist = max(abs(uv.x - 0.5 * aspectRatio), abs(uv.y - 0.5));
    } else if (shape == 6) {
        // Triangle
        dist = max(abs(diff.x) - diff.y * -0.5, -1.0 * diff.y);
    } else if (shape == 10) {
        // Cosine
        dist = 1.0 - length(vec2((cos(diff.x * TAU) + 1.0) * 0.5, (cos(diff.y * TAU) + 1.0) * 0.5));
    }

    float lf = map(loopScale, 1.0, 100.0, 6.0, 1.0);

    float t = 1.0;
    if (speed < 0.0) {
        t = dist * lf + time;
    } else {
        t = dist * lf - time;
    }
    return mix(dist,
               (sin(t * TAU) + 1.0 * 0.5) * abs(speed) * 0.005,
               abs(speed) * 0.01);
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;

    vec4 color = vec4(0.0, 0.0, 0.0, 1.0);

    vec2 diff = 0.5 - uv;
    if (aspectLens) {
        diff = vec2(0.5 * aspectRatio, 0.5) - vec2(uv.x * aspectRatio, uv.y);
    }
    float centerDist = _distance(diff, uv);

    float distort = 0.0;
    float zoom = 1.0;
    if (distortion < 0.0) {
        distort = map(distortion, -100.0, 0.0, -2.0, 0.0);
        zoom = map(distortion, -100.0, 0.0, 0.04, 0.0);
    } else {
        distort = map(distortion, 0.0, 100.0, 0.0, 2.0);
        zoom = map(distortion, 0.0, 100.0, 0.0, -1.0);
    }


    // aberration and lensing
    vec2 lensedCoords = fract((uv - diff * zoom) - diff * centerDist * centerDist * distort);

    float aberrationOffset = map(aberration, 0.0, 100.0, 0.0, 0.05) * centerDist * PI * 0.5;

    float redOffset = mix(clamp(lensedCoords.x + aberrationOffset, 0.0, 1.0), lensedCoords.x, lensedCoords.x);
    vec4 red = texture(inputTex, vec2(redOffset, lensedCoords.y));

    vec4 green = texture(inputTex, lensedCoords);

    float blueOffset = mix(lensedCoords.x, clamp(lensedCoords.x - aberrationOffset, 0.0, 1.0), lensedCoords.x);
    vec4 blue = texture(inputTex, vec2(blueOffset, lensedCoords.y));

    //color = vec4(red.r, green.g, blue.b, color.a);

    // from aberration
    vec3 hsv = vec3(1.0);

    float t = modulate ? time : 0.0;

    if (mode == 0) {
        // chromatic
        color = vec4(red.r, green.g, blue.b, color.a) - green;
        color.a = green.a;

        // tweak hue of edges
        hsv = rgb2hsv(color.rgb);
        hsv[0] = fract(hsv[0] + (1.0 - (hueRotation / 360.0)) + hsv[0] * hueRange * 0.01 + t);
        hsv[1] = 1.0;

    } else {
        // prismatic
        // get edges
        color = vec4(length(vec4(red.r, green.g, blue.b, color.a) - green)) * green;
        color.a = green.a;

        // boost hue range of edges
        hsv = rgb2hsv(color.rgb);
        hsv[0] = fract(((hsv[0] + 0.125 + (1.0 - (hueRotation / 360.0))) * (2.0 + hueRange * 0.05)) + t);
        hsv[1] = 1.0;
    }

    // desaturate original
    green.rgb = saturate(green.rgb) * map(passthru, 0.0, 100.0, 0.0, 2.0);

    // recombine
    if (blendMode == 0) {
        // add
        color.rgb = min(green.rgb + hsv2rgb(hsv), 1.0);
    } else if (blendMode == 1) {
        // alpha
        color.rgb = min(max(green.rgb - vec3(hsv[2]), 0.0) + hsv2rgb(hsv), 1.0);
    }
    // end aberration

    // apply tint (this was the "reflect" mode from blendo)
    color.rgb = mix(color.rgb, (color.rgb == vec3(1.0)) ? color.rgb : min(tint * tint / (1.0 - color.rgb), vec3(1.0)), alpha * 0.01);
    color.a = max(color.a, alpha * 0.01);

	// vignette
	if (vignetteAmt < 0.0) {
		color.rgb = mix(color.rgb * 1.0 - pow(length(0.5 - uv) * 1.125, 2.0), color.rgb, map(vignetteAmt, -100.0, 0.0, 0.0, 1.0));
        color.a = max(color.a, length(0.5 - uv) * map(vignetteAmt, -100.0, 0.0, 1.0, 0.0));
	} else {
		color.rgb = mix(color.rgb, 1.0 - (1.0 - color.rgb * 1.0 - pow(length(0.5 - uv) * 1.125, 2.0)), map(vignetteAmt, 0.0, 100.0, 0.0, 1.0));
        color.a = max(color.a, length(0.5 - uv) * map(vignetteAmt, -100.0, 0.0, 1.0, 0.0));
	}

    fragColor = color;//vec4(color.rgb, 1.0); 
}
