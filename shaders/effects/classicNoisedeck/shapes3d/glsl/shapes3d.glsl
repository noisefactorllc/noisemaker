#version 300 es

/*
 * GLSL 3D shapes shader.
 * Performs signed distance ray marching with configurable lighting to mirror the WGSL implementation.
 * Camera orbit controls are normalized so interactive adjustments cannot push the raymarch outside the scene bounds.
 */

precision highp float;
precision highp int;

// SHAPE_A, SHAPE_B and BLEND_MODE are compile-time defines injected by the
// runtime (see definition.js `globals.{shapeA,shapeB,blendMode}.define`).
// Same Knob 2 rationale as classicNoisedeck/noise: the per-raymarch-step
// dispatch on shape index/blend mode (~100 steps × 2 shapes per pixel)
// inflates HLSL bytecode badly when left as runtime; baking the choice lets
// the compiler keep only the active branch.
#ifndef SHAPE_A
#define SHAPE_A 30
#endif
#ifndef SHAPE_B
#define SHAPE_B 10
#endif
#ifndef BLEND_MODE
#define BLEND_MODE 10
#endif

uniform float time;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float shapeAScale;
uniform float shapeBScale;
uniform float shapeAThickness;
uniform float shapeBThickness;
uniform float smoothness;
uniform float spin;
uniform float flip;
uniform float spinSpeed;
uniform float flipSpeed;
uniform bool repetition;
uniform int animation;
uniform float flythroughSpeed;
uniform float spacing;
uniform float cameraDist;
uniform vec3 bgColor;
uniform float bgAlpha;
uniform int colorMode;
uniform int paletteMode;
uniform vec3 paletteOffset;
uniform vec3 paletteAmp;
uniform vec3 paletteFreq;
uniform vec3 palettePhase;
uniform int cyclePalette;
uniform float rotatePalette;
uniform float repeatPalette;

uniform float weight;
uniform sampler2D inputTex;

out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718
#define aspectRatio fullResolution.x / fullResolution.y

const float MIN_DIST = 0.01;
const float MAX_DIST = 200.0;
const int MAX_STEPS = 100;

struct TransformData {
    vec2 staticSpin;
    vec2 staticFlip;
    vec2 dynamicSpin;
    vec2 dynamicFlip;
    float repeatSpacing;
    float flythroughOffset;
    bool repeatBefore;
    bool repeatAfter;
    bool useFlythrough;
};

struct ShapeParams {
    float scaleA;
    float scaleB;
    float thicknessA;
    float thicknessB;
};

TransformData computeTransformData() {
    TransformData data;
    float staticSpinAngle = radians(spin);
    float staticFlipAngle = radians(flip);
    data.staticSpin = vec2(cos(staticSpinAngle), sin(staticSpinAngle));
    data.staticFlip = vec2(cos(staticFlipAngle), sin(staticFlipAngle));

    float dynamicSpinAngle = time * (spinSpeed * 0.1) * PI;
    float dynamicFlipAngle = time * (flipSpeed * 0.1) * PI;
    data.dynamicSpin = vec2(cos(dynamicSpinAngle), sin(dynamicSpinAngle));
    data.dynamicFlip = vec2(cos(dynamicFlipAngle), sin(dynamicFlipAngle));

    data.repeatSpacing = spacing;
    bool hasRepetition = repetition;
    data.repeatBefore = hasRepetition && animation == 1;
    data.repeatAfter = hasRepetition && animation == 0;

    bool enableFlythrough = hasRepetition && animation != 0 && flythroughSpeed != 0.0;
    data.flythroughOffset = enableFlythrough ? time * flythroughSpeed : 0.0;
    data.useFlythrough = enableFlythrough;

    return data;
}

