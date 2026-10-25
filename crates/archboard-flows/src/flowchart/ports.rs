//! Where a line meets a decision's diamond or a terminal: at the middle of the
//! side it crosses, a diamond's point, never on a slanted side or off to one
//! side of a terminal. The layout spreads the lines that leave or reach a box
//! along the side they cross; a diamond has no side to spread them along, and
//! a terminal is a mark every line of a flow starts or ends at. So every line
//! into a decision arrives at one point, as a flowchart draws them.
//!
//! The answers out of a decision leave it apart: one from its left point, one
//! from its right point and a third from its bottom point. The layout holds
//! each answer to its point of the decision's box, which is wider than the
//! diamond on either side (`shared/rules/track/routes/points.ts`). An answer
//! held near the left or right edge of the box starts beside the diamond, and
//! here it is drawn out of the point on that side: it runs out sideways and
//! turns down where it was laid out, clear of the diamond (`from_side`).
//!
//! A line is moved in one of two ways: it turns in just outside the box to the
//! middle, or its first leg moves over to the middle and the run after its
//! first turn starts there instead. A line that leaves a shape turns in where
//! it can, so it still passes the words of its answer, which stand beside its
//! first leg; a line that reaches a shape moves its last leg where it can. A
//! line that reaches a shape is the same line read backwards.

use archboard_scene::geometry::{
    Curve, EPSILON, Point, Rect, Segment, curve_through, segment_start, vertices_of,
};
use archboard_scene::js;
use archboard_scene::request::FlowchartShape;

use crate::routes::reversed;

/// The radius of every bend a line takes.
const BEND_RADIUS: f64 = archboard_scene::geometry::BEND_RADIUS;
/// The straight run a line keeps before its arrowhead.
const APPROACH_STRAIGHT: f64 = 12.0;
/// How far beyond the turn out of a point a line runs before it turns again,
/// so the two turns do not touch.
const CLEAR: f64 = 4.0;

/// Which end of a line is moved: where it leaves a shape, or where it arrives.
#[derive(Clone, Copy, PartialEq, Eq)]
enum End {
    Leaves,
    Arrives,
}

/// The unit way along a straight piece, when it runs along one axis.
fn axis_way(from: Point, to: Point) -> Option<Point> {
    let dx = to.x - from.x;
    let dy = to.y - from.y;
    if dx.abs() < EPSILON && dy.abs() > EPSILON {
        return Some(Point {
            x: 0.0,
            y: js::sign(dy),
        });
    }
    if dy.abs() < EPSILON && dx.abs() > EPSILON {
        return Some(Point {
            x: js::sign(dx),
            y: 0.0,
        });
    }
    None
}

/// The middle of the side of a box a line crosses, at the line's own
/// distance from the box.
fn middle_for(bounds: Rect, end: Point, way: Point) -> Point {
    if way.x == 0.0 {
        Point {
            x: bounds.x + bounds.width / 2.0,
            y: end.y,
        }
    } else {
        Point {
            x: end.x,
            y: bounds.y + bounds.height / 2.0,
        }
    }
}

/// A point moved along a way.
fn along(point: Point, way: Point, by: f64) -> Point {
    Point {
        x: point.x + way.x * by,
        y: point.y + way.y * by,
    }
}

/// How far apart two points are.
fn apart(a: Point, b: Point) -> f64 {
    js::hypot(b.x - a.x, b.y - a.y)
}

/// Whether a piece is one of the route's quarter turns, which moves it as far
/// across as along, rather than a hop over another line, which comes back to
/// the line it left.
fn is_turn(from: Point, segment: &Segment) -> bool {
    let Segment::Cubic { to, .. } = segment else {
        return false;
    };
    let across = (to.x - from.x).abs();
    across > EPSILON && (across - (to.y - from.y).abs()).abs() < EPSILON
}

/// The corners of the first legs of a line, as far as its second turn or a
/// hop over another line, and the pieces after the last of them.
fn first_legs(curve: &Curve) -> (Vec<Point>, Vec<Segment>) {
    let mut turns = 0;
    let mut end = 0;
    for (index, segment) in curve.segments.iter().enumerate() {
        if let Segment::Line { .. } = segment {
            end = index + 1;
            if turns == 2 {
                break;
            }
            continue;
        }
        if !is_turn(segment_start(curve, index), segment) {
            break;
        }
        turns += 1;
    }
    let head = Curve {
        from: curve.from,
        segments: curve.segments[..end].to_vec(),
    };
    (vertices_of(&head), curve.segments[end..].to_vec())
}

