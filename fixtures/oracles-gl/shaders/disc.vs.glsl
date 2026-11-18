#version 300 es
precision highp float;
precision highp int;
uniform vec2 u_view;
in vec2 a_center;
in uvec4 a_meta;
out vec2 v_local;
flat out uint v_style;
flat out uint v_cat;
void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  v_local = corner * 22.0;
  v_style = a_meta.x;
  v_cat = a_meta.y;
  vec2 px = a_center * 0.001 + v_local;
  gl_Position = vec4(px.x / u_view.x * 2.0 - 1.0, 1.0 - px.y / u_view.y * 2.0, 0.0, 1.0);
}
