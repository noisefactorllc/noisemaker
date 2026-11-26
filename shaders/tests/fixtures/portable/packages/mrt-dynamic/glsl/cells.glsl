#version 300 es
precision highp float;

// Two render targets at one cell per texel. Cell (x, y) starts at screen
// pixel (x, y) * zoom: the first target holds that x in red, the second that
// y in green, both over 255.

uniform int zoom;

layout(location = 0) out vec4 columns;
layout(location = 1) out vec4 rows;

void main() {
    ivec2 cell = ivec2(gl_FragCoord.xy);
    columns = vec4(float(cell.x * zoom) / 255.0, 0.0, 0.0, 1.0);
    rows = vec4(0.0, float(cell.y * zoom) / 255.0, 0.0, 1.0);
}
