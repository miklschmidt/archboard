//! Feasibility of the orthogonal templates inside a candidate's reserved room.

use crate::geometry::{Point, Rect};

/// Remove duplicates and collinear vertices without moving a bend.
pub(super) fn clean(points: Vec<Point>) -> Vec<Point> {
    let mut out: Vec<Point> = Vec::new();
    for point in points {
        if out.last() == Some(&point) {
            continue;
        }
        while out.len() >= 2 && collinear(out[out.len() - 2], out[out.len() - 1], point) {
            out.pop();
        }
        out.push(point);
    }
    out
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
