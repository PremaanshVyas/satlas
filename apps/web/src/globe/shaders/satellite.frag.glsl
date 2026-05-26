uniform float uOpacity;

varying vec2 vUv;
varying vec3 vColor;

void main() {
  // vUv is [0,1] with centre at 0.5; map to [0,1] radial distance from centre.
  float dist = length(vUv - 0.5) * 2.0;

  // fwidth gives the screen-space derivative of dist — exactly one pixel wide
  // at any zoom level. Crisp outer boundary regardless of dot size.
  float fw = fwidth(dist);
  float alpha = uOpacity * (1.0 - smoothstep(1.0 - fw, 1.0 + fw, dist));
  if (alpha < 0.001) discard;

  gl_FragColor = vec4(vColor, alpha);
}
