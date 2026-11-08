//! Compare complete routes by clear approaches, crossings, bends and travel.

use archboard_scene::paint::design::LANDING_ROOM;

use crate::{
    blocks::assembly::PlacedLine,
    geometry::Point,
    track::{chains::LANE, score::crossings_of},
};

/// A crossing costs the same travel as two and a half bends.
const CROSSING_COST: f64 = 300.0;
/// A crossing beside an arrow costs a finished drawing what two crossings cost.
const CROWDED_COST: f64 = 2.0 * CROSSING_COST;

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

/// How a finished drawing ranks: whether its words read where it lands, whether it stays
/// within the room limit, its long detours, then the work of tracing its lines, with its
/// crowded approaches, times its area. A page whose words read pays for its area alone, not
/// for the scale it lands at: a smaller scale costs a reader less than lines that cross and
/// run the long way round.
pub(super) type Order = (bool, bool, usize, f64);

/// The scale that a landing must reach for its words to read (the first gate of the reader).
const NEAR_SCALE: f64 = 0.6;
/// The shape of the room a picture lands in, width over height.
const PANE_SHAPE: f64 = LANDING_ROOM.0 / LANDING_ROOM.1;
/// The largest page a reading settles for. Past it, a reading of few lines tries more room.
const LANDS_WHOLE: (f64, f64) = (2505.0, 1520.0);
/// A line is a long detour past this much extra travel, and half again its direct way.
const LONG_DETOUR: f64 = 300.0;

/// What a page of this size costs before it is routed: its own area, which a page that lands
/// whole shows as it is, and the room that the smallest box of the pane's shape round it
/// needs past the landing room, which a larger page pays for in scale. A placement that
/// promises the pane's shape lands larger, so the ring and the promise prefer it, and the
/// order judges the routed page by its area.
pub(super) fn room_cost(width: f64, height: f64) -> f64 {
    let pane = width.max(height * PANE_SHAPE);
    width * height + (pane * pane / PANE_SHAPE - LANDING_ROOM.0 * LANDING_ROOM.1).max(0.0)
}

/// What a dense placement promises before it is routed: the straight way of
/// its lines times what its room costs, so a long thin page pays for its shape.
pub(super) fn promise(drawing: &crate::blocks::assembly::Placed, reach: f64) -> f64 {
    (1.0 + reach) * room_cost(drawing.width, drawing.height)
}

fn long_detours(lines: &[PlacedLine]) -> usize {
    lines
        .iter()
        .filter(|line| {
            let (length, direct) = distances(&line.points);
            length > direct * 1.5 && length - direct > LONG_DETOUR
        })
        .count()
}

/// A drawing as it was routed. Contraction brings cards and crossings together, so a
/// route's own measures read this, and only the room a drawing takes reads what contraction left.
fn as_routed(drawing: &crate::blocks::assembly::Placed) -> &crate::blocks::assembly::Placed {
    drawing.routed.as_deref().unwrap_or(drawing)
}

/// How a finished drawing's routes rank.
pub(super) fn drawn_rank(drawing: &crate::blocks::assembly::Placed) -> (usize, u64) {
    rank(&as_routed(drawing).edges)
}

pub(super) fn order(drawing: &crate::blocks::assembly::Placed) -> Order {
    let routed = &as_routed(drawing).edges;
    let (crowded, cost) = rank(routed);
    (
        drawing.width * NEAR_SCALE > LANDING_ROOM.0 || drawing.height * NEAR_SCALE > LANDING_ROOM.1,
        drawing.width > LANDS_WHOLE.0 || drawing.height > LANDS_WHOLE.1,
        long_detours(routed),
        (1.0 + f64::from_bits(cost) + crowded as f64 * CROWDED_COST)
            * drawing.width
            * drawing.height,
    )
}

