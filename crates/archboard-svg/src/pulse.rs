//! Traffic drawn as a beam of light (ADR 0027): a gradient painted onto a bar
//! that slides along each straight or bending piece of the route, and a soft
//! mask in the shape of that piece lets it through. A train of pulses is one
//! repeating gradient that slides by one spacing every spacing's time; a
//! message's pulse crosses its line once in every turn of the shared clock.

use archboard_scene::attrs;
use archboard_scene::geometry::{Segment, coord, round_coord};
use archboard_scene::js;
use archboard_scene::markup::{Markup, markup_of, short_hash, tag, wrap};
use archboard_scene::route::{Leg, leg_path, legs_of, plain};
use archboard_scene::scene::{Motion, PulseLook, TrafficMark};

/// The class every moving mark carries, for the stylesheet to hide it from a
/// reader who asked for less motion.
pub const PULSE_CLASS: &str = "ab-pulse";

const CORE_LEAST: f64 = 1.5;
const CORE_OVER_LINE: f64 = 0.6;
/// How a pulse falls off across its line: how much wider than its core each
/// layer of the glow is, and how much light it lets through.
const GLOW: [(f64, f64); 4] = [(6.0, 0.07), (3.4, 0.2), (1.3, 0.5), (0.0, 0.9)];
const HALO_OVER: f64 = 1.0;
const HEAD: f64 = 12.0;
const TAIL: f64 = 56.0;
const FRONT: f64 = 3.0;
const FILL: f64 = 0.8;
const TAIL_CURVE: f64 = 2.3;
const TAIL_LIGHT: f64 = 0.6;
const TAIL_STEPS: u32 = 9;
const MASK_ROOM: f64 = 2.0;
const BAR_ROOM: f64 = 1.0;

/// How thick a pulse is on a line of one width: the width of its core.
fn pulse_breadth(line_width: f64) -> f64 {
    js::js_max(CORE_LEAST, line_width + CORE_OVER_LINE)
}

/// How long a pulse's tail is where pulses are `room` apart.
fn tail_for(room: f64) -> f64 {
    js::js_max(0.0, js::js_min(TAIL, room * FILL - HEAD - FRONT))
}

/// How high a bar must be to cover its piece's mask.
fn bar_height(leg: &Leg, core: f64) -> f64 {
    core + GLOW[0].0 + 2.0 * leg.sag + 2.0 * BAR_ROOM
}

/// The box the light of a piece stays inside, spelt as the markup spells it.
fn box_of(leg: &Leg, core: f64) -> [String; 4] {
    let reach = (core + GLOW[0].0) / 2.0 + MASK_ROOM;
    let mut points = vec![leg.from, leg.segment.to()];
    if let Segment::Cubic { first, second, .. } = leg.segment {
        points.push(first);
        points.push(second);
    }
    let x0 = js::min(points.iter().map(|point| point.x)) - reach;
    let y0 = js::min(points.iter().map(|point| point.y)) - reach;
    let width = js::max(points.iter().map(|point| point.x)) + reach - x0;
    let height = js::max(points.iter().map(|point| point.y)) + reach - y0;
    [coord(x0), coord(y0), coord(width), coord(height)]
}

/// A definition and the id it is referred to by.
struct Defined {
    id: String,
    markup: String,
}

/// The clip that keeps the light of a piece inside the box of its mask.
fn clip_of(leg: &Leg, core: f64) -> Defined {
    let [x, y, width, height] = box_of(leg, core);
    let rect = markup_of(&tag("rect", attrs! { "x": x, "y": y, "width": width, "height": height }));
    let id = format!("ab-clip-{}", short_hash(&rect));
    Defined { markup: format!("<clipPath id=\"{id}\">{rect}</clipPath>"), id }
}

