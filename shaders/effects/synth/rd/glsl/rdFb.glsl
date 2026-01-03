#version 300 es

/*
 * Reaction-diffusion feedback shader.
 * Runs the Gray-Scott update step on the low-resolution feedback buffer with adjustable feed/kill constants.
 * Stability parameters are clamped to safe ranges so the solver cannot explode during performances.
 */

precision highp float;
precision highp int;

uniform float time;
uniform int seed;
uniform vec2 resolution;
uniform sampler2D bufTex;
uniform float feed;
uniform float kill;
uniform float rate1;
uniform float rate2;
uniform float speed;
uniform float weight;
uniform int sourceF;
uniform int sourceK;
uniform int sourceR1;
uniform int sourceR2;
uniform float zoom;

uniform sampler2D inputTex;
uniform bool resetState;

out vec4 fragColor;
#define aspectRatio resolution.x / resolution.y

vec3 lp(sampler2D tex, vec2 uv, vec2 size) {
	vec3 val = vec3(0.0);

	val += texture(tex, (uv + vec2(-1, -1)) / size).rgb * 0.05;
	val += texture(tex, (uv + vec2(0, -1)) / size).rgb * 0.2;
	val += texture(tex, (uv + vec2(1, -1)) / size).rgb * 0.05;
	val += texture(tex, (uv + vec2(-1, 0)) / size).rgb * 0.2;
	val += texture(tex, (uv + vec2(0, 0)) / size).rgb * -1.0;
	val += texture(tex, (uv + vec2(1, 0)) / size).rgb * 0.2;
	val += texture(tex, (uv + vec2(-1, 1)) / size).rgb * 0.05;
	val += texture(tex, (uv + vec2(0, 1)) / size).rgb * 0.2;
	val += texture(tex, (uv + vec2(1, 1)) / size).rgb * 0.05;

	return val;
}

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

float lum(vec3 color) {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

float hash(vec2 p) {
    vec2 p2 = fract(p * vec2(0.1031, 0.1030));
    p2 += dot(p2, p2.yx + 33.33);
    return fract((p2.x + p2.y) * p2.x);
}

void main() {
    ivec2 texSize = textureSize(bufTex, 0);
    vec4 tex = texture(bufTex, gl_FragCoord.xy/vec2(texSize));
	float a = tex.r;
	float b = tex.g;

    // Check if buffer is empty (first frame initialization) or reset requested
    // Sample all channels to detect truly empty buffer
    bool bufferIsEmpty = (tex.r == 0.0 && tex.g == 0.0 && tex.b == 0.0 && tex.a == 0.0);
    
    if (bufferIsEmpty || resetState) {
        // Initialize: A=1 everywhere, B=1 at sparse random locations
        a = 1.0;
        b = 0.0;
        if (hash(gl_FragCoord.xy + vec2(float(seed))) > 0.99) {
            b = 1.0;
        }
        // Return initial state without running update step
        fragColor = vec4(a, b, 0.0, 1.0);
        return;
    }

	vec3 color = lp(bufTex, gl_FragCoord.xy, vec2(texSize));

    vec2 prevFrameCoord = gl_FragCoord.xy/vec2(texSize);
    prevFrameCoord.y = 1.0 - prevFrameCoord.y;

    vec3 prevFrame = texture(inputTex, prevFrameCoord).rgb;

    float prevLum = lum(prevFrame);

	float f = feed * 0.001;
	float k = kill * 0.001;
	float r1 = rate1 * 0.01;
	float r2 = rate2 * 0.01;
    
    float s = speed * 0.01;

    if (sourceF > 0) {
        float val = prevLum;

        if (sourceF == 2) {
            val = 1.0 - prevLum;
        } else if (sourceF == 3) {
            val = prevFrame.r;
        } else if (sourceF == 4) {
            val = prevFrame.g;
        } else if (sourceF == 5) {
            val = prevFrame.b;
        }

        val = map(val, 0.0, 1.0, 0.01, 0.11);
        f = mix(f, val, weight * 0.01);   
    }

    if (sourceK > 0) {
        float val = prevLum;

        if (sourceK == 2) {
            val = 1.0 - prevLum;
        } if (sourceK == 3) {
            val = prevFrame.r;
        } else if (sourceK == 4) {
            val = prevFrame.g;
        } else if (sourceK == 5) {
            val = prevFrame.b;
        }

        val = map(val, 0.0, 1.0, 0.045, 0.07);
        k = mix(k, val, weight * 0.01);   
    }

    if (sourceR1 > 0) {
        float val = prevLum;

        if (sourceR1 == 2) {
            val = 1.0 - prevLum;
        } if (sourceR1 == 3) {
            val = prevFrame.r;
        } else if (sourceR1 == 4) {
            val = prevFrame.g;
        } else if (sourceR1 == 5) {
            val = prevFrame.b;
        }

        val = map(val, 0.0, 1.0, 0.5, 1.2);
        r1 = mix(r1, val, weight * 0.01);   
    }

    if (sourceR2 > 0) {
        float val = prevLum;

        if (sourceR2 == 2) {
            val = 1.0 - prevLum;
        } if (sourceR2 == 3) {
            val = prevFrame.r;
        } else if (sourceR2 == 4) {
            val = prevFrame.g;
        } else if (sourceR2 == 5) {
            val = prevFrame.b;
        }

        val = map(val, 0.0, 1.0, 0.2, 0.5);
        r2 = mix(r2, val, weight * 0.01);   
    }

	float a2 = a + (r1 * color.r - a * b * b + f * (1.0 - a)) * s;
	float b2 = b + (r2 * color.g + a * b * b - (k + f) * b) * s;

	// Clamp to [0,1] for numerical stability
	a2 = clamp(a2, 0.0, 1.0);
	b2 = clamp(b2, 0.0, 1.0);

	fragColor = vec4(a2, b2, 0.0, 1.0);
}
