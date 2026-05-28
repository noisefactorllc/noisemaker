#version 300 es

/*
 * Navier-Stokes external-force / source pass.
 * On first frame or reset: seeds the velocity field with several coherent vortex blobs (curl
 * potential) and matching dye spots. With an input texture, the luminance gradient drives a
 * continuous force and brightness contributes dye. State is stored in rgba16f, so velocity in
 * R,G is float — no encoding roundtrip — which avoids the precision-loss noise that bites at 8-bit.
 */

precision highp float;
precision highp int;

uniform vec2 resolution;
uniform int seed;
uniform float speed;
uniform float inputForce;
uniform float inputDye;
uniform bool resetState;

uniform sampler2D bufTex;
uniform sampler2D inputTex;

out vec4 fragColor;

#define NUM_INIT_VORTICES 9

float hash11(float x) {
    return fract(sin(x * 12.9898) * 43758.5453);
}

vec2 hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
}

float lum(vec3 c) {
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

void main() {
    ivec2 texSize = textureSize(bufTex, 0);
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = fragCoord / vec2(texSize);

    vec4 prev = texture(bufTex, uv);

    // First-frame buffer is all zeros (including A, which is initialized to 0 by the runtime).
    // We detect this and seed initial conditions on the first frame OR when the user hits reset.
    bool bufferEmpty = (prev.a == 0.0);
    if (resetState || bufferEmpty) {
        vec2 vel = vec2(0.0);
        float dye = 0.0;
        float seedF = float(seed);
        for (int i = 0; i < NUM_INIT_VORTICES; i++) {
            float idf = float(i);
            vec2 c = hash22(vec2(idf * 7.31 + 1.0, seedF * 13.7 + idf));
            float sign = hash11(idf * 4.17 + seedF * 5.9) > 0.5 ? 1.0 : -1.0;
            float radius = 0.10 + 0.06 * hash11(idf * 2.11 + seedF);

            vec2 d = uv - c;
            float r2 = dot(d, d);
            float falloff = exp(-r2 / (2.0 * radius * radius));
            // Tangential velocity: rotate radial vector 90 degrees, scale by Gaussian envelope.
            // The 12.0 sets the angular speed — enough that vortices visibly rotate at default dt.
            vec2 tangent = vec2(-d.y, d.x);
            vel += tangent * sign * falloff * 12.0;
            dye += falloff;
        }
        // A=1.0 marks "buffer has been initialized" — distinguishes initialized-but-quiet from empty.
        fragColor = vec4(vel, clamp(dye, 0.0, 1.0), 1.0);
        return;
    }

    vec2 vel = prev.rg;
    float dye = prev.b;

    float dt = clamp(speed, 0.0, 200.0) * 0.0001;

    // Input-texture-driven additions.
    float iForce = clamp(inputForce, 0.0, 100.0) * 0.01;
    float iDye = clamp(inputDye, 0.0, 100.0) * 0.01;
    if (iForce > 0.0 || iDye > 0.0) {
        vec2 texel = 1.0 / vec2(texSize);
        float lc = lum(texture(inputTex, uv).rgb);
        float lr = lum(texture(inputTex, uv + vec2(texel.x, 0.0)).rgb);
        float lu = lum(texture(inputTex, uv + vec2(0.0, texel.y)).rgb);
        vec2 grad = vec2(lr - lc, lu - lc);
        vel += grad * iForce * 50.0;
        dye += lc * iDye * dt * 60.0;
    }

    dye = clamp(dye, 0.0, 2.0);

    fragColor = vec4(vel, dye, 1.0);
}
