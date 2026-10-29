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
    Curve, Point, Rect, Segment, curve_bounds, inflate, reversed, segment_start,
};
use archboard_scene::request::{Arrowhead, Dash};

use crate::constants::APPROACH_STRAIGHT;
use crate::ecma::{hypot, js_max, js_min, max, min, sign, sorted_by};

use super::clearance::curve_boxes;
use super::drawn_lines::{Axis, Run, line_runs, on_run, straight_through};
use super::{BRIDGE_CLEARANCE, BRIDGE_RADIUS, LineLook};

/// Straight line kept past a hop, before a bend, a join or an end's approach.
pub(super) const HOP_MARGIN: f64 = 6.0;

/// How far the line beneath a hop runs straight toward the side it bulges to:
/// under its crest and on past it.
const HOP_REACH: f64 = BRIDGE_RADIUS + HOP_MARGIN;

/// How far the line beneath a hop runs straight on the other side, so it is
/// seen to pass beneath rather than to end at the line or turn onto it.
const FAR_REACH: f64 = BRIDGE_CLEARANCE;

/// Clear space a hop keeps from a card, a label, a title or an arrowhead: twice
/// what it keeps from a line, since an arc five points from a label's edge
/// reads as touching it.
const BOX_CLEARANCE: f64 = BRIDGE_CLEARANCE * 2.0;

/// Clear space between hops on crossing lines: a hop's radius, twice what hops
/// on parallel lines keep, since an arc bulging across another's path reads as
/// one knot with it.
const CROSSWISE_CLEARANCE: f64 = BRIDGE_RADIUS;

/// Which way a hop bulges: 1 up from a line across and right of a line down,
/// or -1, for a lone hop only the other side has room for, the other way.
pub(super) type Bulge = f64;

/// A hop that stands, and the axis of the run it stands on.
#[derive(Clone, Debug)]
pub(super) struct Hop {
    pub(super) curve: Curve,
    pub(super) axis: Axis,
    bounds: Rect,
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
    /// Every hop that stands.
    pub(super) hops: Vec<Hop>,
    ink: Vec<Vec<Ink>>,
}

/// Bounds of one unchanged route segment, with its finer boxes measured only
/// if a proposed hop reaches it. Both live for one crossing pass.
#[derive(Debug)]
struct Ink {
    bounds: Rect,
    pieces: OnceCell<Vec<Rect>>,
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
            runs,
            keepouts: keepouts_of(drawing, lines),
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
fn hump(run: &Run, first: f64, last: f64, bulge: Bulge) -> Curve {
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

/// The box an arrowhead is drawn in, when the route ends in a head on a
/// straight piece: its last stretch of approach, and half as far to either side.
fn arrowhead_box(edge: &DrawingEdge<EdgeFacts>, look: LineLook) -> Option<Rect> {
    let Some(Segment::Line { to }) = edge.curve.segments.last().copied() else {
        return None;
    };
    if look.arrowhead == Arrowhead::None {
        return None;
    }
    let from = segment_start(&edge.curve, edge.curve.segments.len() - 1);
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
    let heads = drawing
        .edges
        .iter()
        .enumerate()
        .filter_map(|(index, edge)| {
            arrowhead_box(edge, look_of(lines, &edge.edge.id)).map(|bounds| Keepout {
                bounds,
                edge_index: Some(index),
            })
        });
    cards.chain(titles).chain(labels).chain(heads).collect()
}

/// Whether a route piece other than those of the lines a hump rides and
/// passes over lies in its space; refined cubic bounds keep the clearance
/// without treating empty hulls as ink.
fn route_obstructs(scene: &HopScene<'_>, allowed: &[&Run], bounds: Rect, curve: &Curve) -> bool {
    let bridge_boxes: Vec<Rect> = curve_boxes(curve)
        .into_iter()
        .map(|piece| inflate(piece, BRIDGE_CLEARANCE))
        .collect();
    scene
        .drawing
        .edges
        .iter()
        .enumerate()
        .any(|(edge_index, edge)| {
            edge.curve
                .segments
                .iter()
                .enumerate()
                .any(|(segment_index, segment)| {
                    let ink = &scene.ink[edge_index][segment_index];
                    if !overlaps(bounds, ink.bounds) {
                        return false;
                    }
                    if allowed.iter().any(|piece| {
                        piece.edge_index == edge_index && piece.segment_index == segment_index
                    }) {
                        return false;
                    }
                    ink.pieces
                        .get_or_init(|| {
                            curve_boxes(&Curve {
                                from: segment_start(&edge.curve, segment_index),
                                segments: vec![*segment],
                            })
                        })
                        .iter()
                        .any(|&piece| {
                            bridge_boxes
                                .iter()
                                .any(|&bridge_box| overlaps(bridge_box, piece))
                        })
                })
        })
}

/// Whether a crest touches a card, a label, a title, an arrowhead other than
/// its own line's, an accepted hop or a crest standing with it, or another
/// line's ink than the lines it passes over (`beneath`, by their drawers).
pub(super) fn crowded(
    scene: &HopScene<'_>,
    run: &Run,
    beneath: &[&Run],
    curve: &Curve,
    pending: &[Hop],
) -> bool {
    let own = line_runs(&scene.runs, run);
    let curve_bounds = curve_bounds(curve);
    let bounds = inflate(curve_bounds, BRIDGE_CLEARANCE);
    let clear = inflate(curve_bounds, BOX_CLEARANCE);
    let near_other = scene
        .keepouts
        .iter()
        .filter(|keepout| {
            !own.iter()
                .any(|mine| Some(mine.edge_index) == keepout.edge_index)
        })
        .any(|keepout| overlaps(clear, keepout.bounds));
    if near_other {
        return true;
    }
    if scene
        .hops
        .iter()
        .chain(pending)
        .any(|hop| touches(hop, curve_bounds, run.axis))
    {
        return true;
    }
    let mut allowed = own;
    for under in beneath {
        allowed.extend(line_runs(&scene.runs, under));
    }
    route_obstructs(scene, &allowed, bounds, curve)
}

/// Whether a crest comes near the arrowhead of its own line: a hop stood so
/// close to the head it leads into reads as a knot at the card.
pub(super) fn near_own_head(scene: &HopScene<'_>, run: &Run, curve: &Curve) -> bool {
    let own: Vec<usize> = line_runs(&scene.runs, run)
        .into_iter()
        .map(|mine| mine.edge_index)
        .collect();
    let clear = inflate(curve_bounds(curve), BOX_CLEARANCE);
    scene.keepouts.iter().any(|keepout| {
        keepout
            .edge_index
            .is_some_and(|edge_index| own.contains(&edge_index))
            && overlaps(clear, keepout.bounds)
    })
}

/// Whether a new crest on a run of `axis` comes nearer a standing hop than
/// their lines allow.
fn touches(hop: &Hop, bounds: Rect, axis: Axis) -> bool {
    let clearance = if hop.axis == axis {
        BRIDGE_CLEARANCE
    } else {
        CROSSWISE_CLEARANCE
    };
    overlaps(inflate(bounds, clearance), inflate(hop.bounds, clearance))
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
