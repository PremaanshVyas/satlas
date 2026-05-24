uniform float uOpacity;

varying vec2 vUv;
varying vec3 vColor;

void main() {
  // vUv is [0,1] with centre at 0.5; map to [-1,1] distance from centre.
  float dist = length(vUv - 0.5) * 2.0;
  if (dist > 1.0) discard;

  // Soft anti-aliased edge.
  float alpha = uOpacity * (1.0 - smoothstep(0.6, 1.0, dist));
  gl_FragColor = vec4(vColor, alpha);
}
