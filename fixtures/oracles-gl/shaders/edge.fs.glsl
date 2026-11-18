#version 300 es
precision highp float;
precision highp int;
in float v_across;
in float v_along;
flat in uint v_style;
uniform vec3 u_ink;
out vec4 o_color;
const float WIDTH[3] = float[3](6.0, 10.0, 2.0);
const float ALPHA[3] = float[3](0.35, 0.25, 0.6);
void main() {
  int s = min(int(v_style), 2);
  float aa = max(fwidth(v_across), 0.0001);
  float cov = clamp(0.5 - (abs(v_across) - 0.5 * WIDTH[s]) / aa, 0.0, 1.0);
  if (s == 1 && mod(v_along, 10.0) >= 6.0) discard;
  float a = cov * ALPHA[s];
  o_color = vec4(u_ink * a, a);
}
