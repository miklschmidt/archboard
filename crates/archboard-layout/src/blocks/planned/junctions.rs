//! A shared fan can meet only at the ends of its declared shared strokes.

use crate::constants::{APPROACH_STRAIGHT, BEND_RADIUS};
use crate::geometry::Point;

#[derive(Clone, Copy)]
pub(super) struct Envelope(f64, f64, f64, f64);
impl Envelope {
    pub(super) fn new(path: &[Point]) -> Self {
        path.iter().fold(
            Self(
                f64::INFINITY,
                f64::INFINITY,
                f64::NEG_INFINITY,
                f64::NEG_INFINITY,
            ),
            |a, p| Self(a.0.min(p.x), a.1.min(p.y), a.2.max(p.x), a.3.max(p.y)),
        )
    }
    fn segment(a: Point, b: Point) -> Self {
        Self(a.x.min(b.x), a.y.min(b.y), a.x.max(b.x), a.y.max(b.y))
    }
    /// Disjoint envelopes cannot share ink, cross, or violate the twelve-point lane gap.
    pub(super) fn apart(self, b: Self) -> bool {
        self.apart_by(b, 0.0)
    }
    /// `apart` for two lines whose ink reaches `spread` further between them than a lone
    /// line's: the sum of their halves.
    pub(super) fn apart_by(self, b: Self, spread: f64) -> bool {
        let gap = 12.0 + spread;
        b.0 - self.2 >= gap || self.0 - b.2 >= gap || b.1 - self.3 >= gap || self.1 - b.3 >= gap
    }
}

/// Sharing is a common prefix or suffix, never an accidental reunion in the middle.
pub(super) fn sharing(a: &[Point], b: &[Point], source: bool, target: bool) -> bool {
    let prefix = if source { common_prefix(a, b) } else { 0.0 };
    let suffix = if target { common_suffix(a, b) } else { 0.0 };
    shared_only_at_ends(a, b, prefix, suffix)
}

fn shared_only_at_ends(a: &[Point], b: &[Point], prefix: f64, suffix: f64) -> bool {
    let total = super::geometry::length(a);
    let mut before = 0.0;
    for p in a.windows(2) {
        for q in b.windows(2) {
            if let Some([low, high]) = shared_ends(p, q) {
                let start = before
                    + super::geometry::length(&[p[0], low])
                        .min(super::geometry::length(&[p[0], high]));
                let end = start + super::geometry::length(&[low, high]);
                if end > prefix + 1e-6 && start < total - suffix - 1e-6 {
                    return false;
                }
            }
        }
        before += super::geometry::length(p);
    }
    true
}

/// Direction of a step from `at` to `to`: unit orthogonal sign, or zero along an axis.
fn step_dir(at: Point, to: Point) -> (f64, f64) {
    let sign = |d: f64| if d.abs() < 1e-6 { 0.0 } else { d.signum() };
    (sign(to.x - at.x), sign(to.y - at.y))
}

fn manhattan(a: Point, b: Point) -> f64 {
    (a.x - b.x).abs() + (a.y - b.y).abs()
}

/// The length of ink two routes share from the same endpoint, stepping forward or backward.
fn common_end(a: &[Point], b: &[Point], reverse: bool) -> f64 {
    let at_index = |s: &[Point], idx: usize| if reverse { s[s.len() - 1 - idx] } else { s[idx] };
    if a.is_empty() || b.is_empty() || at_index(a, 0) != at_index(b, 0) {
        return 0.0;
    }
    let (mut i, mut j, mut at, mut shared) = (1, 1, at_index(a, 0), 0.0);
    while i < a.len() && j < b.len() {
        let (pa, pb) = (at_index(a, i), at_index(b, j));
        let (dx, dy) = step_dir(at, pa);
        if (dx != 0.0) == (dy != 0.0) || (dx, dy) != step_dir(at, pb) {
            break;
        }
        let distance = manhattan(at, pa).min(manhattan(at, pb));
        shared += distance;
        at = Point {
            x: at.x + dx * distance,
            y: at.y + dy * distance,
        };
        if manhattan(at, pa) < 1e-6 {
            i += 1;
        }
        if manhattan(at, pb) < 1e-6 {
            j += 1;
        }
    }
    shared
}