ShapeParams computeShapeParams() {
    ShapeParams params;
    params.scaleA = 1.0 + shapeAScale * 0.1;
    params.scaleB = 1.0 + shapeBScale * 0.1;
    params.thicknessA = shapeAThickness;
    params.thicknessB = shapeBThickness;
    return params;
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

vec3 linearToSrgb(vec3 linear) {
    vec3 srgb;
    for (int i = 0; i < 3; ++i) {
        if (linear[i] <= 0.0031308) {
            srgb[i] = linear[i] * 12.92;
        } else {
            srgb[i] = 1.055 * pow(linear[i], 1.0 / 2.4) - 0.055;
        }
    }
    return srgb;
}

// oklab transform and inverse - Public Domain/MIT License
// https://bottosson.github.io/posts/oklab/

const mat3 fwdA = mat3(1.0, 1.0, 1.0,
                       0.3963377774, -0.1055613458, -0.0894841775,
                       0.2158037573, -0.0638541728, -1.2914855480);

const mat3 fwdB = mat3(4.0767245293, -1.2681437731, -0.0041119885,
                       -3.3072168827, 2.6093323231, -0.7034763098,
                       0.2307590544, -0.3411344290,  1.7068625689);

const mat3 invB = mat3(0.4121656120, 0.2118591070, 0.0883097947,
                       0.5362752080, 0.6807189584, 0.2818474174,
                       0.0514575653, 0.1074065790, 0.6302613616);

const mat3 invA = mat3(0.2104542553, 1.9779984951, 0.0259040371,
                       0.7936177850, -2.4285922050, 0.7827717662,
                       -0.0040720468, 0.4505937099, -0.8086757660);

vec3 oklab_from_linear_srgb(vec3 c) {
    vec3 lms = invB * c;

    return invA * (sign(lms)*pow(abs(lms), vec3(0.3333333333333)));
}

vec3 linear_srgb_from_oklab(vec3 c) {
    vec3 lms = fwdA * c;

    return fwdB * (lms * lms * lms);
}
// end oklab

float luminance(vec3 color) {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

vec3 pal(float t) {
    vec3 a = paletteOffset;
    vec3 b = paletteAmp;
    vec3 c = paletteFreq;
    vec3 d = palettePhase;

    t = abs(t);
    t = t * repeatPalette + rotatePalette * 0.01;

    vec3 color = a + b * cos(6.28318 * (c * t + d));

    // convert to rgb if palette is in hsv or oklab mode
    // 1 = hsv, 2 = oklab, 3 = rgb
    if (paletteMode == 1) {
        color = hsv2rgb(color);
    } else if (paletteMode == 2) {
        color.g = color.g * -.509 + .276;
        color.b = color.b * -.509 + .198;
        color = linear_srgb_from_oklab(color);
        color = linearToSrgb(color);
    } 

    return color;
}
/*
// smoothmin from https://iquilezles.org/articles/smin/ - MIT License
float smin(float a, float b, float k) {
    float h = max( k-abs(a-b), 0.0 )/k;
    return min( a, b ) - h*h*k*(1.0/4.0);
}

float smax(float a, float b, float k) {
    float h = exp(k * a) + exp(k * b);
    return log(h) / k;
}
*/

// from https://iquilezles.org/articles/distfunctions/ - MIT License
float smin(float d1, float d2, float k) {
    float h = clamp( 0.5 + 0.5*(d2-d1)/k, 0.0, 1.0 );
    return mix( d2, d1, h ) - k*h*(1.0-h);
}

float ssub(float d1, float d2, float k) {
    float h = clamp( 0.5 - 0.5*(d2+d1)/k, 0.0, 1.0 );
    return mix( d2, -d1, h ) + k*h*(1.0-h);
}

float smax(float d1, float d2, float k) {
    float h = clamp( 0.5 - 0.5*(d2-d1)/k, 0.0, 1.0 );
    return mix( d2, d1, h ) + k*h*(1.0-h);
}

// 3D distance functions - MIT License
// https://iquilezles.org/articles/distfunctions/
//
// shape3d() is split into per-define helpers shape3dA() and shape3dB(): each
// variant only emits the body of the active shape branch. The two helpers
// have the same body keyed off SHAPE_A vs SHAPE_B; they're textually
// duplicated rather than macroized because the duplication is short and the
// macro form would obscure the per-variant compile-time selection.
float shape3dA(vec3 p, vec3 origin, float scale, float thickness) {
    float d = 0.0;
    float s = scale * 0.25;
#if SHAPE_A == 20
    // sphere
    d = length(p - origin) - s;
#elif SHAPE_A == 30
    // torus - vert
    vec2 q = vec2(length(p.xy) - s, p.z);
    d = length(q) - 0.2;
#elif SHAPE_A == 31
    // torus - horiz
    vec2 q = vec2(length(p.xz) - s, p.y);
    d = length(q) - 0.2;
#elif SHAPE_A == 10
    // cube
    s *= 0.75;
    p -= clamp(p, -s, s);
    d = length(p) - 0.01;
#elif SHAPE_A == 40
    // cylinder vertical
    s *= 0.75;
    d = length(p.xz) - s;
#elif SHAPE_A == 50
    // cylinder horizontal
    s *= 0.75;
    d = max(length(p - clamp(p, -s, s)), (length(p.xy) - s));
#elif SHAPE_A == 60
    // capsule vertical
    p.y -= clamp(p.y, -scale * 0.5, scale * 0.5);
    d = length(p) - s * 0.5;
#elif SHAPE_A == 70
    // capsule horizontal
    p.x -= clamp(p.x, -scale * 0.5, scale * 0.5);
    d = length(p) - s * 0.5;
#elif SHAPE_A == 80
    // octahedron
    p = abs(p);
    return (p.x + p.y + p.z - s) * 0.57735027;
#endif
    d = abs(d) - (thickness * 0.01);
    return d;
}

float shape3dB(vec3 p, vec3 origin, float scale, float thickness) {
    float d = 0.0;
    float s = scale * 0.25;
#if SHAPE_B == 20
    d = length(p - origin) - s;
#elif SHAPE_B == 30
    vec2 q = vec2(length(p.xy) - s, p.z);
    d = length(q) - 0.2;
#elif SHAPE_B == 31
    vec2 q = vec2(length(p.xz) - s, p.y);
    d = length(q) - 0.2;
#elif SHAPE_B == 10
    s *= 0.75;
    p -= clamp(p, -s, s);
    d = length(p) - 0.01;
#elif SHAPE_B == 40
    s *= 0.75;
    d = length(p.xz) - s;
#elif SHAPE_B == 50
    s *= 0.75;
    d = max(length(p - clamp(p, -s, s)), (length(p.xy) - s));
#elif SHAPE_B == 60
    p.y -= clamp(p.y, -scale * 0.5, scale * 0.5);
    d = length(p) - s * 0.5;
#elif SHAPE_B == 70
    p.x -= clamp(p.x, -scale * 0.5, scale * 0.5);
    d = length(p) - s * 0.5;
#elif SHAPE_B == 80
    p = abs(p);
    return (p.x + p.y + p.z - s) * 0.57735027;
#endif
    d = abs(d) - (thickness * 0.01);
    return d;
}

float blend(float shape1, float shape2) {
#if BLEND_MODE == 10
    // smooth min (union)
    return smin(shape1, shape2, smoothness * 0.02);
#elif BLEND_MODE == 20
    // smooth max (intersect)
    return smax(shape1, shape2, smoothness * 0.01);
#elif BLEND_MODE == 25
    // smooth subtract
    return ssub(shape1, shape2, smoothness * 0.02);
#elif BLEND_MODE == 26
    // smooth subtract (flipped)
    return ssub(-shape1, shape2, smoothness * 0.02);
#elif BLEND_MODE == 30
    // min (union)
    return min(shape1, shape2);
#elif BLEND_MODE == 40
    // max (intersect)
    return max(shape1, shape2);
#elif BLEND_MODE == 50
    // subtract
    return max(-shape1, shape2);
#elif BLEND_MODE == 51
    // subtract (flipped)
    return max(shape1, -shape2);
#else
    return 0.0;
#endif
}


// raymarching

vec2 rotate2D(vec2 st, vec2 cs) {
    return vec2(st.x * cs.x - st.y * cs.y, st.x * cs.y + st.y * cs.x);
}

vec3 applyTransform(vec3 p, TransformData data) {
    if (data.useFlythrough) {
        p.z += data.flythroughOffset;
    }

    p.xz = rotate2D(p.xz, data.staticSpin);
    p.yz = rotate2D(p.yz, data.staticFlip);

    if (data.repeatBefore) {
        p -= data.repeatSpacing * round(p / data.repeatSpacing);
    }

    p.xz = rotate2D(p.xz, data.dynamicSpin);
    p.yz = rotate2D(p.yz, data.dynamicFlip);

    if (data.repeatAfter) {
        p -= data.repeatSpacing * round(p / data.repeatSpacing);
    }
    return p;
}

// get the nearest distance to the SDFs
float getDist(vec3 p, TransformData data, ShapeParams params) {
    p = applyTransform(p, data);

    float shape1 = shape3dA(p, vec3(0.0), params.scaleA, params.thicknessA);
    float shape2 = shape3dB(p, vec3(0.0), params.scaleB, params.thicknessB);

    return blend(shape1, shape2);
}

// surface normal at the given point
vec3 getNormal(vec3 p, TransformData data, ShapeParams params) {
    float epsilon = 0.01;

    // sample the distance field at nearby points
    float d = getDist(p, data, params);
    float dx = getDist(p + vec3(epsilon, 0.0, 0.0), data, params) - d;
    float dy = getDist(p + vec3(0.0, epsilon, 0.0), data, params) - d;
    float dz = getDist(p + vec3(0.0, 0.0, epsilon), data, params) - d;

    // calculate the normal using the gradient of the distance field
    return normalize(vec3(dx, dy, dz));
}

float rayMarch(vec3 rayOrigin, vec3 rayDirection, TransformData data, ShapeParams params) {
    float distAccum = 0.0;

    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = rayOrigin + rayDirection * distAccum;
        float dist = getDist(p, data, params);
        distAccum += dist;
        // break if we are too far from the origin or too close to an SDF
        if (distAccum > MAX_DIST || dist < MIN_DIST) {
            break;
        }
    }
    return distAccum;
}
// end raymarching

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec4 color = vec4(1.0);
    vec2 st = (globalCoord - 0.5 * fullResolution.xy) / fullResolution.y;

    // ray marching - calculate distance to scene objects
    vec3 rayOrigin = vec3(0.0, 0.0, -cameraDist);
    vec3 rayDirection = normalize(vec3(st, 1.0));
    TransformData transformData = computeTransformData();
    ShapeParams shapeParams = computeShapeParams();
    float d = rayMarch(rayOrigin, rayDirection, transformData, shapeParams);

    // calculate the lighting
    vec3 p = rayOrigin + rayDirection * d;
    vec3 lightPosition = vec3(-5.0, 5.0, -5.0);
    vec3 lightVector = normalize(lightPosition - p);
    vec3 normal = getNormal(p, transformData, shapeParams);
    float diffuse = clamp(dot(normal, lightVector), 0.0, 1.0);
    

    // calculate shadows - move a small distance from SDFs and march back towards the origin
    // if dist is shorter than distance to the light, the point is in shadows
    /*
    float minDist = 0.01;
    float dist = rayMarch(p + normal * minDist * 2.0, lightVector);
    if (dist < length(lightPosition - p)) {
        diffuse *= 0.1;
    }
    */

    if (weight > 0.0) {
        // triplanar texture mapping
        vec3 localP = applyTransform(p, transformData);
        localP = localP * 0.5 + 0.5;

        vec3 colorXY = texture(inputTex, localP.xy).rgb;
        vec3 colorXZ = texture(inputTex, localP.xz).rgb;
        vec3 colorYZ = texture(inputTex, localP.yz).rgb;

        normal = abs(normal);
        color.rgb = colorXY * normal.z + colorXZ * normal.y + colorYZ * normal.x;
    }

    if (colorMode == 0) {
        // depth
        color.rgb *= vec3(1.0 - clamp(d * 0.035, 0.0, 1.0));
    } else if (colorMode == 1) {
        // diffuse
        color.rgb *= vec3(diffuse * 1.5) + 0.5;
    } else if (colorMode == 10) {
        // palette
        color.rgb *= vec3(diffuse * 1.5) + 0.5; // add 0.25 - 0.5 for ambient?
        // apply palette
        float lum = luminance(color.rgb);
        if (cyclePalette == -1) {
            lum += time;
        } else if (cyclePalette == 1) {
            lum -= time;
        }
        color.rgb *= pal(lum);
    }


    // add background color. if repeating, a bit of distance fog
    float fogDist = clamp(d / 200.0, 0.0, 1.0);
    if (repetition) {
        color = mix(color, vec4(bgColor, bgAlpha * 0.01), fogDist);
    } else {
        color = mix(color, vec4(bgColor, bgAlpha * 0.01), floor(fogDist));
    }

    st = globalCoord / fullResolution;

    fragColor = color;
}
