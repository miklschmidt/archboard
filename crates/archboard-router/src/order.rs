//! Which side of another route a route runs on where the two share a line.
//! [W12] §4 orders the routes of a shared path by where they part: walked
//! along the path, a route that parts to the left of the other runs on its
//! left the whole way, so the two never cross on the shared stretch. A pair
//! is walked forward and backward from the segment where they meet; where
//! the two ends disagree a crossing cannot be avoided, and the forward end
//! decides. How sure the order is goes with it, so that a caller ordering
//! many routes on one line can keep the surest orders where the pairs
//! contradict each other.

use crate::Point;
use crate::grid::{SAME, sign};

/// A route's points, read from its tail or from its head.
#[derive(Clone, Copy)]
struct View<'a> {
    points: &'a [Point],
    reversed: bool,
}

impl View<'_> {
    fn len(&self) -> usize {
        self.points.len()
    }

    fn at(&self, index: usize) -> Point {
        if self.reversed {
            self.points[self.points.len() - 1 - index]
        } else {
            self.points[index]
        }
    }

    /// The same route read the other way, and where segment `index` is then.
    fn turned(self, index: usize) -> (Self, usize) {
        (
            View {
                points: self.points,
                reversed: !self.reversed,
            },
            self.len() - 2 - index,
        )
    }
}

/// The direction from one point to another, each part -1, 0 or 1.
fn heading(from: Point, to: Point) -> (f64, f64) {
    (
        f64::from(sign(to.x - from.x)),
        f64::from(sign(to.y - from.y)),
    )
}

/// Which side a turn goes to, seen along a heading: 1 or -1, 0 straight on.
fn handed(heading: (f64, f64), turn: (f64, f64)) -> i32 {
    sign(heading.0 * turn.1 - heading.1 * turn.0)
}

/// Walk two routes forward from a segment each, both running the same way
/// on one line, to where they part.
/// Returns the side route `a` parts to, seen along the walk, or 0 when they
/// part at an end of either route.
fn parting(a: View<'_>, mut ia: usize, b: View<'_>, mut ib: usize) -> i32 {
    loop {
        let heading = heading(a.at(ia), a.at(ia + 1));
        let progress = |p: Point| p.x * heading.0 + p.y * heading.1;
        let turn = |route: View<'_>, index: usize| {
            (index + 2 < route.len()).then(|| {
                let (corner, next) = (route.at(index + 1), route.at(index + 2));
                handed(heading, (next.x - corner.x, next.y - corner.y))
            })
        };
        let (end_a, end_b) = (progress(a.at(ia + 1)), progress(b.at(ib + 1)));
        if end_a < end_b - SAME {
            return turn(a, ia).unwrap_or(0);
        }
        if end_b < end_a - SAME {
            return -turn(b, ib).unwrap_or(0);
        }
        match (turn(a, ia), turn(b, ib)) {
            (Some(sa), Some(sb)) if sa == sb && sa != 0 => {
                ia += 1;
                ib += 1;
            }
            (Some(sa), Some(sb)) => return if sa != 0 { sa } else { -sb },
            _ => return 0,
        }
    }
}

/// How sure an order of two routes on one line is, surest first.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum Sureness {
    /// Both ends of the shared stretch say the same.
    Agreed,
    /// One end says, and the other ends a route.
    OneEnd,
    /// The two ends disagree: the routes cross on the stretch either way.
    Crossing,
}

/// Which side of route `b` route `a` runs on along the line their segments
/// `ia` and `ib` share: -1 at the lower coordinate across the line, 1 at the
/// higher, and how sure that is; nothing when where they part does not say.
pub(crate) fn side(a: &[Point], ia: usize, b: &[Point], ib: usize) -> Option<(i32, Sureness)> {
    let a = View {
        points: a,
        reversed: false,
    };
    let along = heading(a.at(ia), a.at(ia + 1));
    let b = View {
        points: b,
        reversed: false,
    };
    let (b, ib) = if heading(b.at(ib), b.at(ib + 1)) == along {
        (b, ib)
    } else {
        b.turned(ib)
    };
    let forward = parting(a, ia, b, ib);
    let backward = {
        let ((ra, ria), (rb, rib)) = (a.turned(ia), b.turned(ib));
        -parting(ra, ria, rb, rib)
    };
    let (handedness, sureness) = match (forward, backward) {
        (0, 0) => return None,
        (0, one) | (one, 0) => (one, Sureness::OneEnd),
        (one, other) if one == other => (one, Sureness::Agreed),
        (one, _) => (one, Sureness::Crossing),
    };
    // The side handedness 1 names, across the line: the heading turned a
    // quarter clockwise on the page, where y runs down.
    let across = if along.0 == 0.0 { -along.1 } else { along.0 };
    Some((handedness * sign(across), sureness))
}
