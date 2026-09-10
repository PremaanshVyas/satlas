uniform float uSize;
// 0 = at the previous position set, 1 = at the current one. Advanced every frame so motion
// is smooth at the render rate rather than stepping whenever the propagator replies.
uniform float uLerp;

// Per-instance state. Position lives here rather than in the instance matrix so publishing
// a new set is a memcpy instead of ~34,000 matrix compositions on the main thread.
attribute vec3 aPos;
attribute vec3 aPrev;
attribute float aScale;

varying vec2 vUv;
varying vec3 vColor;

void main() {
  vUv = uv;

  vec3 center = mix(aPrev, aPos, uLerp);
  float scale = aScale;

#ifdef USE_INSTANCING_COLOR
  vColor = instanceColor;
#else
  vColor = vec3(1.0);
#endif

  // Billboard: project the center to camera space, then offset the quad
  // vertices in camera space so the disc always faces the viewer.
  // A hidden instance has scale 0, which collapses the quad to zero area.
  vec4 mv = modelViewMatrix * vec4(center, 1.0);
  mv.xy += position.xy * uSize * scale;
  gl_Position = projectionMatrix * mv;
}
