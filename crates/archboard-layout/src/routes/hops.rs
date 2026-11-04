//! Where a hop may stand and what it draws. A hop is a
//! small arc on a straight run, bulging up from a line across and right of a
//! line down, over one or more crossings under one crest. It stands where the
//! rising line runs straight and alone past its feet, the line beneath runs
//! straight under its crest, and the crest spans no crossing it does not hop
//! and touches no card, label, title, arrowhead, accepted hop or other line.
//! Which line rises at which crossing is `crossings`'s to choose.

use std::cell::OnceCell;
use std::collections::BTreeMap;

use archboard_scene::drawing::{ArchitectureDrawing, DrawingEdge, EdgeFacts, NodeFacts};
use archboard_scene::geometry::{
    Curve, Point, Rect, Segment, curve_bounds, reversed, segment_start,
};
use archboard_scene::paint::junction_boxes;
use archboard_scene::request::{Arrowhead, Dash};

use crate::constants::APPROACH_STRAIGHT;
use crate::ecma::{hypot, js_max, js_min, max, min, sign, sorted_by};

use super::drawn_lines::{Axis, Run, SHARED_INK, fixed_of, on_run, straight_through, straightness};
use super::{BRIDGE_CLEARANCE, BRIDGE_RADIUS, LineLook};

/// Straight line kept past a hop, before a bend, a join or an end's approach.
pub(super) const HOP_MARGIN: f64 = 6.0;

/// How far the line beneath a hop runs straight toward the side it bulges to:
/// under its crest and on past it.
const HOP_REACH: f64 = BRIDGE_RADIUS + HOP_MARGIN;

/// How far the line beneath a hop runs straight on the other side, so it is
/// seen to pass beneath rather than to end at the line or turn onto it.
const FAR_REACH: f64 = BRIDGE_CLEARANCE;

/// Straight line a hop that must stand keeps from a bend, an end or another
/// hop along its line.
const FORCED_GAP: f64 = 1.0;

/// Which way a hop bulges: 1 up from a line across and right of a line down,
/// or -1, for a lone hop only the other side has room for, the other way.
pub(super) type Bulge = f64;

/// A hop that stands, and the axis of the run it stands on.
#[derive(Clone, Debug)]
pub(super) struct Hop {
    pub(super) curve: Curve,
    pub(super) axis: Axis,
    pub(super) bounds: Rect,
}

impl Hop {
    /// A fixed crest and the bounds later candidates read.
    pub(super) fn new(curve: Curve, axis: Axis) -> Self {
        let bounds = curve_bounds(&curve);
        Self {
            curve,
            axis,
            bounds,
        }
    }
}

/// A place a hop keeps clear of, and the route it belongs to, if any.
#[derive(Clone, Copy, Debug)]
pub(super) struct Keepout {
    pub(super) bounds: Rect,
    pub(super) edge_index: Option<usize>,
}

/// What a new hop must keep clear of.
#[derive(Debug)]
pub(super) struct HopScene<'a> {
    pub(super) drawing: &'a ArchitectureDrawing<NodeFacts, EdgeFacts>,
    pub(super) runs: Vec<Run>,
    /// Cards, labels, titles and arrowheads.
    pub(super) keepouts: Vec<Keepout>,
    /// The boxes the painter draws junction marks in.
    pub(super) marks: Vec<Rect>,
    /// Every hop that stands.
    pub(super) hops: Vec<Hop>,
    pub(super) ink: Vec<Vec<Ink>>,
}

/// Bounds of one unchanged route segment, with its finer boxes measured only
/// if a proposed hop reaches it. Both live for one crossing pass.
#[derive(Debug)]
pub(super) struct Ink {
    pub(super) bounds: Rect,
    pub(super) pieces: OnceCell<Vec<Rect>>,
}

impl<'a> HopScene<'a> {
    /// Read the fixed obstacles once, before any hop is tried.
    pub(super) fn new(
        drawing: &'a ArchitectureDrawing<NodeFacts, EdgeFacts>,
        runs: Vec<Run>,
        lines: &BTreeMap<String, LineLook>,
    ) -> Self {
        let ink = drawing
            .edges
            .iter()
            .map(|edge| {
                edge.curve
                    .segments
                    .iter()
                    .enumerate()
                    .map(|(index, segment)| Ink {
                        bounds: curve_bounds(&Curve {
                            from: segment_start(&edge.curve, index),
                            segments: vec![*segment],
                        }),
                        pieces: OnceCell::new(),
                    })
                    .collect()
            })
            .collect();
        Self {
            drawing,
            keepouts: keepouts_of(drawing, lines),
            marks: junction_boxes(&drawing.edges),
            runs,
            hops: Vec::new(),
            ink,
        }
    }
}

/// Whether two boxes touch; the bounds include the clearance their caller needs.
pub(super) fn overlaps(a: Rect, b: Rect) -> bool {
    a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
}

