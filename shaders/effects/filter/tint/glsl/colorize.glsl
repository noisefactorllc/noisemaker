#version 300 es
precision highp float;

uniform vec3 color;
uniform float alpha;
uniform float mode;
uniform sampler2D inputTex;

out vec4 fragColor;

vec3 rgb_to_hsv(vec3 rgb) {
    float r = rgb.x, g = rgb.y, b = rgb.z;
    float max_c = max(max(r, g), b);
    float min_c = min(min(r, g), b);
    float delta = max_c - min_c;
    float hue = 0.0;
    if (delta != 0.0) {
        if (max_c == r) {
            float raw = (g - b) / delta;
            raw = raw - floor(raw / 6.0) * 6.0;
            if (raw < 0.0) raw += 6.0;
            hue = raw;
        } else if (max_c == g) {
            hue = (b - r) / delta + 2.0;
        } else {
            hue = (r - g) / delta + 4.0;
        }
    }
    hue /= 6.0;
    if (hue < 0.0) hue += 1.0;
    float sat = max_c != 0.0 ? delta / max_c : 0.0;
    return vec3(hue, sat, max_c);
}

vec3 hsv_to_rgb(vec3 hsv) {
    float h = hsv.x, s = hsv.y, v = hsv.z;
    float dh = h * 6.0;
    float dr = clamp(abs(dh - 3.0) - 1.0, 0.0, 1.0);
    float dg = clamp(-abs(dh - 2.0) + 2.0, 0.0, 1.0);
    float db = clamp(-abs(dh - 4.0) + 2.0, 0.0, 1.0);
    float oms = 1.0 - s;
    return vec3((oms + s * dr) * v, (oms + s * dg) * v, (oms + s * db) * v);
}

void main() {
  vec2 st = gl_FragCoord.xy / vec2(max(textureSize(inputTex, 0), ivec2(1)));
  vec4 base = texture(inputTex, st);
  vec3 base_rgb = clamp(base.rgb, 0.0, 1.0);

  int m = int(mode);
  vec3 tinted;
  if (m == 1) {
      // Multiply
      tinted = base_rgb * color;
  } else if (m == 2) {
      // Recolor: replace hue with tint color's hue
      float tintHue = rgb_to_hsv(color).x;
      vec3 base_hsv = rgb_to_hsv(base_rgb);
      tinted = clamp(hsv_to_rgb(vec3(tintHue, clamp(base_rgb.y, 0.0, 1.0), clamp(base_hsv.z, 0.0, 1.0))), 0.0, 1.0);
  } else {
      // Overlay (default)
      tinted = color;
  }

  vec3 rgb = mix(base_rgb, tinted, alpha);
  fragColor = vec4(rgb, base.a);
}
