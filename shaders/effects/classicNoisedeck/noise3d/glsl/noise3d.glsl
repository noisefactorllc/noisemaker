#version 300 es

/*
 * 3D noise shader.
 * Slices through 3D simplex noise volumes for volumetric motion cues.
 * Loop and rotation controls are normalized to keep the marching direction stable during long animations.
 */

precision highp float;
precision highp int;

uniform float time;
uniform int seed;
uniform vec2 resolution;
uniform float scale;
uniform int noiseType;
uniform bool ridges;
uniform float offsetX;
uniform float offsetY;
uniform float speed;
uniform int colorMode;
uniform float hueRotation;
uniform float hueRange;
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
    p.x = p.x >= 0.0 ? p.x * 2.0 : -p.x * 2.0 + 1.0;
    p.y = p.y >= 0.0 ? p.y * 2.0 : -p.y * 2.0 + 1.0;
    p.z = p.z >= 0.0 ? p.z * 2.0 : -p.z * 2.0 + 1.0;
	return vec3(pcg(uvec3(p))) / float(uint(0xffffffff));
}
// end PCG PRNG

float random(vec2 st) {
    return prng(vec3(st, 0.0)).x;
}

float map(float value, float inMin, float inMax, float outMin, float outMax) {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

float smootherstep(float x) {
	return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}



/// 3d voronoi from https://github.com/MaxBittker/glsl-voronoi-noise - MIT License
const mat2 myt = mat2(.12121212, .13131313, -.13131313, .12121212);
const vec2 mys = vec2(1e4, 1e6);

vec2 rhash(vec2 uv) {
  uv *= myt;
  uv *= mys;
  return fract(fract(uv / mys) * uv);
}
/*
vec3 hash(vec3 p) {
  return fract(
      sin(vec3(dot(p, vec3(1.0, 57.0, 113.0)), dot(p, vec3(57.0, 113.0, 1.0)),
               dot(p, vec3(113.0, 1.0, 57.0)))) *
      43758.5453);
}
*/

vec3 voronoi3d(const in vec3 x) {
  vec3 p = floor(x);
  vec3 f = fract(x);

  float id = 0.0;
  vec2 res = vec2(100.0);
  for (int k = -1; k <= 1; k++) {
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec3 b = vec3(float(i), float(j), float(k));
        vec3 r = vec3(b) - f + prng(p + b);
        float d = dot(r, r);

        float cond = max(sign(res.x - d), 0.0);
        float nCond = 1.0 - cond;

        float cond2 = nCond * max(sign(res.y - d), 0.0);
        float nCond2 = 1.0 - cond2;

        id = (dot(p + b, vec3(1.0, 57.0, 113.0)) * cond) + (id * nCond);
        res = vec2(d, res.x) * cond + res * nCond;

        res.y = cond2 * d + nCond2 * res.y;
      }
    }
  }

  return vec3(sqrt(res), abs(id));
}
// end 3d voronoi




// 3d cell noise - MIT license
// Cellular noise ("Worley noise") in 3D in GLSL.
// Copyright (c) Stefan Gustavson 2011-04-19. All rights reserved.
// This code is released under the conditions of the MIT license.
// See LICENSE file for details.
// https://github.com/stegu/webgl-noise

// Modulo 289 without a division (only multiplications)
vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}
  
// Modulo 7 without a division
vec3 mod7(vec3 x) {
    return x - floor(x * (1.0 / 7.0)) * 7.0;
}

// Permutation polynomial: (34x^2 + 6x) mod 289
vec3 permute(vec3 x) {
    return mod289((34.0 * x + 10.0) * x);
}
  
// Cellular noise, returning F1 and F2 in a vec2.
// 3x3x3 search region for good F2 everywhere, but a lot
// slower than the 2x2x2 version.
// The code below is a bit scary even to its author,
// but it has at least half decent performance on a
// modern GPU. In any case, it beats any software
// implementation of Worley noise hands down.
  
