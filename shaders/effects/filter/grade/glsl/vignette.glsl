/*
 * Grade - Vignette Pass
 * Elliptical vignette with highlight preservation
 * Applied as final spatial modifier
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform float gradeVignetteAmount;
uniform float gradeVignetteMidpoint;
uniform float gradeVignetteRoundness;
uniform float gradeVignetteFeather;
uniform float gradeVignetteHighlightProtect;

out vec4 fragColor;

const vec3 LUMA_WEIGHTS = vec3(0.2126, 0.7152, 0.0722);

// sRGB to linear
vec3 srgbToLinear(vec3 srgb) {
    vec3 linear;
    for (int i = 0; i < 3; i++) {
        if (srgb[i] <= 0.04045) {
            linear[i] = srgb[i] / 12.92;
        } else {
            linear[i] = pow((srgb[i] + 0.055) / 1.055, 2.4);
        }
    }
    return linear;
}

// Linear to sRGB
vec3 linearToSrgb(vec3 linear) {
    vec3 srgb;
    for (int i = 0; i < 3; i++) {
        if (linear[i] <= 0.0031308) {
            srgb[i] = linear[i] * 12.92;
        } else {
            srgb[i] = 1.055 * pow(linear[i], 1.0 / 2.4) - 0.055;
        }
    }
    return srgb;
}

// Compute vignette mask
// Returns 0-1 where 0 = full darkening, 1 = no change
float computeVignette(vec2 uv, vec2 aspectRatio, float midpoint, float roundness, float feather) {
    // Center UV at 0.5, 0.5
    vec2 centered = uv - 0.5;
    
    // Apply aspect ratio correction
    // roundness: -1 = horizontal ellipse, 0 = match aspect, +1 = circle
    vec2 scale;
    if (roundness > 0.0) {
        // Blend toward circle
        scale = mix(aspectRatio, vec2(1.0), roundness);
    } else {
        // Enhance aspect ratio difference
        scale = mix(aspectRatio, aspectRatio * vec2(1.0 + abs(roundness), 1.0 - abs(roundness) * 0.5), -roundness);
    }
    
    centered *= scale;
    
    // Distance from center
    float dist = length(centered) * 2.0;  // Normalize so corners are ~1.4
    
    // Vignette falloff
    float inner = midpoint - feather * 0.5;
    float outer = midpoint + feather * 0.5;
    
    return 1.0 - smoothstep(inner, outer, dist);
}

// Apply vignette with optional highlight protection
vec3 applyVignette(vec3 rgb, float vignetteMask, float amount, float highlightProtect) {
    if (abs(amount) < 0.001) return rgb;
    
    // Amount > 0 = darken edges, Amount < 0 = lighten edges
    float darken = 1.0 - (1.0 - vignetteMask) * abs(amount);
    
    // Highlight protection: reduce vignette effect on bright pixels
    if (highlightProtect > 0.0) {
        float luma = dot(rgb, LUMA_WEIGHTS);
        float protection = smoothstep(0.5, 1.0, luma) * highlightProtect;
        darken = mix(darken, 1.0, protection);
    }
    
    if (amount > 0.0) {
        // Darken: multiply
        return rgb * darken;
    } else {
        // Lighten: screen blend inverse
        return 1.0 - (1.0 - rgb) * darken;
    }
}

void main() {
    vec2 texSize = vec2(textureSize(inputTex, 0));
    vec2 uv = gl_FragCoord.xy / texSize;
    
    ivec2 coord = ivec2(gl_FragCoord.xy);
    vec4 color = texelFetch(inputTex, coord, 0);
    
    // Early exit if no vignette
    if (abs(gradeVignetteAmount) < 0.001) {
        fragColor = color;
        return;
    }
    
    // Decode to linear
    vec3 rgb = srgbToLinear(color.rgb);
    
    // Compute aspect ratio for ellipse
    vec2 aspectRatio = vec2(1.0);
    if (texSize.x > texSize.y) {
        aspectRatio = vec2(texSize.x / texSize.y, 1.0);
    } else {
        aspectRatio = vec2(1.0, texSize.y / texSize.x);
    }
    
    // Compute vignette mask
    float vignetteMask = computeVignette(uv, aspectRatio, gradeVignetteMidpoint, 
                                         gradeVignetteRoundness, gradeVignetteFeather);
    
    // Apply vignette
    rgb = applyVignette(rgb, vignetteMask, gradeVignetteAmount, gradeVignetteHighlightProtect);
    
    // Final encode to sRGB
    rgb = linearToSrgb(max(rgb, vec3(0.0)));
    
    fragColor = vec4(rgb, color.a);
}
