#version 300 es

precision highp float;

uniform sampler2D gridTex;
uniform sampler2D inputTex;
uniform float alpha;
uniform vec2 resolution;

layout(location = 0) out vec4 dlaOutColor;

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5) / resolution;
    vec4 inputColor = texture(inputTex, uv);
    vec4 cluster = texture(gridTex, uv);

    float intensity = clamp(cluster.a, 0.0, 1.0);

    // Mono output: grayscale emission
    float emission = intensity * (0.35 + intensity * 0.8);
    vec3 combined = mix(inputColor.rgb, clamp(inputColor.rgb + vec3(emission), 0.0, 1.0), clamp(alpha, 0.0, 1.0));
    float outAlpha = max(inputColor.a, intensity);

    dlaOutColor = vec4(combined, outAlpha);
}
