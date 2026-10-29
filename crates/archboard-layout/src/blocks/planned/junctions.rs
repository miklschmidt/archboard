//! A shared fan can meet only at the ends of its declared shared strokes.

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
    /// Disjoint envelopes cannot share ink, cross, or violate the twelve-point lane gap.
    pub(super) fn apart(self, b: Self) -> bool {
        b.0 - self.2 >= 12.0 || self.0 - b.2 >= 12.0 || b.1 - self.3 >= 12.0 || self.1 - b.3 >= 12.0
    }
}

/// Sharing is a common prefix or suffix, never an accidental reunion in the middle.
pub(super) fn sharing(a: &[Point], b: &[Point], source: bool, target: bool) -> bool {
    let prefix = if source { common_prefix(a, b) } else { 0.0 };
    let suffix = if target {
        common_prefix(
            &a.iter().rev().copied().collect::<Vec<_>>(),
            &b.iter().rev().copied().collect::<Vec<_>>(),
        )
    } else {
        0.0
    };
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

fn common_prefix(a: &[Point], b: &[Point]) -> f64 {
    if a.first() != b.first() || a.is_empty() {
        return 0.0;
    }
    let (mut i, mut j, mut at, mut shared) = (1, 1, a[0], 0.0);
    while i < a.len() && j < b.len() {
        let sign = |d: f64| if d.abs() < 1e-6 { 0.0 } else { d.signum() };
        let dir = |p: Point| (sign(p.x - at.x), sign(p.y - at.y));
        let (dx, dy) = dir(a[i]);
        if dx != 0.0 && dy != 0.0 || dx == 0.0 && dy == 0.0 || (dx, dy) != dir(b[j]) {
            break;
        }
        let distance =
            super::geometry::length(&[at, a[i]]).min(super::geometry::length(&[at, b[j]]));
        shared += distance;
        at = Point {
            x: at.x + dx * distance,
            y: at.y + dy * distance,
        };
        if super::geometry::length(&[at, a[i]]) < 1e-6 {
            i += 1;
        }
        if super::geometry::length(&[at, b[j]]) < 1e-6 {
            j += 1;
        }
    }
    shared
}

pub(super) fn ordered(a: &[Point], b: &[Point], sharing: bool) -> bool {
    let shared: Vec<_> = if sharing {
        a.windows(2)
            .flat_map(|p| b.windows(2).filter_map(move |q| shared_ends(p, q)))
            .flatten()
            .collect()
    } else {
        Vec::new()
    };
    a.windows(2).all(|p| {
        b.windows(2).all(|q| {
            let ph = p[0].y == p[1].y;
            let qh = q[0].y == q[1].y;
            if ph == qh {
                return (sharing || shared_ends(p, q).is_none()) && !near_parallel(p, q, ph);
            }
            let (h, v) = if ph { (p, q) } else { (q, p) };
            let point = Point {
                x: v[0].x,
                y: h[0].y,
            };
            let crosses = within(point.x, h[0].x, h[1].x) && within(point.y, v[0].y, v[1].y);
            !crosses || shared.contains(&point) || clear_crossing(h, v)
        })
    })
}

/// Crossings use straight room on both paths, clear of bends and arrow approaches.
fn clear_crossing(h: &[Point], v: &[Point]) -> bool {
    let room = 16.0;
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
            clear_crossing(h, v)
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
    gap > 0.0
        && ((gap <= 1.01 && a.max(b).min(c.max(d)) > a.min(b).max(c.min(d)))
            || (gap < 12.0 && a.max(b).min(c.max(d)) - a.min(b).max(c.min(d)) > 16.0))
}

#[cfg(test)]
mod tests {
    use super::*;
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
