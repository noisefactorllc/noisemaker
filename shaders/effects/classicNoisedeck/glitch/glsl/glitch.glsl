#version 300 es

/*
 * Glitch processor shader.
 * Uses deterministic noise fields to drive scanline shears, snow bursts, and channel offsets.
 * Probability controls are remapped before application so glitch bursts remain inspectable during performances.
 */


precision highp float;
precision highp int;

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float time;
uniform int seed;
uniform bool aspectLens;
uniform float xChonk;
uniform float yChonk;
uniform float glitchiness;
uniform float scanlinesAmt;
uniform float snowAmt;
uniform float vignetteAmt;
uniform float aberration;
uniform float distortion;
uniform int kernel;
uniform float levels; 
out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718
#define aspectRatio resolution.x / resolution.y

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

float f(vec2 st) {
    return prng(vec3(floor(st), float(seed))).x;
}

float bicubic(vec2 p) {
    float x = p.x;
    float y = p.y;
    float x1 = floor(x);
    float y1 = floor(y);
    float x2 = x1 + 1.;
    float y2 = y1 + 1.;
    float f11 = f(vec2(x1, y1));
    float f12 = f(vec2(x1, y2));
    float f21 = f(vec2(x2, y1));
    float f22 = f(vec2(x2, y2));
    float f11x = (f(vec2(x1 + 1., y1)) - f(vec2(x1 - 1., y1))) / 2.;
    float f12x = (f(vec2(x1 + 1., y2)) - f(vec2(x1 - 1., y2))) / 2.;
    float f21x = (f(vec2(x2 + 1., y1)) - f(vec2(x2 - 1., y1))) / 2.;
    float f22x = (f(vec2(x2 + 1., y2)) - f(vec2(x2 - 1., y2))) / 2.;
    float f11y = (f(vec2(x1, y1 + 1.)) - f(vec2(x1, y1 - 1.))) / 2.;
    float f12y = (f(vec2(x1, y2 + 1.)) - f(vec2(x1, y2 - 1.))) / 2.;
    float f21y = (f(vec2(x2, y1 + 1.)) - f(vec2(x2, y1 - 1.))) / 2.;
    float f22y = (f(vec2(x2, y2 + 1.)) - f(vec2(x2, y2 - 1.))) / 2.;
    float f11xy = (f(vec2(x1 + 1., y1 + 1.)) - f(vec2(x1 + 1., y1 - 1.)) - f(vec2(x1 - 1., y1 + 1.)) + f(vec2(x1 - 1., y1 - 1.))) / 4.;
    float f12xy = (f(vec2(x1 + 1., y2 + 1.)) - f(vec2(x1 + 1., y2 - 1.)) - f(vec2(x1 - 1., y2 + 1.)) + f(vec2(x1 - 1., y2 - 1.))) / 4.;
    float f21xy = (f(vec2(x2 + 1., y1 + 1.)) - f(vec2(x2 + 1., y1 - 1.)) - f(vec2(x2 - 1., y1 + 1.)) + f(vec2(x2 - 1., y1 - 1.))) / 4.;
    float f22xy = (f(vec2(x2 + 1., y2 + 1.)) - f(vec2(x2 + 1., y2 - 1.)) - f(vec2(x2 - 1., y2 + 1.)) + f(vec2(x2 - 1., y2 - 1.))) / 4.;
    mat4 Q = mat4(f11, f21, f11x, f21x, f12, f22, f12x, f22x, f11y, f21y, f11xy, f21xy, f12y, f22y, f12xy, f22xy);
    mat4 S = mat4(1., 0., 0., 0., 0., 0., 1., 0., -3., 3., -2., -1., 2., -2., 1., 1.);
    mat4 T = mat4(1., 0., -3., 2., 0., 0., 3., -2., 0., 1., -2., 1., 0., 0., -1., 1.);
    mat4 A = T * Q * S;
    float t = fract(p.x);
    float u = fract(p.y);
    vec4 tv = vec4(1., t, t * t, t * t * t);
    vec4 uv = vec4(1., u, u * u, u * u * u);
    return dot(tv * A, uv);
}

