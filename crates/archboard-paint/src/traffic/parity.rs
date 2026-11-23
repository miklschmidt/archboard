//! The canvas held to the SVG: at any moment, each piece's bar stands where the
//! SVG's animation puts it, as a browser plays SMIL.

use archboard_scene::geometry::{Curve, Point, Segment};
use archboard_scene::js::within;
use archboard_scene::scene::{Colour, Item, Motion, PulseLook, Token, TrafficMark};
use kurbo::{Affine, BezPath, Shape as _};

use super::draw_traffic;
use crate::canvas::{Canvas, Ink};
use crate::palette::{Palette, Theme};

/// How far apart the canvas and the SVG may stand: the SVG rounds its numbers.
const TOLERANCE: f64 = 0.02;

/// A canvas that keeps each bar it fills: where it stands, and its box in its own space.
#[derive(Default)]
struct Bars {
    at: Affine,
    bars: Vec<(Affine, kurbo::Rect)>,
}

impl Canvas for Bars {
    fn set_transform(&mut self, transform: Affine) {
        self.at = transform;
    }
    fn fill(&mut self, path: &BezPath, _: &Ink, _: bool) {
        self.bars.push((self.at, path.bounding_box()));
    }
    fn stroke(&mut self, _: &BezPath, _: &kurbo::Stroke, _: &Ink) {}
    fn push(&mut self, _: Option<(&BezPath, bool)>, _: f32) {}
    fn push_cut(&mut self) {}
    fn push_keep(&mut self) {}
    fn pop(&mut self) {}
}

/// An attribute of an element's opening tag.
fn attribute<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let start = tag.find(&format!(" {name}=\""))? + name.len() + 3;
    Some(&tag[start..start + tag[start..].find('"')?])
}

/// Numbers in a list, split at spaces, commas and semicolons.
fn numbers(list: &str) -> Vec<f64> {
    list.split([' ', ',', ';'])
        .filter(|part| !part.is_empty())
        .map(|part| part.trim_end_matches('s').parse().expect("a number"))
        .collect()
}

/// An SVG transform list as an affine.
fn transform_of(list: &str) -> Affine {
    let mut affine = Affine::IDENTITY;
    for call in list.split(')').filter(|call| !call.trim().is_empty()) {
        let (name, arguments) = call.trim().split_once('(').expect("a transform");
        let values = numbers(arguments);
        affine *= match name {
            "translate" => Affine::translate((values[0], values[1])),
            "rotate" => Affine::rotate(values[0].to_radians()),
            "scale" => Affine::scale_non_uniform(values[0], values[1]),
            _ => panic!("no transform {name}"),
        };
    }
    affine
}

/// One piece as the SVG writes it: its frame, its bar, and its animation.
struct Written {
    frame: Affine,
    bar: (f64, f64),
    motion: String,
}

impl Written {
    /// Where the bar's slide stands at a moment, as SMIL plays a linear animation.
    fn slide_at(&self, seconds: f64) -> f64 {
        let duration = numbers(attribute(&self.motion, "dur").expect("a duration"))[0];
        let share = within(seconds, duration) / duration;
        let Some(values) = attribute(&self.motion, "values") else {
            let from = numbers(attribute(&self.motion, "from").expect("a start"))[0];
            let to = numbers(attribute(&self.motion, "to").expect("an end"))[0];
            return from + (to - from) * share;
        };
        let values: Vec<f64> = numbers(values).into_iter().step_by(2).collect();
        let times = numbers(attribute(&self.motion, "keyTimes").expect("key times"));
        let key = times
            .windows(2)
            .rposition(|pair| pair[0] <= share && pair[0] < pair[1])
            .unwrap_or(0);
        let span = times[key + 1] - times[key];
        values[key] + (values[key + 1] - values[key]) * (share - times[key]) / span
    }
}

/// The pieces of a mark as the SVG painter writes them.
fn written(mark: &TrafficMark) -> Vec<Written> {
    let svg = archboard_svg::markup(&[Item::Traffic(mark.clone())]);
    svg.split("<g transform=\"")
        .skip(1)
        .map(|piece| {
            let frame = transform_of(&piece[..piece.find('"').expect("a frame")]);
            let rect = &piece[piece.find("<rect").expect("a bar")..];
            let x = numbers(attribute(rect, "x").expect("x"))[0];
            let width = numbers(attribute(rect, "width").expect("width"))[0];
            let motion = &rect[rect.find("<animateTransform").expect("a motion")..];
            Written {
                frame,
                bar: (x, x + width),
                motion: motion[..motion.find("/>").expect("an end")].to_owned(),
            }
        })
        .collect()
}

