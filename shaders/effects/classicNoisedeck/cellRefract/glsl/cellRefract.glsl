#version 300 es

/*
 * Cell refract shader.
 * Uses cell-noise distance fields to refract the input feed in a controllable manner.
 * Refraction strength is normalized against resolution to avoid over-sampling artifacts.
 */

precision highp float;
precision highp int;

uniform sampler2D inputTex;
uniform float time;
uniform int seed;
uniform vec2 resolution;
uniform int metric;
uniform float scale;
uniform float cellScale;
uniform float cellSmooth;
uniform float cellVariation;
uniform float loopAmp;
uniform float refractAmt;
uniform float refractDir;
uniform int wrap;
uniform int kernel;
uniform float effectWidth;
out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718
#define aspectRatio resolution.x / resolution.y

// convolution kernels
float emboss[9];
float sharpen[9];
float blur[9];
float edge[9];
float edge2[9];

void loadKernels() {
	// kernels can be declared outside of function but values must be set inside function
	// emboss kernel
	emboss[0] = -2.0; emboss[1] = -1.0; emboss[2] = 0.0;
	emboss[3] = -1.0; emboss[4] = 1.0; emboss[5] = 1.0;
	emboss[6] = 0.0; emboss[7] = 1.0; emboss[8] = 2.0;

	// sharpen kernel
	sharpen[0] = -1.0; sharpen[1] = 0.0; sharpen[2] = -1.0;
	sharpen[3] = 0.0; sharpen[4] = 5.0; sharpen[5] = 0.0;
	sharpen[6] = -1.0; sharpen[7] = 0.0; sharpen[8] = -1.0;

	// gaussian blur kernel
	blur[0] = 1.0; blur[1] = 2.0; blur[2] = 1.0;
	blur[3] = 2.0; blur[4] = 4.0; blur[5] = 2.0;
	blur[6] = 1.0; blur[7] = 2.0; blur[8] = 1.0;

	// edge detect kernel
	edge[0] = -1.0; edge[1] = -1.0; edge[2] = -1.0;
	edge[3] = -1.0; edge[4] = 8.0; edge[5] = -1.0;
	edge[6] = -1.0; edge[7] = -1.0; edge[8] = -1.0;

	// edge detect kernel 2
	edge2[0] = -1.0; edge2[1] = 0.0; edge2[2] = -1.0;
	edge2[3] = 0.0; edge2[4] = 4.0; edge2[5] = 0.0;
	edge2[6] = -1.0; edge2[7] = 0.0; edge2[8] = -1.0;
}

vec3 convolve(vec2 uv, float kernel[9], bool divide) {
    vec2 steps = 1.0 / resolution; // 1.0 / width = 1 texel
    vec2 offset[9];
    offset[0] = vec2(-steps.x, -steps.y);   // top left
    offset[1] = vec2(0.0, -steps.y);        // top middle
    offset[2] = vec2(steps.x, -steps.y);    // top right
    offset[3] = vec2(-steps.x, 0.0);        // middle left
    offset[4] = vec2(0.0, 0.0);             //middle
    offset[5] = vec2(steps.x, 0.0);         //middle right
    offset[6] = vec2(-steps.x, steps.y);    //bottom left
    offset[7] = vec2(0.0, steps.y);         //bottom middle
    offset[8] = vec2(steps.x, steps.y);     //bottom right

    float kernelWeight = 0.0;
    vec3 conv = vec3(0.0);

    for(int i = 0; i < 9; i++){
        //sample a 3x3 grid of pixels
        vec3 color = texture(inputTex, uv + offset[i] * effectWidth).rgb;

        // multiply the color by the kernel value and add it to our conv total
        conv += color * kernel[i];

        // keep a running tally of the kernel weights
        kernelWeight += kernel[i];
    }

    // normalize the convolution by dividing by the kernel weight
    if (divide) {
        conv.rgb /= kernelWeight;
    }

    return clamp(conv.rgb, 0.0, 1.0);
}

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

// PCG PRNG - MIT License
// https://github.com/riccardoscalco/glsl-pcg-prng
uvec3 pcg(uvec3 v) {
	v = v * uint(1664525) + uint(1013904223);

	v.x += v.y * v.z;
	v.y += v.z * v.x;
	v.z += v.x * v.y;

	v ^= v >> uint(16);

	v.x += v.y * v.z;
	v.y += v.z * v.x;
	v.z += v.x * v.y;

	return v;
}

vec3 prng (vec3 p) {
	return vec3(pcg(uvec3(p))) / float(uint(0xffffffff));
}
// end PCG PRNG

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

vec3 desaturate(vec3 color) {
	float avg = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
	return vec3(avg);
}

