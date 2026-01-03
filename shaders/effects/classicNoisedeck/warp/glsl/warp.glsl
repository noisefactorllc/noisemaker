#version 300 es

/*
 * Warp distortion shader.
 * Combines pinch, bulge, ripple, and noise-driven offsets to bend the input feed without introducing UV seams.
 * Rotation and strength inputs are mapped into normalized ranges so live automation cannot drive the warp outside the framebuffer.
 */

precision highp float;
precision highp int;

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float time;
uniform int seed;
uniform bool aspectLens;
uniform int distortionType;
uniform float speed;
uniform float rotation; // rotation speed
uniform float scale;
uniform float rotateAmt;
uniform float strength;
uniform int flip;
uniform int wrap;
uniform float center;
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

vec2 rotate2D(vec2 st, float rot) {
    st.x *= aspectRatio;
    //rot = map(rot, 0.0, 360.0, 0.0, 2.0);
    float angle = rot * PI;
    st -= vec2(0.5 * aspectRatio, 0.5);
    st = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * st;
    st += vec2(0.5 * aspectRatio, 0.5);
    st.x /= aspectRatio;
    return st;
}

float smootherstep(float x) {
    return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

float smoothlerp(float x, float a, float b) {
    return a + smootherstep(x) * (b - a);
}

float grid(vec2 st, vec2 cell) {
    float angle = prng(vec3(cell, 1.0)).r * TAU;
    angle += time * TAU * speed;
    vec2 gradient = vec2(cos(angle), sin(angle));
    vec2 dist = st - cell;
    return dot(gradient, dist);
}

float perlin(vec2 st, vec2 scale) {
    st *= scale;
    vec2 cell = floor(st);    
    float tl = grid(st, cell);
    float tr = grid(st, vec2(cell.x + 1.0, cell.y));
    float bl = grid(st, vec2(cell.x, cell.y + 1.0));
    float br = grid(st, cell + 1.0);    
    float upper = smoothlerp(st.x - cell.x, tl, tr);
    float lower = smoothlerp(st.x - cell.x, bl, br);
    float val = smoothlerp(st.y - cell.y, upper, lower);    
    return val * 0.5 + 0.5;
}

vec2 pinch(vec2 uv) {
    float intensity = strength * 0.01;

    uv -= 0.5;

    if (aspectLens) {
        uv.x *= aspectRatio;
    }

    float r = length(uv);
    float effect = pow(r, 1.0 - intensity);
    uv = normalize(uv) * effect;

    if (aspectLens) {
        uv.x /= aspectRatio;
    }

    uv += 0.5;

    return uv;
}

vec2 bulge(vec2 uv) {
    float intensity = strength * -0.01;

    uv -= 0.5;

    if (aspectLens) {
        uv.x *= aspectRatio;
    }

    float r = length(uv);
    float effect = pow(r, 1.0 - intensity);
    uv = normalize(uv) * effect;

    if (aspectLens) {
        uv.x /= aspectRatio;
    }

    uv += 0.5;

    return uv;
}

vec2 spiral(vec2 uv, float direction) {
    uv -= 0.5;

    if (aspectLens) {
        uv.x *= aspectRatio;
    }

    // Convert to polar coordinates
    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // Apply spiral distortion
    float spiral = (strength * 0.05) * r * direction;
    a += spiral - (time * TAU * rotation * direction);

    // Convert back to cartesian coordinates
    uv = vec2(cos(a), sin(a)) * r;

    if (aspectLens) {
        uv.x /= aspectRatio;
    }

    uv += 0.5;
    return uv;
}

float smod(float v, float m) {
	return m * (0.75 - abs(fract(v) - 0.5) - 0.25);
}

vec2 smod(vec2 v, float m) {
    return m * (0.75 - abs(fract(v) - 0.5) - 0.25);
}

float shape(vec2 uv, int sides) {
    float a = atan(uv.x, uv.y) + PI;
    float r = TAU / float(sides);
    return cos(floor(0.5 + a / r) * r - a) * length(uv);
}

vec2 polar(vec2 uv) {
    if (aspectLens) {
        uv.x *= aspectRatio;
	    uv -= vec2(0.5 * aspectRatio, 0.5);
    } else {
        uv -= 0.5;
    }

	vec2 coord = vec2(atan(uv.y, uv.x)/TAU + 0.5, length(uv) - scale * 0.075);
    coord.x = smod(coord.x + time * -rotation, 1.0);
    coord.y = smod(coord.y + time * speed, 1.0);
    return coord;
}

vec2 vortex(vec2 uv) {
    if (aspectLens) {
        uv.x *= aspectRatio;
        uv -= vec2(0.5 * aspectRatio, 0.5);
    } else {
        uv -= 0.5;
    }

	float r2 = dot(uv, uv) - scale * 0.01;
	uv = uv / r2;
	uv.x = smod(uv.x + time * -rotation, 1.0);
	uv.y = smod(uv.y + time * speed, 1.0);
    return uv;
}

vec2 waves(vec2 uv) {
    uv.y += sin(uv.x * scale * 10.0 + time * TAU * speed) * (strength * 0.001);
    return uv;
}

vec2 perlin(vec2 uv) {
    uv.x += (perlin(uv * vec2(aspectRatio, 1.0) + float(seed), vec2(abs(scale * 3.0))) - 0.5) * strength * 0.01;
    uv.y += (perlin(uv * vec2(aspectRatio, 1.0) + float(seed) + 10.0, vec2(abs(scale * 3.0))) - 0.5) * strength * 0.01;
    return uv;
}

vec2 flipMirror(vec2 uv) {
    if (flip == 1) {
       // flip both
       uv.x = 1.0 - uv.x;
       uv.y = 1.0 - uv.y;
    } else if (flip == 2) {
       // flip h
       uv.x = 1.0 - uv.x;
    } else if (flip == 3) {
       // flip v
       uv.y = 1.0 - uv.y;
    } else if (flip == 11) {
       // mirror lr
       if (uv.x > 0.5) {
           uv.x = 1.0 - uv.x;
       }
    } else if (flip == 12) {
       // mirror rl
       if (uv.x < 0.5) {
           uv.x = 1.0 - uv.x;
       }
    } else if (flip == 13) {
       // mirror ud
       if (uv.y > 0.5) {
           uv.y = 1.0 - uv.y;
       }
    } else if (flip == 14) {
       // mirror du
       if (uv.y < 0.5) {
           uv.y = 1.0 - uv.y;
       }
    } else if (flip == 15) {
       // mirror lr ud
       if (uv.x > 0.5) {
           uv.x = 1.0 - uv.x;
       }
       if (uv.y > 0.5) {
           uv.y = 1.0 - uv.y;
       }
    } else if (flip == 16) {
       // mirror lr du
       if (uv.x > 0.5) {
           uv.x = 1.0 - uv.x;
       }
       if (uv.y < 0.5) {
           uv.y = 1.0 - uv.y;
       }
    } else if (flip == 17) {
       // mirror rl ud
       if (uv.x < 0.5) {
           uv.x = 1.0 - uv.x;
       }
       if (uv.y > 0.5) {
           uv.y = 1.0 - uv.y;
       }
    } else if (flip == 18) {
       // mirror rl du
       if (uv.x < 0.5) {
           uv.x = 1.0 - uv.x;
       }
       if (uv.y < 0.5) {
           uv.y = 1.0 - uv.y;
       }
    }
    return uv;
}


void main() {
	vec2 uv = gl_FragCoord.xy / resolution;	
	uv.y = 1.0 - uv.y;

	vec4 color = vec4(0.0);

    uv = rotate2D(uv, rotateAmt / 180.0);

    uv = flipMirror(uv);

    if (distortionType == 0) {
        uv = polar(uv);
    } else if (distortionType == 1) {
        uv = vortex(uv);
    } else if (distortionType == 2) {
        uv = waves(uv);
    } else if (distortionType == 10) {
        uv = perlin(uv);
    } else if (distortionType == 20) {
        uv = pinch(uv);
    } else if (distortionType == 21) {
        uv = bulge(uv);
    } else if (distortionType == 30) {
        uv = spiral(uv, 1.0);
    } else if (distortionType == 31) {
        uv = spiral(uv, -1.0);
    }

    if (wrap == 0) {
        // mirror (default)
        uv = uv;
    } else if (wrap == 1) {
        // repeat
        uv = mod(uv, 1.0);
    } else if (wrap == 2) {
        // clamp
        uv = clamp(uv, 0.0, 1.0);
    }

    uv = rotate2D(uv, -rotateAmt / 180.0);

    color = texture(inputTex, uv);

    // apply center brightening/darkening for polar or vortex
    if (distortionType == 0 || distortionType == 1) {
        vec2 centerUV = gl_FragCoord.xy / resolution.y;	
        float centerMask = length(centerUV - vec2(0.5 * aspectRatio, 0.5)) * 2.0;
        centerMask = clamp(pow(centerMask, abs(center) * 0.25), 0.0, 1.0);

        if (center < 0.0) {
            color.rgb *= centerMask;
        } else if (center > 0.0) {
            color.rgb = clamp(color.rgb + 1.0 - centerMask, 0.0, 1.0);
        }
    }

	fragColor = color;
}
