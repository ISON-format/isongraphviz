#version 300 es
precision highp float;
precision highp int;
uniform vec2 u_view;
in vec4 a_ab;
in vec4 a_cb;
in uvec4 a_meta;
out float v_across;
out float v_along;
flat out uint v_style;
const int SEG = 16;
const float WIDTH[3] = float[3](6.0, 10.0, 2.0);
vec2 curve(float t, vec2 a, vec2 c1, vec2 c2, vec2 b, uint kind) {
  float s = 1.0 - t;
  if (kind == 0u) return a * s + b * t;
  if (kind == 1u) return a * (s * s) + c1 * (2.0 * s * t) + b * (t * t);
  return a * (s * s * s) + c1 * (3.0 * s * s * t) + c2 * (3.0 * s * t * t) + b * (t * t * t);
}
vec2 slope(float t, vec2 a, vec2 c1, vec2 c2, vec2 b, uint kind) {
  float s = 1.0 - t;
  if (kind == 0u) return b - a;
  if (kind == 1u) return 2.0 * (s * (c1 - a) + t * (b - c1));
  return 3.0 * (s * s * (c1 - a) + 2.0 * s * t * (c2 - c1) + t * t * (b - c2));
}
void main() {
  int i = gl_VertexID >> 1;
  float side = (gl_VertexID & 1) == 0 ? -1.0 : 1.0;
  float t = float(i) / float(SEG);
  uint kind = a_meta.x;
  vec2 a = a_ab.xy * 0.001;
  vec2 c1 = a_ab.zw * 0.001;
  vec2 c2 = a_cb.xy * 0.001;
  vec2 b = a_cb.zw * 0.001;
  vec2 p = curve(t, a, c1, c2, b, kind);
  vec2 d = slope(t, a, c1, c2, b, kind);
  float dn = length(d);
  vec2 dir = dn > 0.000001 ? d / dn : vec2(1.0, 0.0);
  float half_w = 0.5 * WIDTH[min(int(a_meta.y), 2)] + 1.0;
  vec2 q = p + vec2(-dir.y, dir.x) * side * half_w;
  float poly = kind == 0u ? length(b - a) : (kind == 1u ? length(c1 - a) + length(b - c1) : length(c1 - a) + length(c2 - c1) + length(b - c2));
  v_across = side * half_w;
  v_along = t * poly;
  v_style = a_meta.y;
  gl_Position = vec4(q.x / u_view.x * 2.0 - 1.0, 1.0 - q.y / u_view.y * 2.0, 0.0, 1.0);
}
