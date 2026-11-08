//! Close the space that nothing in a routed drawing uses. Every card, wall, word plate and run
//! of a line moves on its own, in whole units, and keeps its order against whatever shares its
//! slab of the page. So a route keeps its bends and crossings, and a gap shrinks to what runs in
//! it at that height, whatever another row needs there.

use crate::{
    blocks::assembly::Placed,
    constants::{APPROACH_STRAIGHT, BEND_RADIUS, CONTAINER_INSET},
    geometry::Axis,
    track::chains::LANE,
};

use super::{junctions::JOIN_ROOM, shape::Shape};

mod sheet;

use sheet::{Kind, Piece, Sheet};

/// The least room between two cards.
const CARD_GAP: f64 = 2.0 * LANE;
/// The room a line needs off a card it ends on: its arrow and the bend behind it.
const APPROACH: f64 = APPROACH_STRAIGHT + BEND_RADIUS + 1.0;
/// Cards that stood on one station stay on one while parting would bring them less than this.
const STAY_ALIGNED: f64 = 40.0;
/// How near a card's corner a straight line to a neighbour can slide along its wall.
const SLIDE_MARGIN: f64 = 24.0;
/// Two pieces nearer than this touch, as a line's end touches its wall.
const TOUCH: f64 = 0.1;
/// How many passes over both axes a drawing takes. A later pass finds what the other axis freed.
const PASSES: usize = 2;
/// How many times the lines that a squeeze stretched take their length back.
const SHORTEN_PASSES: usize = 3;

/// One rule between two movers: the second's shift is at least the first's plus this much.
struct Rule {
    first: usize,
    second: usize,
    least: f64,
}

/// Sets of movers that travel together.
struct Bodies(Vec<usize>);

impl Bodies {
    fn of(&mut self, mut at: usize) -> usize {
        while self.0[at] != at {
            self.0[at] = self.0[self.0[at]];
            at = self.0[at];
        }
        at
    }

    fn join(&mut self, a: usize, b: usize) {
        let (a, b) = (self.of(a), self.of(b));
        self.0[a.max(b)] = a.min(b);
    }
}

/// How much room the pair must keep at least, the first at the low end.
fn room(first: Kind, second: Kind, reach: f64) -> f64 {
    use Kind::{Card, Door, Far, Line, Near, Tab};
    match (first, second) {
        (Near | Tab, Card | Door) | (Card | Door, Far) => CONTAINER_INSET,
        (Card | Door | Far, Card | Door | Near) | (Far, Far) => CARD_GAP,
        (Card | Door, Line) | (Line, Card | Door) => reach.max(APPROACH),
        _ => reach,
    }
}

/// Whether a run ends on a top or bottom wall of a card, as this axis sees it.
fn ends_on(run: &Piece, card: &Piece) -> bool {
    run.kind == Kind::Line
        && matches!(card.kind, Kind::Card | Kind::Door)
        && run.low > card.low + TOUCH
        && run.low < card.high - TOUCH
}

/// Whether two pieces share a slab, with this much room between their slabs at most.
fn share_slab(one: &Piece, two: &Piece, reach: f64) -> bool {
    one.from - reach < two.to && two.from - reach < one.to
}

/// A run that ends on a card holds that card's whole slab, so that the runs on its opposite
/// walls stay a lane apart.
fn reach_through(pieces: &mut [Piece], reach: f64) {
    let cards: Vec<Piece> = pieces
        .iter()
        .copied()
        .filter(|piece| matches!(piece.kind, Kind::Card | Kind::Door))
        .collect();
    for run in pieces.iter_mut() {
        for card in &cards {
            if ends_on(run, card) && share_slab(run, card, reach) {
                run.from = run.from.min(card.from);
                run.to = run.to.max(card.to);
            }
        }
    }
}

/// The rules between a drawing's pieces, and which movers travel together.
struct Found {
    rules: Vec<Rule>,
    bodies: Bodies,
    /// Whether a run already moves with a card.
    held: Vec<bool>,
    reach: f64,
}

