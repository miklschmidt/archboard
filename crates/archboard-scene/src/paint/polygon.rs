//! Convex polygons, clockwise on the page, for the shapes that are not boxes:
//! a face is the shape cut by itself lifted ([`intersection`]), a border runs
//! inside an outline and a selection ring outside it ([`inset`]), and a shadow
//! is the shape moved ([`translated`]).

use crate::geometry::{Point, round_coord};
use crate::js;
use crate::scene::PathStep;

/// A convex outline, its corners clockwise on the page.
pub(super) type Polygon = Vec<Point>;

/// Less than this is nothing.
const TINY: f64 = 1e-9;

/// Where a rounded corner's curve leaves one side and comes into the next.
fn rounded_corner(before: Point, corner: Point, after: Point, radius: f64) -> (Point, Point) {
    let back = Point {
        x: before.x - corner.x,
        y: before.y - corner.y,
    };
    let forth = Point {
        x: after.x - corner.x,
        y: after.y - corner.y,
    };
    let lengths = [js::hypot(back.x, back.y), js::hypot(forth.x, forth.y)];
    let cosine = (back.x * forth.x + back.y * forth.y) / (lengths[0] * lengths[1]);
    let half = libm::acos(js::js_min(js::js_max(cosine, -1.0), 1.0)) / 2.0;
    let reach = js::min([radius / libm::tan(half), lengths[0] / 2.0, lengths[1] / 2.0]);
    (
        Point {
            x: corner.x + (back.x / lengths[0]) * reach,
            y: corner.y + (back.y / lengths[0]) * reach,
        },
        Point {
            x: corner.x + (forth.x / lengths[1]) * reach,
            y: corner.y + (forth.y / lengths[1]) * reach,
        },
    )
}

/// One point, rounded as it is drawn.
fn at(point: Point) -> Point {
    Point {
        x: round_coord(point.x),
        y: round_coord(point.y),
    }
}

/// A polygon as a path, its corners rounded by a radius, or sharp for none.
pub(super) fn polygon_path(polygon: &[Point], radius: f64) -> Vec<PathStep> {
    let mut steps = Vec::new();
    if radius <= 0.0 {
        for (index, corner) in polygon.iter().enumerate() {
            let to = at(*corner);
            steps.push(if index == 0 {
                PathStep::Move { to }
            } else {
                PathStep::Line { to }
            });
        }
        steps.push(PathStep::Close);
        return steps;
    }
    let count = polygon.len();
    for (index, corner) in polygon.iter().enumerate() {
        let (leaves, comes) = rounded_corner(
            polygon[(index + count - 1) % count],
            *corner,
            polygon[(index + 1) % count],
            radius,
        );
        let to = at(leaves);
        steps.push(if index == 0 {
            PathStep::Move { to }
        } else {
            PathStep::Line { to }
        });
        steps.push(PathStep::Quad {
            control: at(*corner),
            to: at(comes),
        });
    }
    steps.push(PathStep::Close);
    steps
}

/// A polygon moved.
pub(super) fn translated(polygon: &[Point], by: Point) -> Polygon {
    polygon
        .iter()
        .map(|point| Point {
            x: point.x + by.x,
            y: point.y + by.y,
        })
        .collect()
}

/// Which side of the line from one point to another a point is on.
fn side_of(from: Point, to: Point, point: Point) -> f64 {
    (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x)
}

/// Where the segment between two points on either side of a line crosses it.
fn crossing(a: (Point, f64), b: (Point, f64)) -> Point {
    let share = a.1 / (a.1 - b.1);
    Point {
        x: a.0.x + (b.0.x - a.0.x) * share,
        y: a.0.y + (b.0.y - a.0.y) * share,
    }
}

/// A polygon cut to the inside of a line.
fn cut_by(polygon: &[Point], from: Point, to: Point) -> Polygon {
    let count = polygon.len();
    let mut kept = Vec::new();
    for (index, corner) in polygon.iter().enumerate() {
        let before = polygon[(index + count - 1) % count];
        let now = (*corner, side_of(from, to, *corner));
        let earlier = (before, side_of(from, to, before));
        if (now.1 >= 0.0) != (earlier.1 >= 0.0) {
            kept.push(crossing(earlier, now));
        }
        if now.1 >= 0.0 {
            kept.push(*corner);
        }
    }
    let count = kept.len();
    (0..count)
        .filter(|index| {
            let corner = kept[*index];
            let before = kept[(index + count - 1) % count];
            js::hypot(corner.x - before.x, corner.y - before.y) > TINY
        })
        .map(|index| kept[index])
        .collect()
}

/// What two convex polygons share.
pub(super) fn intersection(polygon: &[Point], by: &[Point]) -> Polygon {
    let count = by.len();
    by.iter()
        .enumerate()
        .fold(polygon.to_vec(), |kept, (index, from)| {
            cut_by(&kept, *from, by[(index + 1) % count])
        })
}

/// The corner where two lines meet, each given by a point on it and its direction.
fn meeting(one: (Point, Point), other: (Point, Point)) -> Point {
    let (at, way) = one;
    let turn = way.x * other.1.y - way.y * other.1.x;
    if turn.abs() < TINY {
        return at;
    }
    let along = ((other.0.x - at.x) * other.1.y - (other.0.y - at.y) * other.1.x) / turn;
    Point {
        x: at.x + way.x * along,
        y: at.y + way.y * along,
    }
}

/// A polygon with every side moved inward, its corners kept sharp; a negative
/// distance moves them outward.
pub(super) fn inset(polygon: &[Point], distance: f64) -> Polygon {
    let count = polygon.len();
    let sides: Vec<(Point, Point)> = polygon
        .iter()
        .enumerate()
        .map(|(index, from)| {
            let to = polygon[(index + 1) % count];
            let length = js::hypot(to.x - from.x, to.y - from.y);
            let way = Point {
                x: (to.x - from.x) / length,
                y: (to.y - from.y) / length,
            };
            (
                Point {
                    x: from.x - way.y * distance,
                    y: from.y + way.x * distance,
                },
                way,
            )
        })
        .collect();
    (0..count)
        .map(|index| meeting(sides[(index + count - 1) % count], sides[index]))
        .collect()
}
