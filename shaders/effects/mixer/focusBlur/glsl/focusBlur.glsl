/*
 * Focus blur (depth of field) mixer shader
 * Reconstructs a faux depth buffer from luminance to drive circle-of-confusion blurs
 * Blur radius is based on distance from focal point
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform sampler2D tex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float focalDistance;
uniform float aperture;
uniform float sampleBias;
uniform int depthSource;

out vec4 fragColor;

// Convert RGB to luminosity for depth estimation
float getLuminosity(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

// Compute blur factor based on depth distance from focal plane
float computeBlurFactor(float depth) {
    float focalPlane = focalDistance * 0.01;
    float blur = abs(depth - focalPlane) * aperture;
    return clamp(blur, 0.0, 1.0);
}

// Apply depth of field blur using golden-angle spiral disk samples
vec4 applyFocusBlur(sampler2D sceneTex, sampler2D depthTex, vec2 uv) {
    vec4 depthSample = texture(depthTex, gl_FragCoord.xy / vec2(textureSize(depthTex, 0)));
    float depth = getLuminosity(depthSample.rgb);

    float blurRadius = computeBlurFactor(depth) * sampleBias;

    vec4 color = vec4(0.0);
    const float GOLDEN = 2.399963;

    for (int i = 0; i < 64; i++) {
        float r = sqrt(float(i) / 64.0);
        float theta = float(i) * GOLDEN;
        vec2 offset = vec2(cos(theta), sin(theta)) * r * blurRadius / resolution;
        color += texture(sceneTex, ((uv + offset) * fullResolution - tileOffset) / vec2(textureSize(sceneTex, 0)));
    }

    return color / 64.0;
}

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 uv = globalCoord / fullResolution;

    vec4 color;

    // depthSource: 0 = use inputTex (A) as depth map, blur tex (B)
    //              1 = use tex (B) as depth map, blur inputTex (A)
    if (depthSource == 0) {
        color = applyFocusBlur(tex, inputTex, uv);
    } else {
        color = applyFocusBlur(inputTex, tex, uv);
    }

    // Preserve maximum alpha from both sources
    color.a = max(texture(inputTex, gl_FragCoord.xy / vec2(textureSize(inputTex, 0))).a, texture(tex, gl_FragCoord.xy / vec2(textureSize(tex, 0))).a);

    fragColor = color;
}
