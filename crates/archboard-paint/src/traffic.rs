//! Traffic drawn as a beam of light, the same beam the SVG writes:
//! a gradient on a bar that slides along each piece of the route, and a soft
//! mask in the shape of that piece lets it through. The scene answers every
//! number of the pulses (`pulse_train`) and where a bar stands at a moment
//! (`pulse_slide`); here the bar sits where this painter's clock says.

use archboard_scene::scene::{
    GlowLayer, Item, PulseLeg, PulseLook, PulseTrain, TrafficMark, pulse_slide, pulse_train,
};
use kurbo::{Affine, BezPath, Rect, Shape as _};
use peniko::{Color, ColorStop, Extend, Gradient, InterpolationAlphaSpace};

use crate::canvas::{Canvas, Ink};
use crate::palette::Palette;
use crate::path::segment_onto;

/// The frame a piece's beam is drawn in.
fn frame_of(leg: &PulseLeg) -> Affine {
    Affine::translate((leg.from.x, leg.from.y))
        * Affine::rotate(leg.turn)
        * Affine::scale_non_uniform(leg.stretch, 1.0)
}

/// One piece as a path, run a hair past each end, or cut off exactly at its ends.
fn leg_path(leg: &PulseLeg, overlapping: bool) -> BezPath {
    let mut path = BezPath::new();
    if overlapping {
        path.move_to((leg.lead.x, leg.lead.y));
        path.line_to((leg.from.x, leg.from.y));
    } else {
        path.move_to((leg.from.x, leg.from.y));
    }
    segment_onto(&mut path, &leg.segment);
    if overlapping {
        path.line_to((leg.trail.x, leg.trail.y));
    }
    path
}

/// The gradient of a pulse, painted along the frame's x axis.
fn gradient_of(palette: &Palette, look: &PulseLook, train: &PulseTrain) -> Gradient {
    let stops: Vec<ColorStop> = train
        .stops
        .iter()
        .map(|stop| {
            #[expect(
                clippy::cast_possible_truncation,
                reason = "a gradient's offsets are f32"
            )]
            let offset = stop.offset as f32;
            let colour: Color =
                palette.colour(if stop.hot { &look.hot } else { &look.head }, stop.light);
            ColorStop {
                offset,
                color: colour.into(),
            }
        })
        .collect();
    let mut gradient =
        Gradient::new_linear((0.0, 0.0), (train.span, 0.0)).with_extend(if train.repeats {
            Extend::Repeat
        } else {
            Extend::Pad
        });
    gradient.stops = stops.as_slice().into();
    gradient.interpolation_alpha_space = InterpolationAlphaSpace::Unpremultiplied;
    gradient
}

/// One piece of a pulse: its bar slid `slide` along, cut down to the soft shape of the piece.
fn draw_leg<C: Canvas>(
    canvas: &mut C,
    transform: Affine,
    leg: &PulseLeg,
    glow: &[GlowLayer],
    slide: f64,
    gradient: &Gradient,
) {
    let bar = leg.bar;
    let room = leg.room;
    let body = Rect::new(
        bar.from,
        -bar.height / 2.0,
        bar.from + bar.width,
        bar.height / 2.0,
    )
    .to_path(0.1);
    let ink = Ink::Gradient(gradient.clone(), Affine::IDENTITY);
    canvas.set_transform(transform);
    let clip = Rect::new(room.x, room.y, room.x + room.width, room.y + room.height).to_path(0.1);
    canvas.push(Some((&clip, false)), 1.0);
    canvas.set_transform(transform * frame_of(leg) * Affine::translate((slide, 0.0)));
    canvas.fill(&body, &ink, false);
    canvas.set_transform(transform);
    canvas.push_keep();
    let joined = leg_path(leg, true);
    let exact = leg_path(leg, false);
    for layer in glow {
        #[expect(clippy::cast_possible_truncation, reason = "a colour's alpha is f32")]
        let white = Ink::Solid(Color::WHITE.with_alpha(layer.light as f32));
        let stroke = kurbo::Stroke::new(layer.width);
        let path = if layer.exact { &exact } else { &joined };
        canvas.stroke(path, &stroke, &white);
    }
    canvas.pop();
    canvas.pop();
}

/// Whether any traffic runs among some items.
pub(crate) fn holds_traffic(items: &[Item]) -> bool {
    items.iter().any(|item| match item {
        Item::Traffic(_) => true,
        Item::Group(group) => holds_traffic(&group.items),
        Item::Viewport(viewport) => holds_traffic(&viewport.items),
        _ => false,
    })
}

/// A line's traffic at a moment of the traffic's clock: each piece whose bar is on it then.
pub(crate) fn draw_traffic<C: Canvas>(
    canvas: &mut C,
    palette: &Palette,
    transform: Affine,
    mark: &TrafficMark,
    seconds: f64,
) {
    let train = pulse_train(mark);
    let gradient = gradient_of(palette, &mark.look, &train);
    for leg in &train.legs {
        if let Some(slide) = pulse_slide(&leg.motion, seconds) {
            draw_leg(canvas, transform, leg, &train.layers, slide, &gradient);
        }
    }
}
