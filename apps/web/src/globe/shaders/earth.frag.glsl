uniform sampler2D dayTexture;
uniform sampler2D nightTexture;
uniform vec3 sunDirection;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
  vec3 sunDir = normalize(sunDirection);
  float cosAngle = dot(vNormal, sunDir);

  // Crisp terminator with a narrow twilight band
  float blend = smoothstep(-0.1, 0.15, cosAngle);

  vec4 day = texture2D(dayTexture, vUv);

  // Aggressive brightness — makes the planet look vivid like other globe sites
  day.rgb *= 2.1;

  // Saturation boost — pulls ocean blue and land green far from grey
  float luma = dot(day.rgb, vec3(0.2126, 0.7152, 0.0722));
  day.rgb = clamp(mix(vec3(luma), day.rgb, 1.7), 0.0, 1.0);

  // Deep-blue push for ocean pixels (blue > red signals open water)
  float oceanMask = clamp(day.b - day.r * 0.8, 0.0, 1.0);
  day.rgb += vec3(0.0, 0.03, 0.09) * oceanMask;
  day.rgb = clamp(day.rgb, 0.0, 1.0);

  // Ocean specular glint — Blinn-Phong highlight on water
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 halfVec = normalize(sunDir + viewDir);
  float spec = pow(max(dot(vNormal, halfVec), 0.0), 60.0);
  float waterMask = clamp(day.b * 2.0 - day.r - day.g * 0.5, 0.0, 1.0);
  float onDay = clamp(cosAngle * 5.0, 0.0, 1.0);
  day.rgb += spec * waterMask * 0.22 * onDay * vec3(0.85, 0.92, 1.0);

  // City lights: brightened and tinted slightly blue for atmospheric scatter
  vec4 nightSample = texture2D(nightTexture, vUv);
  vec4 night = vec4(nightSample.rgb * 3.5, 1.0);
  night.rgb = mix(night.rgb, night.rgb * vec3(0.8, 0.85, 1.0), 0.35);

  gl_FragColor = mix(night, day, blend);
}
