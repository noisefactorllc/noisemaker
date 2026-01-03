#version 300 es

/*
 * Tunnel shader.
 * Builds a perspective tunnel with noise-driven offsets for motion depth.
 * Speed and rotation controls are remapped so the vanishing point stays centered unless intentionally offset.
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
uniform float rotation;
uniform float center;
uniform float scale;
uniform int flip;
out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718
#define aspectRatio resolution.x / resolution.y

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
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

// Tunnel - MIT License
// modified from https://www.shadertoy.com/view/Ms2SWW
// The MIT License
// Copyright © 2013 Inigo Quilez
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), 
// to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, 
// and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above 
// copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", 
// WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND 
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, 
// TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
// https://www.youtube.com/c/InigoQuilez
// https://iquilezles.org/

// This shader shows one way to fix the texturing
// discontinuities created by fetching textures with
// atan(), which you can see if you set IMPLEMENTATION 
// to 0, depending on your screen resolution. More info
// here:  https://iquilezles.org/articles/tunnel
vec4 tunnel(vec2 uv) {
    vec2 uv2 = gl_FragCoord.xy/resolution; // shape coordinates

    if (aspectLens) {
        uv.x *= aspectRatio;
        uv -= vec2(0.5 * aspectRatio, 0.5);
        uv2 = vec2(uv2.x * aspectRatio * 2.0 - aspectRatio, uv2.y * 2.0 - 1.0);
    } else {
	    uv -= 0.5;
        uv2 = uv2 * 2.0 - 1.0;
    }

	float a = atan(uv.y, uv.x);
	float r = 0.0;

    if (distortionType == 0) {
        // circle
        r = length(uv);
    } else if (distortionType == 1) {
        // triangle
        r = shape(uv2, 3);
    } else if (distortionType == 2) {
        // rounded square
        vec2 uv8 = uv * uv * uv * uv * uv * uv * uv * uv;
        r = pow(uv8.x + uv8.y, 1.0/8.0);
    } else if (distortionType == 3) {
        // square
        r = shape(uv2, 4);
    } else if (distortionType == 4) {
        // hexagon
        r = shape(uv2, 6);
    } else if (distortionType == 5) {
        // octagon
        r = shape(uv2, 8);
    } 

    r -= scale * 0.075;

    vec2 coords = smod(vec2(0.3/r + time * speed, a/PI + time * -rotation), 1.0); 
	vec2 coords2 = vec2(coords.x, atan(coords.y, abs(coords.x))/PI);
	vec4 color = textureGrad(inputTex, coords, dFdx(coords2), dFdy(coords2));

    // center
    float c = clamp(r * 2.0, 0.0, 1.0);
	if (center < 0.0) {
        color.rgb = mix(color.rgb, color.rgb * c, -center * 0.2);
        color.a = max(color.a, (1.0 - c) * map(center, -5.0, 0.0, 1.0, 0.0));
    } else if (center > 0.0) {
        color.rgb = mix(color.rgb, color.rgb + (1.0 - c), center * 0.2);
        color.a = max(color.a, (1.0 - c) * map(center, -5.0, 0.0, 1.0, 0.0));
    }

    return color;
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

    uv = flipMirror(uv);

    color = tunnel(uv);

	fragColor = color;// vec4(color, 1.0); 
}