/// Two quarter circles with a shared crest over a cluster of crossings, as the
/// displaced piece of the route only.
pub(super) fn hump(run: &Run, first: f64, last: f64, bulge: Bulge) -> Curve {
    let radius = BRIDGE_RADIUS * bulge;
    let tangent = (4.0 * (2.0_f64.sqrt() - 1.0) * radius) / 3.0;
    let along = tangent.abs();
    let reach = BRIDGE_RADIUS;
    let mut segments = vec![Segment::Cubic {
        first: on_run(run, first - reach, tangent),
        second: on_run(run, first - along, radius),
        to: on_run(run, first, radius),
    }];
    if last > first {
        segments.push(Segment::Line {
            to: on_run(run, last, radius),
        });
    }
    segments.push(Segment::Cubic {
        first: on_run(run, last + along, radius),
        second: on_run(run, last + reach, tangent),
        to: on_run(run, last + reach, 0.0),
    });
    Curve {
        from: on_run(run, first - reach, 0.0),
        segments,
    }
}

/// A hop as another run of its drawn line draws it: moved across onto that
/// run, and read backwards where that run goes the other way, so every route
/// of a trunk hops as its drawer does.
pub(super) fn carried(curve: &Curve, drawer: &Run, member: &Run) -> Curve {
    let side = drawer.axis.across();
    let shift = side.of(member.from) - side.of(drawer.from);
    let moved = |point: Point| side.with(point, side.of(point) + shift);
    let on_member = Curve {
        from: moved(curve.from),
        segments: curve
            .segments
            .iter()
            .map(|segment| match *segment {
                Segment::Line { to } => Segment::Line { to: moved(to) },
                Segment::Cubic { first, second, to } => Segment::Cubic {
                    first: moved(first),
                    second: moved(second),
                    to: moved(to),
                },
            })
            .collect(),
    };
    let axis = drawer.axis;
    let same_way = sign(axis.of(member.to) - axis.of(member.from))
        == sign(axis.of(drawer.to) - axis.of(drawer.from));
    if same_way {
        on_member
    } else {
        reversed(&on_member)
    }
}

/// The crest over some crossings along a run, at the places along it, when the
/// run keeps `room` of straight line past each foot.
pub(super) fn crest_along(
    runs: &[Run],
    run: &Run,
    places: &[f64],
    room: f64,
    bulge: Bulge,
) -> Option<Curve> {
    // A crest over several lines runs on past the outer ones, so each passes
    // under its flat and none meets it where it turns.
    let margin = if places.len() > 1 {
        BRIDGE_CLEARANCE
    } else {
        0.0
    };
    let first = min(places.iter().copied()) - margin;
    let last = max(places.iter().copied()) + margin;
    let low = run
        .axis
        .of(on_run(run, first - (BRIDGE_RADIUS + room), 0.0));
    let high = run.axis.of(on_run(run, last + (BRIDGE_RADIUS + room), 0.0));
    straight_through(runs, run, js_min(low, high), js_max(low, high))
        .then(|| hump(run, first, last, bulge))
}

/// Whether a hop fits over a coordinate along a run: its drawn line runs
/// straight a hop's radius and a little more on either side, short of its
/// ends' approaches when `rooms` asks, and clear of every hop on that line.
pub(super) fn hop_fits(scene: &HopScene<'_>, run: &Run, coordinate: f64, rooms: bool) -> bool {
    let axis = run.axis;
    let across = axis.across();
    let straight = straightness(&scene.runs, run, coordinate, rooms);
    let clear = min(std::iter::once(straight).chain(
        scene
            .hops
            .iter()
            .filter(|hop| {
                hop.axis == axis && (across.of(hop.curve.from) - fixed_of(run)).abs() <= SHARED_INK
            })
            .map(|hop| {
                let [one, other] = [axis.of(hop.curve.from), axis.of(curve_end(&hop.curve))];
                let (low, high) = (js_min(one, other), js_max(one, other));
                js_max(0.0, js_max(low - coordinate, coordinate - high))
            }),
    ));
    clear >= BRIDGE_RADIUS + FORCED_GAP
}

/// Where a curve ends.
pub(super) fn curve_end(curve: &Curve) -> Point {
    segment_start(curve, curve.segments.len())
}

/// Whether a line runs straight and alone beneath where a hop over it would
/// stand: under the crest and on past it on the side the hop bulges to, and a
/// little way on the other side.
pub(super) fn passes_beneath(runs: &[Run], run: &Run, point: Point, bulge: Bulge) -> bool {
    let at = run.axis.of(point);
    // A hop bulges up from a line across, toward lower y along a line down,
    // and right of a line down, toward higher x along a line across.
    let (back, ahead) = if (run.axis == Axis::Y) == (bulge == 1.0) {
        (HOP_REACH, FAR_REACH)
    } else {
        (FAR_REACH, HOP_REACH)
    };
    straight_through(runs, run, at - back, at + ahead)
}

/// How a relationship's line is drawn: as measurement settled it, or solid
/// with a filled head, as a relationship of a kind the vault does not know is.
pub(super) fn look_of(lines: &BTreeMap<String, LineLook>, id: &str) -> LineLook {
    lines.get(id).copied().unwrap_or(LineLook {
        dash: Dash::Solid,
        arrowhead: Arrowhead::Filled,
    })
}