/// A line with its first leg moved over to start at the middle of the side:
/// the run after its first turn then starts or ends there instead. Nothing
/// where that run would turn back on itself or has no room left for its turns.
fn moved_leg(corners: &[Point], start: Point) -> Option<Vec<Point>> {
    let [from, knee, after, ..] = corners else {
        return None;
    };
    let moved = Point {
        x: knee.x + start.x - from.x,
        y: knee.y + start.y - from.y,
    };
    if !keeps_way(*knee, moved, *after) {
        return None;
    }
    let mut points = vec![start, moved];
    points.extend_from_slice(&corners[2..]);
    Some(points)
}

/// Whether a run from a moved corner still goes the way it went, with room
/// left for its turns.
fn keeps_way(knee: Point, moved: Point, after: Point) -> bool {
    let Some(was) = axis_way(knee, after) else {
        return false;
    };
    axis_way(moved, after).is_some_and(|now| now.x == was.x && now.y == was.y)
        && apart(moved, after) >= BEND_RADIUS + CLEAR
}

/// A line whose first leg runs straight out of the box for a while, turned in
/// just outside the box to the middle of the side. Nothing where its first leg
/// has no room for it.
fn turned_in(corners: &[Point], start: Point, reach: f64) -> Option<Vec<Point>> {
    let [from, next, ..] = corners else {
        return None;
    };
    if apart(*from, *next) < reach + BEND_RADIUS * 2.0 {
        return None;
    }
    let way = axis_way(*from, *next)?;
    let mut points = vec![start, along(start, way, reach), along(*from, way, reach)];
    points.extend_from_slice(&corners[1..]);
    Some(points)
}

/// The corners of a line's first legs moved to start at the middle of a side.
fn started_at(corners: &[Point], start: Point, end: End) -> Option<Vec<Point>> {
    if end == End::Arrives {
        return moved_leg(corners, start)
            .or_else(|| turned_in(corners, start, APPROACH_STRAIGHT + BEND_RADIUS));
    }
    turned_in(corners, start, BEND_RADIUS + CLEAR).or_else(|| moved_leg(corners, start))
}

/// A line's first legs bent again through new corners, and the rest of it as it was.
fn rejoined(corners: &[Point], rest: Vec<Segment>) -> Curve {
    let head = curve_through(corners, true);
    let mut segments = head.segments;
    segments.extend(rest);
    Curve {
        from: head.from,
        segments,
    }
}

/// A line that leaves a shape, moved to leave from the middle of the side it
/// crosses: where it leaves it keeps its first leg, which its words stand
/// beside, and turns in; where it arrives it moves its last leg.
fn from_middle(curve: Curve, bounds: Rect, end: End) -> Curve {
    let (corners, rest) = first_legs(&curve);
    let way = match corners.as_slice() {
        [first, second, ..] => axis_way(*first, *second),
        _ => None,
    };
    let Some(way) = way else {
        return curve;
    };
    let start = middle_for(bounds, curve.from, way);
    if apart(start, curve.from) < EPSILON {
        return curve;
    }
    match started_at(&corners, start, end) {
        None => curve,
        Some(turned) => rejoined(&turned, rest),
    }
}

/// A line laid out to leave beside a shape's box, as a decision's answer held
/// to an edge of its box is, drawn out of the point on that side: it runs out
/// sideways and turns down where it was laid out. Nothing where it leaves from
/// the box's own face.
fn from_side(curve: &Curve, bounds: Rect) -> Option<Curve> {
    let x = curve.from.x;
    let right = bounds.x + bounds.width;
    let side = if x < bounds.x - EPSILON {
        bounds.x
    } else if x > right + EPSILON {
        right
    } else {
        return None;
    };
    let (corners, rest) = first_legs(curve);
    let middle = bounds.y + bounds.height / 2.0;
    let mut points = vec![Point { x: side, y: middle }, Point { x, y: middle }];
    points.extend(corners);
    Some(rejoined(&points, rest))
}

