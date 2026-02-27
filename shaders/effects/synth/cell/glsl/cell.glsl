#version 300 es

/*
 * Cell noise shader (simplified - mono only).
 * Generates Worley-style distance fields for use as displacement or masks.
 * Distance metrics and jitter are normalized so tiling remains seamless across seeds.
 */

precision highp float;
precision highp int;

uniform float time;
uniform int seed;
uniform vec2 resolution;
uniform int metric;
uniform float scale;
uniform float cellScale;
uniform float cellSmooth;
uniform float variation;
uniform float loopAmp;

out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718
#define aspectRatio resolution.x / resolution.y

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
    p.x = p.x >= 0.0 ? p.x * 2.0 : -p.x * 2.0 + 1.0;
    p.y = p.y >= 0.0 ? p.y * 2.0 : -p.y * 2.0 + 1.0;
    p.z = p.z >= 0.0 ? p.z * 2.0 : -p.z * 2.0 + 1.0;
    return vec3(pcg(uvec3(p))) / float(uint(0xffffffff));
}
// end PCG PRNG

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

// smoothmin from https://iquilezles.org/articles/smin/ - MIT License
float smin(float a, float b, float k) {
    if (k == 0.0) { return min(a, b); }
    float h = max( k-abs(a-b), 0.0 )/k;
    return min( a, b ) - h*h*k*(1.0/4.0);
}

float cells(vec2 st, float freq, float cellSize, int sides) {
    st -= vec2(0.5 * aspectRatio, 0.5);
	st *= freq;
    st += vec2(0.5 * aspectRatio, 0.5);
	st += prng(vec3(float(seed))).xy;


	vec2 i = floor(st);
	vec2 f = fract(st);

	float d = 1.0;

	for (int y = -2; y <= 2; y++) {
		for (int x = -2; x <= 2; x++) {
			vec2 n = vec2(float(x), float(y));
			vec2 wrap = i + n;
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

            dist += r1.z * (variation * 0.01); // size variation
            d = smin(d, dist, cellSmooth * 0.01);
		}
	}
	return d;
}

void main() {
    vec4 color = vec4(0.0, 0.0, 1.0, 1.0);
    vec2 st = gl_FragCoord.xy / resolution.y;

    float freq = map(scale, 1.0, 100.0, 20.0, 1.0);
    float cellSize = map(cellScale, 1.0, 100.0, 3.0, 0.75);

    float d = cells(st, freq, cellSize, metric);

    // Mono output only
    color.rgb = vec3(d);

    fragColor = color;
}
