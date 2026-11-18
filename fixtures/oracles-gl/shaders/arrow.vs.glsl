#version 300 es
precision highp float;
precision highp int;
uniform vec2 u_view;
in vec4 a_tb1;
in vec2 a_b2;
void main() {
  vec2 p = gl_VertexID == 0 ? a_tb1.xy : (gl_VertexID == 1 ? a_tb1.zw : a_b2);
  p = p * 0.001;
  gl_Position = vec4(p.x / u_view.x * 2.0 - 1.0, 1.0 - p.y / u_view.y * 2.0, 0.0, 1.0);
}