vec2 cellular(vec3 P) {
    #define K 0.142857142857 // 1/7
    #define Ko 0.428571428571 // 1/2-K/2
    #define K2 0.020408163265306 // 1/(7*7)
    #define Kz 0.166666666667 // 1/6
    #define Kzo 0.416666666667 // 1/2-1/6*2
    #define jitter 1.0 // smaller jitter gives more regular pattern
  
    vec3 Pi = mod289(floor(P));
    vec3 Pf = fract(P) - 0.5;

    vec3 Pfx = Pf.x + vec3(1.0, 0.0, -1.0);
    vec3 Pfy = Pf.y + vec3(1.0, 0.0, -1.0);
    vec3 Pfz = Pf.z + vec3(1.0, 0.0, -1.0);

    vec3 p = permute(Pi.x + vec3(-1.0, 0.0, 1.0));
    vec3 p1 = permute(p + Pi.y - 1.0);
    vec3 p2 = permute(p + Pi.y);
    vec3 p3 = permute(p + Pi.y + 1.0);

    vec3 p11 = permute(p1 + Pi.z - 1.0);
    vec3 p12 = permute(p1 + Pi.z);
    vec3 p13 = permute(p1 + Pi.z + 1.0);

    vec3 p21 = permute(p2 + Pi.z - 1.0);
    vec3 p22 = permute(p2 + Pi.z);
    vec3 p23 = permute(p2 + Pi.z + 1.0);

    vec3 p31 = permute(p3 + Pi.z - 1.0);
    vec3 p32 = permute(p3 + Pi.z);
    vec3 p33 = permute(p3 + Pi.z + 1.0);

    vec3 ox11 = fract(p11*K) - Ko;
    vec3 oy11 = mod7(floor(p11*K))*K - Ko;
    vec3 oz11 = floor(p11*K2)*Kz - Kzo; // p11 < 289 guaranteed

    vec3 ox12 = fract(p12*K) - Ko;
    vec3 oy12 = mod7(floor(p12*K))*K - Ko;
    vec3 oz12 = floor(p12*K2)*Kz - Kzo;

    vec3 ox13 = fract(p13*K) - Ko;
    vec3 oy13 = mod7(floor(p13*K))*K - Ko;
    vec3 oz13 = floor(p13*K2)*Kz - Kzo;

    vec3 ox21 = fract(p21*K) - Ko;
    vec3 oy21 = mod7(floor(p21*K))*K - Ko;
    vec3 oz21 = floor(p21*K2)*Kz - Kzo;

    vec3 ox22 = fract(p22*K) - Ko;
    vec3 oy22 = mod7(floor(p22*K))*K - Ko;
    vec3 oz22 = floor(p22*K2)*Kz - Kzo;

    vec3 ox23 = fract(p23*K) - Ko;
    vec3 oy23 = mod7(floor(p23*K))*K - Ko;
    vec3 oz23 = floor(p23*K2)*Kz - Kzo;

    vec3 ox31 = fract(p31*K) - Ko;
    vec3 oy31 = mod7(floor(p31*K))*K - Ko;
    vec3 oz31 = floor(p31*K2)*Kz - Kzo;

    vec3 ox32 = fract(p32*K) - Ko;
    vec3 oy32 = mod7(floor(p32*K))*K - Ko;
    vec3 oz32 = floor(p32*K2)*Kz - Kzo;

    vec3 ox33 = fract(p33*K) - Ko;
    vec3 oy33 = mod7(floor(p33*K))*K - Ko;
    vec3 oz33 = floor(p33*K2)*Kz - Kzo;

    vec3 dx11 = Pfx + jitter*ox11;
    vec3 dy11 = Pfy.x + jitter*oy11;
    vec3 dz11 = Pfz.x + jitter*oz11;

    vec3 dx12 = Pfx + jitter*ox12;
    vec3 dy12 = Pfy.x + jitter*oy12;
    vec3 dz12 = Pfz.y + jitter*oz12;

    vec3 dx13 = Pfx + jitter*ox13;
    vec3 dy13 = Pfy.x + jitter*oy13;
    vec3 dz13 = Pfz.z + jitter*oz13;

    vec3 dx21 = Pfx + jitter*ox21;
    vec3 dy21 = Pfy.y + jitter*oy21;
    vec3 dz21 = Pfz.x + jitter*oz21;

    vec3 dx22 = Pfx + jitter*ox22;
    vec3 dy22 = Pfy.y + jitter*oy22;
    vec3 dz22 = Pfz.y + jitter*oz22;

    vec3 dx23 = Pfx + jitter*ox23;
    vec3 dy23 = Pfy.y + jitter*oy23;
    vec3 dz23 = Pfz.z + jitter*oz23;

    vec3 dx31 = Pfx + jitter*ox31;
    vec3 dy31 = Pfy.z + jitter*oy31;
    vec3 dz31 = Pfz.x + jitter*oz31;

    vec3 dx32 = Pfx + jitter*ox32;
    vec3 dy32 = Pfy.z + jitter*oy32;
    vec3 dz32 = Pfz.y + jitter*oz32;

    vec3 dx33 = Pfx + jitter*ox33;
    vec3 dy33 = Pfy.z + jitter*oy33;
    vec3 dz33 = Pfz.z + jitter*oz33;

    vec3 d11 = dx11 * dx11 + dy11 * dy11 + dz11 * dz11;
    vec3 d12 = dx12 * dx12 + dy12 * dy12 + dz12 * dz12;
    vec3 d13 = dx13 * dx13 + dy13 * dy13 + dz13 * dz13;
    vec3 d21 = dx21 * dx21 + dy21 * dy21 + dz21 * dz21;
    vec3 d22 = dx22 * dx22 + dy22 * dy22 + dz22 * dz22;
    vec3 d23 = dx23 * dx23 + dy23 * dy23 + dz23 * dz23;
    vec3 d31 = dx31 * dx31 + dy31 * dy31 + dz31 * dz31;
    vec3 d32 = dx32 * dx32 + dy32 * dy32 + dz32 * dz32;
    vec3 d33 = dx33 * dx33 + dy33 * dy33 + dz33 * dz33;
  
    // Sort out the two smallest distances (F1, F2)
    #if 0
        // Cheat and sort out only F1
        vec3 d1 = min(min(d11,d12), d13);
        vec3 d2 = min(min(d21,d22), d23);
        vec3 d3 = min(min(d31,d32), d33);
        vec3 d = min(min(d1,d2), d3);
        d.x = min(min(d.x,d.y),d.z);
        return vec2(sqrt(d.x)); // F1 duplicated, no F2 computed
    #else
        // Do it right and sort out both F1 and F2
        vec3 d1a = min(d11, d12);
        d12 = max(d11, d12);
        d11 = min(d1a, d13); // Smallest now not in d12 or d13
        d13 = max(d1a, d13);
        d12 = min(d12, d13); // 2nd smallest now not in d13
        vec3 d2a = min(d21, d22);
        d22 = max(d21, d22);
        d21 = min(d2a, d23); // Smallest now not in d22 or d23
        d23 = max(d2a, d23);
        d22 = min(d22, d23); // 2nd smallest now not in d23
        vec3 d3a = min(d31, d32);
        d32 = max(d31, d32);
        d31 = min(d3a, d33); // Smallest now not in d32 or d33
        d33 = max(d3a, d33);
        d32 = min(d32, d33); // 2nd smallest now not in d33
        vec3 da = min(d11, d21);
        d21 = max(d11, d21);
        d11 = min(da, d31); // Smallest now in d11
        d31 = max(da, d31); // 2nd smallest now not in d31
        d11.xy = (d11.x < d11.y) ? d11.xy : d11.yx;
        d11.xz = (d11.x < d11.z) ? d11.xz : d11.zx; // d11.x now smallest
        d12 = min(d12, d21); // 2nd smallest now not in d21
        d12 = min(d12, d22); // nor in d22
        d12 = min(d12, d31); // nor in d31
        d12 = min(d12, d32); // nor in d32
        d11.yz = min(d11.yz,d12.xy); // nor in d12.yz
        d11.y = min(d11.y,d12.z); // Only two more to go
        d11.y = min(d11.y,d11.z); // Done! (Phew!)
        return sqrt(d11.xy); // F1, F2
    #endif
}
/// end 3d cell noise