/// Hold one bar the canvas drew to the piece the SVG wrote, at a moment.
fn assert_piece_agrees(
    drawn: Affine,
    bar: kurbo::Rect,
    piece: &Written,
    seconds: f64,
    repeat: Option<f64>,
) {
    // What the canvas drew, in the SVG's frame of the piece. The SVG writes its
    // angle to a thousandth of a degree, and its start to a hundredth of a unit.
    let inside = (piece.frame.inverse() * drawn).as_coeffs();
    let turned = [inside[0] - 1.0, inside[1], inside[2], inside[3] - 1.0];
    assert!(
        turned.iter().all(|value| value.abs() < 1e-4) && inside[5].abs() < TOLERANCE,
        "at {seconds}s the frames differ: {inside:?}"
    );
    let svg = piece.slide_at(seconds);
    let mut apart = inside[4] - svg;
    if let Some(period) = repeat {
        apart -= period * (apart / period).round();
    }
    assert!(
        apart.abs() < TOLERANCE,
        "at {seconds}s: canvas {}, SVG {svg}",
        inside[4]
    );
    assert!((bar.x0 - piece.bar.0).abs() < TOLERANCE && (bar.x1 - piece.bar.1).abs() < TOLERANCE);
}

/// Hold the canvas to the SVG at each moment: every piece, the same bar, in
/// the same frame, slid as far. A repeating train may stand a whole spacing
/// apart, which shows the same light.
pub(crate) fn assert_agree(mark: &TrafficMark, moments: &[f64]) {
    let pieces = written(mark);
    let repeat = match mark.motion {
        Motion::Steady { spacing, .. } => Some(archboard_scene::geometry::round_coord(spacing)),
        Motion::Turn { .. } => None,
    };
    let palette = Palette::of(Theme::Light);
    for &seconds in moments {
        let mut canvas = Bars::default();
        draw_traffic(&mut canvas, &palette, Affine::IDENTITY, mark, seconds);
        assert_eq!(canvas.bars.len(), pieces.len(), "at {seconds}s");
        for ((drawn, bar), piece) in canvas.bars.iter().zip(&pieces) {
            assert_piece_agrees(*drawn, *bar, piece, seconds, repeat);
        }
    }
}

/// A mark on a route that runs right, bends down and runs down.
pub(crate) fn mark(motion: Motion) -> TrafficMark {
    let at = |x, y| Point { x, y };
    TrafficMark {
        look: PulseLook {
            head: Colour::Token {
                token: Token::Border,
            },
            hot: Colour::White,
            line_width: 1.5,
        },
        route: Curve {
            from: at(10.0, 10.0),
            segments: vec![
                Segment::Line {
                    to: at(140.0, 10.0),
                },
                Segment::Cubic {
                    first: at(160.0, 10.0),
                    second: at(170.0, 25.0),
                    to: at(170.0, 45.0),
                },
                Segment::Line {
                    to: at(170.0, 190.0),
                },
            ],
        },
        motion,
    }
}

/// A message: one pulse a turn of a 3 second clock, leaving at 0.4 seconds.
pub(crate) const MESSAGE: Motion = Motion::Turn {
    speed: 160.0,
    cycle: 3.0,
    start: 0.4,
};

/// Moments across two whole cycles, and a hair either side of some edges.
pub(crate) fn moments(cycle: f64, edges: &[f64]) -> Vec<f64> {
    let mut moments: Vec<f64> = (0..=120)
        .map(|step| cycle * f64::from(step) / 60.0)
        .collect();
    for edge in edges {
        moments.extend([edge - 1e-4, *edge, edge + 1e-4]);
    }
    moments
}

#[test]
fn a_message_agrees_across_its_cycle_at_both_ends_of_each_window_and_at_the_wrap() {
    let mark = mark(MESSAGE);
    let mut edges = vec![0.0, 3.0, 6.0];
    for piece in mark.beam().pieces {
        let archboard_scene::scene::Slide::Pass { enter, leave, .. } = piece.slide else {
            panic!("a message passes");
        };
        edges.extend([enter, leave, enter + 3.0, leave + 3.0]);
    }
    assert_agree(&mark, &moments(3.0, &edges));
}

#[test]
fn a_message_cut_short_by_its_cycle_agrees_at_the_wrap() {
    // It leaves late, so the turn ends while it is still on the last piece,
    // and it enters the first piece before the turn begins.
    let mark = mark(Motion::Turn {
        speed: 160.0,
        cycle: 2.0,
        start: 0.0,
    });
    assert_agree(&mark, &moments(2.0, &[0.0, 2.0, 4.0]));
}

#[test]
fn a_train_agrees_across_its_round_and_at_the_wrap() {
    let mark = mark(Motion::Steady {
        speed: 75.0,
        spacing: 48.3,
        phase: 11.0,
    });
    let round = 48.3 / 75.0;
    assert_agree(&mark, &moments(round, &[round, 2.0 * round]));
}