float map(float value, float inMin, float inMax, float outMin, float outMax) {
  	return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

float periodicFunction(float p) {
    return map(sin(p * TAU), -1.0, 1.0, 0.0, 1.0);
}

vec4 scanlines(vec4 color, vec2 st) {
    float centerDistance = length(0.5 - st) * PI * 0.5;

    float noise = periodicFunction(bicubic(st * 4.0) - time) * map(scanlinesAmt, 0.0, 100.0, 0.0, 0.5);

    float hatch = (sin(mix(st.y, st.y + noise, pow(centerDistance, 8.0)) * resolution.y * 1.5) + 1.0) * 0.5;

    color.rgb = mix(color.rgb, color.rgb * hatch, map(scanlinesAmt, 0.0, 100.0, 0.0, 0.5));
    return color;
}

vec4 snow(vec4 color, vec2 st) {
    st = gl_FragCoord.xy;
    float amt = snowAmt / 100.0;
    float noise = prng(vec3(st, time * 1000.0)).x;

    float mask;
    float maskNoise = prng(vec3(st + 10.0, time * 1000.0)).x;
    float maskNoiseSparse = clamp(maskNoise - 0.93875, 0.0, 0.06125) * 16.0;

    if (amt < .5) {
        mask = mix(0.0, maskNoiseSparse, amt * 2.0);
    } else {
        mask = mix(maskNoiseSparse, maskNoise * maskNoise, map(amt, 0.5, 1.0, 0.0, 1.0));

        if (amt > .75) {
            mask = mix(mask, 1.0, map(amt, 0.75, 1.0, 0.0, 1.0));
        }
    }

    return vec4(mix(color.rgb, vec3(noise), mask), color.a);
}

float offsets(vec2 st) {
	return prng(vec3(floor(st), 0.0)).x;
}

vec4 glitch(vec2 st) {
    vec2 freq = vec2(1.0);
    freq.x *= map(xChonk, 1.0, 100.0, 50.0, 1.0);
    freq.y *= map(yChonk, 1.0, 100.0, 50.0, 1.0);

    freq *= vec2(periodicFunction(prng(vec3(floor(st * freq), 0.0)).x - time));

    float g = map(glitchiness, 0.0, 100.0, 0.0, 1.0);

    // get drift value from somewhere far away
    float xDrift = prng(vec3(floor(st * freq) + 10.0, 0.0)).x * g;
    float yDrift = prng(vec3(floor(st * freq) - 10.0, 0.0)).x * g;

    float sparseness = map(glitchiness, 0.0, 100.0, 8.0, 2.0);

    // clamp for sparseness
	float rand = prng(vec3(floor(st * freq), 0.0)).x;
    float xOffset = clamp((periodicFunction(rand + xDrift - time)
        - periodicFunction(xDrift - time) * sparseness) * 4.0, 0.0, 1.0);

    float yOffset = clamp((periodicFunction(rand + yDrift - time)
        - periodicFunction(yDrift - time) * sparseness) * 4.0, 0.0, 1.0);

    float refract = g * .125;

    st.x = mod(st.x + sin(xOffset * TAU) * refract, 1.0);
    st.y = mod(st.y + sin(yOffset * TAU) * refract, 1.0);

    // aberration and lensing, borrowed from lens
    vec2 diff = vec2(0.5 - st);
	if (aspectLens) {
		diff = vec2(0.5 * aspectRatio, 0.5) - vec2(st.x * aspectRatio, st.y);
	}
    float centerDist = length(diff);

    float distort = 0.0;
    float zoom = 1.0;
    if (distortion < 0.0) {
        distort = map(distortion, -100.0, 0.0, -0.5, 0.0);
        zoom = map(distortion, -100.0, 0.0, 0.01, 0.0);
    } else {
        distort = map(distortion, 0.0, 100.0, 0.0, 0.5);
        zoom = map(distortion, 0.0, 100.0, 0.0, -0.25);
    }

    vec2 lensedCoords = fract((st - diff * zoom) - diff * centerDist * centerDist * distort);

    float aberrationOffset = map(aberration, 0.0, 100.0, 0.0, 0.05) * centerDist * PI * 0.5;

    float redOffset = mix(clamp(lensedCoords.x + aberrationOffset, 0.0, 1.0), lensedCoords.x, lensedCoords.x);
    vec4 red = texture(inputTex, vec2(redOffset, lensedCoords.y));

    vec4 green = texture(inputTex, lensedCoords);

    float blueOffset = mix(lensedCoords.x, clamp(lensedCoords.x - aberrationOffset, 0.0, 1.0), lensedCoords.x);
    vec4 blue = texture(inputTex, vec2(blueOffset, lensedCoords.y));

    return vec4(red.r, green.g, blue.b, green.a);
}

void main() {
	vec2 uv = gl_FragCoord.xy / resolution;

	vec4 color = vec4(0.0);

	float blendy = periodicFunction(time - offsets(uv));

	vec4 origcolor = texture(inputTex, uv);
    color = origcolor;

	color = glitch(uv);
	color = scanlines(color, uv);
    color = snow(color, uv);

	// vignette
	if (vignetteAmt < 0.0) {
		color.rgb = mix(color.rgb * 1.0 - pow(length(0.5 - uv) * 1.125, 2.0), color.rgb, map(vignetteAmt, -100.0, 0.0, 0.0, 1.0));
        color.a = max(color.a, length(0.5 - uv) * map(vignetteAmt, -100.0, 0.0, 1.0, 0.0));
	} else {
		color.rgb = mix(color.rgb, 1.0 - (1.0 - color.rgb * 1.0 - pow(length(0.5 - uv) * 1.125, 2.0)), map(vignetteAmt, 0.0, 100.0, 0.0, 1.0));
        color.a = max(color.a, length(0.5 - uv) * map(vignetteAmt, -100.0, 0.0, 1.0, 0.0));
	}

	fragColor = color;
}
