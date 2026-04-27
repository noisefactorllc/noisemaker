#version 300 es
precision highp float;

uniform sampler2D inputTex;
uniform sampler2D trailTex;
uniform vec2 resolution;
uniform vec2 tileOffset;
uniform vec2 fullResolution;
uniform float inputIntensity;
uniform float matteOpacity;

out vec4 fragColor;

void main() {
    vec2 globalCoord = gl_FragCoord.xy + tileOffset;
    vec2 uv = gl_FragCoord.xy / resolution;

    vec4 inputColor = texture(inputTex, uv);
    vec4 trailColor = texture(trailTex, uv);
    
    // Additive blend: trail + scaled input
    // inputIntensity 0 = black, 100 = trail + full input
    float t = inputIntensity / 100.0;
    float matteAlpha = matteOpacity;
    
    // Trail presence based on max RGB channel
    float trailPresence = max(max(trailColor.r, trailColor.g), trailColor.b);
    
    // Background contribution is scaled by matte opacity (premultiplied)
    // Trail contribution is NOT affected by matte opacity
    vec3 rgb = trailColor.rgb + inputColor.rgb * t * matteAlpha;
    
    // Alpha: where trail exists, full opacity; elsewhere, matte opacity
    float alpha = max(trailPresence, matteAlpha);
    
    fragColor = vec4(rgb, alpha);
}
