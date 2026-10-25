//! Segments that are one line: routes that share an end and run together
//! from it (\[W12\] §3) are joined into one group of segments until the routes
//! part, so that nudging moves them as one.

use crate::grid::{close, sign};
use crate::segments::Segment;
use crate::{End, Point, Scene};

/// Union-find over segments.
pub(crate) struct Groups(pub(crate) Vec<usize>);

impl Groups {
    /// The root of a segment's group, with every segment on the way pointed straight at it.
    pub(crate) fn find(&mut self, a: usize) -> usize {
        let mut root = a;
        while self.0[root] != root {
            root = self.0[root];
        }
        let mut node = a;
        while self.0[node] != root {
            let next = self.0[node];
            self.0[node] = root;
            node = next;
        }
        root
    }
    /// Put two segments' groups into one.
    fn join(&mut self, a: usize, b: usize) {
        let (a, b) = (self.find(a), self.find(b));
        // The lower index roots the group, so groups do not depend on order.
        let (low, high) = (a.min(b), a.max(b));
        self.0[high] = low;
    }
}

/// Whether two ends are the same end.
fn same_end(a: &End, b: &End) -> bool {
    match (a, b) {
        (
            End::Pin {
                obstacle: o1,
                at: p1,
                leaves: d1,
            },
            End::Pin {
                obstacle: o2,
                at: p2,
                leaves: d2,
            },
        ) => o1 == o2 && d1 == d2 && close(*p1, *p2),
        (End::Free { at: p1 }, End::Free { at: p2 }) => close(*p1, *p2),
        _ => false,
    }
}

/// One route walked from one of its ends: which route, its points, and
/// whether the walk starts at its head.
#[derive(Clone, Copy)]
struct Walked<'r> {
    route: usize,
    points: &'r [Point],
    from_head: bool,
}

/// The segment of a route that runs from one of its points to the next, by
/// the index of its first point.
fn segment_index(segments: &[Segment], route: usize, index: usize) -> Option<usize> {
    segments
        .iter()
        .position(|s| s.route == route && s.index == index)
}

/// Join the segments of routes that share an end and run together from it.
pub(crate) fn join_shared(
    scene: &Scene,
    routes: &[Option<Vec<Point>>],
    segments: &[Segment],
    groups: &mut Groups,
) {
    let n = scene.connectors.len();
    for one in 0..n {
        for other in one + 1..n {
            join_pair(scene, routes, segments, groups, (one, other));
        }
    }
}

/// Join the segments of two routes from each end they share.
fn join_pair(
    scene: &Scene,
    routes: &[Option<Vec<Point>>],
    segments: &[Segment],
    groups: &mut Groups,
    (one, other): (usize, usize),
) {
    let (Some(a), Some(b)) = (&routes[one], &routes[other]) else {
        return;
    };
    let end_of = |route: usize, from_head: bool| {
        let (tail, head) = scene.connectors[route];
        if from_head { head } else { tail }
    };
    for (from_a, from_b) in [(false, false), (false, true), (true, false), (true, true)] {
        if same_end(&end_of(one, from_a), &end_of(other, from_b)) {
            let walked_a = Walked {
                route: one,
                points: a,
                from_head: from_a,
            };
            let walked_b = Walked {
                route: other,
                points: b,
                from_head: from_b,
            };
            join_together(segments, groups, walked_a, walked_b);
        }
    }
}

/// Join the segments two routes run together on from a shared end, until
/// they part.
fn join_together(segments: &[Segment], groups: &mut Groups, a: Walked<'_>, b: Walked<'_>) {
    let walk_a: Vec<usize> = walk(a.points.len(), a.from_head);
    let walk_b: Vec<usize> = walk(b.points.len(), b.from_head);
    for step in 0..walk_a.len().min(walk_b.len()).saturating_sub(1) {
        let (a0, a1) = (a.points[walk_a[step]], a.points[walk_a[step + 1]]);
        let (b0, b1) = (b.points[walk_b[step]], b.points[walk_b[step + 1]]);
        let together = close(a0, b0)
            && sign(a1.x - a0.x) == sign(b1.x - b0.x)
            && sign(a1.y - a0.y) == sign(b1.y - b0.y);
        if !together {
            break;
        }
        let index_a = walk_a[step].min(walk_a[step + 1]);
        let index_b = walk_b[step].min(walk_b[step + 1]);
        let shared = segment_index(segments, a.route, index_a)
            .zip(segment_index(segments, b.route, index_b));
        if let Some((sa, sb)) = shared {
            groups.join(sa, sb);
        }
        if !close(a1, b1) {
            break;
        }
    }
}

/// A route's point indices, from its tail or from its head.
fn walk(len: usize, from_head: bool) -> Vec<usize> {
    if from_head {
        (0..len).rev().collect()
    } else {
        (0..len).collect()
    }
}
