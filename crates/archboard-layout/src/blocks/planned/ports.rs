//! Joint wall capacity and treatment-specific attachment order.

use super::model::Model;
use super::shape::{CLEAR, Shape};
use crate::geometry::{Point, Rect, Side};
use crate::graph::Node;
use crate::lanes::chains::LANE;
use crate::lanes::channels::PORT_MARGIN;

#[derive(Clone, Copy, PartialEq)]
pub(super) struct Port {
    pub attachment: Point,
    pub approach: Point,
}

impl Port {
    /// The port of a line whose ink reaches `half` to either side: a cable's straight run
    /// reaches as far from the wall as its approach needs (`approach_of`). A lone line's port
    /// is as it was made.
    pub(super) fn reaching(self, half: f64) -> Self {
        if half == 0.0 {
            return self;
        }
        let (dx, dy) = (
            self.approach.x - self.attachment.x,
            self.approach.y - self.attachment.y,
        );
        let length = dx.hypot(dy);
        let reach = super::channel::approach_of(half) + 0.02;
        Self {
            approach: Point {
                x: self.attachment.x + dx / length * reach,
                y: self.attachment.y + dy / length * reach,
            },
            ..self
        }
    }
}

/// The port of one end of a line on one wall of its endpoint (`choose_port`), reaching as far
/// from the wall as the line's approach needs.
pub(super) fn port(
    model: &Model<'_>,
    edge: usize,
    source: bool,
    side: Side,
    shape: &Shape,
) -> Option<Port> {
    choose_port(model, edge, source, side, shape).map(|port| port.reaching(model.half(edge)))
}

/// A line's end on one wall of its endpoint. Every kind of line the endpoint takes in, then
/// every kind it sends out, holds a slot, each as wide as its cable and a lane from the next,
/// and the slots stand together as one group in the middle of the wall: a port leaves the middle
/// only as far as the others need it to, never to shorten its line. One treatment shares a slot
/// only in one direction at one endpoint.
fn choose_port(
    model: &Model<'_>,
    edge: usize,
    source: bool,
    side: Side,
    shape: &Shape,
) -> Option<Port> {
    let endpoint = if source {
        model.ends[edge].0
    } else {
        model.ends[edge].1
    };
    if !model.endpoints[endpoint].walls.contains(&side) {
        return None;
    }
    let at = shape.wall(endpoint, side);
    let (index, widths) = slot(model, shape, (edge, endpoint, source), side)?;
    let margin = if model.endpoints[endpoint].door {
        DOOR_MARGIN
    } else {
        PORT_MARGIN
    };
    if !room(at, side, &widths, margin, LANE) {
        return None;
    }
    let point = centred(at, index, &widths);
    Some(on_wall(at, side, point, margin + model.half(edge)))
}

/// How far a door keeps its ports from its rounded corners, which are rounder than a card's.
const DOOR_MARGIN: f64 = 12.0;

