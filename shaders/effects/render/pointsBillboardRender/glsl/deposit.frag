#version 300 es
precision highp float;

// Billboard Deposit Fragment Shader - Sample sprite texture and blend with particle color

uniform sampler2D spriteTex;

in vec4 vColor;
in vec2 vSpriteUV;

out vec4 fragColor;

void main() {
    // Sample sprite texture
    vec4 spriteColor = texture(spriteTex, vSpriteUV);
    
    // Multiply sprite by particle color (tint the sprite)
    // Use sprite alpha for transparency
    fragColor = vec4(spriteColor.rgb * vColor.rgb, spriteColor.a * vColor.a);
}
