//! Traffic drawn as a beam of light (ADR 0027), the same beam the SVG writes:
//! a gradient on a bar that slides along each piece of the route, and a soft
//! mask in the shape of that piece lets it through. The SVG moves the bar with
//! SMIL or Web Animations. Here the bar sits where a clock says.

use archboard_scene::geometry::{Curve, Point, Segment, round_coord, segment_start};
use archboard_scene::js::within;
use archboard_scene::route::segment_length;
use archboard_scene::scene::traffic::{
    PULSE_FRONT as FRONT, PULSE_HEAD as HEAD, PULSE_MASK_ROOM as MASK_ROOM, PULSE_TAIL as TAIL,
    pulse_breadth,
};
use archboard_scene::scene::{Colour, Item, Motion, PulseLook, TrafficMark};
use kurbo::{Affine, BezPath, Rect, Shape as _};
use peniko::{Color, ColorStop, Extend, Gradient, InterpolationAlphaSpace};

use crate::canvas::{Canvas, Ink};
use crate::palette::Palette;
use crate::path::segment_onto;

/// How a pulse falls off across its line: how much wider than its core each
/// layer of the glow is, and how much light it lets through.
const GLOW: [(f64, f64); 4] = [(6.0, 0.07), (3.4, 0.2), (1.3, 0.5), (0.0, 0.9)];
/// A layer wider than this stops exactly at the ends of its piece.
const HALO_OVER: f64 = 1.0;
/// The share of the room between pulses that a pulse fills.
const FILL: f64 = 0.8;
/// How sharply a tail fades.
const TAIL_CURVE: f64 = 2.3;
/// How bright a tail is where it meets the head.
const TAIL_LIGHT: f64 = 0.6;
/// How many stops describe a tail.
const TAIL_STEPS: u32 = 9;
/// How far a bar overruns the mask of its piece.
const BAR_ROOM: f64 = 1.0;
/// The shortest piece of a route worth a beam of its own.
const LEAST_PIECE: f64 = 0.5;
/// How far the narrow, bright layers of a piece's mask run into the next piece.
const OVERLAP: f64 = 0.5;

/// One piece of a route, with the frame its beam is drawn in.
struct Leg {
    from: Point,
    segment: Segment,
    along: f64,
    length: f64,
    frame: Affine,
    sag: f64,
}

/// The unit direction from one point to another, or none when they are one.
fn direction_of(from: Point, to: Point) -> Option<Point> {
    let length = (to.x - from.x).hypot(to.y - from.y);
    (length >= 1e-9).then(|| Point {
        x: (to.x - from.x) / length,
        y: (to.y - from.y) / length,
    })
}

/// How far a bend's own control points stray from the line between its ends.
fn sag_of(from: Point, segment: &Segment) -> f64 {
    let Segment::Cubic { first, second, to } = segment else {
        return 0.0;
    };
    let chord = (to.x - from.x).hypot(to.y - from.y);
    [*first, *second]
        .map(|point| {
            (((point.x - from.x) * (to.y - from.y) - (point.y - from.y) * (to.x - from.x)) / chord)
                .abs()
        })
        .into_iter()
        .fold(0.0, f64::max)
}

/// The pieces of a route.
fn legs_of(curve: &Curve) -> Vec<Leg> {
    let mut legs = Vec::new();
    let mut along = 0.0;
    for (index, segment) in curve.segments.iter().enumerate() {
        let from = segment_start(curve, index);
        let to = segment.to();
        let length = segment_length(from, segment);
        if length >= LEAST_PIECE && direction_of(from, to).is_some() {
            let stretch = (to.x - from.x).hypot(to.y - from.y) / length;
            legs.push(Leg {
                from,
                segment: *segment,
                along,
                length,
                frame: Affine::translate((from.x, from.y))
                    * Affine::rotate((to.y - from.y).atan2(to.x - from.x))
                    * Affine::scale_non_uniform(stretch, 1.0),
                sag: sag_of(from, segment),
            });
        }
        along += length;
    }
    legs
}

