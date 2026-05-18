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

  // NASA Blue Marble has muted grey-blue oceans and flat land colours.
  // Brightening alone doesn't fix this — we need to colour-grade each pixel type.

  // Detect ocean vs land: open water has blue dominant over red
  float oceanFactor = clamp((day.b - day.r * 1.15) * 3.0, 0.0, 1.0);

  // Ocean → deep iconic blue. Keep a small fraction of the original for foam/cloud detail.
  vec3 deepOcean = vec3(0.03, 0.16, 0.52);
  vec3 oceanColor = deepOcean + day.rgb * 0.18;

  // Land → strong saturation + contrast boost
  float landLuma = dot(day.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 landColor = clamp(mix(vec3(landLuma), day.rgb, 2.1) * 1.7, 0.0, 1.0);

  day.rgb = mix(landColor, oceanColor, oceanFactor);

  // S-curve contrast: deepens shadows, pops highlights — the signature of globe renders
  day.rgb = day.rgb * day.rgb * (3.0 - 2.0 * day.rgb);
  day.rgb = clamp(day.rgb * 1.6, 0.0, 1.0);

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
