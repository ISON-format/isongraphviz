#version 300 es
precision highp float;
uniform vec3 u_ink;
out vec4 o_color;
void main() {
  o_color = vec4(u_ink * 0.6, 0.6);
}
