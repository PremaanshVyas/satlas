uniform sampler2D dayTexture;
uniform sampler2D nightTexture;
uniform vec3 sunDirection;

varying vec2 vUv;
varying vec3 vNormal;

void main() {
  float cosAngle = dot(vNormal, normalize(sunDirection));

  // Narrow twilight band at the terminator
  float blend = smoothstep(-0.1, 0.15, cosAngle);

  vec4 day = texture2D(dayTexture, vUv);

  // City lights need boosting — the raw Black Marble image is intentionally dim
  vec4 nightSample = texture2D(nightTexture, vUv);
  vec3 night = nightSample.rgb * 3.5;

  gl_FragColor = vec4(mix(night, day.rgb, blend), 1.0);
}
