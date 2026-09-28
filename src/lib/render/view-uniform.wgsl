struct View {
  camera: vec4f,
  viewport: vec4f,
  settings: vec4f,
  cameraLow: vec4f
}

@group(0) @binding(0)
var<uniform> view: View;
// Subtract high parts first: nearby coordinates cancel exactly, leaving the
// fine position intact instead of rounding it away at board-scale magnitudes.
fn relativePosition(high: vec2f, low: vec2f) -> vec2f {
  return (high - view.camera.xy) + (low - view.cameraLow.xy);
}

fn clipPosition(relative: vec2f) -> vec4f {
  return vec4f(relative * vec2f(2.0 * view.camera.w / view.viewport.x, 2.0 / view.viewport.y) * view.camera.z, 0, 1);
}

// Generated float32 byte/255 constants avoid backend reciprocal rounding.
/* UNORM8_TABLE */

// Negative alpha is a packed copper material, not opacity. Keep the geometry
// and net RGB resident when switching to layer colors (cameraLow.z == 0).
fn materialColor(color: vec4f) -> vec4f {
  if (color.a >= 0.0) { return color; }
  if (view.cameraLow.z > 0.5) { return vec4f(color.rgb, 1.0); }
  let packed = u32(-color.a - 1.0);
  let layer = vec3f(unorm8[(packed >> 16u) & 255u], unorm8[(packed >> 8u) & 255u], unorm8[packed & 255u]);
  return vec4f(layer, 1.0);
}