//
// Description : Array and textureless GLSL 2D/3D/4D simplex 
//               noise functions.
//      Author : Ian McEwan, Ashima Arts.
//  Maintainer : stegu
//     Lastmod : 20201014 (stegu)
//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
//               Distributed under the MIT License. See LICENSE file.
//               https://github.com/ashima/webgl-noise
//               https://github.com/stegu/webgl-noise
// 

/*
vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}
*/

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
     return mod289(((x*34.0)+10.0)*x);
}

vec4 taylorInvSqrt(vec4 r)
{
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v)
  { 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

// First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

// Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //   x0 = x0 - 0.0 + 0.0 * C.xxx;
  //   x1 = x0 - i1  + 1.0 * C.xxx;
  //   x2 = x0 - i2  + 2.0 * C.xxx;
  //   x3 = x0 - 1.0 + 3.0 * C.xxx;
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

// Permutations
  i = mod289(i); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

// Gradients: 7x7 points over a square, mapped onto an octahedron.
// The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 bHigh = vec4( x.zw, y.zw );

  //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;
  //vec4 sHighAlt = vec4(lessThan(bHigh,0.0))*2.0 - 1.0;
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 sHigh = floor(bHigh)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 aHigh = bHigh.xzyw + sHigh.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(aHigh.xy,h.z);
  vec3 p3 = vec3(aHigh.zw,h.w);

//Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

// Mix final noise value
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 105.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
  }

