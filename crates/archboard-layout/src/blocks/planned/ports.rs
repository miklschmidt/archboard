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

/// One treatment shares a port only in one direction at one endpoint.
pub(super) fn port(
    model: &Model<'_>,
    edge: usize,
    source: bool,
    side: Side,
    shape: &Shape,
    toward: Point,
) -> Option<Port> {
    choose_port(model, edge, source, side, shape, toward)
        .map(|port| port.reaching(model.half(edge)))
}

fn choose_port(
    model: &Model<'_>,
    edge: usize,
    source: bool,
    side: Side,
    shape: &Shape,
    toward: Point,
) -> Option<Port> {
    let (endpoint, incidents) = if source {
        let endpoint = model.ends[edge].0;
        (endpoint, &model.outgoing[endpoint])
    } else {
        let endpoint = model.ends[edge].1;
        (endpoint, &model.incoming[endpoint])
    };
    if !model.endpoints[endpoint].walls.contains(&side) {
        return None;
    }
    let at = shape.wall(endpoint, side);
    let kinds = kinds_of(model, incidents);
    let half = model.half(edge);
    if model.endpoints[endpoint].door
        && let Some((index, widths)) = door_slot(model, shape, (edge, endpoint, source), side)
    {
        if !room(at, side, &widths, DOOR_MARGIN, LANE) {
            return None;
        }
        let point = slot_of(at, index, &widths, DOOR_MARGIN);
        return Some(on_wall(at, side, point, DOOR_MARGIN + half));
    }
    let widths = widths_of(model, incidents, &kinds);
    let (margin, spacing) = spacing(source, model.endpoints[endpoint].door);
    if !room(at, side, &widths, margin, spacing) {
        return None;
    }
    let index = kinds
        .iter()
        .position(|kind| *kind == model.treatments[edge])?;
    let point = distributed(at, index, &widths, incidents.len(), toward, margin);
    let selected = on_wall(at, side, point, margin + half);
    if kinds.len() != 1 {
        return Some(selected);
    }
    separate_roles(model, endpoint, source, side, shape, selected)
}

/// How far a door keeps its ports from its rounded corners.
const DOOR_MARGIN: f64 = 12.0;

/// The slot of a line's end on a door's wall, and the width of each slot the wall holds: one for
/// each kind of line the door takes in, then one for each it sends out, a lane apart and each as
/// wide as its cable. A head and a tail then never stand within a lane of each other on opposite
/// walls, where they would read as one line through the door. Within the heads and within the
/// tails, the kinds stand in the order their far ends stand along the wall, so the lines leave
/// the door already sorted and do not cross before they reach anything. A door that joins one
/// kind of line in one direction has no slots.
fn door_slot(
    model: &Model<'_>,
    shape: &Shape,
    (edge, endpoint, source): (usize, usize, bool),
    side: Side,
) -> Option<(usize, Vec<f64>)> {
    let (incoming, outgoing) = (&model.incoming[endpoint], &model.outgoing[endpoint]);
    let mut heads = kinds_of(model, incoming);
    let mut tails = kinds_of(model, outgoing);
    if heads.len() + tails.len() <= 1 {
        return None;
    }
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

fn separate_roles(
    model: &Model<'_>,
    endpoint: usize,
    source: bool,
    side: Side,
    shape: &Shape,
    selected: Port,
) -> Option<Port> {
    let primary_source = matches!(side, Side::Bottom | Side::Right);
    let (others, own_margin) = if source {
        (&model.incoming[endpoint], 12.0)
    } else {
        (&model.outgoing[endpoint], 20.0)
    };
    if source == primary_source || others.is_empty() || kinds_of(model, others).len() != 1 {
        return Some(selected);
    }
    let other = others[0];
    let peer = if source {
        model.ends[other].0
    } else {
        model.ends[other].1
    };
    let toward = center(shape.endpoints[&peer]);
    let at = shape.wall(endpoint, side);
    let margin = if primary_source { 12.0 } else { 20.0 };
    let primary = on_wall(
        at,
        side,
        distributed(at, 0, &[0.0], others.len(), toward, margin),
        margin,
    );
    shifted_port(at, side, selected, primary, own_margin)
}
fn shifted_port(at: Rect, side: Side, selected: Port, primary: Port, margin: f64) -> Option<Port> {
    let vertical = matches!(side, Side::Top | Side::Bottom);
    let value = |p: Point| if vertical { p.x } else { p.y };
    let origin = value(primary.attachment);
    if (value(selected.attachment) - origin).abs() >= LANE {
        return Some(selected);
    }
    let (low, high) = if vertical {
        (at.x + margin, at.x + at.width - margin)
    } else {
        (at.y + margin, at.y + at.height - margin)
    };
    let position = [origin - LANE, origin + LANE]
        .into_iter()
        .filter(|&p| p >= low && p <= high)
        .min_by(|a, b| {
            (a - value(selected.attachment))
                .abs()
                .total_cmp(&(b - value(selected.attachment)).abs())
        })?;
    let toward = if vertical {
        Point {
            x: position,
            ..center(at)
        }
    } else {
        Point {
            y: position,
            ..center(at)
        }
    };
    Some(on_wall(at, side, toward, margin))
}

fn distributed(
    at: Rect,
    index: usize,
    widths: &[f64],
    incidents: usize,
    toward: Point,
    margin: f64,
) -> Point {
    if widths.len() > 1 {
        slot_of(at, index, widths, margin)
    } else if incidents > 1 {
        center(at)
    } else {
        toward
    }
}

/// The middle of one of some slots of these widths along a box's wall, a margin in from each
/// end, with the room the slots leave shared evenly between them.
fn slot_of(at: Rect, index: usize, widths: &[f64], margin: f64) -> Point {
    let gaps = widths.len().saturating_sub(1).max(1) as f64;
    let before: f64 = widths[..index].iter().sum();
    let along = |length: f64| {
        let gap = (length - 2.0 * margin - widths.iter().sum::<f64>()) / gaps;
        margin + before + index as f64 * gap + widths[index] / 2.0
    };
    Point {
        x: at.x + along(at.width),
        y: at.y + along(at.height),
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

/// How far a wall keeps the ports of one end of its lines from its corners, and how far apart:
/// a head a lane from the next, as wide as it is, and a tail closer. A door's corners are
/// rounder than a card's, so its ports stand nearer them.
fn spacing(source: bool, door: bool) -> (f64, f64) {
    match (source, door) {
        (true, _) => (12.0, 8.0),
        (false, true) => (12.0, LANE),
        (false, false) => (PORT_MARGIN, LANE),
    }
}

/// The graph with each door as wide as one wall needs to hold its slots (`door_slot`): a port
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