/// The length of ink two routes share on their way from the same endpoint.
pub(super) fn common_prefix(a: &[Point], b: &[Point]) -> f64 {
    common_end(a, b, false)
}

/// The length of ink two routes share on their way to the same endpoint.
pub(super) fn common_suffix(a: &[Point], b: &[Point]) -> f64 {
    common_end(a, b, true)
}

/// How far from an arrowhead on the box at its shared end a fan joins or parts at the
/// nearest: the arrow and the bend behind it, then a bend and as long a straight again.
pub(super) const JOIN_ROOM: f64 = APPROACH_STRAIGHT + 3.0 * BEND_RADIUS;

/// A fan joins or parts on a visible run beside an arrowhead at its shared end, so its
/// junction never sits beside that arrowhead, whichever way the lines run. A target fan
/// always ends on arrowheads. A source fan starts on one when a line of it runs both
/// ways, so `start` says so. Where one branch runs wholly along the other, they never join.
pub(super) fn readable(a: &[Point], b: &[Point], start: bool, target: bool) -> bool {
    let room = JOIN_ROOM.min(super::geometry::length(a).min(super::geometry::length(b)));
    let clear = |joined: f64| joined == 0.0 || joined >= room - 1e-6;
    (!start || clear(common_prefix(a, b))) && (!target || clear(common_suffix(a, b)))
}

/// One straight piece of a route, how far its ink reaches to either side of it, and its envelope.
#[derive(Clone, Copy)]
pub(super) struct Piece {
    ends: [Point; 2],
    ink: f64,
    envelope: Envelope,
}

impl Piece {
    /// How far its ink reaches to either side of it.
    pub(super) fn ink(self) -> f64 {
        self.ink
    }

    /// Its two ends.
    pub(super) fn ends(self) -> [Point; 2] {
        self.ends
    }
}

fn make_piece(ends: [Point; 2], ink: f64) -> Piece {
    Piece {
        ends,
        ink,
        envelope: Envelope::segment(ends[0], ends[1]),
    }
}

fn toward(from: Point, to: Point, by: f64) -> Point {
    let length = (to.x - from.x).abs() + (to.y - from.y).abs();
    Point {
        x: from.x + (to.x - from.x) * by / length,
        y: from.y + (to.y - from.y) * by / length,
    }
}

/// Fill `out` with the straight pieces of a route, each with its ink (`pieces`), reusing `out`'s
/// allocation.
pub(super) fn pieces_into(points: &[Point], (half, reach): (f64, f64), out: &mut Vec<Piece>) {
    out.clear();
    let runs = points.len().saturating_sub(1);
    if runs == 0 {
        return;
    }
    if reach <= half {
        out.extend(points.windows(2).map(|p| make_piece([p[0], p[1]], reach)));
        return;
    }
    let [first_spreads, last_spreads] = crate::constants::fans_at_bend(points, (half, reach));
    let apron = crate::constants::apron(half, reach);
    out.reserve(runs + 2);
    for run in 0..runs {
        let (from, to) = (points[run], points[run + 1]);
        let (first, last) = (run == 0, run + 1 == runs);
        if runs == 1 || (first && first_spreads) || (last && last_spreads) {
            out.push(make_piece([from, to], reach));
        } else if first {
            let cut = toward(from, to, apron);
            out.push(make_piece([from, cut], reach));
            out.push(make_piece([cut, to], half));
        } else if last {
            let cut = toward(to, from, apron);
            out.push(make_piece([from, cut], half));
            out.push(make_piece([cut, to], reach));
        } else {
            out.push(make_piece([from, to], half));
        }
    }
}

/// The straight pieces of a route, each with its ink: a cable's fan (`reach`) on the part of its
/// first and last runs where its strands stand a lane apart, the apron at each card or the whole
/// run where it fans out whole (`constants::fans_at_bend`), and its body (`half`) elsewhere. A lone
/// line has no ink past its own.
pub(super) fn pieces(points: &[Point], ink: (f64, f64)) -> Vec<Piece> {
    let mut out = Vec::with_capacity(points.len().saturating_sub(1) + 2);
    pieces_into(points, ink, &mut out);
    out
}

/// Whether two routes, inked as `pieces` gives them, cross only clear of their bends and run
/// nowhere close beside each other.
pub(super) fn ordered(a: &[Point], b: &[Point], (sharing, inks): (bool, [(f64, f64); 2])) -> bool {
    let theirs = pieces(b, inks[1]);
    ordered_pieces(&pieces(a, inks[0]), (Envelope::new(b), &theirs), sharing)
}