/// A larger drawing needs a ten-percent gain after its route cost pays for
/// the extra area. Compare every candidate with the first guarded drawing.
/// A cheaper total must not hide a new long detour on an individual route.
pub(super) fn worth_placing(
    next: &crate::blocks::assembly::Placed,
    first: &crate::blocks::assembly::Placed,
    graph: &crate::graph::Node,
) -> bool {
    let area = next.width * next.height / (first.width * first.height);
    let (next, first) = (as_routed(next), as_routed(first));
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        blocks::assembly::{Placed, PlacedCard},
        geometry::Rect,
    };

    const CARD: f64 = 100.0;

    fn card(id: &str, x: f64, y: f64) -> PlacedCard {
        PlacedCard {
            id: id.into(),
            bx: Rect {
                x,
                y,
                width: CARD,
                height: CARD,
            },
            depth: 1,
            header: None,
        }
    }

    fn line(id: &str, to: Point) -> PlacedLine {
        let from = Point { x: 0.0, y: 0.0 };
        PlacedLine {
            id: id.into(),
            points: vec![from, Point { x: to.x, y: 0.0 }, to],
            label: None,
        }
    }

    /// A caller with two cards to call, the second this far along and this far down.
    fn fan(second: Point, routed: Option<Placed>) -> Placed {
        Placed {
            width: 1000.0,
            height: 1000.0,
            cards: vec![card("one", 200.0, 0.0), card("two", second.x, second.y)],
            frames: Vec::new(),
            regions: Vec::new(),
            edges: vec![
                line("to one", Point { x: 200.0, y: 0.0 }),
                line("to two", second),
            ],
            titles: Vec::new(),
            routed: routed.map(std::rc::Rc::new),
        }
    }

    #[test]
    fn a_saving_cannot_spread_a_callers_cards_as_routed() {
        let graph: crate::graph::Node = serde_json::from_value(serde_json::json!({
            "id": "root",
            "edges": [
                {"id": "to one", "sources": ["caller"], "targets": ["one"]},
                {"id": "to two", "sources": ["caller"], "targets": ["two"]},
            ],
        }))
        .unwrap();
        let row = Point { x: 400.0, y: 0.0 };
        let below = Point { x: 400.0, y: 150.0 };
        let first = fan(row, Some(fan(row, None)));
        assert!(!worth_placing(
            &fan(below, Some(fan(below, None))),
            &first,
            &graph
        ));
        assert!(worth_placing(
            &fan(below, Some(fan(row, None))),
            &first,
            &graph
        ));
    }

    #[test]
    fn readable_landing_precedes_the_legacy_room_limit() {
        // Taller than the room limit, and its words read where it lands.
        let readable = Placed {
            width: 1000.0,
            height: 1580.0,
            ..fan(Point { x: 400.0, y: 0.0 }, None)
        };
        // Within the room limit, and too wide for its words to read where it lands.
        let unreadable = Placed {
            width: LANDING_ROOM.0 / NEAR_SCALE + 100.0,
            height: 1000.0,
            ..readable.clone()
        };
        assert!(order(&readable) < order(&unreadable));
    }

    /// Two pages that both land where their words read: a wide one whose line is short, and
    /// one of the pane's shape whose line is two fifths longer. The pane's shape saves the
    /// wide page's scale, not its area, so the short line wins.
    #[test]
    fn a_readable_page_pays_its_area_not_the_panes_shape() {
        let page = |width: f64, height: f64, length: f64| Placed {
            width,
            height,
            cards: Vec::new(),
            frames: Vec::new(),
            regions: Vec::new(),
            edges: vec![PlacedLine {
                id: "line".into(),
                points: vec![Point { x: 0.0, y: 0.0 }, Point { x: length, y: 0.0 }],
                label: None,
            }],
            titles: Vec::new(),
            routed: None,
        };
        let wide = page(2000.0, 900.0, 1000.0);
        let pane = page(1500.0, 1150.0, 1400.0);
        assert!(order(&wide) < order(&pane));
    }
}
