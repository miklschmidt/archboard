//! Traffic drawn as a beam of light: a gradient painted onto a bar
//! that slides along each straight or bending piece of the route, and a soft
//! mask in the shape of that piece lets it through. A train of pulses is one
//! repeating gradient that slides by one spacing every spacing's time; a
//! message's pulse crosses its line once in every turn of the shared clock.

use archboard_scene::geometry::{Point, round_coord};
use archboard_scene::js;
use archboard_scene::scene::{
    BeamGradient, BeamPiece, Frame, MaskLayer, PathStep, Slide, TrafficMark,
};

use crate::css::css;
use crate::path::{Spelling, path_data};
use crate::xml::{Attributes, close, coord, empty, open};

/// The class every moving mark carries, for the stylesheet to hide it from a
/// reader who asked for less motion.
pub(crate) const PULSE_CLASS: &str = "ab-pulse";

/// A box as the markup spells it: x, y, width and height.
fn box_of(piece: &BeamPiece) -> [String; 4] {
    let bounds = piece.bounds;
    [
        coord(bounds.x),
        coord(bounds.y),
        coord(bounds.width),
        coord(bounds.height),
    ]
}

/// A mask layer's path as path data, each point rounded as a coordinate.
fn layer_path(layer: &MaskLayer) -> String {
    let at = |point: Point| Point {
        x: round_coord(point.x),
        y: round_coord(point.y),
    };
    let steps: Vec<PathStep> = layer
        .path
        .iter()
        .map(|step| match *step {
            PathStep::Move { to } => PathStep::Move { to: at(to) },
            PathStep::Line { to } => PathStep::Line { to: at(to) },
            PathStep::Cubic { first, second, to } => PathStep::Cubic {
                first: at(first),
                second: at(second),
                to: at(to),
            },
            other => other,
        })
        .collect();
    path_data(&steps, Spelling::Route)
}

/// The frame a piece is drawn in, as a transform.
fn frame_of(frame: &Frame) -> String {
    let angle = (frame.angle * 180.0) / std::f64::consts::PI;
    let scaled = if (frame.stretch - 1.0).abs() < 1e-4 {
        String::new()
    } else {
        format!(" scale({} 1)", js::fixed_number(frame.stretch, 5))
    };
    format!(
        "translate({} {}) rotate({}){scaled}",
        coord(frame.origin.x),
        coord(frame.origin.y),
        js::fixed_number(angle, 3)
    )
}

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

/// The clip that keeps the light of a piece inside the box of its mask.
fn clip_of(piece: &BeamPiece) -> Defined {
    let [x, y, width, height] = box_of(piece);
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
fn mask_of(piece: &BeamPiece) -> Defined {
    let [x, y, width, height] = box_of(piece);
    let layers: String = piece
        .mask
        .iter()
        .map(|layer| {
            let mut attributes = Attributes::new();
            attributes
                .set("d", layer_path(layer))
                .set("fill", "none")
                .set("stroke", "#ffffff")
                .set("stroke-width", js::fixed_number(layer.width, 2))
                .set("stroke-opacity", layer.light);
            let mut markup = String::new();
            empty("path", &attributes, &mut markup);
            markup
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
fn gradient_of(gradient: &BeamGradient) -> Defined {
    let stops: String = gradient
        .stops
        .iter()
        .map(|stop| {
            let mut attributes = Attributes::new();
            attributes
                .set("offset", js::fixed_number(stop.offset.unwrap_or(0.0), 4))
                .set("stop-color", css(&stop.colour))
                .set(
                    "stop-opacity",
                    js::fixed_number(stop.opacity.unwrap_or(1.0), 3),
                );
            let mut markup = String::new();
            empty("stop", &attributes, &mut markup);
            markup
        })
        .collect();
    let markup = format!(
        "gradientUnits=\"userSpaceOnUse\" x1=\"0\" y1=\"0\" x2=\"{}\" y2=\"0\"{}>{stops}",
        js::fixed_number(gradient.span, 4),
        if gradient.repeat {
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

/// A bar's slide as an animation of its transform.
fn motion_of(slide: &Slide) -> Attributes {
    let mut motion = Attributes::new();
    motion
        .set("attributeName", "transform")
        .set("type", "translate");
    match *slide {
        Slide::Loop { length, speed } => {
            motion
                .set("from", "0 0")
                .set("to", format!("{} 0", js::fixed_number(length, 4)))
                .set("dur", timecount(length / speed));
        }
        Slide::Pass {
            cycle,
            enter,
            leave,
            from,
            to,
        } => {
            let values = [from, from, to, to]
                .iter()
                .map(|x| format!("{} 0", js::fixed_number(*x, 2)))
                .collect::<Vec<_>>()
                .join(";");
            let times = [
                "0".to_owned(),
                ratio(enter / cycle),
                ratio(leave / cycle),
                "1".to_owned(),
            ]
            .join(";");
            motion
                .set("values", values)
                .set("keyTimes", times)
                .set("dur", timecount(cycle));
        }
    }
    motion
        .set("repeatCount", "indefinite")
        .set("calcMode", "linear");
    motion
}

/// One piece of a pulse: the mask, the clip inside it, and the bar that slides behind them.
fn piece_markup(piece: &BeamPiece, mask: &str, clip: &str, gradient: &str) -> String {
    let rest = if piece.rest == 0.0 {
        String::new()
    } else {
        format!(" translate({} 0)", js::fixed_number(piece.rest, 2))
    };
    let mut out = String::new();
    let mut masked = Attributes::new();
    masked.set("mask", format!("url(#{mask})"));
    open("g", &masked, &mut out);
    let mut clipped = Attributes::new();
    clipped.set("clip-path", format!("url(#{clip})"));
    open("g", &clipped, &mut out);
    let mut framed = Attributes::new();
    framed.set("transform", format!("{}{rest}", frame_of(&piece.frame)));
    open("g", &framed, &mut out);
    let bar = piece.bar;
    let mut rect = Attributes::new();
    rect.set("x", js::fixed_number(bar.x, 2))
        .set("y", js::fixed_number(bar.y, 2))
        .set("width", js::fixed_number(bar.width, 2))
        .set("height", js::fixed_number(bar.height, 2))
        .set("fill", format!("url(#{gradient})"));
    open("rect", &rect, &mut out);
    empty("animateTransform", &motion_of(&piece.slide), &mut out);
    close("rect", &mut out);
    close("g", &mut out);
    close("g", &mut out);
    close("g", &mut out);
    out
}

/// One train of pulses written as SVG: a group that holds its gradient and the
/// masks and clips of its pieces, then the pieces.
pub(crate) fn write_traffic(mark: &TrafficMark, out: &mut String) {
    let beam = mark.beam();
    let gradient = gradient_of(&beam.gradient);
    let pieces: Vec<(Defined, Defined, String)> = beam
        .pieces
        .iter()
        .map(|piece| {
            let mask = mask_of(piece);
            let clip = clip_of(piece);
            let markup = piece_markup(piece, &mask.id, &clip.id, &gradient.id);
            (mask, clip, markup)
        })
        .collect();
    out.push_str("<g class=\"");
    out.push_str(PULSE_CLASS);
    out.push_str("\" pointer-events=\"none\"><defs>");
    out.push_str(&gradient.markup);
    for (mask, clip, _) in &pieces {
        out.push_str(&mask.markup);
        out.push_str(&clip.markup);
    }
    out.push_str("</defs>");
    for (_, _, markup) in &pieces {
        out.push_str(markup);
    }
    out.push_str("</g>");
}