impl Found {
    fn push(&mut self, first: &Piece, second: &Piece, least: f64) {
        self.rules.push(Rule {
            first: first.mover,
            second: second.mover,
            least,
        });
    }

    /// The second keeps its order past the first, with its room or the room it has. A line
    /// joining another before a card keeps the room of a junction from that card.
    fn keep(&mut self, first: &Piece, second: &Piece) {
        let gap = second.low - first.high;
        let mut least = room(first.kind, second.kind, self.reach);
        if first.joins == Some(second.mover) || second.joins == Some(first.mover) {
            least = least.max(JOIN_ROOM);
        }
        self.push(first, second, least.min(gap) - gap);
    }

    /// A run stays on a card's wall, clear of its corners.
    fn slide(&mut self, card: &Piece, run: &Piece) {
        let (near, far) = (run.low - card.low, card.high - run.low);
        let margin = SLIDE_MARGIN.min(near).min(far);
        self.push(card, run, margin - near);
        self.push(run, card, margin - far);
    }

    /// Two pieces of one slab keep their order. A run moves with the first card it ends on,
    /// and it slides on the wall of the second. What overlaps or touches travels together.
    fn pair(&mut self, one: &Piece, two: &Piece) {
        if two.low - one.high > TOUCH {
            self.keep(one, two);
        } else if one.low - two.high > TOUCH {
            self.keep(two, one);
        } else if ends_on(two, one) && self.held[two.mover] {
            self.slide(one, two);
        } else {
            self.held[two.mover] = true;
            self.bodies.join(one.mover, two.mover);
        }
    }
}

/// The rules that keep the order of a drawing's pieces, and which movers travel together.
fn rules_of(pieces: &[Piece], movers: usize, reach: f64) -> (Vec<Rule>, Vec<usize>) {
    let mut found = Found {
        rules: Vec::new(),
        bodies: Bodies((0..movers).collect()),
        held: vec![false; movers],
        reach,
    };
    for (at, one) in pieces.iter().enumerate() {
        for two in &pieces[at + 1..] {
            if one.mover != two.mover && share_slab(one, two, reach) {
                found.pair(one, two);
            }
        }
    }
    let bodies: Vec<usize> = (0..movers).map(|mover| found.bodies.of(mover)).collect();
    found.rules.retain_mut(|rule| {
        rule.first = bodies[rule.first];
        rule.second = bodies[rule.second];
        rule.first != rule.second
    });
    (found.rules, bodies)
}

/// The least whole shift of every body that keeps every rule, from some lower bounds.
fn solve(rules: &[Rule], shifts: &mut [f64]) {
    let mut moved = true;
    while moved {
        moved = false;
        for rule in rules {
            let least = (shifts[rule.first] + rule.least).ceil();
            if least > shifts[rule.second] {
                shifts[rule.second] = least;
                moved = true;
            }
        }
    }
}

/// The cards that stand on one station of an axis, as places in the drawing's cards.
fn stations(drawing: &Placed, axis: Axis) -> Vec<Vec<usize>> {
    let mut at: Vec<(f64, usize)> = (drawing.cards.iter().enumerate())
        .map(|(card, placed)| (axis.span(placed.bx).0, card))
        .collect();
    at.sort_by(|a, b| a.0.total_cmp(&b.0));
    at.chunk_by(|a, b| a.0 == b.0)
        .map(|station| station.iter().map(|&(_, card)| card).collect())
        .collect()
}

/// Bring the cards of each station back together while parting them gains little. The
/// stations come from low to high, so a card that moves carries the stations beyond it.
fn keep_aligned(
    sheet: &Sheet,
    stations: &[Vec<usize>],
    rules: &[Rule],
    bodies: &[usize],
    shifts: &mut [f64],
) {
    for station in stations {
        let mut standing: Vec<(f64, usize)> = station
            .iter()
            .map(|&card| (sheet.pieces[card].low + shifts[bodies[card]], bodies[card]))
            .collect();
        standing.sort_by(|a, b| a.0.total_cmp(&b.0));
        if gather(&standing, shifts) {
            solve(rules, shifts);
        }
    }
}

