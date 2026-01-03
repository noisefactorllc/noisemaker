#version 300 es

/*
 * Pattern generator shader.
 * Produces kaleidoscope, checker, and polar repeats with deterministic offsets so the GLSL pipeline mirrors preset captures.
 * Loop and rotation controls are normalized to radians before modulation to guard against cumulative drift.
 */

precision highp float;
precision highp int;

uniform float time;
uniform int seed;
uniform vec2 resolution;
uniform int patternType;
uniform float scale;
uniform float skewAmt;
uniform float rotation;
uniform float lineWidth;
uniform int animation;
uniform float speed;
uniform float sharpness;
uniform vec3 color1;
uniform vec3 color2;
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

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

vec2 rotate2D(vec2 st, float rot) {
    rot = map(rot, 0.0, 360.0, 0.0, 2.0);
    float angle = rot * PI;
    st -= vec2(aspectRatio * 0.5, 0.5);
    st = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * st;
    st += vec2(aspectRatio * 0.5, 0.5);
    return st;
}

vec2 skew(vec2 st) {
    st = rotate2D(st, rotation);
    float x = map(skewAmt, -100.0, 100.0, -1.0, 1.0);
    vec2 uv = st;
    uv.x += (st.y * x);
    return uv;
}

vec2 applyScale(vec2 st, float freq) {
    st -= vec2(aspectRatio * 0.5, 0.5);
    st *= freq;
    st += vec2(aspectRatio * 0.5, 0.5);
    st.x -= 0.5 * aspectRatio;
    return st;
}

vec2 animate(vec2 uv, int anim, float freq) {
	float factor = speed / freq;

    if (anim == 1) {
        uv.y -= time * factor * aspectRatio;
    } else if (anim == 2) {
		uv.x += time * factor;
	} else if (anim == 3) {
		uv.x -= time * factor;
	} else if (anim == 4) {
		uv.y -= time * factor;
	} else if (anim == 5) {
		uv.y += time * factor;
	} else if (anim == 6) {
        uv = rotate2D(uv, -time * speed * 360.0); 
	} else if (anim == 7) {
		uv = rotate2D(uv, time * speed * 360.0);
	} 

	return uv;
}

float checkers(vec2 st) {
    st.x -= 0.5 * aspectRatio;
    st = fract(st) - 0.5;
    float d = step(st.x * st.y, 0.0);
    return d;
}

float waves(vec2 st) {
    st.y += cos(st.x * PI) * 0.5;
    return step(map(lineWidth, 1.0, 100.0, 0.001, 0.8), 1.0 - smoothstep(0.0, 1.0, abs(sin(st.y * PI))));
}

float zigzag(vec2 st, float freq) {
    st = fract(st);
    st.x = abs(st.x - 0.5);

    float width = map(lineWidth, 1.0, 100.0, 0.02, 0.2);
    float line = step(0.5, mod(st.x * 2.0, 2.0));
    st.y += (1.0 - 2.0 * line) * (0.25 - st.x);

    float dist = abs(st.y - 0.6) / clamp(width * freq, 0.0, 1.25);
    float alpha = 1.0 - smoothstep(0.5, 0.0, dist);
    return mix(0.0, 0.75, alpha);
}


float stripes(vec2 st) {
    return step(map(lineWidth, 1.0, 100.0, 0.05, 0.925), fract(st.y));
}

float rings(vec2 st, float freq) {
    st = skew(st);
    float dist = length(st - vec2(0.5 * aspectRatio, 0.5));
    return cos((dist - (time / freq * speed)) * freq * TAU) - map(lineWidth, 1.0, 100.0, -1.0, 0.4);
}

float dots(vec2 st) {
    return length(fract(st) - 0.5) + 0.05;
}

float shape(vec2 st, int sides) {
    st = st * 2.0 - 1.0;
    float a = atan(st.x, st.y) + PI;
    float r = TAU / float(sides);
    return cos(floor(0.5 + a / r) * r - a) * length(st);
}

float squares(vec2 st) {
    return shape(fract(st), 4) - 0.2;
}

float hexagons(vec2 st) {
    return shape(fract(st), 6) - 0.3;
}

