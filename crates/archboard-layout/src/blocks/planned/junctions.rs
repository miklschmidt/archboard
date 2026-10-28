//! A shared fan can meet only at the ends of its declared shared strokes.

use crate::geometry::Point;

pub(super) fn ordered(a: &[Point], b: &[Point]) -> bool {
    let shared: Vec<_> = a
        .windows(2)
        .flat_map(|p| b.windows(2).filter_map(move |q| shared_ends(p, q)))
        .flatten()
        .collect();
    a.windows(2).all(|p| {
        b.windows(2).all(|q| {
            let ph = p[0].y == p[1].y;
            let qh = q[0].y == q[1].y;
            if ph == qh {
                return !near_parallel(p, q, ph);
            }
            let (h, v) = if ph { (p, q) } else { (q, p) };
            let point = Point {
                x: v[0].x,
                y: h[0].y,
            };
            let crosses = within(point.x, h[0].x, h[1].x) && within(point.y, v[0].y, v[1].y);
            !crosses || shared.contains(&point)
        })
    })
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

fn near_parallel(one: &[Point], other: &[Point], horizontal: bool) -> bool {
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
    gap > 0.0 && gap <= 1.0 && a.min(b).max(c.min(d)) < a.max(b).min(c.max(d))
}
