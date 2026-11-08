//! Feasibility of the orthogonal templates inside a candidate's reserved room.

use crate::geometry::{Point, Rect};

/// Remove duplicates and collinear vertices without moving a bend.
pub(super) fn clean(points: Vec<Point>) -> Vec<Point> {
    let mut out: Vec<Point> = Vec::new();
    clean_into(points, &mut out);
    out
}

/// Reuse a candidate buffer while preserving the same normalization order.
pub(super) fn clean_into(points: impl IntoIterator<Item = Point>, out: &mut Vec<Point>) {
    out.clear();
    for point in points {
        if out.last() == Some(&point) {
            continue;
        }
        while out.len() >= 2 && collinear(out[out.len() - 2], out[out.len() - 1], point) {
            out.pop();
        }
        out.push(point);
    }
}

fn collinear(a: Point, b: Point, c: Point) -> bool {
    (a.x == b.x && b.x == c.x) || (a.y == b.y && b.y == c.y)
}

pub(super) fn length(path: &[Point]) -> f64 {
    path.windows(2)
        .map(|p| (p[0].x - p[1].x).abs() + (p[0].y - p[1].y).abs())
        .sum()
}

pub(super) fn crosses_box(path: &[Point], at: Rect) -> bool {
    path.windows(2).any(|p| {
        let (a, b) = (p[0], p[1]);
        if a.x == b.x {
            a.x > at.x
                && a.x < at.x + at.width
                && a.y.min(b.y) < at.y + at.height
                && a.y.max(b.y) > at.y
        } else {
            a.y > at.y
                && a.y < at.y + at.height
                && a.x.min(b.x) < at.x + at.width
                && a.x.max(b.x) > at.x
        }
    })
}

pub(super) fn contains(outer: Rect, inner: Rect) -> bool {
    inner.x >= outer.x
        && inner.y >= outer.y
        && inner.x + inner.width <= outer.x + outer.width
        && inner.y + inner.height <= outer.y + outer.height
}

/// A positive overlap of two collinear strokes, or a proper transverse crossing.
pub(super) fn intersection(a: &[Point], b: &[Point]) -> (bool, bool) {
    a.windows(2)
        .flat_map(|p| b.windows(2).map(move |q| pair_intersection(p, q)))
        .fold((false, false), |(a, b), (c, d)| (a || c, b || d))
}

/// Whether a route meets its own ink away from its bends: it crosses, touches or runs along a
/// stroke of its own that it does not turn from. Such a route closes a loop, and no hop can
/// stand where a line crosses itself, so the loop would read as a junction.
pub(super) fn meets_itself(path: &[Point]) -> bool {
    let strokes: Vec<&[Point]> = path.windows(2).collect();
    strokes.iter().enumerate().any(|(index, stroke)| {
        strokes.iter().skip(index + 2).any(|later| {
            let (along, across) = pair_intersection(stroke, later);
            along || across
        })
    })
}

fn pair_intersection(p: &[Point], q: &[Point]) -> (bool, bool) {
    let ph = p[0].y == p[1].y;
    let qh = q[0].y == q[1].y;
    if ph == qh {
        (parallel_overlap(p, q, ph), false)
    } else {
        (
            false,
            if ph {
                transverse(p, q)
            } else {
                transverse(q, p)
            },
        )
    }
}

fn parallel_overlap(p: &[Point], q: &[Point], horizontal: bool) -> bool {
    let (pa, pb, qa, qb, same) = if horizontal {
        (
            p[0].x,
            p[1].x,
            q[0].x,
            q[1].x,
            (p[0].y - q[0].y).abs() <= 1.0,
        )
    } else {
        (
            p[0].y,
            p[1].y,
            q[0].y,
            q[1].y,
            (p[0].x - q[0].x).abs() <= 1.0,
        )
    };
    same && pa.min(pb).max(qa.min(qb)) < pa.max(pb).min(qa.max(qb))
}

fn transverse(h: &[Point], v: &[Point]) -> bool {
    v[0].x >= h[0].x.min(h[1].x)
        && v[0].x <= h[0].x.max(h[1].x)
        && h[0].y >= v[0].y.min(v[1].y)
        && h[0].y <= v[0].y.max(v[1].y)
}

#[cfg(test)]
mod tests {
    use super::meets_itself;
    use crate::geometry::Point;

    fn route(points: &[(f64, f64)]) -> Vec<Point> {
        points.iter().map(|&(x, y)| Point { x, y }).collect()
    }

    #[test]
    fn a_route_that_loops_back_to_its_own_line_meets_itself() {
        // Down past its target's row, round, and back across its own descent.
        let across = [
            (1033.0, 74.0),
            (1033.0, 1116.0),
            (874.0, 1116.0),
            (874.0, 1006.0),
            (1328.0, 1006.0),
            (1328.0, 986.0),
        ];
        assert!(meets_itself(&route(&across)));
        // Ending on its own line reads as a join.
        let onto = [
            (0.0, 0.0),
            (0.0, 100.0),
            (-50.0, 100.0),
            (-50.0, 50.0),
            (0.0, 50.0),
        ];
        assert!(meets_itself(&route(&onto)));
    }

    #[test]
    fn a_route_that_turns_back_beside_itself_does_not_meet_itself() {
        let hairpin = [
            (100.0, 100.0),
            (100.0, 300.0),
            (140.0, 300.0),
            (140.0, 100.0),
        ];
        assert!(!meets_itself(&route(&hairpin)));
        let step = [(0.0, 0.0), (200.0, 0.0), (200.0, 100.0), (400.0, 100.0)];
        assert!(!meets_itself(&route(&step)));
    }
}