/// The way a piece leaves its start, or arrives at its end.
fn tangent_of(leg: &Leg, end: bool) -> Option<Point> {
    let ways = match leg.segment {
        Segment::Cubic { first, second, to } if end => {
            [direction_of(second, to), direction_of(first, to)]
        }
        Segment::Cubic { first, second, .. } => [
            direction_of(leg.from, first),
            direction_of(leg.from, second),
        ],
        Segment::Line { .. } => [None, None],
    };
    ways.into_iter()
        .flatten()
        .next()
        .or_else(|| direction_of(leg.from, leg.segment.to()))
}

/// One piece as a path, run a hair past each end, or cut off exactly at its ends.
fn leg_path(leg: &Leg, overlapping: bool) -> BezPath {
    let mut path = BezPath::new();
    if overlapping {
        let start = tangent_of(leg, false).unwrap_or(Point { x: 0.0, y: 0.0 });
        path.move_to((
            leg.from.x - start.x * OVERLAP,
            leg.from.y - start.y * OVERLAP,
        ));
        path.line_to((leg.from.x, leg.from.y));
    } else {
        path.move_to((leg.from.x, leg.from.y));
    }
    segment_onto(&mut path, &leg.segment);
    if overlapping {
        let end = tangent_of(leg, true).unwrap_or(Point { x: 0.0, y: 0.0 });
        let to = leg.segment.to();
        path.line_to((to.x + end.x * OVERLAP, to.y + end.y * OVERLAP));
    }
    path
}

/// The box the light of a piece stays inside.
fn box_of(leg: &Leg, core: f64) -> Rect {
    let reach = f64::midpoint(core, GLOW[0].0) + MASK_ROOM;
    let path = leg_path(leg, false);
    let bounds = path.control_box();
    bounds.inflate(reach, reach)
}

/// How long a pulse's tail is where pulses are `room` apart.
fn tail_for(room: f64) -> f64 {
    (room * FILL - HEAD - FRONT).clamp(0.0, TAIL)
}

/// One stop of a pulse.
fn stop_of(palette: &Palette, span: f64, behind: f64, colour: &Colour, light: f64) -> ColorStop {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "a gradient's offsets are f32"
    )]
    let offset = ((span - behind) / span) as f32;
    let colour: Color = palette.colour(colour, light);
    ColorStop {
        offset,
        color: colour.into(),
    }
}

/// The stops of a pulse along one axis, its front at the far end.
fn stops_of(palette: &Palette, look: &PulseLook, span: f64, tail: f64) -> Vec<ColorStop> {
    let reach = FRONT + HEAD + tail;
    let mut stops = Vec::new();
    if tail >= 1.0 {
        for step in 0..TAIL_STEPS {
            let share = f64::from(step) / f64::from(TAIL_STEPS);
            stops.push(stop_of(
                palette,
                span,
                reach - tail * share,
                &look.head,
                TAIL_LIGHT * share.powf(TAIL_CURVE),
            ));
        }
    }
    stops.push(stop_of(palette, span, FRONT + HEAD, &look.head, TAIL_LIGHT));
    stops.push(stop_of(palette, span, FRONT + HEAD * 0.45, &look.hot, 0.9));
    stops.push(stop_of(palette, span, FRONT, &look.hot, 1.0));
    stops.push(stop_of(palette, span, 0.0, &look.hot, 0.0));
    stops
}

/// The gradient of a pulse, painted along the frame's x axis.
fn gradient_of(stops: &[ColorStop], span: f64, repeat: bool) -> Gradient {
    let mut gradient = Gradient::new_linear((0.0, 0.0), (span, 0.0)).with_extend(if repeat {
        Extend::Repeat
    } else {
        Extend::Pad
    });
    gradient.stops = stops.into();
    gradient.interpolation_alpha_space = InterpolationAlphaSpace::Unpremultiplied;
    gradient
}