// end 3d ximplex

vec2 rotate2D(vec2 st, float rot) {
    float angle = rot * PI;
    st = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * st;
    return st;
}

// smoothmin from https://iquilezles.org/articles/smin/ - MIT License
float smin(float a, float b, float k) {
    float h = max( k-abs(a-b), 0.0 )/k;
    return min( a, b ) - h*h*k*(1.0/4.0);
}

float smax(float a, float b, float k) {
    return log(exp(k*a)+exp(k*b))/k;
}


float smoothabs(float v, float m) {
	return sqrt(v * v + m);
}


float sine3D(vec3 p) {
    vec3 r0 = prng(vec3(float(seed))) * TAU;
    float a = r0.x;
    float b = r0.y;
    float c = r0.z;

    vec3 r1 = prng(vec3(float(seed))) + 1.0;
    vec3 r2 = prng(vec3(float(seed) + 10.0)) + 1.0;
    vec3 r3 = prng(vec3(float(seed) + 20.0)) + 1.0;
    float x = sin(r1.x * p.z + sin(r1.y * p.x + a) + sin(r1.z * p.y + b) + c);
    float y = sin(r2.x * p.x + sin(r2.y * p.y + b) + sin(r2.z * p.z + c) + a);
    float z = sin(r3.x * p.y + sin(r3.y * p.z + c) + sin(r3.z * p.x + a) + b);

    return (x + y + z) * 0.33 + 0.33; // may be better * 0.25
}


float spheres(vec3 p) {
    vec3 q = p;
    p = p - round(p);
    vec3 ip = floor(q);
    vec3 fp = fract(p);
    vec3 r1 = prng(ip + float(seed)) * 0.5 + 0.25;
    return length(fp - 0.5) - map(scale, 1.0, 100.0, 0.025, 0.55) * r1.x;
}