/// `ordered` for two routes already cut into inked pieces, the second with its envelope.
pub(super) fn ordered_pieces(
    ours: &[Piece],
    (around, theirs): (Envelope, &[Piece]),
    sharing: bool,
) -> bool {
    let most = theirs.iter().map(|piece| piece.ink).fold(0.0, f64::max);
    // Runs twelve or more apart neither cross, share ink nor run close beside each other, so
    // only the runs of one route that come near the other route are compared.
    let near = || {
        ours.iter()
            .filter(move |piece| !piece.envelope.apart_by(around, piece.ink + most))
    };
    let beside = move |one: &Piece| {
        let (at, ink) = (one.envelope, one.ink);
        theirs
            .iter()
            .filter(move |other| !other.envelope.apart_by(at, ink + other.ink))
            .map(move |other| (ink + other.ink, &other.ends[..]))
    };
    let shared: Vec<_> = if sharing {
        near()
            .flat_map(|one| beside(one).filter_map(move |(_, q)| shared_ends(&one.ends, q)))
            .flatten()
            .collect()
    } else {
        Vec::new()
    };
    near().all(|one| {
        let p = &one.ends[..];
        beside(one).all(|(spread, q)| {
            let ph = p[0].y == p[1].y;
            let qh = q[0].y == q[1].y;
            if ph == qh {
                return (sharing || shared_ends(p, q).is_none())
                    && !near_parallel(p, q, (ph, spread));
            }
            let (h, v) = if ph { (p, q) } else { (q, p) };
            let point = Point {
                x: v[0].x,
                y: h[0].y,
            };
            let crosses = within(point.x, h[0].x, h[1].x) && within(point.y, v[0].y, v[1].y);
            !crosses || shared.contains(&point) || clear_crossing(h, v, spread)
        })
    })
}

/// Crossings use straight room on both paths, clear of bends and arrow approaches, and of the
/// strands of a cable, which reach `spread` further together. Contraction stands a crossing
/// exactly that far from a bend, so floating noise must not refuse it.
fn clear_crossing(h: &[Point], v: &[Point], spread: f64) -> bool {
    let room = 16.0 + spread - 1e-6;
    v[0].x >= h[0].x.min(h[1].x) + room
        && v[0].x <= h[0].x.max(h[1].x) - room
        && h[0].y >= v[0].y.min(v[1].y) + room
        && h[0].y <= v[0].y.max(v[1].y) - room
}

pub(super) fn crossings(a: &[Point], b: &[Point]) -> usize {
    a.windows(2)
        .flat_map(|p| b.windows(2).map(move |q| (p, q)))
        .filter(|(p, q)| {
            if (p[0].y == p[1].y) == (q[0].y == q[1].y) {
                return false;
            }
            let (h, v) = if p[0].y == p[1].y { (p, q) } else { (q, p) };
            clear_crossing(h, v, 0.0)
        })
        .count()
}

fn within(at: f64, a: f64, b: f64) -> bool {
    at >= a.min(b) && at <= a.max(b)
}

fn shared_ends(one: &[Point], other: &[Point]) -> Option<[Point; 2]> {
    let horizontal = one[0].y == one[1].y;
    if horizontal != (other[0].y == other[1].y) {
        return None;
    }
    let (a, b, c, d, same) = if horizontal {
        (
            one[0].x,
            one[1].x,
            other[0].x,
            other[1].x,
            one[0].y == other[0].y,
        )
    } else {
        (
            one[0].y,
            one[1].y,
            other[0].y,
            other[1].y,
            one[0].x == other[0].x,
        )
    };
    let (low, high) = (a.min(b).max(c.min(d)), a.max(b).min(c.max(d)));
    (same && low < high).then(|| {
        [low, high].map(|at| {
            if horizontal {
                Point { x: at, y: one[0].y }
            } else {
                Point { x: one[0].x, y: at }
            }
        })
    })
}

