// A frame seen through a lens that racks its focus.
//
// `first` and `down` halve the frame level by level, so each level holds it a
// step further out of focus. `show` puts the frame on the surface: as it is
// inside the box in focus, and out of focus around it. Colours are squared on
// the way in and rooted on the way out, which is close to working in light: a
// bright line spreads into a glow, not into a grey smear.

struct View {
    centre: vec2f,
    half_size: vec2f,
    radius: f32,
    soft: f32,
    blur: f32,
    sink: f32,
    ground: vec3f,
    smear: f32,
}

const SMEAR_TAPS = 9;

// How far a frame smears before the smear has taken it over, in pixels.
const SMEAR_SHOWS_BY = 24.0;

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var filtered: sampler;
@group(0) @binding(2) var levels: texture_2d<f32>;
@group(0) @binding(3) var<uniform> view: View;

@vertex
fn whole(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
    let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
    return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

// The middle of a pixel of the level being drawn, and the four corners round it.
fn taps(place: vec2f) -> array<vec3f, 5> {
    let size = vec2f(textureDimensions(source));
    let at = place / floor(size / 2.0);
    let texel = 1.0 / size;
    return array<vec3f, 5>(
        textureSampleLevel(source, filtered, at, 0.0).rgb,
        textureSampleLevel(source, filtered, at + texel * vec2f(-1.0, -1.0), 0.0).rgb,
        textureSampleLevel(source, filtered, at + texel * vec2f(1.0, -1.0), 0.0).rgb,
        textureSampleLevel(source, filtered, at + texel * vec2f(-1.0, 1.0), 0.0).rgb,
        textureSampleLevel(source, filtered, at + texel * vec2f(1.0, 1.0), 0.0).rgb,
    );
}

@fragment
fn first(@builtin(position) place: vec4f) -> @location(0) vec4f {
    let t = taps(place.xy);
    let sum = t[0] * t[0] * 4.0 + t[1] * t[1] + t[2] * t[2] + t[3] * t[3] + t[4] * t[4];
    return vec4f(sum / 8.0, 1.0);
}

@fragment
fn down(@builtin(position) place: vec4f) -> @location(0) vec4f {
    let t = taps(place.xy);
    return vec4f((t[0] * 4.0 + t[1] + t[2] + t[3] + t[4]) / 8.0, 1.0);
}

// How far outside the box in focus a point is, in pixels.
fn outside_box(place: vec2f) -> f32 {
    let corner = abs(place - view.centre) - view.half_size + view.radius;
    return length(max(corner, vec2f(0.0))) + min(max(corner.x, corner.y), 0.0) - view.radius;
}

// A level at a point, on a cubic spline: a level is small, and plain filtering
// shows its pixels as diamonds.
fn level_at(uv: vec2f, level: i32) -> vec3f {
    let size = vec2f(textureDimensions(levels, level));
    let point = uv * size - 0.5;
    let f = fract(point);
    let base = point - f + 0.5;
    let w0 = (1.0 - f) * (1.0 - f) * (1.0 - f) / 6.0;
    let w1 = (3.0 * f * f * f - 6.0 * f * f + 4.0) / 6.0;
    let w2 = (-3.0 * f * f * f + 3.0 * f * f + 3.0 * f + 1.0) / 6.0;
    let w3 = f * f * f / 6.0;
    let g0 = w0 + w1;
    let g1 = w2 + w3;
    let near = (base + w1 / g0 - 1.0) / size;
    let far = (base + w3 / g1 + 1.0) / size;
    let down_near = mix(
        textureSampleLevel(levels, filtered, vec2f(far.x, near.y), f32(level)),
        textureSampleLevel(levels, filtered, near, f32(level)),
        g0.x,
    );
    let down_far = mix(
        textureSampleLevel(levels, filtered, far, f32(level)),
        textureSampleLevel(levels, filtered, vec2f(near.x, far.y), f32(level)),
        g0.x,
    );
    return mix(down_far, down_near, g0.y).rgb;
}

// The frame this many pixels out of focus.
fn out_of_focus(uv: vec2f, sharp: vec3f, blur: f32) -> vec3f {
    if blur < 2.0 {
        return mix(sharp, level_at(uv, 0), blur / 2.0);
    }
    let level = min(log2(blur) - 1.0, f32(textureNumLevels(levels)) - 1.001);
    let low = floor(level);
    return mix(level_at(uv, i32(low)), level_at(uv, i32(low) + 1), level - low);
}

// A frame in travel: what it passes on the way across, as a shutter sees it.
// Each pixel starts its taps at its own offset, which turns the bands that a few
// taps leave into a grain too fine to see in motion.
fn smeared(uv: vec2f, place: vec2f, seen: vec3f) -> vec3f {
    if view.smear <= 0.0 {
        return seen;
    }
    let across = view.smear / f32(textureDimensions(source).x);
    let offset = fract(52.9829189 * fract(dot(place, vec2f(0.06711056, 0.00583715))));
    var sum = vec3f(0.0);
    for (var tap = 0; tap < SMEAR_TAPS; tap++) {
        let along = (f32(tap) + offset) / f32(SMEAR_TAPS) - 0.5;
        sum += textureSampleLevel(levels, filtered, uv + vec2f(along * across, 0.0), 0.0).rgb;
    }
    return mix(seen, sum / f32(SMEAR_TAPS), saturate(view.smear / SMEAR_SHOWS_BY));
}

@fragment
fn show(@builtin(position) place: vec4f) -> @location(0) vec4f {
    let frame = textureLoad(source, vec2i(place.xy), 0).rgb;
    let outside = smoothstep(0.0, view.soft, outside_box(place.xy));
    if outside <= 0.0 {
        return vec4f(frame, 1.0);
    }
    let uv = place.xy / vec2f(textureDimensions(source));
    let seen = smeared(uv, place.xy, out_of_focus(uv, frame * frame, view.blur * outside));
    let ground = view.ground * view.ground;
    return vec4f(sqrt(mix(seen, ground, view.sink * outside)), 1.0);
}
