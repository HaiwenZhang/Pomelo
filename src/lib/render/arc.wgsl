// A number is (high, residual). Normalize every add before the next multiply;
// subtracting two kilometre-scale squared radii in a single float loses the rim.
fn dsAdd(a: vec2f, b: vec2f) -> vec2f {
  let sum = a.x + b.x;
  let v = sum - a.x;
  let error = (a.x - (sum - v)) + (b.x - v) + a.y + b.y;
  let high = sum + error;
  return vec2f(high, error - (high - sum));
}

fn dsMul(a: vec2f, b: vec2f) -> vec2f {
  let ca = 4097.0 * a.x;
  let ah = ca - (ca - a.x);
  let al = a.x - ah;
  let cb = 4097.0 * b.x;
  let bh = cb - (cb - b.x);
  let bl = b.x - bh;
  let product = a.x * b.x;
  let error = ((ah * bh - product) + ah * bl + al * bh) + al * bl + a.x * b.y + a.y * b.x;
  return dsAdd(vec2f(product, 0), vec2f(error, 0));
}

fn relativePair(high: vec2f, low: vec2f) -> vec4f {
  let x = dsAdd(vec2f(high.x, low.x), - vec2f(view.camera.x, view.cameraLow.x));
  let y = dsAdd(vec2f(high.y, low.y), - vec2f(view.camera.y, view.cameraLow.y));
  return vec4f(x.x, y.x, x.y, y.y);
}

struct Out {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat) center: vec4f,
  @location(1) @interpolate(flat) size: vec4f,
  @location(2) @interpolate(flat) a: vec4f,
  @location(3) @interpolate(flat) b: vec4f,
  @location(4) @interpolate(flat) ta: vec4f,
  @location(5) @interpolate(flat) tb: vec4f,
  @location(6) @interpolate(flat) flags: vec4f,
  @location(7) @interpolate(flat) color: vec4f,
}

fn tangent(point: vec4f, center: vec4f) -> vec4f {
  let x = dsAdd(point.xz, - center.xz);
  let y = dsAdd(point.yw, - center.yw);
  return vec4f(- y.x, x.x, - y.y, x.y);
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @location(0) circle: vec4f, @location(1) ends: vec4f, @location(2) bounds: vec4f, @location(3) color: vec4f, @location(4) flags: vec4f, @location(5) circleLow: vec4f, @location(6) endsLow: vec4f, @location(7) boundsLow: vec4f) -> Out {
  let corners = array<vec2f, 4>(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(1, 1));
  let aa = 2.0 / view.camera.z;
  let limit = view.viewport.xy * .5 / view.camera.z;
  // Clamp before rasterization: deep zoom may put most of the arc far outside
  // the viewport. Fragment geometry comes from screen position, not a large
  // interpolated local vector or a cancellation-prone centre/radius sum.
  let lo = clamp(relativePosition(bounds.xy, boundsLow.xy) - aa, - limit, limit);
  let hi = clamp(relativePosition(bounds.zw, boundsLow.zw) + aa, - limit, limit);
  var out: Out;
  out.position = clipPosition(mix(lo, hi, corners[vi]));
  out.center = relativePair(circle.xy, circleLow.xy);
  out.size = vec4f(circle.zw, circleLow.zw);
  out.a = relativePair(ends.xy, endsLow.xy);
  out.b = relativePair(ends.zw, endsLow.zw);
  out.ta = tangent(out.a, out.center);
  out.tb = tangent(out.b, out.center);
  out.flags = flags;
  out.color = materialColor(color);
  return out;
}

fn delta(screen: vec2f, point: vec4f) -> vec4f {
  let x = dsAdd(vec2f(screen.x, 0), - point.xz);
  let y = dsAdd(vec2f(screen.y, 0), - point.yw);
  return vec4f(x.x, y.x, x.y, y.y);
}

fn preciseDot(a: vec4f, b: vec4f) -> f32 {
  let d = dsAdd(dsMul(a.xz, b.xz), dsMul(a.yw, b.yw));
  return d.x + d.y;
}

@fragment
fn fs(i: Out) -> @location(0) vec4f {
  let px = 1.0 / view.camera.z;
  let screen = (i.position.xy / view.viewport.z - view.viewport.xy * .5) * vec2f(view.camera.w, - 1) * px;
  let p = delta(screen, i.center);
  let r = i.size.xz;
  let square = dsAdd(dsAdd(dsMul(p.xz, p.xz), dsMul(p.yw, p.yw)), - dsMul(r, r));
  let radial = (square.x + square.y) / (length(p.xy + p.zw) + r.x + r.y);
  let a = delta(screen, i.a);
  let b = delta(screen, i.b);
  let after = preciseDot(a, i.ta) * i.flags.x >= 0;
  let before = preciseDot(b, i.tb) * i.flags.x <= 0;
  let inside = i.flags.z > .5 || (i.flags.x != 0 && select(after && before, after || before, i.flags.y > .5));
  var distance = abs(radial);
  if (!inside) {
    distance = min(length(a.xy + a.zw), length(b.xy + b.zw));
  }
  distance -= max((i.size.y + i.size.w) * .5, px * .5);
  let alpha = 1.0 - smoothstep(- px * .65, px * .65, distance);
  if (view.settings.w > .5) {
    let edge = 1.0 - smoothstep(px * .6, px * 1.6, abs(distance));
    let screenPx = i.position.xy / view.viewport.z;
    let cell = screenPx - floor(screenPx / 5.0) * 5.0 - vec2f(2.5);
    let dots = 1.0 - smoothstep(.65, 1.25, length(cell));
    let coverage = max(edge, select(dots * alpha, 0.0, view.settings.w > 1.5 && view.settings.w < 2.5));
    return vec4f(select(vec3f(1), vec3f(.63, 1, .85), view.settings.w > 1.5), coverage * .9);
  }
  return vec4f(i.color.rgb, i.color.a * alpha * view.settings.x);
}
