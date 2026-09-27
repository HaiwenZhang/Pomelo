fn lineSum(a: vec2f, b: vec2f) -> vec2f {
  let sum = a.x + b.x;
  let v = sum - a.x;
  let error = (a.x - (sum - v)) + (b.x - v) + a.y + b.y;
  let high = sum + error;
  return vec2f(high, error - (high - sum));
}

fn lineProduct(a: vec2f, b: vec2f) -> vec2f {
  let ca = 4097.0 * a.x;
  let ah = ca - (ca - a.x);
  let al = a.x - ah;
  let cb = 4097.0 * b.x;
  let bh = cb - (cb - b.x);
  let bl = b.x - bh;
  let product = a.x * b.x;
  let error = ((ah * bh - product) + ah * bl + al * bh) + al * bl + a.x * b.y + a.y * b.x;
  return lineSum(vec2f(product, 0), vec2f(error, 0));
}

fn lineRelative(high: vec2f, low: vec2f) -> vec4f {
  let x = lineSum(vec2f(high.x, low.x), - vec2f(view.camera.x, view.cameraLow.x));
  let y = lineSum(vec2f(high.y, low.y), - vec2f(view.camera.y, view.cameraLow.y));
  return vec4f(x.x, y.x, x.y, y.y);
}

fn lineDot(a: vec4f, b: vec4f) -> f32 {
  let value = lineSum(lineProduct(a.xz, b.xz), lineProduct(a.yw, b.yw));
  return value.x + value.y;
}
