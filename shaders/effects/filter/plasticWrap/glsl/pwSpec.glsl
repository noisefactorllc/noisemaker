/*
 * Plastic Wrap - specular pass.
 *
 * The blurred image (_pwBlur, written by pwBlurH/pwBlurV) supplies a height
 * field h via its luminance. A 1px central-difference gradient of h gives a
 * per-pixel surface normal. A configurable key light and fixed view vector
 * form a Blinn half-vector for the directional highlight. A five-point Laplacian adds
 * energy at two-dimensional ridge crests, so the sheen hugs raised contours
 * rather than washing evenly over plain slopes. The result is screened onto
 * the original image.
 *
 * Y-orientation note: the gradient taps (uv +/- 1px in x and y) and the
 * user-supplied key-light vector are interpreted identically by both
 * backends -- unlike e.g.
 * spinBlur's rotation of a fragment-position-derived offset, nothing here is
 * built from the fragment's own coordinate relative to a center parameter.
 * The WGSL port therefore matches this file exactly, with no manual Y
 * compensation, rather than following spinBlur/pondRipples' position-rotation
 * pattern.
 *
 * The vector control uses the user-facing light heading shared by the
 * Lighting effect. This height-field gradient uses the opposite XY direction,
 * so its azimuth is rotated 180 degrees below while Z remains toward the
 * viewer. Keeping that conversion inside the shader also preserves the
 * established default Plastic Wrap pixels.
 */

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D inputTex;
uniform sampler2D blurTex;
uniform vec2 resolution;
uniform float highlight;
uniform float smoothness;
uniform vec3 lightDirection;

out vec4 fragColor;

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 texel = 1.0 / resolution;
    vec4 src = texture(inputTex, uv);

    float hC = lum(texture(blurTex, uv).rgb);
    float hL = lum(texture(blurTex, uv - vec2(texel.x, 0.0)).rgb);
    float hR = lum(texture(blurTex, uv + vec2(texel.x, 0.0)).rgb);
    float hB = lum(texture(blurTex, uv - vec2(0.0, texel.y)).rgb);
    float hT = lum(texture(blurTex, uv + vec2(0.0, texel.y)).rgb);

    vec2 grad = vec2(hR - hL, hT - hB);

    // Gradient-to-slope scale: 10.0 turns a full 0..1
    // luminance swing over a ~2px span into a strongly tilted facet
    // (grad ~0.5 * 10 = 5, well past the point where the normal is mostly
    // sideways) while leaving gentle/smoothed contours near-flat.
    float strength = 10.0;
    vec3 n = normalize(vec3(-grad * strength, 1.0));
    float lightLengthSq = dot(lightDirection, lightDirection);
    vec3 operatorLight = lightLengthSq > 0.000001
        ? lightDirection
        : vec3(-0.4, 0.6, 0.7);
    vec3 controlledLight = vec3(-operatorLight.xy, operatorLight.z);
    vec3 L = normalize(controlledLight);
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 halfVector = L + V;
    float halfLengthSq = dot(halfVector, halfVector);
    vec3 defaultL = normalize(vec3(0.4, -0.6, 0.7));
    vec3 defaultHalf = normalize(defaultL + V);
    vec3 H = halfLengthSq > 0.000001
        ? normalize(halfVector)
        : defaultHalf;

    float gloss = mix(24.0, 6.0, smoothness / 100.0);
    float flatSpec = pow(H.z, gloss);
    float rawSpec = pow(clamp(dot(n, H), 0.0, 1.0), gloss);
    // Remove the flat-plane response and normalize the remaining directional
    // highlight so unmodulated image regions do not receive a milky wash.
    float spec = clamp((rawSpec - flatSpec) / max(1.0 - flatSpec, 0.0001), 0.0, 1.0);

    // The negative five-point Laplacian is positive at a two-dimensional
    // height-field crest. Unlike the prior x-only second derivative, it
    // responds equally to horizontal, vertical, and curved contours.
    float curv = 4.0 * hC - hL - hR - hB - hT;
    float ridge = clamp(curv * strength * 2.0, 0.0, 1.0);
    spec = clamp(spec * 1.35 + ridge * 0.75, 0.0, 1.0);

    vec3 specColor = clamp(vec3(spec) * (highlight / 100.0), 0.0, 1.0);
    // Screen blend: 1 - (1-a)(1-b). highlight=0 -> specColor=0 -> out=src exactly.
    vec3 outc = vec3(1.0) - (vec3(1.0) - src.rgb) * (vec3(1.0) - specColor);

    fragColor = vec4(outc, src.a);
}
