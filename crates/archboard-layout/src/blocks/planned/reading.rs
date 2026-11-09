//! Compare complete routes by clear approaches, crossings, bends and travel.

use archboard_scene::paint::design::LANDING_ROOM;

use crate::{
    blocks::assembly::PlacedLine,
    geometry::{Point, Rect},
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

/// How a finished drawing ranks: whether its words read where it lands, its long detours, then
/// the work of tracing its lines, with its crowded approaches, and its dead space. Page shape
/// counts only where the page lands too small for its words to read. A large page whose space
/// its cards and lines use costs nothing for its size.
pub(super) type Order = (bool, usize, f64);

/// The scale that a landing must reach for its words to read (the first gate of the reader).
const NEAR_SCALE: f64 = 0.6;
/// A line is a long detour past this much extra travel, and half again its direct way.
const LONG_DETOUR: f64 = 300.0;

fn is_long(line: &PlacedLine) -> bool {
    let (length, direct) = distances(&line.points);
    length > direct * 1.5 && length - direct > LONG_DETOUR
}

fn long_detours(lines: &[PlacedLine]) -> usize {
    lines.iter().filter(|line| is_long(line)).count()
}

/// The lines of a finished drawing that run a long way round, as it was routed.
pub(super) fn long_lines(drawing: &crate::blocks::assembly::Placed) -> Vec<&str> {
    let lines = &as_routed(drawing).edges;
    (lines.iter().filter(|line| is_long(line)))
        .map(|line| line.id.as_str())
        .collect()
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

/// The largest page whose words still read where it lands.
pub(super) const READABLE: (f64, f64) = (LANDING_ROOM.0 / NEAR_SCALE, LANDING_ROOM.1 / NEAR_SCALE);

pub(super) fn order(drawing: &crate::blocks::assembly::Placed) -> Order {
    let routed = &as_routed(drawing).edges;
    let (crowded, cost) = rank(routed);
    (
        drawing.width > READABLE.0 || drawing.height > READABLE.1,
        long_detours(routed),
        f64::from_bits(cost) + crowded as f64 * CROWDED_COST + dead_space(drawing) / DEAD_SPACE,
    )
}

/// How far from every card, line and label a place stands before it is dead space.
const REACH: f64 = 48.0;
/// How much dead space costs as much as one unit of line: the band that a line inks.
pub(super) const DEAD_SPACE: f64 = 2.0 * REACH;
/// How finely dead space is measured.
const GRAIN: f64 = 8.0;

/// A whole count or index of cells: the floor or the ceiling of a page coordinate over the grain.
#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "the floor or ceiling of a finite page coordinate that is not negative, over the grain"
)]
fn cells(value: f64) -> usize {
    value as usize
}

/// A page on a grain of cells, each holding how many cells, side or corner, it stands from the
/// nearest ink.
struct Grain {
    columns: usize,
    rows: usize,
    steps: Vec<u32>,
}

impl Grain {
    fn new(width: f64, height: f64) -> Grain {
        let columns = cells((width / GRAIN).ceil()) + 1;
        let rows = cells((height / GRAIN).ceil()) + 1;
        let far = u32::try_from(columns + rows).unwrap_or(u32::MAX);
        Grain {
            columns,
            rows,
            steps: vec![far; columns * rows],
        }
    }

    /// Ink every cell of the box between two corners.
    fn ink(&mut self, a: Point, b: Point) {
        let cell = |value: f64, count: usize| cells(value.max(0.0) / GRAIN).min(count - 1);
        let (left, right) = (
            cell(a.x.min(b.x), self.columns),
            cell(a.x.max(b.x), self.columns),
        );
        for row in cell(a.y.min(b.y), self.rows)..=cell(a.y.max(b.y), self.rows) {
            let start = row * self.columns;
            self.steps[start + left..=start + right].fill(0);
        }
    }