vec3 derivatives(vec3 color, vec2 uv, bool divide) {
	// use: desaturate, get deriv_x and deriv_y and calculate dist between, then multiply by color
	vec3 dcolor = desaturate(color);

	float deriv_x[9];
	deriv_x[0] = 0.0; deriv_x[1] = 0.0; deriv_x[2] = 0.0;
	deriv_x[3] = 0.0; deriv_x[4] = 1.0; deriv_x[5] = -1.0;
	deriv_x[6] = 0.0; deriv_x[7] = 0.0; deriv_x[8] = 0.0;

	float deriv_y[9];
	deriv_y[0] = 0.0; deriv_y[1] = 0.0; deriv_y[2] = 0.0;
	deriv_y[3] = 0.0; deriv_y[4] = 1.0; deriv_y[5] = 0.0;
	deriv_y[6] = 0.0; deriv_y[7] = -1.0; deriv_y[8] = 0.0;

	vec3 s1 = convolve(uv, deriv_x, divide);
	vec3 s2 = convolve(uv, deriv_y, divide);
	float dist = distance(s1, s2);
	return color *= dist;
}

vec3 sobel(vec3 color, vec2 uv) {
	// use: desaturate, get sobel_x and sobel_y and calculate dist between, then multiply by color
	vec3 dcolor = desaturate(color);
	
	float sobel_x[9];
	sobel_x[0] = 1.0; sobel_x[1] = 0.0; sobel_x[2] = -1.0;
	sobel_x[3] = 2.0; sobel_x[4] = 0.0; sobel_x[5] = -2.0;
	sobel_x[6] = 1.0; sobel_x[7] = 0.0; sobel_x[8] = -1.0;

	float sobel_y[9];
	sobel_y[0] = 1.0; sobel_y[1] = 2.0; sobel_y[2] = 1.0;
	sobel_y[3] = 0.0; sobel_y[4] = 0.0; sobel_y[5] = 0.0;
	sobel_y[6] = -1.0; sobel_y[7] = -2.0; sobel_y[8] = -1.0;

	vec3 s1 = convolve(uv, sobel_x, false);
	vec3 s2 = convolve(uv, sobel_y, false);
	float dist = distance(s1, s2);
	return color *= dist;
}

vec3 shadow(vec3 color, vec2 uv) {
	float sobel_x[9];
	sobel_x[0] = 1.0; sobel_x[1] = 0.0; sobel_x[2] = -1.0;
	sobel_x[3] = 2.0; sobel_x[4] = 0.0; sobel_x[5] = -2.0;
	sobel_x[6] = 1.0; sobel_x[7] = 0.0; sobel_x[8] = -1.0;

	float sobel_y[9];
	sobel_y[0] = 1.0; sobel_y[1] = 2.0; sobel_y[2] = 1.0;
	sobel_y[3] = 0.0; sobel_y[4] = 0.0; sobel_y[5] = 0.0;
	sobel_y[6] = -1.0; sobel_y[7] = -2.0; sobel_y[8] = -1.0;

	color = rgb2hsv(color);

	vec3 x = convolve(uv, sobel_x, false);
	vec3 y = convolve(uv, sobel_y, false);

	float shade = distance(x, y);
	float highlight = shade * shade;
	shade = (1.0 - ((1.0 - color.z) * (1.0 - highlight))) * shade;

	// should be effectWidth
	float alpha = 0.75;
	color = vec3(color.x, color.y, mix(color.z, shade, alpha));
	return hsv2rgb(color);
}

vec3 outline(vec3 color, vec2 uv) {
    // use: desaturate, get sobel_x and sobel_y and calculate dist between, then multiply by color
    vec3 dcolor = desaturate(color);

    float sobel_x[9];
    sobel_x[0] = 1.0; sobel_x[1] = 0.0; sobel_x[2] = -1.0;
    sobel_x[3] = 2.0; sobel_x[4] = 0.0; sobel_x[5] = -2.0;
    sobel_x[6] = 1.0; sobel_x[7] = 0.0; sobel_x[8] = -1.0;

    float sobel_y[9];
    sobel_y[0] = 1.0; sobel_y[1] = 2.0; sobel_y[2] = 1.0;
    sobel_y[3] = 0.0; sobel_y[4] = 0.0; sobel_y[5] = 0.0;
    sobel_y[6] = -1.0; sobel_y[7] = -2.0; sobel_y[8] = -1.0;

    vec3 s1 = convolve(uv, sobel_x, false);
    vec3 s2 = convolve(uv, sobel_y, false);
    float dist = distance(s1, s2);

    vec3 outcolor = color - dist;
    return max(outcolor, 0.0);
}

vec3 convolution(int kernel, vec3 color, vec2 uv) {
    vec3 color1 = vec3(0.0);

    if (kernel == 0) {
        return color;
    } else if (kernel == 1) {
        color1 = convolve(uv, blur, true);
    } else if (kernel == 2) {
        // deriv divide
        color1 = derivatives(color, uv, true);
    } else if (kernel == 120) {
        // deriv
        color1 = clamp(derivatives(color, uv, false) * 2.5, 0.0, 1.0);
    } else if (kernel == 3) {
        color1 = convolve(uv, edge2, true);
        color1 = color * color1;
    } else if (kernel == 4) {
        color1 = convolve(uv, emboss, false);
    } else if (kernel == 5) {
        color1 = outline(color, uv);
    } else if (kernel == 6) {
        color1 = shadow(color, uv);
    } else if (kernel == 7) {
        color1 = convolve(uv, sharpen, false);
    } else if (kernel == 8) {
        color1 = sobel(color, uv);
    } else if (kernel == 9) {
        // lit edge
        color1 = convolve(uv, edge2, true);
        color1 = max(color, color1);
    }

    return color1;
}

