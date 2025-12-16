#version 300 es

precision highp float;

uniform sampler2D gridTex;
uniform sampler2D tex;
uniform float inputIntensity;
uniform vec2 resolution;

layout(location = 0) out vec4 dlaOutColor;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec4 inputColor = texture(tex, uv);
    vec4 cluster = texture(gridTex, uv);

    float trailVal = clamp(cluster.a, 0.0, 1.0);

    // Use the actual cluster color, scaled by emission brightness
    float emission = trailVal * (0.35 + trailVal * 0.8);
    vec3 clusterColor = cluster.rgb;
    
    // Blend input based on inputIntensity (0-100 scale)
    float inputBlend = clamp(inputIntensity / 100.0, 0.0, 1.0);
    vec3 bg = inputColor.rgb * inputBlend;
    vec3 fg = clusterColor * emission;
    vec3 combined = clamp(bg + fg, 0.0, 1.0);
    
    float outAlpha = max(inputColor.a, trailVal);

    dlaOutColor = vec4(combined, outAlpha);
}