/// Bring the cards of a station that stand near each other to the last of them, and say
/// whether any moved. It counts back from the last card, so the rows it leaves stand clearly
/// apart and none misses another by a little.
fn gather(mut standing: &[(f64, usize)], shifts: &mut [f64]) -> bool {
    let mut moved = false;
    while let Some(&(to, _)) = standing.last() {
        let start = standing.partition_point(|&(at, _)| to - at > STAY_ALIGNED);
        let (rest, near) = standing.split_at(start);
        for &(at, body) in near {
            shifts[body] += to - at;
            moved |= at != to;
        }
        standing = rest;
    }
    moved
}

/// A line that the squeeze stretched takes it back: a door or a bend that stands short of
/// more of its runs than it stands past moves on, as far as what stands beyond it allows.
fn shorten(sheet: &Sheet, rules: &[Rule], bodies: &[usize], shifts: &mut [f64]) {
    let mut place = vec![0.0; sheet.movers];
    let mut placed = vec![false; sheet.movers];
    for piece in &sheet.pieces {
        place[piece.mover] = piece.low;
        placed[bodies[piece.mover]] |= !matches!(piece.kind, Kind::Door | Kind::Line | Kind::Words);
    }
    let runs: Vec<(usize, usize, usize, usize)> = sheet
        .joined()
        .map(|(a, b)| (bodies[a], a, bodies[b], b))
        .filter(|run| run.0 != run.2)
        .collect();
    let mut order: Vec<usize> = (0..sheet.movers)
        .filter(|&mover| !placed[mover] && bodies[mover] == mover)
        .collect();
    let at = |body: usize, shifts: &[f64]| place[body] + shifts[body];
    order.sort_by(|&a, &b| at(b, shifts).total_cmp(&at(a, shifts)));
    for _ in 0..SHORTEN_PASSES {
        let before = shifts.to_vec();
        for &body in &order {
            shifts[body] += shortening(body, &runs, &place, rules, shifts);
        }
        if before == shifts {
            break;
        }
    }
}

/// How far a body moves on: nowhere unless it stands short of more runs than it stands past.
fn shortening(
    body: usize,
    runs: &[(usize, usize, usize, usize)],
    place: &[f64],
    rules: &[Rule],
    shifts: &[f64],
) -> f64 {
    let ends: Vec<f64> = (runs.iter())
        .filter_map(|&(a, near, b, far)| {
            let length = place[far] + shifts[b] - (place[near] + shifts[a]);
            (a == body)
                .then_some(length)
                .or_else(|| (b == body).then_some(-length))
        })
        .collect();
    let beyond = || ends.iter().copied().filter(|&end| end > 0.0);
    if beyond().count() <= ends.iter().filter(|&&end| end < 0.0).count() {
        return 0.0;
    }
    let free = (rules.iter())
        .filter(|rule| rule.first == body)
        .map(|rule| shifts[rule.second] - rule.least - shifts[body])
        .fold(-shifts[body], f64::min);
    beyond().fold(free, f64::min).max(0.0).floor()
}

