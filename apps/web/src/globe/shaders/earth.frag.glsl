uniform sampler2D dayTexture;
uniform sampler2D nightTexture;
uniform vec3 sunDirection;

varying vec2 vUv;
varying vec3 vNormal;

void main() {
  float cosAngle = dot(normalize(vNormal), normalize(sunDirection));
  float blend = smoothstep(-0.1, 0.1, cosAngle);

  vec4 day = texture2D(dayTexture, vUv);
  vec4 night = texture2D(nightTexture, vUv) * 2.5;

  gl_FragColor = mix(night, day, blend);
}