/// The mask that lets a beam through only where a piece of the route is.
fn mask_of(leg: &Leg, core: f64) -> Defined {
    let joined = leg_path(leg, true);
    let exact = leg_path(leg, false);
    let [x, y, width, height] = box_of(leg, core);
    let layers: String = GLOW
        .iter()
        .map(|(over, light)| {
            markup_of(&tag(
                "path",
                attrs! {
                    "d": if *over > HALO_OVER { exact.as_str() } else { joined.as_str() },
                    "fill": "none",
                    "stroke": "#ffffff",
                    "stroke-width": plain(core + over, 2),
                    "stroke-opacity": *light,
                },
            ))
        })
        .collect();
    let markup =
        format!("maskUnits=\"userSpaceOnUse\" x=\"{x}\" y=\"{y}\" width=\"{width}\" height=\"{height}\">{layers}");
    let id = format!("ab-mask-{}", short_hash(&markup));
    Defined { markup: format!("<mask id=\"{id}\" {markup}</mask>"), id }
}

/// The gradient a pulse is painted with, along one axis, its front at the far end.
fn gradient_of(look: &PulseLook, span: f64, tail: f64, repeat: bool) -> Defined {
    let reach = FRONT + HEAD + tail;
    let stop = |behind: f64, colour: &str, light: f64| {
        markup_of(&tag(
            "stop",
            attrs! {
                "offset": plain((span - behind) / span, 4),
                "stop-color": colour,
                "stop-opacity": plain(light, 3),
            },
        ))
    };
    let mut stops = String::new();
    if tail >= 1.0 {
        for step in 0..TAIL_STEPS {
            let share = f64::from(step) / f64::from(TAIL_STEPS);
            stops.push_str(&stop(reach - tail * share, &look.head, TAIL_LIGHT * js::pow(share, TAIL_CURVE)));
        }
    }
    stops.push_str(&stop(FRONT + HEAD, &look.head, TAIL_LIGHT));
    stops.push_str(&stop(FRONT + HEAD * 0.45, &look.hot, 0.9));
    stops.push_str(&stop(FRONT, &look.hot, 1.0));
    stops.push_str(&stop(0.0, &look.hot, 0.0));
    let markup = format!(
        "gradientUnits=\"userSpaceOnUse\" x1=\"0\" y1=\"0\" x2=\"{}\" y2=\"0\"{}>{stops}",
        plain(span, 4),
        if repeat { " spreadMethod=\"repeat\"" } else { "" }
    );
    let id = format!("ab-beam-{}", short_hash(&markup));
    Defined { markup: format!("<linearGradient id=\"{id}\" {markup}</linearGradient>"), id }
}

/// A duration as a SMIL timecount: decimal, never with an exponent.
fn timecount(seconds: f64) -> String {
    format!("{}s", js::plain_decimal(seconds))
}

/// A point on the cycle, as SMIL spells a key time: clamped, six places.
fn ratio(value: f64) -> String {
    js::to_fixed(js::js_min(js::js_max(value, 0.0), 1.0), 6)
}

/// A number held to one period.
fn within(value: f64, period: f64) -> f64 {
    ((value % period) + period) % period
}

/// How one piece's bar sits in the piece's frame, and what it is painted with.
struct Bar<'a> {
    mask: &'a str,
    clip: &'a str,
    gradient: &'a str,
    shift: f64,
    from: f64,
    width: f64,
    height: f64,
    motion: &'a Markup,
}

/// One piece of a pulse: the mask, the clip inside it, and the bar that slides behind them.
fn leg_markup(leg: &Leg, bar: &Bar) -> String {
    let shift = if bar.shift == 0.0 { String::new() } else { format!(" translate({} 0)", plain(bar.shift, 2)) };
    let slide = wrap(
        "g",
        attrs! { "transform": format!("{}{shift}", leg.frame) },
        wrap(
            "rect",
            attrs! {
                "x": plain(bar.from, 2),
                "y": plain(-bar.height / 2.0, 2),
                "width": plain(bar.width, 2),
                "height": plain(bar.height, 2),
                "fill": format!("url(#{})", bar.gradient),
            },
            bar.motion.clone(),
        ),
    );
    markup_of(&wrap(
        "g",
        attrs! { "mask": format!("url(#{})", bar.mask) },
        wrap("g", attrs! { "clip-path": format!("url(#{})", bar.clip) }, slide),
    ))
}

/// A pulse as a group: its gradient and the masks and clips of its pieces, then the pieces.
fn pulse_group(gradient: &Defined, pieces: &[(Defined, Defined, String)], out: &mut String) {
    out.push_str("<g class=\"");
    out.push_str(PULSE_CLASS);
    out.push_str("\" pointer-events=\"none\"><defs>");
    out.push_str(&gradient.markup);
    for (mask, clip, _) in pieces {
        out.push_str(&mask.markup);
        out.push_str(&clip.markup);
    }
    out.push_str("</defs>");
    for (_, _, markup) in pieces {
        out.push_str(markup);
    }
    out.push_str("</g>");
}

