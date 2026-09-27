struct Out {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) ab: vec4f,
  @location(2) @interpolate(flat) params: vec4f,
  @location(3) @interpolate(flat) color: vec4f,
  @location(4) @interpolate(flat) circleLow: vec4f
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @location(0) source: vec4f, @location(1) params: vec4f, @location(2) color: vec4f, @location(3) low: vec4f) -> Out {
  var ab = vec4f(relativePosition(source.xy, low.xy), source.zw);
  if (params.z < .5) {
    ab = vec4f(ab.xy, relativePosition(source.zw, low.zw));
  }
  let corners = array<vec2f, 6>(vec2f(- 1, - 1), vec2f(1, - 1), vec2f(- 1, 1), vec2f(- 1, 1), vec2f(1, - 1), vec2f(1, 1));
  let aa = 2.0 / view.camera.z;
  var center = ab.xy;
  var extent = vec2f(ab.z + params.x * .5 + aa);
  if (params.z < .5) {
    center = (ab.xy + ab.zw) * .5;
    extent = abs(ab.zw - ab.xy) * .5 + params.x * .5 + aa;
  }
  if (params.z > 3.5 && params.z < 6.5) {
    let c = abs(cos(params.x));
    let s = abs(sin(params.x));
    extent = vec2f(c * ab.z + s * ab.w, s * ab.z + c * ab.w) + aa;
  }
  let world = center + corners[vi] * extent;
  var out: Out;
  out.position = clipPosition(world);
  out.local = (center - ab.xy) + corners[vi] * extent;
  out.ab = ab;
  out.params = params;
  out.color = color;
  out.circleLow = vec4f(0);
  if (params.z > 6.5) {
    let limit = view.viewport.xy * .5 / view.camera.z;
    let lo = clamp(center - extent, - limit, limit);
    let hi = clamp(center + extent, - limit, limit);
    out.position = clipPosition(mix(lo, hi, corners[vi] * .5 + .5));
    let relative = lineRelative(source.xy, low.xy);
    out.ab = vec4f(relative.xy, source.zw);
    out.circleLow = vec4f(relative.zw, low.zw);
  }
  if (params.z < .5 && length(ab.zw - ab.xy) * view.camera.z > 16384.0) {
    let limit = view.viewport.xy * .5 / view.camera.z;
    let lo = clamp(min(ab.xy, ab.zw) - params.x * .5 - aa, - limit, limit);
    let hi = clamp(max(ab.xy, ab.zw) + params.x * .5 + aa, - limit, limit);
    out.position = clipPosition(mix(lo, hi, corners[vi] * .5 + .5));
    // Entirely offscreen instances collapse to zero area. Avoid compensated
    // arithmetic for these common cases in large, partially visible batches.
    if (any(lo >= hi)) {
      return out;
    }
    let a = lineRelative(source.xy, low.xy);
    let b = lineRelative(source.zw, low.zw);
    let dx = lineSum(b.xz, - a.xz);
    let dy = lineSum(b.yw, - a.yw);
    let d = vec4f(dx.x, dy.x, dx.y, dy.y);
    let magnitude = length(d.xy + d.zw);
    let cross = lineSum(lineProduct(a.xz, d.yw), - lineProduct(a.yw, d.xz));
    // Reuse the existing flat attributes: unit tangent, signed normal offset,
    // start/end projections. A negative params.w selects this line-only path.
    out.ab = vec4f((d.xy + d.zw) / magnitude, (cross.x + cross.y) / magnitude, lineDot(a, d) / magnitude);
    out.params = vec4f(params.x, lineDot(b, d) / magnitude, 0, - 1);
  }
  return out;
}