/// The slot of a line's end on an endpoint's wall, and the width of each slot the wall holds:
/// one for each kind of line that stands on the wall (`face_of`) and comes in, then one for each
/// that goes out, a lane apart and each as wide as its cable. A head and a tail then never stand within a lane of each other
/// on opposite walls, where they would read as one line through the box. Within the heads and
/// within the tails, the kinds stand in the order their far ends stand along the wall, so the
/// lines leave the box already sorted and do not cross before they reach anything.
fn slot(
    model: &Model<'_>,
    shape: &Shape,
    (edge, endpoint, source): (usize, usize, bool),
    side: Side,
) -> Option<(usize, Vec<f64>)> {
    // The lines that stand on this wall: those whose far end lies beyond it, and this one.
    let own =
        |line: usize, far: usize| line == edge || face_of(model, shape, endpoint, far) == side;
    let incoming: Vec<usize> = (model.incoming[endpoint].iter().copied())
        .filter(|&line| own(line, model.ends[line].0))
        .collect();
    let outgoing: Vec<usize> = (model.outgoing[endpoint].iter().copied())
        .filter(|&line| own(line, model.ends[line].1))
        .collect();
    let (incoming, outgoing) = (incoming.as_slice(), outgoing.as_slice());
    let mut heads = kinds_of(model, incoming);
    let mut tails = kinds_of(model, outgoing);
    let along = |far: usize| {
        let at = center(shape.endpoints[&far]);
        if matches!(side, Side::Top | Side::Bottom) {
            at.x
        } else {
            at.y
        }
    };
    // Where the far ends of a kind's lines stand along the wall, on average.
    let bearing = |kind: &str, lines: &[usize], far: fn(&Model<'_>, usize) -> usize| {
        let ats: Vec<f64> = (lines.iter())
            .filter(|&&line| model.treatments[line] == kind)
            .map(|&line| along(far(model, line)))
            .collect();
        ats.iter().sum::<f64>() / ats.len().max(1) as f64
    };
    let by_bearing = |kinds: &mut Vec<&str>,
                      lines: &[usize],
                      far: fn(&Model<'_>, usize) -> usize| {
        kinds.sort_by(|one, other| bearing(one, lines, far).total_cmp(&bearing(other, lines, far)));
    };
    by_bearing(&mut heads, incoming, |model, line| model.ends[line].0);
    by_bearing(&mut tails, outgoing, |model, line| model.ends[line].1);
    let mut widths = widths_of(model, incoming, &heads);
    widths.extend(widths_of(model, outgoing, &tails));
    let kind = model.treatments[edge].as_str();
    let index = if source {
        heads.len() + tails.iter().position(|&one| one == kind)?
    } else {
        heads.iter().position(|&one| one == kind)?
    };
    Some((index, widths))
}

/// How wide each kind's port is: as wide as the cable of that kind, all of whose lines share it.
fn widths_of(model: &Model<'_>, incidents: &[usize], kinds: &[&str]) -> Vec<f64> {
    (kinds.iter())
        .map(|&kind| {
            (incidents.iter())
                .find(|&&edge| model.treatments[edge] == kind)
                .map_or(0.0, |&edge| model.girth[edge])
        })
        .collect()
}

/// The wall of an endpoint that a line to a far endpoint stands on: of the walls it may take,
/// the one the far end lies most beyond, for the box's own shape.
fn face_of(model: &Model<'_>, shape: &Shape, endpoint: usize, far: usize) -> Side {
    let at = shape.endpoints[&endpoint];
    let (middle, there) = (center(at), center(shape.endpoints[&far]));
    let (dx, dy) = (
        (there.x - middle.x) / at.width.max(1.0),
        (there.y - middle.y) / at.height.max(1.0),
    );
    let beyond = |side: Side| match side {
        Side::Top => -dy,
        Side::Bottom => dy,
        Side::Left => -dx,
        Side::Right => dx,
    };
    (model.endpoints[endpoint].walls.into_iter())
        .max_by(|one, other| beyond(*one).total_cmp(&beyond(*other)))
        .unwrap_or(Side::Bottom)
}

/// The middle of one of some slots of these widths along a box's wall, the slots standing a
/// lane apart as one group in the middle of the wall.
fn centred(at: Rect, index: usize, widths: &[f64]) -> Point {
    let group: f64 = widths.iter().sum::<f64>() + widths.len().saturating_sub(1) as f64 * LANE;
    let before: f64 = widths[..index].iter().sum::<f64>() + index as f64 * LANE;
    let offset = before + widths[index] / 2.0 - group / 2.0;
    let middle = center(at);
    Point {
        x: middle.x + offset,
        y: middle.y + offset,
    }
}

/// How many of a route's two ends stand off the centred port of the wall they end on.
pub(super) fn off_centre(model: &Model<'_>, shape: &Shape, edge: usize, points: &[Point]) -> usize {
    let (from, to) = model.ends[edge];
    let last = points.len() - 1;
    [
        (true, from, points[0], points[1]),
        (false, to, points[last], points[last - 1]),
    ]
    .into_iter()
    .filter(|&(source, endpoint, at, next)| {
        let side = wall_of(shape.endpoints[&endpoint], at, next);
        let centred = side.and_then(|side| port(model, edge, source, side, shape));
        !centred.is_some_and(|port| {
            (port.attachment.x - at.x).abs() + (port.attachment.y - at.y).abs() < 0.5
        })
    })
    .count()
}

