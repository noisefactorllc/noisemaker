#version 300 es
precision highp float;

// Vaseline upsample pass - N-tap bloom at edges, blending to original toward center
// Uses 9-tap tent filter same as bloom, with Chebyshev edge mask

uniform sampler2D inputTex;         // Original full-res image
uniform sampler2D downsampleBuffer; // Output from downsample pass
uniform vec2 resolution;
uniform float alpha;

out vec4 fragColor;

const float BRIGHTNESS_ADJUST = 0.25;
const vec2 DOWNSAMPLE_SIZE = vec2(64.0, 64.0);

vec3 clamp01(vec3 v) {
    return clamp(v, vec3(0.0), vec3(1.0));
}

// Chebyshev distance from center (0 at center, 1 at edges)
float chebyshev_mask(vec2 uv) {
    vec2 centered = abs(uv - vec2(0.5)) * 2.0;
    return max(centered.x, centered.y);
}

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec2 fullSize = resolution;
    vec2 downSize = DOWNSAMPLE_SIZE;
    
    // Get original pixel
    vec4 original = texelFetch(inputTex, coord, 0);
    float a = clamp(alpha, 0.0, 1.0);
    
    // Early return if no effect
    if (a <= 0.0) {
        fragColor = vec4(clamp01(original.rgb), original.a);
        return;
    }
    
    // Calculate UV
    vec2 uv = (vec2(coord) + 0.5) / fullSize;
    
    // 9-tap tent filter for smooth upsampling
    vec2 texelSize = 1.0 / downSize;
    
    vec3 sum = vec3(0.0);
    
    // Center tap (weight 4)
    sum += texture(downsampleBuffer, uv).rgb * 4.0;
    
    // Edge taps (weight 2 each)
    sum += texture(downsampleBuffer, uv + vec2(-texelSize.x, 0.0)).rgb * 2.0;
    sum += texture(downsampleBuffer, uv + vec2( texelSize.x, 0.0)).rgb * 2.0;
    sum += texture(downsampleBuffer, uv + vec2(0.0, -texelSize.y)).rgb * 2.0;
    sum += texture(downsampleBuffer, uv + vec2(0.0,  texelSize.y)).rgb * 2.0;
    
    // Corner taps (weight 1 each)
    sum += texture(downsampleBuffer, uv + vec2(-texelSize.x, -texelSize.y)).rgb;
    sum += texture(downsampleBuffer, uv + vec2( texelSize.x, -texelSize.y)).rgb;
    sum += texture(downsampleBuffer, uv + vec2(-texelSize.x,  texelSize.y)).rgb;
    sum += texture(downsampleBuffer, uv + vec2( texelSize.x,  texelSize.y)).rgb;
    
    // Normalize (4 + 2*4 + 1*4 = 16)
    vec3 bloomSample = sum / 16.0;
    
    // Add brightness boost
    vec3 boosted = clamp01(bloomSample + vec3(BRIGHTNESS_ADJUST));
    
    // Calculate edge mask - more bloom at edges
    float edgeMask = chebyshev_mask(uv);
    edgeMask = smoothstep(0.0, 0.8, edgeMask);  // Smooth transition, full bloom near edges
    
    // Blend bloom with original using edge mask
    vec3 sourceClamped = clamp01(original.rgb);
    vec3 bloomed = clamp01((sourceClamped + boosted) * 0.5);
    
    // Edge-weighted blend: original at center, bloomed at edges
    vec3 edgeBlended = mix(sourceClamped, bloomed, edgeMask);
    
    // Apply alpha to control overall effect intensity
    vec3 finalRgb = clamp01(mix(sourceClamped, edgeBlended, a));
    
    fragColor = vec4(finalRgb, original.a);
}
