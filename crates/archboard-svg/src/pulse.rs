//! Traffic drawn as a beam of light: a gradient painted onto a bar
//! that slides along each straight or bending piece of the route, and a soft
//! mask in the shape of that piece lets it through. A train of pulses is one
//! repeating gradient that slides by one spacing every spacing's time; a
//! message's pulse crosses its line once in every turn of the shared clock.
//! The scene answers every number of the pulses (`pulse_train`); this file
//! spells them as SVG and SMIL.

use archboard_scene::geometry::{Point, Segment, round_coord};
use archboard_scene::js;
use archboard_scene::scene::{
    GlowLayer, LegMotion, PathStep, PulseLeg, PulseLook, PulseTrain, TrafficMark, pulse_train,
};

use crate::css::css;
use crate::path::{Spelling, path_data};
use crate::xml::{Attributes, close, coord, empty, open};

/// The class every moving mark carries, for the stylesheet to hide it from a
/// reader who asked for less motion.
pub(crate) const PULSE_CLASS: &str = "ab-pulse";

/// Seven characters of FNV-1a over some markup's UTF-16 code units, in base 36.
fn short_hash(markup: &str) -> String {
    let mut state: u32 = 0x811c_9dc5;
    for code in markup.encode_utf16() {
        state = (state ^ u32::from(code)).wrapping_mul(0x0100_0193);
    }
    js::pad_start(&js::radix(state, 36), 7, '0')
}

/// A definition and the id it is referred to by.
struct Defined {
    id: String,
    markup: String,
}

/// The frame one piece of a route is drawn in.
fn frame_of(leg: &PulseLeg) -> String {
    let angle = (leg.turn * 180.0) / std::f64::consts::PI;
    let scaled = if (leg.stretch - 1.0).abs() < 1e-4 {
        String::new()
    } else {
        format!(" scale({} 1)", js::fixed_number(leg.stretch, 5))
    };
    format!(
        "translate({} {}) rotate({}){scaled}",
        coord(leg.from.x),
        coord(leg.from.y),
        js::fixed_number(angle, 3)
    )
}

/// One piece of a route as path data, run a hair past each end, or cut off exactly at its ends.
fn leg_path(leg: &PulseLeg, overlapping: bool) -> String {
    let at = |point: Point| Point {
        x: round_coord(point.x),
        y: round_coord(point.y),
    };
    let segment = match leg.segment {
        Segment::Line { to } => PathStep::Line { to: at(to) },
        Segment::Cubic { first, second, to } => PathStep::Cubic {
            first: at(first),
            second: at(second),
            to: at(to),
        },
    };
    let piece = path_data(
        &[PathStep::Move { to: at(leg.from) }, segment],
        Spelling::Route,
    );
    if !overlapping {
        return piece;
    }
    format!(
        "M{},{} L{} L{},{}",
        coord(leg.lead.x),
        coord(leg.lead.y),
        &piece[1..],
        coord(leg.trail.x),
        coord(leg.trail.y),
    )
}

/// The box the light of a piece stays inside, spelt as the markup spells it.
fn room_of(leg: &PulseLeg) -> [String; 4] {
    let room = leg.room;
    [
        coord(room.x),
        coord(room.y),
        coord(room.width),
        coord(room.height),
    ]
}

/// The clip that keeps the light of a piece inside the box of its mask.
fn clip_of(leg: &PulseLeg) -> Defined {
    let [x, y, width, height] = room_of(leg);
    let mut attributes = Attributes::new();
    attributes
        .set("x", x)
        .set("y", y)
        .set("width", width)
        .set("height", height);
    let mut rect = String::new();
    empty("rect", &attributes, &mut rect);
    let id = format!("ab-clip-{}", short_hash(&rect));
    Defined {
        markup: format!("<clipPath id=\"{id}\">{rect}</clipPath>"),
        id,
    }
}

/// The mask that lets a beam through only where a piece of the route is.
fn mask_of(leg: &PulseLeg, glow: &[GlowLayer]) -> Defined {
    let joined = leg_path(leg, true);
    let exact = leg_path(leg, false);
    let [x, y, width, height] = room_of(leg);
    let layers: String = glow
        .iter()
        .map(|layer| {
            let mut attributes = Attributes::new();
            attributes
                .set(
                    "d",
                    if layer.exact {
                        exact.as_str()
                    } else {
                        joined.as_str()
                    },
                )
                .set("fill", "none")
                .set("stroke", "#ffffff")
                .set("stroke-width", js::fixed_number(layer.width, 2))
                .set("stroke-opacity", layer.light);
            let mut path = String::new();
            empty("path", &attributes, &mut path);
            path
        })
        .collect();
    let markup = format!(
        "maskUnits=\"userSpaceOnUse\" x=\"{x}\" y=\"{y}\" width=\"{width}\" height=\"{height}\">{layers}"
    );
    let id = format!("ab-mask-{}", short_hash(&markup));
    Defined {
        markup: format!("<mask id=\"{id}\" {markup}</mask>"),
        id,
    }
}

