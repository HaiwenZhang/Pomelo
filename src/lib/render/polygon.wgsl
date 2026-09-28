struct Out {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f
}

@vertex
fn vs(@location(0) position: vec2f, @location(1) color: vec4f, @location(2) low: vec2f) -> Out {
    var out: Out;
    out.position = clipPosition(relativePosition(position, low));
    out.color = materialColor(color);
    return out;
}

@fragment
fn fs(i: Out) -> @location(0) vec4f {
    if (view.settings.w > .5) {
        if (view.settings.w > 1.5) {
            return vec4f(.63, 1, .85, .18);
        }
        let screen = i.position.xy / view.viewport.z;
        let cell = screen - floor(screen / 5.0) * 5.0 - vec2f(2.5);
        return vec4f(1, 1, 1, (1.0 - smoothstep(.65, 1.25, length(cell))) * .8);
    }
    return vec4f(i.color.rgb, i.color.a * view.settings.x * view.settings.z);
}