/// A line's traffic: a steady train of pulses `spacing` apart flying at `speed`.
fn steady_pulses(look: &PulseLook, legs: &[Leg], speed: f64, spacing: f64, phase: f64, out: &mut String) {
    let period = round_coord(spacing);
    let core = pulse_breadth(look.line_width);
    let gradient = gradient_of(look, period, tail_for(period), true);
    let motion = tag(
        "animateTransform",
        attrs! {
            "attributeName": "transform",
            "type": "translate",
            "from": "0 0",
            "to": format!("{} 0", plain(period, 4)),
            "dur": timecount(period / speed),
            "repeatCount": "indefinite",
            "calcMode": "linear",
        },
    );
    let pieces: Vec<(Defined, Defined, String)> = legs
        .iter()
        .map(|leg| {
            let mask = mask_of(leg, core);
            let clip = clip_of(leg, core);
            let markup = leg_markup(
                leg,
                &Bar {
                    mask: &mask.id,
                    clip: &clip.id,
                    gradient: &gradient.id,
                    shift: within(phase - leg.along + FRONT, period) - period,
                    from: -period - 1.0,
                    width: leg.length + 2.0 * period + 2.0,
                    height: bar_height(leg, core),
                    motion: &motion,
                },
            );
            (mask, clip, markup)
        })
        .collect();
    pulse_group(&gradient, &pieces, out);
}

/// How a message's bar slides along one piece of its route.
fn slide_of(leg: &Leg, speed: f64, cycle: f64, start: f64) -> Markup {
    let span = FRONT + HEAD + TAIL;
    let slide_at = |time: f64| (time - start) * speed - leg.along + FRONT - span;
    let moment_of = |slide: f64| start + (slide + leg.along - FRONT + span) / speed;
    let from = js::js_max(0.0, moment_of(-span - 1.0));
    let to = js::js_min(cycle, moment_of(leg.length + 1.0));
    let slides = [slide_at(from), slide_at(from), slide_at(to), slide_at(to)];
    tag(
        "animateTransform",
        attrs! {
            "attributeName": "transform",
            "type": "translate",
            "values": slides.iter().map(|x| format!("{} 0", plain(*x, 2))).collect::<Vec<_>>().join(";"),
            "keyTimes": ["0".to_owned(), ratio(from / cycle), ratio(to / cycle), "1".to_owned()].join(";"),
            "dur": timecount(cycle),
            "repeatCount": "indefinite",
            "calcMode": "linear",
        },
    )
}

/// A message's pulse: one that crosses its line once in every turn of the clock.
fn turn_pulse(look: &PulseLook, legs: &[Leg], speed: f64, cycle: f64, start: f64, out: &mut String) {
    let core = pulse_breadth(look.line_width);
    let span = FRONT + HEAD + TAIL;
    let gradient = gradient_of(look, span, TAIL, false);
    let pieces: Vec<(Defined, Defined, String)> = legs
        .iter()
        .map(|leg| {
            let mask = mask_of(leg, core);
            let clip = clip_of(leg, core);
            let motion = slide_of(leg, speed, cycle, start);
            let markup = leg_markup(
                leg,
                &Bar {
                    mask: &mask.id,
                    clip: &clip.id,
                    gradient: &gradient.id,
                    shift: 0.0,
                    from: 0.0,
                    width: span,
                    height: bar_height(leg, core),
                    motion: &motion,
                },
            );
            (mask, clip, markup)
        })
        .collect();
    pulse_group(&gradient, &pieces, out);
}

/// One train of pulses written as SVG.
pub fn write_traffic(mark: &TrafficMark, out: &mut String) {
    let legs = legs_of(&mark.route);
    match mark.motion {
        Motion::Steady { speed, spacing, phase } => steady_pulses(&mark.look, &legs, speed, spacing, phase, out),
        Motion::Turn { speed, cycle, start } => turn_pulse(&mark.look, &legs, speed, cycle, start, out),
    }
}