/// Move everything on one axis as near the start of the page as its rules allow.
fn squeeze(drawing: &mut Placed, axis: Axis, stations: &[Vec<usize>], reach: f64) -> bool {
    let mut sheet = Sheet::of(drawing, axis);
    reach_through(&mut sheet.pieces, reach);
    let (rules, bodies) = rules_of(&sheet.pieces, sheet.movers, reach);
    let start = sheet.pieces.iter().map(|piece| piece.low);
    let start = start.fold(reach, f64::min);
    let mut shifts = vec![f64::NEG_INFINITY; sheet.movers];
    for piece in &sheet.pieces {
        let body = bodies[piece.mover];
        shifts[body] = shifts[body].max((start - piece.low).ceil());
    }
    solve(&rules, &mut shifts);
    keep_aligned(&sheet, stations, &rules, &bodies, &mut shifts);
    shorten(&sheet, &rules, &bodies, &mut shifts);
    let shifts: Vec<f64> = bodies.iter().map(|&body| shifts[body]).collect();
    let extent = *axis.extent(drawing);
    let room = (extent - sheet.end(&vec![0.0; sheet.movers])).min(reach);
    *axis.extent(drawing) = (sheet.end(&shifts) + room).ceil();
    sheet.apply_boxes(drawing, axis, &shifts);
    sheet.apply_lines(drawing, axis, &shifts);
    shifts.iter().any(|&shift| shift != 0.0) || *axis.extent(drawing) != extent
}

