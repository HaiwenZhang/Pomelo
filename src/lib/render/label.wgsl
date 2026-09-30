@group(0) @binding(1)
var atlas: texture_2d<f32>;
@group(0) @binding(2)
var linearSampler: sampler;
struct Out {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
    @location(1) color: vec4f
}

@vertex
fn vs(@builtin(vertex_index) i: u32, @location(0) xywh: vec4f, @location(1) uv: vec4f, @location(2) color: vec4f, @location(3) rotation: vec4f, @location(4) low: vec2f) -> Out {
    let corners = array<vec2f, 6>(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1));
    let corner = corners[i];
    let d = corner * xywh.zw;
    let relative = relativePosition(xywh.xy, low) + vec2f((d.x * rotation.x - d.y * rotation.y) * rotation.z, d.x * rotation.y + d.y * rotation.x);
    var out: Out;
    out.pos = clipPosition(relative);
    // Shapes already carry their own alpha; drill spans also survive Global=0.
    // Keep the flag per glyph because spans and via net names share a batch.
    out.uv = mix(vec2f(uv.x, uv.w), vec2f(uv.z, uv.y), corner);
    // Low bit is independent opacity; upper bits identify a CPU-selected atlas page.
    out.color = vec4f(color.rgb, color.a * select(view.settings.x, 1.0, (u32(rotation.w) & 1u) != 0u));
    return out;
}

@fragment
fn fs(i: Out) -> @location(0) vec4f {
    let sample = textureSample(atlas, linearSampler, i.uv).rgb;
    let distance = max(min(sample.r, sample.g), min(max(sample.r, sample.g), sample.b));
    let atlasSize = vec2f(textureDimensions(atlas));
    let dx = length(dpdx(i.uv) * atlasSize);
    let dy = length(dpdy(i.uv) * atlasSize);
    let screenRange = 4.0 / max(max(dx, dy), 0.0001);
    let softness = 0.5 / max(screenRange, 1.0);
    let body = smoothstep(0.5 - softness, 0.5 + softness, distance);
    let overlay = select(vec3f(1), vec3f(.63, 1, .85), view.settings.w > 1.5);
    let color = select(i.color.rgb, overlay, view.settings.w > .5);
    return vec4f(color, i.color.a * body);
}
