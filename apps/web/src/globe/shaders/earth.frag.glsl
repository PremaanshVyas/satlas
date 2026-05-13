uniform sampler2D dayTexture;
uniform sampler2D nightTexture;
uniform vec3 sunDirection;

varying vec2 vUv;
varying vec3 vNormal;

void main() {
  float cosAngle = dot(normalize(vNormal), normalize(sunDirection));

  // Wider twilight band for realistic dawn/dusk transition
  float blend = smoothstep(-0.2, 0.2, cosAngle);

  vec4 day = texture2D(dayTexture, vUv);

  // City lights: brightened and tinted slightly blue for atmospheric scatter
  vec4 nightSample = texture2D(nightTexture, vUv);
  vec4 night = vec4(nightSample.rgb * 3.5, 1.0);
  night.rgb = mix(night.rgb, night.rgb * vec3(0.8, 0.85, 1.0), 0.35);

  gl_FragColor = mix(night, day, blend);
}