/// The wall of a box that a route's end leaves from toward its next point.
fn wall_of(at: Rect, end: Point, next: Point) -> Option<Side> {
    let near = |a: f64, b: f64| (a - b).abs() < 0.1;
    if next.y < end.y && near(end.y, at.y) {
        Some(Side::Top)
    } else if next.y > end.y && near(end.y, at.y + at.height) {
        Some(Side::Bottom)
    } else if next.x < end.x && near(end.x, at.x) {
        Some(Side::Left)
    } else if next.x > end.x && near(end.x, at.x + at.width) {
        Some(Side::Right)
    } else {
        None
    }
}

/// Whether a line meets each door it joins on a side that faces the line's far end. A line
/// that met a door on another side would loop round the door, or reach it from behind.
pub(super) fn faces_far_end(
    model: &Model<'_>,
    shape: &Shape,
    edge: usize,
    points: &[Point],
) -> bool {
    let (from, to) = model.ends[edge];
    let last = points.len() - 1;
    [
        (from, to, points[0], points[1]),
        (to, from, points[last], points[last - 1]),
    ]
    .into_iter()
    .all(|(at, far, attachment, next)| {
        !model.endpoints[at].door
            || facing(
                shape.endpoints[&at],
                center(shape.endpoints[&far]),
                attachment,
                next,
            )
    })
}

/// Whether a line that leaves a box from one point toward the next heads for a far point.
/// A far point beside the box in neither direction leaves every side open.
fn facing(at: Rect, far: Point, attachment: Point, next: Point) -> bool {
    let above = far.y < at.y;
    let below = far.y > at.y + at.height;
    let before = far.x < at.x;
    let after = far.x > at.x + at.width;
    if !(above || below || before || after) {
        return true;
    }
    if next.y < attachment.y {
        above
    } else if next.y > attachment.y {
        below
    } else if next.x < attachment.x {
        before
    } else {
        after
    }
}

pub(super) fn center(at: Rect) -> Point {
    Point {
        x: at.x + at.width / 2.0,
        y: at.y + at.height / 2.0,
    }
}

/// A place along a wall, a margin in from each end. On a wall shorter than twice
/// the margin both ends meet at its middle, and rounding must not cross them.
fn along(value: f64, start: f64, length: f64, margin: f64) -> f64 {
    let inset = length.min(2.0 * margin) / 2.0;
    let low = start + inset;
    value.clamp(low, (start + length - inset).max(low))
}

pub(super) fn on_wall(at: Rect, side: Side, toward: Point, margin: f64) -> Port {
    let x = along(toward.x, at.x, at.width, margin);
    let y = along(toward.y, at.y, at.height, margin);
    let (attachment, by) = match side {
        Side::Top => (Point { x, y: at.y }, Point { x: 0.0, y: -CLEAR }),
        Side::Right => (
            Point {
                x: at.x + at.width,
                y,
            },
            Point { x: CLEAR, y: 0.0 },
        ),
        Side::Bottom => (
            Point {
                x,
                y: at.y + at.height,
            },
            Point { x: 0.0, y: CLEAR },
        ),
        Side::Left => (Point { x: at.x, y }, Point { x: -CLEAR, y: 0.0 }),
    };
    // SVG coordinates round to hundredths. Keep the contact just outside the
    // painted face so independent rounding cannot turn it into a header strike.
    let attachment = Point {
        x: attachment.x + by.x / CLEAR * 0.02,
        y: attachment.y + by.y / CLEAR * 0.02,
    };
    Port {
        attachment,
        approach: Point {
            x: attachment.x
                + by.x / CLEAR
                    * (crate::constants::APPROACH_STRAIGHT + crate::constants::BEND_RADIUS + 0.02),
            y: attachment.y
                + by.y / CLEAR
                    * (crate::constants::APPROACH_STRAIGHT + crate::constants::BEND_RADIUS + 0.02),
        },
    }
}

fn kinds_of<'a>(model: &'a Model<'_>, incidents: &[usize]) -> Vec<&'a str> {
    let mut kinds = Vec::new();
    for &index in incidents {
        let kind = model.treatments[index].as_str();
        if !kinds.contains(&kind) {
            kinds.push(kind);
        }
    }
    kinds
}