/// The boxes a line's arrowheads are drawn in: one at its end, and one at its
/// start when it runs both ways.
fn arrowhead_boxes(edge: &DrawingEdge<EdgeFacts>, look: LineLook) -> Vec<Rect> {
    if look.arrowhead == Arrowhead::None {
        return Vec::new();
    }
    let curve = &edge.curve;
    let end = curve.segments.last().and_then(|last| match last {
        Segment::Line { to } => Some((segment_start(curve, curve.segments.len() - 1), *to)),
        Segment::Cubic { .. } => None,
    });
    let start = curve.segments.first().and_then(|first| match first {
        Segment::Line { to } if edge.edge.two_way => Some((*to, curve.from)),
        _ => None,
    });
    [end, start]
        .into_iter()
        .flatten()
        .filter_map(|(from, to)| arrowhead_box(from, to))
        .collect()
}

/// The box an arrowhead is drawn in, on a straight piece that runs to the head's
/// tip: the last stretch of approach, and half as far to either side.
fn arrowhead_box(from: Point, to: Point) -> Option<Rect> {
    let length = hypot(to.x - from.x, to.y - from.y);
    if length == 0.0 {
        return None;
    }
    let share = js_min(length, APPROACH_STRAIGHT) / length;
    let back = Point {
        x: to.x + (from.x - to.x) * share,
        y: to.y + (from.y - to.y) * share,
    };
    // The head is as wide as the approach is long, and reaches no further
    // along its line than the approach: a hop across the line a little past it
    // stands clear of it.
    Some(widened(back, to, APPROACH_STRAIGHT / 2.0))
}

/// The box between two points on one straight line, widened to either side of
/// the line only.
fn widened(from: Point, to: Point, side: f64) -> Rect {
    let bounds = Rect {
        x: js_min(from.x, to.x),
        y: js_min(from.y, to.y),
        width: (from.x - to.x).abs(),
        height: (from.y - to.y).abs(),
    };
    if from.x == to.x {
        Rect {
            x: bounds.x - side,
            width: bounds.width + side * 2.0,
            ..bounds
        }
    } else {
        Rect {
            y: bounds.y - side,
            height: bounds.height + side * 2.0,
            ..bounds
        }
    }
}

/// What a hop keeps clear of: cards, container titles, labels and arrowheads,
/// without excluding container interiors.
fn keepouts_of(
    drawing: &ArchitectureDrawing<NodeFacts, EdgeFacts>,
    lines: &BTreeMap<String, LineLook>,
) -> Vec<Keepout> {
    let alone = |bounds: Rect| Keepout {
        bounds,
        edge_index: None,
    };
    let cards = drawing.cards.iter().map(|card| alone(card.bounds));
    let titles = drawing.containers.iter().map(|container| {
        alone(Rect {
            height: container.measured.header_height,
            ..container.bounds
        })
    });
    let labels = drawing
        .edges
        .iter()
        .filter_map(|edge| edge.label.as_ref().map(|label| alone(label.bounds)));
    let heads = drawing.edges.iter().enumerate().flat_map(|(index, edge)| {
        arrowhead_boxes(edge, look_of(lines, &edge.edge.id))
            .into_iter()
            .map(move |bounds| Keepout {
                bounds,
                edge_index: Some(index),
            })
    });
    cards.chain(titles).chain(labels).chain(heads).collect()
}

/// A hop bulging the other way from its line.
pub(super) fn flipped(hop: &Hop) -> Curve {
    let across = hop.axis.across();
    let line = across.of(hop.curve.from);
    let mirror = |point: Point| across.with(point, 2.0 * line - across.of(point));
    Curve {
        from: hop.curve.from,
        segments: hop
            .curve
            .segments
            .iter()
            .map(|segment| match *segment {
                Segment::Line { to } => Segment::Line { to: mirror(to) },
                Segment::Cubic { first, second, to } => Segment::Cubic {
                    first: mirror(first),
                    second: mirror(second),
                    to: mirror(to),
                },
            })
            .collect(),
    }
}

/// A route with its straight pieces' accepted hops spliced in, in order along
/// each piece, every turn kept, and its path drawn again.
pub(super) fn replace_runs(
    edge: &DrawingEdge<EdgeFacts>,
    replacements: &BTreeMap<usize, Vec<Curve>>,
) -> DrawingEdge<EdgeFacts> {
    if replacements.is_empty() {
        return edge.clone();
    }
    let mut segments = Vec::new();
    for (index, segment) in edge.curve.segments.iter().enumerate() {
        let from = segment_start(&edge.curve, index);
        let distance = |curve: &Curve| hypot(curve.from.x - from.x, curve.from.y - from.y);
        let bridges = replacements.get(&index).map_or_else(Vec::new, |bridges| {
            sorted_by(bridges, |a, b| distance(a) - distance(b))
        });
        for bridge in bridges {
            segments.push(Segment::Line { to: bridge.from });
            segments.extend(bridge.segments);
        }
        segments.push(*segment);
    }
    let curve = Curve {
        from: edge.curve.from,
        segments,
    };
    DrawingEdge {
        curve,
        ..edge.clone()
    }
}