/// A routed drawing with the space that nothing uses taken out, if any was. Every run keeps
/// a clearance of `clear` on each side. The caller must place the labels again and apply the
/// complete geometry guard.
pub(super) fn drawing(shape: &Shape, clear: f64) -> Option<Placed> {
    let mut drawing = shape.routed();
    let reach = 2.0 * clear;
    let columns = stations(&drawing, Axis::X);
    let rows = stations(&drawing, Axis::Y);
    let mut moved = false;
    for _ in 0..PASSES {
        moved |= squeeze(&mut drawing, Axis::X, &columns, reach);
        moved |= squeeze(&mut drawing, Axis::Y, &rows, reach);
    }
    moved.then_some(drawing)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        blocks::assembly::{PlacedCard, PlacedLine},
        geometry::{Point, Rect},
    };

    const CARD: Point = Point { x: 200.0, y: 100.0 };

    fn card(id: &str, x: f64, y: f64) -> PlacedCard {
        PlacedCard {
            id: id.into(),
            bx: Rect {
                x,
                y,
                width: CARD.x,
                height: CARD.y,
            },
            depth: 1,
            header: None,
        }
    }

    /// A run that climbs the gap of the first row and leaves it above and below.
    fn lane(id: &str, x: f64) -> PlacedLine {
        let (start, end) = (Point { x, y: 0.0 }, Point { x, y: 150.0 });
        PlacedLine {
            id: id.into(),
            points: vec![start, end],
            label: None,
        }
    }

    #[test]
    fn a_busy_row_leaves_the_gap_of_a_quiet_row_alone() {
        let left = 100.0;
        let right = left + CARD.x + 200.0;
        let cards = vec![
            card("a", left, 20.0),
            card("b", right, 20.0),
            card("c", left, 300.0),
            card("d", right, 300.0),
        ];
        let lanes = (0..3).map(|lane_at| {
            let at = f64::from(lane_at);
            lane(&format!("lane{lane_at}"), left + CARD.x + 60.0 + at * 40.0)
        });
        let shape = Shape::new(Placed {
            width: 1000.0,
            height: 600.0,
            cards,
            frames: Vec::new(),
            regions: Vec::new(),
            edges: lanes.collect(),
            titles: Vec::new(),
            routed: None,
        });
        let drawn = drawing(&shape, 8.0).expect("a gap to close");
        let gap = |one: usize, two: usize| {
            let (first, second) = (drawn.cards[one].bx, drawn.cards[two].bx);
            second.x - first.x - first.width
        };
        assert_eq!(gap(2, 3), CARD_GAP);
        assert!(gap(0, 1) >= 3.0 * 2.0 * 8.0);
    }

    // Canonical architecture: a line that joined another just above the card
    // they enter came out of contraction with too little room for the junction,
    // so the guard refused every tight drawing and the loose one stood.
    #[test]
    fn a_line_joining_another_before_their_card_keeps_a_junctions_room() {
        let line = |id: &str, points: &[(f64, f64)]| PlacedLine {
            id: id.into(),
            points: points.iter().map(|&(x, y)| Point { x, y }).collect(),
            label: None,
        };
        let shape = Shape::new(Placed {
            width: 1000.0,
            height: 1000.0,
            cards: vec![card("source", 300.0, 20.0), card("target", 300.0, 500.0)],
            frames: Vec::new(),
            regions: Vec::new(),
            edges: vec![
                line("straight", &[(400.0, 120.0), (400.0, 500.0)]),
                line("joining", &[(200.0, 300.0), (400.0, 300.0), (400.0, 500.0)]),
            ],
            titles: Vec::new(),
            routed: None,
        });
        let drawn = drawing(&shape, 8.0).expect("room to take out");
        let join = drawn.edges[1].points[1].y;
        assert!(drawn.cards[1].bx.y - join >= JOIN_ROOM);
        assert!(drawn.cards[1].bx.y < 500.0);
    }

    #[test]
    fn branches_that_join_from_opposite_sides_keep_a_junctions_room() {
        let line = |id: &str, from: f64| PlacedLine {
            id: id.into(),
            points: vec![
                Point { x: from, y: 100.0 },
                Point { x: from, y: 300.0 },
                Point { x: 400.0, y: 300.0 },
                Point { x: 400.0, y: 500.0 },
            ],
            label: None,
        };
        let shape = Shape::new(Placed {
            width: 1000.0,
            height: 1000.0,
            cards: vec![
                card("left", 0.0, 0.0),
                card("right", 600.0, 0.0),
                card("target", 300.0, 500.0),
            ],
            frames: Vec::new(),
            regions: Vec::new(),
            edges: vec![line("left", 100.0), line("right", 700.0)],
            titles: Vec::new(),
            routed: None,
        });
        let drawn = drawing(&shape, 8.0).expect("room to take out");
        assert!(super::super::junctions::readable(
            &drawn.edges[0].points,
            &drawn.edges[1].points,
            true,
        ));
        assert!(drawn.cards[2].bx.y < 500.0);
    }

    #[test]
    fn coincident_whole_routes_need_no_junction_room() {
        let line = |id: &str| PlacedLine {
            id: id.into(),
            points: vec![
                Point { x: 100.0, y: 100.0 },
                Point { x: 100.0, y: 300.0 },
                Point { x: 400.0, y: 300.0 },
                Point { x: 400.0, y: 500.0 },
            ],
            label: None,
        };
        let shape = Shape::new(Placed {
            width: 1000.0,
            height: 1000.0,
            cards: vec![card("source", 0.0, 0.0), card("target", 300.0, 500.0)],
            frames: Vec::new(),
            regions: Vec::new(),
            edges: vec![line("one"), line("two")],
            titles: Vec::new(),
            routed: None,
        });
        let drawn = drawing(&shape, 8.0).expect("room to take out");
        let points = &drawn.edges[0].points;
        assert!(points[3].y - points[2].y < JOIN_ROOM);
    }

    #[test]
    fn alignment_cannot_chain_small_gaps_into_a_large_cost() {
        let mut cards = Vec::new();
        for row in 0..3 {
            let y = f64::from(row) * 300.0;
            let mut left = card(&format!("left{row}"), 0.0, y);
            left.bx.width += f64::from(row) * 35.0;
            cards.extend([left, card(&format!("right{row}"), 600.0, y)]);
        }
        let shape = Shape::new(Placed {
            width: 1000.0,
            height: 1000.0,
            cards,
            frames: Vec::new(),
            regions: Vec::new(),
            edges: Vec::new(),
            titles: Vec::new(),
            routed: None,
        });
        let drawn = drawing(&shape, 8.0).expect("room between the cards");
        for row in drawn.cards.as_chunks::<2>().0 {
            let gap = row[1].bx.x - row[0].bx.x - row[0].bx.width;
            assert!(gap <= CARD_GAP + STAY_ALIGNED);
        }
    }
}
