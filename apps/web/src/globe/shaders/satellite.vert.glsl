uniform float uSize;

varying vec2 vUv;
varying vec3 vColor;

void main() {
  vUv = uv;

#ifdef USE_INSTANCING
  // Extract world-space center and uniform scale from the instance matrix.
  // Column 0 holds the scaled X basis; its length equals the instance scale.
  vec3 center = vec3(instanceMatrix[3]);
  float scale  = length(vec3(instanceMatrix[0]));
#else
  vec3 center = position;
  float scale  = 1.0;
#endif

#ifdef USE_INSTANCING_COLOR
  vColor = instanceColor;
#else
  vColor = vec3(1.0);
#endif

  // Billboard: project the center to camera space, then offset the quad
  // vertices in camera space so the disc always faces the viewer.
  vec4 mv = modelViewMatrix * vec4(center, 1.0);
  mv.xy += position.xy * uSize * scale;
  gl_Position = projectionMatrix * mv;
}