/// The graph with each door as wide as one wall needs to hold its slots (`slot`): a port
/// for each kind of line the door takes in and for each it sends out, a lane apart. A door's
/// words set its width only while its lines need less.
pub(in crate::blocks) fn doors_widened(graph: &Node) -> Node {
    let widths: rustc_hash::FxHashMap<String, f64> = Model::new(graph)
        .map(|model| {
            (model.endpoints.iter().enumerate())
                .filter(|(_, end)| end.door)
                .filter_map(|(at, end)| {
                    let (incoming, outgoing) = (&model.incoming[at], &model.outgoing[at]);
                    let mut slots = widths_of(&model, incoming, &kinds_of(&model, incoming));
                    slots.extend(widths_of(&model, outgoing, &kinds_of(&model, outgoing)));
                    let width = 2.0 * DOOR_MARGIN
                        + slots.iter().sum::<f64>()
                        + slots.len().saturating_sub(1) as f64 * LANE;
                    (width > end.node.width.unwrap_or_default())
                        .then(|| (end.node.id.clone(), width))
                })
                .collect()
        })
        .unwrap_or_default();
    let mut wide = graph.clone();
    if !widths.is_empty() {
        widen(&mut wide, &widths);
    }
    wide
}

/// Give each node the width named for it, through the whole hierarchy.
fn widen(node: &mut Node, widths: &rustc_hash::FxHashMap<String, f64>) {
    if let Some(&width) = widths.get(&node.id) {
        node.width = Some(width);
    }
    for child in node.children.iter_mut().flatten() {
        widen(child, widths);
    }
}

/// Whether a wall holds slots of these widths, each `spacing` from the next and a margin in from
/// each end.
fn room(at: Rect, side: Side, widths: &[f64], margin: f64, spacing: f64) -> bool {
    let span = if matches!(side, Side::Top | Side::Bottom) {
        at.width
    } else {
        at.height
    };
    let taken: f64 = widths.iter().sum();
    match widths.len() {
        0 => true,
        1 => span - 2.0 * margin >= taken,
        count => (span - 2.0 * margin - taken) / ((count - 1) as f64) >= spacing,
    }
}

#[cfg(test)]
mod tests {
    use super::{Port, along, on_wall};
    use crate::geometry::{Point, Rect, Side};

    /// A wall's slots stand together in its middle, a lane apart and each as wide as its cable,
    /// however wide the wall: a port leaves the middle only as far as the others need it to.
    #[test]
    fn a_walls_slots_stand_as_one_group_a_lane_apart_in_its_middle() {
        let wall = Rect {
            x: 100.0,
            y: 0.0,
            width: 600.0,
            height: 40.0,
        };
        let widths = [0.0, 16.0, 0.0];
        let at: Vec<f64> = (0..3)
            .map(|index| super::centred(wall, index, &widths).x)
            .collect();
        assert_eq!(at, [376.0, 400.0, 424.0]);
        assert_eq!(super::centred(wall, 0, &[0.0]).x, 400.0);
    }

    #[test]
    fn a_cables_port_reaches_as_far_from_its_wall_as_its_approach_needs() {
        let card = Rect {
            x: 0.0,
            y: 0.0,
            width: 200.0,
            height: 100.0,
        };
        let port = on_wall(card, Side::Bottom, Point { x: 100.0, y: 0.0 }, 20.0);
        let reach = |port: Port| port.approach.y - port.attachment.y;
        assert!(port.reaching(0.0) == port);
        let half = 12.0;
        assert!(
            (reach(port.reaching(half)) - super::super::channel::approach_of(half) - 0.02).abs()
                < 1e-9
        );
    }

    #[test]
    fn a_wall_shorter_than_its_margins_holds_a_place_at_its_middle() {
        // Rounding once stood the two ends of this wall the wrong way round, and `clamp` panics then.
        let (start, length) = (0.1, 0.1 + 0.2);
        assert!((along(50.0, start, length, 8.0) - (start + length / 2.0)).abs() < 1e-9);
        assert_eq!(along(50.0, 0.0, 100.0, 8.0), 50.0);
        assert_eq!(along(99.0, 0.0, 100.0, 8.0), 92.0);
    }
}