@fragment
fn fs(i: Out) -> @location(0) vec4f {
  let px = 1.0 / view.camera.z;
  var distance = 0.0;
  if (i.params.z < .5) {
    if (i.params.w < - .5) {
      let screen = (i.position.xy / view.viewport.z - view.viewport.xy * .5) * vec2f(view.camera.w, - 1) * px;
      let along = dot(screen, i.ab.xy);
      let normal = dot(screen, vec2f(- i.ab.y, i.ab.x)) + i.ab.z;
      let cap = max(max(i.ab.w - along, along - i.params.y), 0.0);
      distance = length(vec2f(cap, normal)) - max(i.params.x * .5, px * .5);
    }
    else {
      let ba = i.ab.zw - i.ab.xy;
      let h = clamp(dot(i.local, ba) / max(dot(ba, ba), 1e-20), 0.0, 1.0);
      distance = length(i.local - ba * h) - max(i.params.x * .5, px * .5);
    }
  }
  else if (i.params.z > 6.5) {
    // Screen-derived compensated radial distances preserve both rims when a
    // real millimetre-size mounting pad is magnified beyond the viewport.
    let screen = (i.position.xy / view.viewport.z - view.viewport.xy * .5) * vec2f(view.camera.w, - 1) * px;
    let x = lineSum(vec2f(screen.x, 0), - vec2f(i.ab.x, i.circleLow.x));
    let y = lineSum(vec2f(screen.y, 0), - vec2f(i.ab.y, i.circleLow.y));
    let squared = lineSum(lineProduct(x, x), lineProduct(y, y));
    let radial = length(vec2f(x.x + x.y, y.x + y.y));
    let outer = vec2f(i.ab.z, i.circleLow.z);
    let inner = vec2f(i.ab.w, i.circleLow.w);
    let a = lineSum(squared, - lineProduct(outer, outer));
    let b = lineSum(squared, - lineProduct(inner, inner));
    distance = max((a.x + a.y) / (radial + outer.x + outer.y), - (b.x + b.y) / (radial + inner.x + inner.y));
    if (view.settings.y < .5 || view.settings.w > .5) {
      distance = abs(distance) - px * .65;
    }
  }
  else if (i.params.z > 3.5) {
    let c = cos(i.params.x);
    let s = sin(i.params.x);
    let p = abs(vec2f(c * i.local.x + s * i.local.y, - s * i.local.x + c * i.local.y));
    let corner = i.params.y;
    if (i.params.z < 4.5 || i.params.z > 5.5) {
      let q = p - i.ab.zw + corner;
      distance = length(max(q, vec2f(0))) + min(max(q.x, q.y), 0.0) - corner;
    }
    else {
      let q = p - i.ab.zw;
      distance = max(max(q.x, q.y), (p.x + p.y - i.ab.z - i.ab.w + corner) * .70710678);
    }
    if ((i.params.z < 5.5 && view.settings.y < .5) || view.settings.w > .5) {
      distance = abs(distance) - px * .65;
    }
  }
  else {
    distance = length(i.local) - i.ab.z;
    if ((i.params.z < 2.5 && i.params.w < .5 && view.settings.y < .5) || view.settings.w > .5) {
      distance = abs(distance) - px * .65;
    }
  }
  let alpha = 1.0 - smoothstep(- px * .65, px * .65, distance);
  if (view.settings.w > .5) {
    var coverage = alpha;
    if (i.params.z < 1.5) {
      let edge = 1.0 - smoothstep(px * .6, px * 1.6, abs(distance));
      let screen = i.position.xy / view.viewport.z;
      let cell = screen - floor(screen / 5.0) * 5.0 - vec2f(2.5);
      let dots = 1.0 - smoothstep(.65, 1.25, length(cell));
      coverage = max(edge, select(dots * alpha, 0.0, view.settings.w > 1.5 && view.settings.w < 2.5));
    }
    let color = select(vec3f(1), vec3f(.63, 1, .85), view.settings.w > 1.5);
    return vec4f(color, coverage * .9);
  }
  if (i.params.w > .5) {
    // Screen-space pattern; unlike the pad boundary it does not grow with zoom.
    let screen = i.position.xy / view.viewport.z;
    let diagonal = vec2f(screen.x + screen.y, screen.x - screen.y);
    let cell = abs(fract(diagonal / 8.0) - .5) * 8.0;
    let hatch = 1.0 - smoothstep(.35, 1.05, min(cell.x, cell.y));
    let annulus = smoothstep(- px * .65, px * .65, length(i.local) - i.params.x);
    let coverage = max(hatch, annulus);
    let rgb = mix(i.color.rgb, vec3f(1), hatch / max(coverage, .0001));
    return vec4f(rgb, alpha * coverage * view.settings.x);
  }
  return vec4f(i.color.rgb, i.color.a * alpha * view.settings.x);
}