/// Where a bar sits, how far it reaches, and what it is painted with.
struct Bar {
    slide: f64,
    from: f64,
    width: f64,
}

/// One piece of a pulse: the bar, cut down to the soft shape of the piece.
fn draw_leg<C: Canvas>(
    canvas: &mut C,
    transform: Affine,
    leg: &Leg,
    core: f64,
    bar: &Bar,
    gradient: &Gradient,
) {
    let height = core + GLOW[0].0 + 2.0 * leg.sag + 2.0 * BAR_ROOM;
    let at = Affine::translate((bar.slide, 0.0));
    let body = Rect::new(bar.from, -height / 2.0, bar.from + bar.width, height / 2.0).to_path(0.1);
    let ink = Ink::Gradient(gradient.clone(), Affine::IDENTITY);
    canvas.set_transform(transform);
    let clip = box_of(leg, core).to_path(0.1);
    canvas.push(Some((&clip, false)), 1.0);
    canvas.set_transform(transform * leg.frame * at);
    canvas.fill(&body, &ink, false);
    canvas.set_transform(transform);
    canvas.push_keep();
    let joined = leg_path(leg, true);
    let exact = leg_path(leg, false);
    for (over, light) in GLOW {
        #[expect(clippy::cast_possible_truncation, reason = "a colour's alpha is f32")]
        let white = Ink::Solid(Color::WHITE.with_alpha(light as f32));
        let stroke = kurbo::Stroke::new(core + over);
        let path = if over > HALO_OVER { &exact } else { &joined };
        canvas.stroke(path, &stroke, &white);
    }
    canvas.pop();
    canvas.pop();
}

/// A message's bar on a piece at a moment of its turn, or none while it is off the piece.
fn slide_at(leg: &Leg, speed: f64, cycle: f64, start: f64, time: f64) -> Option<f64> {
    let span = FRONT + HEAD + TAIL;
    let moment = within(time, cycle);
    let moment_of = |slide: f64| start + (slide + leg.along - FRONT + span) / speed;
    let from = moment_of(-span - 1.0).max(0.0);
    let to = moment_of(leg.length + 1.0).min(cycle);
    (moment >= from && moment <= to).then_some((moment - start) * speed - leg.along + FRONT - span)
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

/// A line's traffic at a moment of the traffic's clock.
pub(crate) fn draw_traffic<C: Canvas>(
    canvas: &mut C,
    palette: &Palette,
    transform: Affine,
    mark: &TrafficMark,
    seconds: f64,
) {
    let core = pulse_breadth(mark.look.line_width);
    let legs = legs_of(&mark.route);
    match mark.motion {
        Motion::Steady {
            speed,
            spacing,
            phase,
        } => {
            let period = round_coord(spacing);
            let gradient = gradient_of(
                &stops_of(palette, &mark.look, period, tail_for(period)),
                period,
                true,
            );
            let moved = within(seconds * speed, period);
            for leg in &legs {
                let shift = within(phase - leg.along + FRONT, period) - period;
                let bar = Bar {
                    slide: shift + moved,
                    from: -period - 1.0,
                    width: leg.length + 2.0 * period + 2.0,
                };
                draw_leg(canvas, transform, leg, core, &bar, &gradient);
            }
        }
        Motion::Turn {
            speed,
            cycle,
            start,
        } => {
            let span = FRONT + HEAD + TAIL;
            let gradient = gradient_of(&stops_of(palette, &mark.look, span, TAIL), span, false);
            for leg in &legs {
                let Some(slide) = slide_at(leg, speed, cycle, start, seconds) else {
                    continue;
                };
                let bar = Bar {
                    slide,
                    from: 0.0,
                    width: span,
                };
                draw_leg(canvas, transform, leg, core, &bar, &gradient);
            }
        }
    }
}
