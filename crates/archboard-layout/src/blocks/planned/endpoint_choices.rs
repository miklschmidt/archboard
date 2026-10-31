//! Endpoint alternatives independent of the route through the intervening space.
use super::{
    choices::Search,
    geometry::length,
    model::Model,
    ports::{center, port},
    shape::Shape,
};
use crate::{
    blocks::assembly::PlacedLine,
    geometry::{Point, Rect, Side},
};
pub(super) fn ends(
    model: &Model<'_>,
    edge: usize,
    source: bool,
    shape: &Shape,
    guide: Option<&PlacedLine>,
    search: Search,
) -> Vec<super::ports::Port> {
    let (from, to) = model.ends[edge];
    let a = center(shape.endpoints[&from]);
    let b = center(shape.endpoints[&to]);
    let mut ports: Vec<_> = [Side::Bottom, Side::Right, Side::Top, Side::Left]
        .into_iter()
        .filter_map(|side| port(model, edge, source, side, shape, if source { b } else { a }))
        .collect();
    if search == Search::Ports {
        ports.extend(extra(model, edge, source, shape));
    }
    if let Some(guide) = guide.filter(|g| g.points.len() >= 2) {
        let (at, next) = if source {
            (guide.points[0], guide.points[1])
        } else {
            let n = guide.points.len();
            (guide.points[n - 1], guide.points[n - 2])
        };
        let (dx, dy) = (next.x - at.x, next.y - at.y);
        let approach = if dx.abs() > dy.abs() {
            Point {
                x: at.x + 20.02 * dx.signum(),
                y: at.y,
            }
        } else {
            Point {
                x: at.x,
                y: at.y + 20.02 * dy.signum(),
            }
        };
        if !ports.iter().any(|port| {
            length(&[port.attachment, at]) < 0.1 && length(&[port.approach, approach]) < 0.1
        }) {
            ports.push(super::ports::Port {
                attachment: at,
                approach,
            });
        }
    }
    let mut seen = rustc_hash::FxHashSet::default();
    ports.retain(|port| {
        seen.insert([
            port.attachment.x.to_bits(),
            port.attachment.y.to_bits(),
            port.approach.x.to_bits(),
            port.approach.y.to_bits(),
        ])
    });
    ports
}
pub(super) fn aligned(
    model: &Model<'_>,
    edge: usize,
    shape: &Shape,
    tail: super::ports::Port,
    head: super::ports::Port,
) -> Vec<(super::ports::Port, super::ports::Port)> {
    let mut pairs = vec![(tail, head)];
    let (from, to) = model.ends[edge];
    let a = shape.endpoints[&from];
    let b = shape.endpoints[&to];
    let source_slides = model.outgoing[from].len() == 1
        && model.edges[edge]
            .option(crate::graph::FROM_POINTS)
            .is_none();
    let target_slides = model.incoming[to].len() == 1;
    let vertical = tail.attachment.x == tail.approach.x && head.attachment.x == head.approach.x;
    let horizontal = tail.attachment.y == tail.approach.y && head.attachment.y == head.approach.y;
    if !vertical && !horizontal {
        return pairs;
    }
    let extent = |r: Rect| {
        if vertical {
            (r.x, r.width)
        } else {
            (r.y, r.height)
        }
    };
    let coordinate = |p: Point| if vertical { p.x } else { p.y };
    let (a_start, a_size) = extent(a);
    let (b_start, b_size) = extent(b);
    let low = (a_start + 12.0).max(b_start + 20.0);
    let high = (b_start + b_size - 20.0).min(a_start + a_size - 12.0);
    let (one, two) = (coordinate(tail.attachment), coordinate(head.attachment));
    let position = sliding_position(source_slides, target_slides, low, high, one, two);
    if let Some(position) = position.filter(|&p| low <= p && p <= high) {
        let (mut one, mut two) = (tail, head);
        if vertical {
            one.attachment.x = position;
            one.approach.x = position;
            two.attachment.x = position;
            two.approach.x = position;
        } else {
            one.attachment.y = position;
            one.approach.y = position;
            two.attachment.y = position;
            two.approach.y = position;
        }
        if (one, two) != (tail, head) {
            pairs.push((one, two));
        }
    }
    pairs
}

/// Where a relationship's own slot stands along a wall, among all that end there.
fn wall_slot(
    model: &Model<'_>,
    shape: &Shape,
    incidents: &[(usize, bool)],
    (edge, source): (usize, bool),
    (side, at): (Side, Rect),
) -> Point {
    let horizontal = matches!(side, Side::Bottom | Side::Top);
    let mut ordered = incidents.to_vec();
    ordered.sort_by(|&(one, os), &(two, ts)| {
        let coord = |e: usize, s: bool| {
            let other = if s { model.ends[e].1 } else { model.ends[e].0 };
            let p = center(shape.endpoints[&other]);
            if horizontal { p.x } else { p.y }
        };
        coord(one, os)
            .total_cmp(&coord(two, ts))
            .then(one.cmp(&two))
            .then(os.cmp(&ts))
    });
    let index = ordered
        .iter()
        .position(|v| *v == (edge, source))
        .expect("the incident relationship has an endpoint slot");
    let fraction = (index + 1) as f64 / (ordered.len() + 1) as f64;
    Point {
        x: at.x + 20.0 + (at.width - 40.0) * fraction,
        y: at.y + 20.0 + (at.height - 40.0) * fraction,
    }
}

fn extra(model: &Model<'_>, edge: usize, source: bool, shape: &Shape) -> Vec<super::ports::Port> {
    let (from, to) = model.ends[edge];
    let a = center(shape.endpoints[&from]);
    let b = center(shape.endpoints[&to]);
    let mut ports = Vec::new();

    let (endpoint, toward) = if source { (from, b) } else { (to, a) };
    if super::points::pointed(model, endpoint) {
        return ports;
    }
    let incidents: Vec<_> = model.outgoing[endpoint]
        .iter()
        .map(|&e| (e, true))
        .chain(model.incoming[endpoint].iter().map(|&e| (e, false)))
        .collect();
    let margin = if source { 12.0 } else { 20.0 };
    let walls = model.endpoints[endpoint].walls;
    for side in [Side::Bottom, Side::Right, Side::Top, Side::Left] {
        if walls.contains(&side) {
            let at = shape.wall(endpoint, side);
            ports.push(super::ports::on_wall(at, side, toward, margin));
            let slot = wall_slot(model, shape, &incidents, (edge, source), (side, at));
            ports.push(super::ports::on_wall(at, side, slot, 20.0));
        }
    }
    ports
}

fn sliding_position(
    source_slides: bool,
    target_slides: bool,
    low: f64,
    high: f64,
    one: f64,
    two: f64,
) -> Option<f64> {
    if source_slides && target_slides {
        Some(f64::midpoint(low, high))
    } else if source_slides {
        Some(two)
    } else if target_slides {
        Some(one)
    } else {
        None
    }
}
