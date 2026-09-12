#version 300 es
precision highp float;
precision highp int;

uniform sampler2D xyzTex;
uniform sampler2D velTex;
uniform sampler2D heightTex;
uniform sampler2D diffuseTex;
uniform float gridScale;
uniform float heightScale;
uniform float heightOffset;

layout(location = 0) out vec4 outXYZ;
layout(location = 1) out vec4 outVel;
layout(location = 2) out vec4 outRGBA;

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 stateSize = textureSize(xyzTex, 0);
    // pointsEmit allocates a square state texture: one grid vertex per slot.
    vec2 uv = (vec2(coord) + 0.5) / vec2(stateSize);
    vec3 heightColor = texture(heightTex, uv).rgb;
    float elevation = dot(heightColor, vec3(0.2126, 0.7152, 0.0722));
    // XZ ground plane, Y elevation. These are world coordinates, not UVs.
    outXYZ = vec4((uv.x - 0.5) * gridScale,
        elevation * heightScale + heightOffset,
        (uv.y - 0.5) * gridScale, 1.0);
    outVel = vec4(0.0, 0.0, 0.0, texelFetch(velTex, coord, 0).w);
    outRGBA = texture(diffuseTex, uv);
}
