#version 300 es
precision highp float;
precision highp int;
in vec2 v_local;
flat in uint v_style;
flat in uint v_cat;
uniform vec3 u_ink;
out vec4 o_color;
const vec3 PAL[9] = vec3[9](
  vec3(42.0, 120.0, 214.0) / 255.0, vec3(235.0, 104.0, 52.0) / 255.0, vec3(27.0, 175.0, 122.0) / 255.0,
  vec3(237.0, 161.0, 0.0) / 255.0, vec3(232.0, 123.0, 164.0) / 255.0, vec3(0.0, 131.0, 0.0) / 255.0,
  vec3(74.0, 58.0, 167.0) / 255.0, vec3(227.0, 73.0, 72.0) / 255.0, vec3(122.0, 121.0, 117.0) / 255.0);
void main() {
  float r = length(v_local);
  float aa = max(fwidth(r), 0.0001);
  if (v_style == 2u) {
    float outer = clamp(0.5 - (r - 11.0) / aa, 0.0, 1.0);
    float inner = clamp(0.5 - (r - 9.0) / aa, 0.0, 1.0);
    vec3 c = mix(vec3(1.0), PAL[min(int(v_cat), 8)], inner);
    o_color = vec4(c * outer, outer);
  } else if (v_style == 0u) {
    float cov = clamp(0.5 - (abs(r - 14.0) - 1.5) / aa, 0.0, 1.0);
    o_color = vec4(u_ink * cov, cov);
  } else {
    float cov = clamp(0.5 - (abs(r - 18.0) - 1.0) / aa, 0.0, 1.0);
    float ang = atan(v_local.y, v_local.x) + 3.14159265;
    if (mod(ang * 18.0, 7.0) >= 4.0) discard;
    o_color = vec4(u_ink * cov, cov);
  }
}
