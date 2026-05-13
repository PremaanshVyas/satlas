varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
  // Fresnel: 1 at edge (normal ⊥ view), 0 at centre (normal ∥ view)
  float fresnel = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDir)));
  float intensity = pow(fresnel, 3.5) * 1.2;

  // Atmospheric blue — matches Earth's Rayleigh scattering colour
  vec3 atmosphereColor = vec3(0.25, 0.55, 1.0);

  gl_FragColor = vec4(atmosphereColor * intensity, intensity * 0.7);
}
