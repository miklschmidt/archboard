//! Compare complete routes by clear approaches, crossings, bends and travel.

use crate::{
    blocks::assembly::PlacedLine,
    geometry::Point,
    track::{chains::LANE, score::crossings_of},
};

/// A crossing costs the same travel as two and a half bends.
const CROSSING_COST: f64 = 300.0;

/// Prefer crossings at least two lanes from a card's attachment.
const APPROACH_ROOM: f64 = 2.0 * LANE;

fn inside(value: f64, a: f64, b: f64) -> bool {
    value > a.min(b) + 1.0 && value < a.max(b) - 1.0
}

fn crossing(a: Point, b: Point, c: Point, d: Point) -> Option<Point> {
    if a.x == b.x && c.y == d.y && inside(a.x, c.x, d.x) && inside(c.y, a.y, b.y) {
        Some(Point { x: a.x, y: c.y })
    } else if a.y == b.y && c.x == d.x && inside(c.x, a.x, b.x) && inside(a.y, c.y, d.y) {
        Some(Point { x: c.x, y: a.y })
    } else {
        None
    }
}

/// Count visible crossing sites close to a card on an endpoint run.
fn approaches(lines: &[PlacedLine]) -> usize {
    let mut sites = rustc_hash::FxHashSet::default();
    for (index, line) in lines.iter().enumerate() {
        let points = &line.points;
        if points.len() < 2 {
            continue;
        }
        let ends = [
            (points[0], points[1]),
            (points[points.len() - 1], points[points.len() - 2]),
        ];
        for (at, next) in ends {
            for other in lines
                .iter()
                .enumerate()
                .filter(|(i, _)| *i != index)
                .map(|(_, line)| line)
            {
                sites.extend(approach_sites(at, next, other));
            }
        }
    }
    sites.len()
}

/// Crossing sites on one foreign line near an endpoint run.
fn approach_sites(at: Point, next: Point, other: &PlacedLine) -> impl Iterator<Item = (u64, u64)> {
    other.points.windows(2).filter_map(move |pair| {
        crossing(at, next, pair[0], pair[1])
            .filter(|p| (p.x - at.x).abs() + (p.y - at.y).abs() < APPROACH_ROOM)
            .map(|p| (p.x.round().to_bits(), p.y.round().to_bits()))
    })
}

/// Lower ranks keep card approaches clear, then reduce the work of tracing lines.
pub(super) fn rank(lines: &[PlacedLine]) -> (usize, u64) {
    let crossings = crossings_of(lines.iter().map(|line| line.points.as_slice()));
    let cost = lines
        .iter()
        .map(|line| super::fixed::route_cost(&line.points))
        .sum::<f64>()
        + CROSSING_COST * crossings;
    (approaches(lines), cost.to_bits())
}

/// A larger drawing needs a ten-percent gain after its route cost pays for
/// the extra area. Compare every candidate with the first guarded drawing.
/// A cheaper total must not hide a new long detour on an individual route.
pub(super) fn worth_placing(
    next: &crate::blocks::assembly::Placed,
    first: &crate::blocks::assembly::Placed,
    graph: &crate::graph::Node,
) -> bool {
    let grows_detour = next.edges.iter().any(|edge| {
        first
            .edges
            .iter()
            .find(|old| old.id == edge.id)
            .is_some_and(|old| {
                let (length, direct) = distances(&edge.points);
                let (before, previous_direct) = distances(&old.points);
                length > direct * 1.5 && length - direct > before - previous_direct + 300.0
            })
    });
    let area = next.width * next.height / (first.width * first.height);
    !grows_detour
        && !spreads_fan(next, first, graph)
        && (area <= 1.0
            || f64::from_bits(rank(&next.edges).1) * area * 1.1
                < f64::from_bits(rank(&first.edges).1))
}

/// Actual travel and the direct orthogonal distance between a route's ends.
fn distances(points: &[Point]) -> (f64, f64) {
    (
        super::geometry::length(points),
        super::geometry::length(&[points[0], points[points.len() - 1]]),
    )
}

/// A total saving must not spread a caller's cards over more rows while
/// making that caller's own routes more expensive.
fn spreads_fan(
    next: &crate::blocks::assembly::Placed,
    first: &crate::blocks::assembly::Placed,
    graph: &crate::graph::Node,
) -> bool {
    let mut fans: rustc_hash::FxHashMap<&str, Vec<&crate::graph::Edge>> =
        rustc_hash::FxHashMap::default();
    for edge in graph.edges.iter().flatten() {
        fans.entry(edge.source()).or_default().push(edge);
    }
    fans.values().any(|edges| {
        let (rows, cost) = fan_reading(next, edges);
        let (before_rows, before_cost) = fan_reading(first, edges);
        rows > before_rows && cost > before_cost
    })
}

/// Row bands and route cost for the cards that one source calls.
fn fan_reading(
    drawing: &crate::blocks::assembly::Placed,
    edges: &[&crate::graph::Edge],
) -> (usize, f64) {
    let mut targets = Vec::new();
    let mut cost = 0.0;
    for edge in edges {
        if let Some(card) = drawing.cards.iter().find(|card| card.id == edge.target()) {
            targets.push(card.bx);
            if let Some(line) = drawing.edges.iter().find(|line| line.id == edge.id) {
                cost += super::fixed::route_cost(&line.points);
            }
        }
    }
    targets.sort_by(|a, b| a.y.total_cmp(&b.y));
    let mut rows = 0;
    let mut bottom = f64::NEG_INFINITY;
    for target in targets {
        if target.y >= bottom {
            rows += 1;
            bottom = target.y + target.height;
        } else {
            bottom = bottom.min(target.y + target.height);
        }
    }
    (rows, cost)
}