fn near_parallel(one: &[Point], other: &[Point], (horizontal, spread): (bool, f64)) -> bool {
    let (a, b, c, d, gap) = if horizontal {
        (
            one[0].x,
            one[1].x,
            other[0].x,
            other[1].x,
            (one[0].y - other[0].y).abs(),
        )
    } else {
        (
            one[0].y,
            one[1].y,
            other[0].y,
            other[1].y,
            (one[0].x - other[0].x).abs(),
        )
    };
    gap > 0.0
        && ((gap <= spread + 1.01 && a.max(b).min(c.max(d)) > a.min(b).max(c.min(d)))
            || (gap < 12.0 + spread && a.max(b).min(c.max(d)) - a.min(b).max(c.min(d)) > 16.0))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn path(points: &[(f64, f64)]) -> Vec<Point> {
        points.iter().map(|&(x, y)| Point { x, y }).collect()
    }

    /// Two runs fourteen apart read as two lone lines, but a cable's strands reach between them.
    #[test]
    fn a_cable_keeps_its_strands_a_lane_gap_from_a_line_beside_it() {
        let one = path(&[(0.0, 0.0), (200.0, 0.0)]);
        let other = path(&[(0.0, 14.0), (200.0, 14.0)]);
        // A single run is a cable's first and last at once, so its fan reaches between them.
        let wide = [(4.0, 8.0), (0.0, 0.0)];
        assert!(ordered(&one, &other, (false, [(0.0, 0.0); 2])));
        assert!(!ordered(&one, &other, (false, wide)));
    }

    #[test]
    fn cables_cannot_overdraw_strands_on_a_short_run() {
        let one = path(&[(0.0, 0.0), (200.0, 0.0)]);
        let other = path(&[(188.0, 8.0), (300.0, 8.0)]);
        let wide = [(4.0, 8.0), (0.0, 0.0)];
        assert!(ordered(&one, &other, (false, [(0.0, 0.0); 2])));
        assert!(!ordered(&one, &other, (false, wide)));
    }

    /// The owner's knot on the card `renderer`: callers from above and below met
    /// on one column, and only the arrow approach turned into the card.
    #[test]
    fn branches_of_a_target_fan_join_a_visible_run_before_the_box() {
        let above = path(&[
            (2201.0, 74.82),
            (2201.0, 165.6),
            (875.29, 165.6),
            (875.29, 301.6),
            (855.27, 301.6),
        ]);
        let below = path(&[
            (187.88, 1038.71),
            (875.29, 1038.71),
            (875.29, 301.6),
            (855.27, 301.6),
        ]);
        let beside = path(&[
            (2245.88, 281.58),
            (2245.88, 261.56),
            (875.29, 261.56),
            (875.29, 301.6),
            (855.27, 301.6),
        ]);
        assert!(!readable(&above, &below, false, true));
        assert!(readable(&above, &beside, false, true));
        // Branches that meet from both sides join well before the box.
        let far = |from: f64| path(&[(915.29, from), (915.29, 301.6), (855.27, 301.6)]);
        assert!(readable(&far(165.6), &far(1038.71), false, true));
        // Parallel lines between two near cards share their whole short run and never join.
        let short = path(&[(150.0, 92.0), (150.0, 116.0)]);
        assert!(readable(&short, &short, true, true));
    }

    /// The owner's Architecture drawing: a two-way line leaves its card with four
    /// others and draws its back arrowhead where they share their first stretch. A
    /// source fan without such an arrowhead parts where it likes.
    #[test]
    fn branches_of_a_source_fan_part_on_a_visible_run_after_the_box() {
        let down = path(&[(1177.0, 584.22), (1177.0, 948.81)]);
        let right = |turn: f64| {
            path(&[
                (1177.0, 584.22),
                (1177.0, turn),
                (1314.0, turn),
                (1314.0, 961.79),
            ])
        };
        assert!(!readable(&right(604.24), &down, true, false));
        assert!(readable(&right(640.0), &down, true, false));
        assert!(readable(&right(604.24), &down, false, false));
    }

    #[test]
    fn a_diagonal_or_zero_length_piece_cannot_stall_shared_prefix_detection() {
        let diagonal = [Point { x: 0.0, y: 0.0 }, Point { x: 10.0, y: 10.0 }];
        assert_eq!(common_prefix(&diagonal, &diagonal), 0.0);
        let repeated = [
            Point { x: 0.0, y: 0.0 },
            Point { x: 0.0, y: 0.0 },
            Point { x: 10.0, y: 0.0 },
        ];
        assert_eq!(common_prefix(&repeated, &repeated), 0.0);
    }
}