// Modified from https://iquilezles.org/articles/distfunctions/ and https://iquilezles.org/articles/sdfrepetition/ - MIT License
float cubes(vec3 p) {
    //p.x -= 2.0;
    float s = 4.0;
    p.x -= s * 0.5;
    p = p - s * round(p / s);
    vec3 b = vec3(map(scale, 1.0, 100.0, 0.1, 0.95));
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// raymarching

// get the nearest distance to the SDFs
float getDist(vec3 p) {
    float d;
    
    if (noiseType == 12) {
        // simplex
        float scale = map(scale, 1.0, 100.0, 0.25, 0.025); 
        d = snoise(p * scale + float(seed)) * 0.5 + 0.5;
        d = smootherstep(d);
    } else if (noiseType == 20) {
        // cell
        float scale = map(scale, 1.0, 100.0, 0.1, 0.35); 
        d = cellular(p * 0.1 + float(seed)).x;
        d = smoothstep(scale, 0.5, d);
    } else if (noiseType == 21) {
        // cell v2
        d = voronoi3d(p * 0.1 + float(seed)).x;
        float scale = map(scale, 1.0, 100.0, 0.1, 0.35); 
        d = smoothstep(scale, 0.5, d);
    } else if (noiseType == 30) {
        // sine
        float scale = map(scale, 1.0, 100.0, 1.0, 0.1); 
        d = sine3D(p * scale);
    } else if (noiseType == 40) {
        d = spheres(p);
    } else if (noiseType == 50) {
        d = cubes(p);
    } else if (noiseType == 60) {
        // wavy planes both
        float scale = map(scale, 1.0, 100.0, 0.25, 0.025); 
        d = -abs(p.y) + 4.0 + snoise(p * scale + float(seed)) * 0.75;
    } else if (noiseType == 61) {
        // wavy plane lower
        float scale = map(scale, 1.0, 100.0, 0.25, 0.025); 
        d = p.y + 4.0 + snoise(p * scale + float(seed)) * 0.75;
    } else if (noiseType == 62) {
        // wavy plane upper
        float scale = map(scale, 1.0, 100.0, 0.25, 0.025); 
        d = -p.y + 2.0 + snoise(p * scale + float(seed)) * 0.75;
    }

    if (ridges && noiseType == 12) {
        d = 1.0 - smoothabs(d * 2.0 - 1.0, 0.05);
    }

    return d;
}

// surface normal at the given point
vec3 getNormal(vec3 p) {
    float epsilon = 0.01;

    // sample the distance field at nearby points
    float d = getDist(p);
    float dx = getDist(p + vec3(epsilon, 0.0, 0.0)) - d;
    float dy = getDist(p + vec3(0.0, epsilon, 0.0)) - d;
    float dz = getDist(p + vec3(0.0, 0.0, epsilon)) - d;

    // calculate the normal using the gradient of the distance field
    return normalize(vec3(dx, dy, dz));
}

float rayMarch(vec3 rayOrigin, vec3 rayDirection) {
    int maxSteps = 100; // max marching steps
    float maxDist = 100.0; // maximum distance from the origin to march
    float minDist = 0.01; // minimum distance from SDF surface to march
    float d = 0.0; // distance to SDFs

    for (int i = 0; i < maxSteps; i++) {
        vec3 p = rayOrigin + rayDirection * d;

        float dist = getDist(p);
        d += dist;
        // break if we are too far from the origin or too close to an SDF
        if (d > maxDist || dist < minDist) {
            break;
        }
    }
    return d;
}
// end raymarching


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


void main() {
    vec4 color = vec4(0.0, 0.0, 0.0, 1.0);
    vec2 st = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;	

    // ray marching - calculate distance to scene objects
    vec3 rayOrigin = vec3(offsetX * 0.1, offsetY * 0.1, -8.0 + time * TAU * speed);
    vec3 rayDirection = normalize(vec3(st, 1.0));
    float d = rayMarch(rayOrigin, rayDirection);

    // calculate the lighting
    vec3 p = rayOrigin + rayDirection * d;
    vec3 lightPosition = rayOrigin + vec3(-5.0, 5.0, -10.0);
    vec3 lightVector = normalize(lightPosition - p);
    vec3 normal = getNormal(p);
    float diffuse = clamp(dot(normal, lightVector), 0.0, 1.0);

    // colorize
    if (colorMode == 0) {
        // grayscale
        color.rgb = vec3(diffuse);
    } else if (colorMode == 6) {
        // hsv
        color.rgb = hsv2rgb(vec3(diffuse * (hueRange * 0.01) + (hueRotation / 360.0), 0.75, 0.75));
    } else if (colorMode == 7) {
        // surface normal
        color.rgb = normal;
    } else if (colorMode == 8) {
        // depth 
        color.rgb = vec3(clamp(d, 0.0, 1.0));
    }
    //color.rgb = hsv2rgb(vec3(d * 0.25, length(st), diffuse));
    //color.rgb = hsv2rgb(vec3(diffuse * 0.25, 0.75, 0.5));
    //color.rgb = normal;
    //color.r += dFdx(d) * length(st * 0.5) * 10.0;
    //color.g += dFdy(d) * length(st * 0.5) * 5.0;

    float fogDist = clamp(d / 50.0, 0.0, 1.0);
    color.rgb = mix(color.rgb, vec3(0.0), fogDist);


    st = gl_FragCoord.xy / resolution;

    fragColor = color;
}
