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

  // Brightness boost — NASA Blue Marble is photographic and looks dim at default
  day.rgb *= 1.35;

  // Saturation boost — pulls ocean blue and land green further from grey
  float luma = dot(day.rgb, vec3(0.2126, 0.7152, 0.0722));
  day.rgb = clamp(mix(vec3(luma), day.rgb, 1.3), 0.0, 1.0);

  // Ocean specular glint — blue-dominant pixels are water, add Blinn-Phong highlight
  // cameraPosition is a Three.js built-in uniform (world space)
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 halfVec = normalize(sunDir + viewDir);
  float spec = pow(max(dot(vNormal, halfVec), 0.0), 60.0);
  float waterMask = clamp(day.b * 2.0 - day.r - day.g * 0.5, 0.0, 1.0);
  float onDay = clamp(cosAngle * 5.0, 0.0, 1.0);
  day.rgb += spec * waterMask * 0.18 * onDay * vec3(0.85, 0.92, 1.0);

  // City lights: brightened and tinted slightly blue for atmospheric scatter
  vec4 nightSample = texture2D(nightTexture, vUv);
  vec4 night = vec4(nightSample.rgb * 3.5, 1.0);
  night.rgb = mix(night.rgb, night.rgb * vec3(0.8, 0.85, 1.0), 0.35);

  gl_FragColor = mix(night, day, blend);
}
