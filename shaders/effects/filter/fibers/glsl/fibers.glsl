#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D trailTex;
uniform float time;
uniform float speed;
uniform int seed;
uniform float alpha;

out vec4 fragColor;

// Simple hash for brightness variation
float hash13(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
}

void main() {
    vec2 texSize = vec2(textureSize(inputTex, 0));
    vec2 uv = (gl_FragCoord.xy - 0.5) / texSize;

    vec4 base = texture(inputTex, uv);
    vec4 trail = texture(trailTex, uv);

    // Trail mask: how much fiber is at this pixel
    float mask = max(trail.r, max(trail.g, trail.b));
    mask = clamp(mask, 0.0, 1.0);

    // Generate brightness noise per-pixel (Python: values(freq=128))
    // Use high-frequency hash for fine-grained brightness variation
    float seedF = float(seed);
    vec3 brightness;
    brightness.r = hash13(vec3(gl_FragCoord.xy * 0.73, seedF * 1.17 + time * speed * 0.1));
    brightness.g = hash13(vec3(gl_FragCoord.xy * 0.79, seedF * 1.31 + time * speed * 0.1));
    brightness.b = hash13(vec3(gl_FragCoord.xy * 0.83, seedF * 1.43 + time * speed * 0.1));

    // Python: blend(tensor, brightness, mask * 0.5)
    // Blend fibers over input at controlled opacity
    float blendAmt = mask * alpha;
    vec3 result = mix(base.rgb, brightness, blendAmt);

    fragColor = vec4(result, base.a);
}
