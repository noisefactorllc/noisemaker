#version 300 es
precision highp float;
precision highp int;

uniform sampler2D xyzTex;
const int viewMode = VIEW_MODE;
uniform float rotateX;
uniform float rotateY;
uniform float posZ;
out vec4 fragColor;

void main() {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    ivec2 dims = textureSize(xyzTex, 0);
    vec4 pos = texelFetch(xyzTex, coord, 0);
    vec3 p = pos.xyz;
    if (viewMode == 1 && abs(p.z) < 1.0 && p.x >= 0.0 && p.x <= 1.0 && p.y >= 0.0 && p.y <= 1.0) {
        p.xy -= 0.5;
        p.z = 0.0;
    }
    p = vec3(p.x, p.y * cos(rotateX) - p.z * sin(rotateX), p.y * sin(rotateX) + p.z * cos(rotateX));
    p = vec3(p.x * cos(rotateY) + p.z * sin(rotateY), p.y, -p.x * sin(rotateY) + p.z * cos(rotateY));
    // Ascending negative camera depth gives back-to-front draw order.
    // Original slot breaks ties and retains per-particle identity.
    float depth = p.z + posZ - 80.0;
    // A non-finite key breaks the merge ordering and can duplicate valid IDs.
    float key = pos.w >= 0.5 && abs(depth) <= 3.402823466e38 ? depth : 3.402823466e38;
    fragColor = vec4(key, float(coord.y * dims.x + coord.x), 0.0, 1.0);
}
