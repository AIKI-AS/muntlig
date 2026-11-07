export const vertexShader = `
precision highp float;
attribute vec3 a_data;
uniform vec2 u_size;
uniform vec2 u_pointer;
uniform float u_time;
uniform float u_layer;
uniform float u_density;
varying vec3 v_position;
varying float v_band;
mat2 turn(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
void main() {
  v_band = a_data.z;
  if (u_layer < 0.5) {
    vec2 p = a_data.xy;
    float depth = 0.25 + a_data.z * 0.75;
    p.x += sin(p.y * 3.5 + u_time * 0.16) * 0.06;
    p.y += cos(p.x * 4.0 - u_time * 0.12) * 0.05;
    p += u_pointer * depth * 0.035;
    gl_Position = vec4(p, 0.95, 1.0);
    gl_PointSize = (0.65 + depth * 1.1) * u_density;
    v_position = vec3(p, depth);
    return;
  }
  float a = a_data.x * 6.2831853;
  float across = a_data.y;
  float twist = a * 0.5 + sin(a * 2.0 + u_time * 0.45) * 0.24;
  vec3 radial = vec3(cos(a), sin(a), 0.0);
  vec3 p = radial * (1.38 + cos(a * 3.0 + u_time * 0.22) * 0.12);
  p.z = sin(a * 2.0 + u_time * 0.32) * 0.35;
  p += (radial * cos(twist) + vec3(0.0, 0.0, sin(twist))) * across * 0.96;
  p.z += sin(a * 4.0 + across * 4.0 + u_time * 0.65) * 0.065;
  p.xz = turn(-0.4 + u_time * 0.2 + u_pointer.x * 0.1) * p.xz;
  p.yz = turn(0.55 + sin(u_time * 0.14) * 0.08 + u_pointer.y * 0.08) * p.yz;
  p.xy = turn(-0.48 + sin(u_time * 0.1) * 0.1) * p.xy;
  v_position = p;
  float aspect = u_size.x / u_size.y;
  float scale = 0.35 * min(1.0, aspect / 0.92);
  float perspective = 5.0 / (6.0 - p.z);
  gl_Position = vec4(p.xy * vec2(1.0 / aspect, 1.0) * scale * perspective, -p.z * 0.16, 1.0);
}
`;

export const fragmentShader = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform float u_layer;
uniform vec3 u_foil;
uniform vec3 u_mid;
uniform vec3 u_shade;
varying vec3 v_position;
varying float v_band;
void main() {
  if (u_layer < 0.5) {
    vec2 circle = gl_PointCoord - 0.5;
    float alpha = (1.0 - smoothstep(0.18, 0.5, length(circle))) * (0.13 + v_band * 0.18);
    gl_FragColor = vec4(u_mid, alpha);
    return;
  }
  vec3 normal = normalize(cross(dFdx(v_position), dFdy(v_position)));
  if (!gl_FrontFacing) normal = -normal;
  vec3 view = normalize(vec3(0.0, 0.0, 6.0) - v_position);
  vec3 light = normalize(vec3(-0.9, 1.2, 1.8));
  float diffuse = max(dot(normal, light), 0.0);
  float shine = pow(max(dot(normal, normalize(view + light)), 0.0), 28.0);
  float edge = pow(1.0 - abs(dot(normal, view)), 2.2);
  float brushed = 0.88 + 0.12 * sin(v_band * 360.0);
  vec3 color = mix(u_shade, u_mid, diffuse * 0.83 + 0.12);
  color = mix(color, u_foil, min(0.96, shine * 0.95 + edge * 0.28));
  gl_FragColor = vec4(color * brushed, 1.0);
}
`;