/// The gradient a pulse is painted with, along one axis, its front at the far end.
fn gradient_of(look: &PulseLook, train: &PulseTrain) -> Defined {
    let head = css(&look.head);
    let hot = css(&look.hot);
    let mut stops = String::new();
    for stop in &train.stops {
        let mut attributes = Attributes::new();
        attributes
            .set("offset", js::fixed_number(stop.offset, 4))
            .set(
                "stop-color",
                if stop.hot {
                    hot.as_str()
                } else {
                    head.as_str()
                },
            )
            .set("stop-opacity", js::fixed_number(stop.light, 3));
        empty("stop", &attributes, &mut stops);
    }
    let markup = format!(
        "gradientUnits=\"userSpaceOnUse\" x1=\"0\" y1=\"0\" x2=\"{}\" y2=\"0\"{}>{stops}",
        js::fixed_number(train.span, 4),
        if train.repeats {
            " spreadMethod=\"repeat\""
        } else {
            ""
        }
    );
    let id = format!("ab-beam-{}", short_hash(&markup));
    Defined {
        markup: format!("<linearGradient id=\"{id}\" {markup}</linearGradient>"),
        id,
    }
}

/// A duration as a SMIL timecount: decimal, never with an exponent.
fn timecount(seconds: f64) -> String {
    format!("{}s", js::plain_decimal(seconds))
}

/// A point on the cycle, as SMIL spells a key time: clamped, six places.
fn ratio(value: f64) -> String {
    js::to_fixed(js::js_min(js::js_max(value, 0.0), 1.0), 6)
}

/// How a piece's bar slides, as SMIL spells it, and where it stands before it slides.
fn motion_of(motion: &LegMotion, span: f64) -> (f64, Attributes) {
    let mut attributes = Attributes::new();
    attributes
        .set("attributeName", "transform")
        .set("type", "translate");
    let (shift, cycle) = match *motion {
        LegMotion::Steady {
            shift,
            period,
            speed,
        } => {
            attributes
                .set("from", "0 0")
                .set("to", format!("{} 0", js::fixed_number(span, 4)));
            (shift, period / speed)
        }
        LegMotion::Turn {
            enters,
            leaves,
            from,
            to,
            cycle,
            ..
        } => {
            let values = [from, from, to, to]
                .iter()
                .map(|x| format!("{} 0", js::fixed_number(*x, 2)))
                .collect::<Vec<_>>()
                .join(";");
            let times = [
                "0".to_owned(),
                ratio(enters / cycle),
                ratio(leaves / cycle),
                "1".to_owned(),
            ]
            .join(";");
            attributes.set("values", values).set("keyTimes", times);
            (0.0, cycle)
        }
    };
    attributes
        .set("dur", timecount(cycle))
        .set("repeatCount", "indefinite")
        .set("calcMode", "linear");
    (shift, attributes)
}

/// One piece of a pulse: the mask, the clip inside it, and the bar that slides behind them.
fn leg_markup(leg: &PulseLeg, mask: &str, clip: &str, gradient: &str, span: f64) -> String {
    let (shift, motion) = motion_of(&leg.motion, span);
    let shift = if shift == 0.0 {
        String::new()
    } else {
        format!(" translate({} 0)", js::fixed_number(shift, 2))
    };
    let mut out = String::new();
    let mut masked = Attributes::new();
    masked.set("mask", format!("url(#{mask})"));
    open("g", &masked, &mut out);
    let mut clipped = Attributes::new();
    clipped.set("clip-path", format!("url(#{clip})"));
    open("g", &clipped, &mut out);
    let mut framed = Attributes::new();
    framed.set("transform", format!("{}{shift}", frame_of(leg)));
    open("g", &framed, &mut out);
    let bar = leg.bar;
    let mut rect = Attributes::new();
    rect.set("x", js::fixed_number(bar.from, 2))
        .set("y", js::fixed_number(-bar.height / 2.0, 2))
        .set("width", js::fixed_number(bar.width, 2))
        .set("height", js::fixed_number(bar.height, 2))
        .set("fill", format!("url(#{gradient})"));
    open("rect", &rect, &mut out);
    empty("animateTransform", &motion, &mut out);
    close("rect", &mut out);
    close("g", &mut out);
    close("g", &mut out);
    close("g", &mut out);
    out
}

/// One train of pulses written as SVG: a group of its gradient and the masks
/// and clips of its pieces, then the pieces.
pub(crate) fn write_traffic(mark: &TrafficMark, out: &mut String) {
    let train = pulse_train(mark);
    let gradient = gradient_of(&mark.look, &train);
    out.push_str("<g class=\"");
    out.push_str(PULSE_CLASS);
    out.push_str("\" pointer-events=\"none\"><defs>");
    out.push_str(&gradient.markup);
    let mut pieces = String::new();
    for leg in &train.legs {
        let mask = mask_of(leg, &train.layers);
        let clip = clip_of(leg);
        out.push_str(&mask.markup);
        out.push_str(&clip.markup);
        pieces.push_str(&leg_markup(
            leg,
            &mask.id,
            &clip.id,
            &gradient.id,
            train.span,
        ));
    }
    out.push_str("</defs>");
    out.push_str(&pieces);
    out.push_str("</g>");
}