/// A line with each end that meets a diamond or a terminal moved to the
/// middle of the side it crosses, or, where it was laid out to leave beside
/// the shape, out of the point on that side.
pub fn at_shape_points(curve: Curve, from: Option<Rect>, to: Option<Rect>) -> Curve {
    let left = match from {
        None => curve,
        Some(bounds) => match from_side(&curve, bounds) {
            Some(side) => side,
            None => from_middle(curve, bounds, End::Leaves),
        },
    };
    match to {
        None => left,
        Some(bounds) => reversed(&from_middle(reversed(&left), bounds, End::Arrives)),
    }
}

/// Where a line that ends on a shape's box meets the shape itself: moved from
/// the box's edge along the line's own direction onto the outline, keeping the
/// gap the line kept from the box for its arrowhead.
///
/// A diamond meets a line at one of its points, where the line was turned to,
/// or at a slanted side where the line had no room to turn; a hexagon at its
/// cut corners; a terminal's ends are round, but a line meets its flat top or
/// foot.
pub fn on_outline(shape: FlowchartShape, bounds: Rect, end: Point) -> Point {
    let half = Point {
        x: bounds.width / 2.0,
        y: bounds.height / 2.0,
    };
    let centre = Point {
        x: bounds.x + half.x,
        y: bounds.y + half.y,
    };
    let offset = Point {
        x: end.x - centre.x,
        y: end.y - centre.y,
    };
    // The line runs into the box across the side it is nearest to, as a share of the box.
    let across = offset.x.abs() / half.x > offset.y.abs() / half.y;
    let reach = outline_reach(
        shape,
        half,
        if across { offset.y } else { offset.x },
        across,
    );
    if across {
        let gap = offset.x.abs() - half.x;
        return Point {
            x: centre.x + js::sign(offset.x) * (reach + gap),
            y: end.y,
        };
    }
    let gap = offset.y.abs() - half.y;
    Point {
        x: end.x,
        y: centre.y + js::sign(offset.y) * (reach + gap),
    }
}

/// How far from a shape's centre its outline stands, along a line parallel to
/// one axis that crosses the other axis at an offset from the centre.
fn outline_reach(shape: FlowchartShape, half: Point, offset: f64, across: bool) -> f64 {
    let (reach, span) = if across {
        (half.x, half.y)
    } else {
        (half.y, half.x)
    };
    let share = js::js_min(offset.abs() / span, 1.0);
    match shape {
        FlowchartShape::Decision => reach * (1.0 - share),
        FlowchartShape::Loop => {
            // A hexagon's top and foot are flat over all but a cut as wide as half its height.
            let cut = half.y / half.x;
            if across {
                half.x - half.y * share
            } else if share <= 1.0 - cut {
                half.y
            } else {
                (half.y * (1.0 - share)) / cut
            }
        }
        FlowchartShape::Start | FlowchartShape::End => reach,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn point(x: f64, y: f64) -> Point {
        Point { x, y }
    }

    const DIAMOND: Rect = Rect {
        x: 0.0,
        y: 0.0,
        width: 100.0,
        height: 50.0,
    };

    #[test]
    fn a_line_into_a_diamond_meets_its_point() {
        // Straight down onto the middle of the top: the top point.
        assert_eq!(
            on_outline(FlowchartShape::Decision, DIAMOND, point(50.0, -4.0)),
            point(50.0, -4.0)
        );
        // Down onto the box off its middle: the slanted side, the gap kept.
        let met = on_outline(FlowchartShape::Decision, DIAMOND, point(75.0, -4.0));
        assert_eq!(met, point(75.0, 8.5));
    }

    #[test]
    fn a_line_leaving_off_the_middle_of_a_terminal_turns_in_to_it() {
        let terminal = Rect {
            x: 0.0,
            y: 0.0,
            width: 96.0,
            height: 34.0,
        };
        let curve = curve_through(&[point(70.0, 34.0), point(70.0, 120.0)], true);
        let moved = at_shape_points(curve, Some(terminal), None);
        assert_eq!(moved.from, point(48.0, 34.0));
        assert_eq!(moved.end(), point(70.0, 120.0));
    }

    #[test]
    fn an_answer_held_beside_its_diamond_runs_out_of_the_side_point() {
        let curve = curve_through(&[point(-30.0, 50.0), point(-30.0, 150.0)], true);
        let moved = at_shape_points(curve, Some(DIAMOND), None);
        assert_eq!(moved.from, point(0.0, 25.0));
        assert_eq!(moved.end(), point(-30.0, 150.0));
    }
}