float hearts(vec2 st) {
    //float pulse = sin(time * TAU * speed) * 0.5;
    float pulse = 1.0;
    //st = fract(st);
    st = mod(st, vec2(aspectRatio, 1.0));
    st -= vec2(0.5 * aspectRatio, 0.65);
    
    float r = length(st) * 8.0;
    st = normalize(st);
    return r - ((st.y * pow(abs(st.x), 0.75) - 0.25) / (st.y + 1.5) - (2.0) * st.y + 1.26 + pulse) - map(lineWidth, 1.0, 100.0, -0.75, -0.25);
}

float grid(vec2 st, float res) {
    return 1.0 - (shape(fract(st), 4) - 0.15);
    /*
    st *= 6.0;
    vec2 grid = fract(st * res) - map(lineWidth, 1.0, 100.0, -0.05, 0.25);
    return (step(res, grid.x) * step(res, grid.y)) ;
    */
}

float truchet(vec2 st, int truchetType) {
    vec2 uv = fract(st) - 0.5;
    vec3 r1 = prng(vec3(floor(st) + float(seed) * 1000.0, time * speed));
    // animate only certain tiles
    if (r1.x < 0.5 && r1.y > fract(time * r1.z * speed)) {
        uv.x *= -1.0;
    }

    float soft, dist, mask;
    if (truchetType == 0) {
        dist = abs(abs(uv.x + uv.y) - 0.5);
        dist = dist - map(lineWidth, 1.0, 100.0, 0.1, 0.4);
        soft = 0.01 * scale * fwidth(dist);
        mask = 1.0 - smoothstep(soft, -soft, dist);
    } else {
        vec2 cuv = uv - 0.5 * sign(uv.x + uv.y + 0.001);
        dist = length(cuv);
        dist = abs(dist - 0.5) - map(lineWidth, 1.0, 100.0, 0.05, 0.175);
        soft = 0.01 * scale * fwidth(dist);
        mask = 1.0 - smoothstep(soft, -soft, dist);
    }

    return mask;
} 

float generate(vec2 st, int ptype, float freq) {
    vec2 st2 = st;
    
    if (animation == 1) {
        st = skew(st);
        st = animate(st, animation, freq);
        st = applyScale(st, freq);
    } else {
        st = animate(st, animation, freq);
        st = applyScale(st, freq);
        st = skew(st);
    }

    float d = 0.0;
    if (ptype == 0) {
        d = checkers(st);
    } else if (ptype == 1) {
        d = dots(st);
    } else if (ptype == 2) {
        d = grid(st, 0.1);
    } else if (ptype == 3) {
        d = hearts(st);
    } else if (ptype == 4) {
        d = hexagons(st); 
    } else if (ptype == 5) {
        d = rings(st2, freq);  
    } else if (ptype == 6) {
        d = squares(st);
    } else if (ptype == 7) {
        d = stripes(st);
    } else if (ptype == 8) {
        d = waves(st);
    } else if (ptype == 9) {
        d = zigzag(st, freq);
    } else if (ptype == 10) {
        d = truchet(st, 0);
    } else if (ptype == 11) {
        d = truchet(st, 1);
    }
    return d;
}

void main() {
    vec4 color = vec4(0.0, 0.0, 1.0, 1.0);
    vec2 st = gl_FragCoord.xy / resolution.y;

    float freq = map(scale, 1.0, 100.0, 40.0, 1.0);
    float d = generate(st, patternType, freq);

    float width = map(lineWidth, 1.0, 100.0, 0.2, 0.48);
    if (patternType == 1 || patternType == 3 || patternType == 4 || patternType == 5 || patternType == 6) {
        float soft = 0.5 - (sharpness * 0.005) + fwidth(d);
        d = smoothstep(width - soft, width + soft, d);
    } else {
        float soft = 0.01 * scale * fwidth(d);
        d = smoothstep(width - soft, width + soft, d);
    }

    color.rgb = mix(color1, color2, d);

    st = gl_FragCoord.xy / resolution;

    fragColor = color;
}


/*
yes
1
3
4
5
6

no
0
2
7
8
9
10
11

*/
