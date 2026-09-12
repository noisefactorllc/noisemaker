#version 300 es
precision highp float;

// Diffuse Pass - Decay existing trail

uniform sampler2D trailTex;
uniform sampler2D defocusTex;
uniform vec2 resolution;
uniform float intensity;
uniform float aperture;
uniform int viewMode;
uniform int blendMode;

out vec4 fragColor;

vec4 sampleDefocus(vec2 uv) {
    // Internal targets use nearest sampling. Interpolate all four channels
    // explicitly so the lower-resolution footprint remains smooth.
    ivec2 dims = textureSize(defocusTex, 0);
    vec2 p = uv * vec2(dims) - 0.5;
    ivec2 lo = ivec2(floor(p));
    vec2 f = fract(p);
    ivec2 a = clamp(lo, ivec2(0), dims - 1);
    ivec2 b = clamp(lo + 1, ivec2(0), dims - 1);
    return mix(mix(texelFetch(defocusTex, a, 0), texelFetch(defocusTex, ivec2(b.x, a.y), 0), f.x),
        mix(texelFetch(defocusTex, ivec2(a.x, b.y), 0), texelFetch(defocusTex, b, 0), f.x), f.y);
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    
    // Sample the trail texture directly (no blur)
    vec4 trailColor = texture(trailTex, uv);
    
    // Apply intensity decay (persistence)
    // intensity=100 means no decay, intensity=0 means instant fade
    float decay = clamp(intensity / 100.0, 0.0, 1.0);
    fragColor = clamp(trailColor * decay, 0.0, 1.0);
    if (blendMode == 0 && aperture > 0.0 && viewMode != 0) fragColor += sampleDefocus(uv);
}