float periodicFunction(float p) {
    return map(sin(p * TAU), -1.0, 1.0, 0.0, 1.0);
}

float polarShape(vec2 st, int sides) {
    float a = atan(st.x, st.y) + PI;
    float r = TAU / float(sides);
    return cos(floor(0.5 + a / r) * r - a) * length(st);
}

float shape(vec2 st, vec2 offset, int type, float scale) {
	st += offset;

	float d = 1.0;
	if (type == 0) {
        // circle
		d = length(st * 1.2);
	} else if (type == 2) {
        // hexagon
		d = polarShape(st * 1.2, 6);
	} else if (type == 3) {
        // octagon
		d = polarShape(st * 1.2, 8);
    } else if (type == 4) {
        // square
        d = polarShape(st * 1.5, 4);
	} else if (type == 6) {
        // triangle
        st.y += 0.05;
		d = polarShape(st * 1.5, 3);
    }

	return d * scale;
}

vec2 wrapEdges(vec2 st, float freq) {
    if (st.x < 0.0) st.x = freq - 1.0;
    if (st.x > freq * aspectRatio) st.x = 0.0;
    if (st.y < 0.0) st.y = freq - 1.0;
    if (st.y > freq) st.y = 0.0;
    return st;
}

// smoothmin from https://iquilezles.org/articles/smin/ - MIT License
float smin(float a, float b, float k) {
    if (k == 0.0) { return min(a, b); }
    float h = max( k-abs(a-b), 0.0 )/k;
    return min( a, b ) - h*h*k*(1.0/4.0);
}

float cells(vec2 st, float freq, float cellSize, int sides) {
	st *= freq;
	st += prng(vec3(float(seed))).xy;

	vec2 i = floor(st);
	vec2 f = fract(st);

	float d = 1.0;

	for (int y = -2; y <= 2; y++) {
		for (int x = -2; x <= 2; x++) {
			vec2 n = vec2(float(x), float(y));
			vec2 wrap = i + n;
            //wrap = wrapEdges(wrap, freq);
			vec2 point = prng(vec3(wrap, float(seed))).xy;

            vec3 r1 = prng(vec3(float(seed), wrap)) * 0.5 - 0.25; 
			vec3 r2 = prng(vec3(wrap, float(seed))) * 2.0 - 1.0;
            float speed = floor(loopAmp);
            point += vec2(sin(time * TAU * speed + r2.x) * r1.x, cos(time * TAU * speed + r2.y) * r1.y);

            vec2 diff = n + point - f;
			float dist = shape(vec2(diff.x, -diff.y), vec2(0.0), sides, cellSize);
            if (metric == 1) {
                dist = abs(n.x + point.x - f.x) + abs(n.y + point.y - f.y);
                dist *= cellSize;
            }

            dist += r1.z * (cellVariation * 0.01); // size variation
            d = smin(d, dist, cellSmooth * 0.01);
			//d = min(d, dist);
		}
	}
	return d;
}

vec3 posterize(vec3 color, float lev) {
    if (lev == 0.0) {
        return color;
    } else if (lev == 1.0) {
        lev = 2.0;
    }

    color = clamp(color, 0.0, 0.99); // avoids speckles
    color = color * lev;
    color = floor(color) + 0.5;
    color = color / lev;
    return color;
}

vec3 pixellate(vec2 uv, float size) {
    if (size <= 1.0) {
        return texture(inputTex, uv).rgb;
    }

    float dx = size * (1.0 / resolution.x);
    float dy = size * (1.0 / resolution.y);
    vec2 coord = vec2(dx * floor(uv.x / dx), dy * floor(uv.y / dy));
    return texture(inputTex, coord).rgb;
}




void main() {
    vec4 color = vec4(0.0, 0.0, 1.0, 1.0);

    vec2 st = gl_FragCoord.xy / resolution;

    loadKernels();
    float blend = 1.0;

    float freq = map(scale, 1.0, 100.0, 20.0, 1.0);
    float cellSize = map(cellScale, 1.0, 100.0, 3.0, 0.75);
    float d = cells(st * vec2(aspectRatio, 1.0), freq, cellSize, metric);
    float ref = map(refractAmt, 0.0, 100.0, 0.0, 0.125);

    float refLen = d + refractDir / 360.0;
    st.x += cos(refLen * TAU) * ref;
    st.y += sin(refLen * TAU) * ref;

    if (wrap == 1) {
        st = fract(st);
    }

    color = texture(inputTex, st);

    if (effectWidth != 0.0 && kernel != 0) {
        if (kernel == 100) {
            color.rgb = pixellate(st, effectWidth * 4.0);
        } else if (kernel == 110) {
            color.rgb = posterize(color.rgb, floor(map(effectWidth, 0.0, 10.0, 0.0, 20.0)));
        } else {
            color.rgb = convolution(kernel, color.rgb, st);
        }
    }
    
    fragColor = color;
}
