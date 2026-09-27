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