    /// One sweep over the cells, forward or back, that gives each cell no more than one step
    /// past a neighbour the sweep already passed.
    fn sweep(&mut self, forward: bool) {
        let passed: [(isize, isize); 4] = if forward {
            [(-1, 0), (0, -1), (-1, -1), (1, -1)]
        } else {
            [(1, 0), (0, 1), (1, 1), (-1, 1)]
        };
        let count = self.steps.len();
        for index in 0..count {
            let at = if forward { index } else { count - 1 - index };
            let (row, column) = (at / self.columns, at % self.columns);
            let nearest = (passed.iter())
                .filter_map(|&(dx, dy)| {
                    let x = column
                        .checked_add_signed(dx)
                        .filter(|&x| x < self.columns)?;
                    let y = row.checked_add_signed(dy).filter(|&y| y < self.rows)?;
                    Some(self.steps[y * self.columns + x].saturating_add(1))
                })
                .fold(self.steps[at], u32::min);
            self.steps[at] = nearest;
        }
    }
}

/// The area of a page that stands farther than `REACH` from every card, line and label. A reader
/// pays for it as for the line that would fill it, which inks a band twice that reach wide.
fn dead_space(drawing: &crate::blocks::assembly::Placed) -> f64 {
    let mut grain = Grain::new(drawing.width, drawing.height);
    let corners = |at: Rect| {
        let far = Point {
            x: at.x + at.width,
            y: at.y + at.height,
        };
        (Point { x: at.x, y: at.y }, far)
    };
    let boxes = (drawing.cards.iter().map(|card| card.bx))
        .chain(drawing.edges.iter().filter_map(|line| line.label));
    for (near, far) in boxes.map(corners) {
        grain.ink(near, far);
    }
    for pair in drawing.edges.iter().flat_map(|line| line.points.windows(2)) {
        grain.ink(pair[0], pair[1]);
    }
    // Two sweeps give every cell its fewest steps, side or corner, to the nearest ink.
    grain.sweep(true);
    grain.sweep(false);
    let dead = (grain.steps.iter())
        .filter(|&&steps| f64::from(steps) > REACH / GRAIN)
        .count();
    dead as f64 * GRAIN * GRAIN
}

/// A drawing is worth placing when it costs no more than the first guarded drawing, counting
/// the blank space of its page as `order` does, so a larger page pays for the room it leaves
/// blank and not for its area. A cheaper total must not hide a new long detour on an
/// individual route.
pub(super) fn worth_placing(
    next: &crate::blocks::assembly::Placed,
    first: &crate::blocks::assembly::Placed,
    graph: &crate::graph::Node,
) -> bool {
    let cheaper = order(next).2 <= order(first).2;
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
    !grows_detour && !spreads_fan(next, first, graph) && cheaper
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
    use crate::blocks::assembly::{Placed, PlacedCard};

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
    fn a_page_whose_words_read_ranks_first() {
        // Taller than the old room limit, and its words read where it lands.
        let readable = Placed {
            width: 1000.0,
            height: 1580.0,
            ..fan(Point { x: 400.0, y: 0.0 }, None)
        };
        // Too wide for its words to read where it lands.
        let unreadable = Placed {
            width: LANDING_ROOM.0 / NEAR_SCALE + 100.0,
            height: 1000.0,
            ..readable.clone()
        };
        assert!(order(&readable) < order(&unreadable));
    }

    /// Three pages that land where their words read, each with one line of the same length. A
    /// page twice as wide pays nothing for its area while a card fills it, and pays for the
    /// blank space it leaves when nothing does.
    #[test]
    fn a_readable_page_pays_its_blank_space_not_its_area() {
        let page = |width: f64, cards: Vec<PlacedCard>| Placed {
            width,
            height: 1000.0,
            cards,
            frames: Vec::new(),
            regions: Vec::new(),
            edges: vec![PlacedLine {
                id: "line".into(),
                points: vec![
                    Point { x: 0.0, y: 500.0 },
                    Point {
                        x: 1000.0,
                        y: 500.0,
                    },
                ],
                label: None,
            }],
            titles: Vec::new(),
            routed: None,
        };
        let filler = PlacedCard {
            id: "filler".into(),
            bx: Rect {
                x: 1000.0,
                y: 0.0,
                width: 1000.0,
                height: 1000.0,
            },
            depth: 0,
            header: None,
        };
        let small = page(1000.0, Vec::new());
        let filled = page(2000.0, vec![filler]);
        let blank = page(2000.0, Vec::new());
        assert!(order(&filled) <= order(&small));
        assert!(order(&small) < order(&blank));
    }
}
