/*
 * Spatter: Multi-layer procedural paint spatter effect.
 *
 * Grid-based noise matching Python reference implementation:
 * 1. Random values generated at INTEGER GRID POINTS via PCG hash
 * 2. pow(x, 4) exponential distribution applied AT GRID POINTS (before interpolation)
 * 3. Upscaled to full resolution via bicubic/bilinear/cosine interpolation
 * 4. Multi-octave FBM with brightness/contrast thresholding
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform vec2 resolution;
uniform float time;
uniform vec3 color;
uniform float density;
uniform float alpha;
uniform int seed;

out vec4 fragColor;

// --- PCG PRNG ---

uvec3 pcg3(uvec3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

uint pcg(uint v) {
    return pcg3(uvec3(v, 0u, 0u)).x;
}

float hashf(uint h) {
    return float(pcg3(uvec3(h, 0u, 0u)).x) / float(0xffffffffu);
}

// --- Grid value: random float in [0,1] at each integer grid point ---

float gridVal(ivec2 p, uint sd) {
    uvec3 h = pcg3(uvec3(uint(p.x + 32768), uint(p.y + 32768), sd));
    return float(h.x) / float(0xffffffffu);
}

// --- Catmull-Rom cubic interpolation ---

float cubic(float a, float b, float c, float d, float t) {
    float t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2.0*b) + (-a+c)*t + (2.0*a - 5.0*b + 4.0*c - d)*t2 + (-a + 3.0*b - 3.0*c + d)*t3);
}

// --- Bicubic exp grid noise (smear layer) ---
// Evaluates 4x4 grid neighborhood. pow(x,4) at grid points, then bicubic interpolate.

float bicubicExpGrid(vec2 pos, uint sd) {
    ivec2 c = ivec2(floor(pos));
    vec2 f = fract(pos);
    float r0 = cubic(pow(gridVal(c+ivec2(-1,-1),sd),4.0), pow(gridVal(c+ivec2(0,-1),sd),4.0), pow(gridVal(c+ivec2(1,-1),sd),4.0), pow(gridVal(c+ivec2(2,-1),sd),4.0), f.x);
    float r1 = cubic(pow(gridVal(c+ivec2(-1,0),sd),4.0), pow(gridVal(c+ivec2(0,0),sd),4.0), pow(gridVal(c+ivec2(1,0),sd),4.0), pow(gridVal(c+ivec2(2,0),sd),4.0), f.x);
    float r2 = cubic(pow(gridVal(c+ivec2(-1,1),sd),4.0), pow(gridVal(c+ivec2(0,1),sd),4.0), pow(gridVal(c+ivec2(1,1),sd),4.0), pow(gridVal(c+ivec2(2,1),sd),4.0), f.x);
    float r3 = cubic(pow(gridVal(c+ivec2(-1,2),sd),4.0), pow(gridVal(c+ivec2(0,2),sd),4.0), pow(gridVal(c+ivec2(1,2),sd),4.0), pow(gridVal(c+ivec2(2,2),sd),4.0), f.x);
    return clamp(cubic(r0, r1, r2, r3, f.y), 0.0, 1.0);
}

// --- Bilinear exp grid noise (dots & specks) ---

float bilinearExpGrid(vec2 pos, uint sd) {
    ivec2 c = ivec2(floor(pos));
    vec2 f = fract(pos);
    float v00 = pow(gridVal(c, sd), 4.0);
    float v10 = pow(gridVal(c + ivec2(1,0), sd), 4.0);
    float v01 = pow(gridVal(c + ivec2(0,1), sd), 4.0);
    float v11 = pow(gridVal(c + ivec2(1,1), sd), 4.0);
    return mix(mix(v00, v10, f.x), mix(v01, v11, f.x), f.y);
}

// --- Cosine exp grid noise (removal layer) ---

float cosineExpGrid(vec2 pos, uint sd) {
    ivec2 c = ivec2(floor(pos));
    vec2 f = fract(pos);
    vec2 t = (1.0 - cos(f * 3.14159265)) * 0.5;
    float v00 = pow(gridVal(c, sd), 4.0);
    float v10 = pow(gridVal(c + ivec2(1,0), sd), 4.0);
    float v01 = pow(gridVal(c + ivec2(0,1), sd), 4.0);
    float v11 = pow(gridVal(c + ivec2(1,1), sd), 4.0);
    return mix(mix(v00, v10, t.x), mix(v01, v11, t.x), t.y);
}

// --- FBM functions ---
// Python simple_multires: per octave, freq doubles, weight halves.
// Each octave gets a different seed (offset by 10000).

// 6-octave bicubic exp FBM (smear)
// Weight sum = 0.984375
float expFbm6Bicubic(vec2 uv, vec2 freq, uint sd) {
    float a = 0.0;
    a += bicubicExpGrid(uv * freq,        sd          ) * 0.5;
    a += bicubicExpGrid(uv * freq * 2.0,  sd + 10000u ) * 0.25;
    a += bicubicExpGrid(uv * freq * 4.0,  sd + 20000u ) * 0.125;
    a += bicubicExpGrid(uv * freq * 8.0,  sd + 30000u ) * 0.0625;
    a += bicubicExpGrid(uv * freq * 16.0, sd + 40000u ) * 0.03125;
    a += bicubicExpGrid(uv * freq * 32.0, sd + 50000u ) * 0.015625;
    return a / 0.984375;
}

// 4-octave bilinear exp FBM (dots & specks)
// Weight sum = 0.9375
float expFbm4Bilinear(vec2 uv, vec2 freq, uint sd) {
    float a = 0.0;
    a += bilinearExpGrid(uv * freq,       sd          ) * 0.5;
    a += bilinearExpGrid(uv * freq * 2.0, sd + 10000u ) * 0.25;
    a += bilinearExpGrid(uv * freq * 4.0, sd + 20000u ) * 0.125;
    a += bilinearExpGrid(uv * freq * 8.0, sd + 30000u ) * 0.0625;
    return a / 0.9375;
}

// 3-octave cosine exp+ridged FBM (removal)
// Ridge applied AFTER interpolation (per-pixel), not at grid points.
// Weight sum = 0.875
float expRidgedFbm3Cosine(vec2 uv, vec2 freq, uint sd) {
    float a = 0.0;
    float v;
    v = cosineExpGrid(uv * freq,       sd          );
    a += (1.0 - abs(2.0 * v - 1.0)) * 0.5;
    v = cosineExpGrid(uv * freq * 2.0, sd + 10000u );
    a += (1.0 - abs(2.0 * v - 1.0)) * 0.25;
    v = cosineExpGrid(uv * freq * 4.0, sd + 20000u );
    a += (1.0 - abs(2.0 * v - 1.0)) * 0.125;
    return a / 0.875;
}

void main() {
    ivec2 dims = textureSize(inputTex, 0);
    vec2 uv = gl_FragCoord.xy / vec2(dims);
    vec4 base = texture(inputTex, uv);

    uint s = uint(seed) * 17u;

    // Seed-derived random frequencies (matching Python ranges)
    float smearFreq = mix(3.0, 6.0, hashf(pcg(s + 10u)));
    float dotFreq   = mix(32.0, 64.0, hashf(pcg(s + 50u)));
    float speckFreq = mix(150.0, 200.0, hashf(pcg(s + 90u)));
    float ridgeFreq = mix(2.0, 3.0, hashf(pcg(s + 130u)));

    // -- Layer 1: Large smear (6-oct bicubic exp FBM, domain warped) --
    // Python: warp with freq=[2-3, 1-3], displacement=1+random()
    float warpFreqX = mix(2.0, 3.0, hashf(pcg(s + 160u)));
    float warpFreqY = mix(1.0, 3.0, hashf(pcg(s + 170u)));
    // Use bilinear for warp displacement (simpler, just UV offsets)
    float warpX = bilinearExpGrid(uv * vec2(warpFreqX, warpFreqY), s + 200u);
    float warpY = bilinearExpGrid(uv * vec2(warpFreqX, warpFreqY), s + 300u);
    float disp = 1.0 + hashf(pcg(s + 150u));
    vec2 warpedUV = uv + (vec2(warpX, warpY) - 0.5) * disp * 0.12;
    float smear = expFbm6Bicubic(warpedUV, vec2(smearFreq), s + 100u);

    // -- Layer 2: Medium dots (4-oct bilinear exp FBM + brightness/contrast) --
    // Python: adjustBrightness(-1.0) + adjustContrast(4.0)
    // Analytical equivalent with mean~0.2: clamp(4*v - 1.6, 0, 1)
    float dots = expFbm4Bilinear(uv, vec2(dotFreq), s + 43u);
    dots = clamp(4.0 * dots - 1.6, 0.0, 1.0);

    // -- Layer 3: Fine specks (4-oct bilinear exp FBM + brightness/contrast) --
    // Python: adjustBrightness(-1.25) + adjustContrast(4.0)
    // Analytical equivalent: clamp(4*v - 2.0, 0, 1)
    float specks = expFbm4Bilinear(uv, vec2(speckFreq), s + 71u);
    specks = clamp(4.0 * specks - 2.0, 0.0, 1.0);

    // Combine: max of layers (Python uses tf.maximum)
    float combined = max(smear, max(dots, specks));

    // Subtract exp+ridged noise for breaks
    float ridge = expRidgedFbm3Cosine(uv, vec2(ridgeFreq), s + 89u);
    combined = max(0.0, combined - ridge);

    // Density scales before threshold
    combined *= (0.5 + density * 2.0);

    // Python: blend_layers(normalize(smear), shape, 0.005, tensor, splash*tensor)
    // With feather=0.005 and 2 layers, this is a sharp step at 0.5
    float mask = step(0.5, combined);

    // Color blend: where mask=1, show color * input; where mask=0, show input
    vec3 colored = base.rgb * color;
    vec3 result = mix(base.rgb, mix(base.rgb, colored, mask), alpha);

    fragColor = vec4(result, base.a);
}
