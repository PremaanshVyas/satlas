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

  // MODIS land_ocean_ice texture has natural vivid colours — only gentle grading needed.

  // Detect ocean vs land: open water has blue dominant over red
  float oceanFactor = clamp((day.b - day.r * 1.15) * 3.0, 0.0, 1.0);

  // Ocean → deep navy. Let more original through to preserve shallow-water variation.
  vec3 deepOcean = vec3(0.04, 0.14, 0.48);
  vec3 oceanColor = deepOcean + day.rgb * 0.25;

  // Land → gentle saturation nudge only; no brightness multiplier on a natural-colour source.
  float landLuma = dot(day.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 landColor = clamp(mix(vec3(landLuma), day.rgb, 1.2), 0.0, 1.0);

  day.rgb = mix(landColor, oceanColor, oceanFactor);

  // Soft contrast: 40 % S-curve blend — adds depth without blowing out natural colours.
  vec3 curved = day.rgb * day.rgb * (3.0 - 2.0 * day.rgb);
  day.rgb = clamp(mix(day.rgb, curved, 0.4), 0.0, 1.0);

  // Ocean specular glint — Blinn-Phong highlight on water
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 halfVec = normalize(sunDir + viewDir);
  float spec = pow(max(dot(vNormal, halfVec), 0.0), 80.0);
  float onDay = clamp(cosAngle * 5.0, 0.0, 1.0);
  day.rgb += spec * oceanFactor * 0.25 * onDay * vec3(0.8, 0.9, 1.0);

  // City lights: brightened and tinted slightly blue for atmospheric scatter
  vec4 nightSample = texture2D(nightTexture, vUv);
  vec4 night = vec4(nightSample.rgb * 3.5, 1.0);
  night.rgb = mix(night.rgb, night.rgb * vec3(0.8, 0.85, 1.0), 0.35);

  gl_FragColor = mix(night, day, blend);
}
