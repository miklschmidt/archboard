//! A scene's geometry as the paths a canvas takes.

use archboard_scene::geometry::{Point, Rect, Segment};
use archboard_scene::scene::{Cap, Geometry, Join, PathStep, Stroke};
use kurbo::{Affine, BezPath, ParamCurve as _, Shape as _, Vec2};

/// How closely a curve stands in for a circle or a rounded corner.
const TOLERANCE: f64 = 0.05;

/// How closely the straight pieces of a dashed path follow its curves, in the
/// picture's units.
const DASH_TOLERANCE: f64 = 0.02;

/// SVG's default miter limit, which a sharp join of a stroke keeps.
const MITER_LIMIT: f64 = 4.0;

/// A rectangle as kurbo spells it.
pub(crate) fn rect_of(rect: &Rect) -> kurbo::Rect {
    kurbo::Rect::new(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height)
}

/// A point as kurbo spells it.
fn point_of(point: Point) -> kurbo::Point {
    kurbo::Point::new(point.x, point.y)
}

/// One arc step, as SVG draws it: the short way round.
fn arc(path: &mut BezPath, from: kurbo::Point, radius: Point, clockwise: bool, to: kurbo::Point) {
    let arc = kurbo::SvgArc {
        from,
        to,
        radii: Vec2::new(radius.x, radius.y),
        x_rotation: 0.0,
        large_arc: false,
        sweep: clockwise,
    };
    match kurbo::Arc::from_svg_arc(&arc) {
        Some(arc) => arc.to_cubic_beziers(TOLERANCE, |first, second, end| {
            path.curve_to(first, second, end);
        }),
        None => path.line_to(to),
    }
}

/// The steps of a path as a path.
pub(crate) fn path_of(steps: &[PathStep]) -> BezPath {
    let mut path = BezPath::new();
    let mut at = kurbo::Point::ZERO;
    let mut start = at;
    for step in steps {
        match *step {
            PathStep::Move { to } => {
                at = point_of(to);
                start = at;
                path.move_to(at);
            }
            PathStep::Line { to } => {
                at = point_of(to);
                path.line_to(at);
            }
            PathStep::Across { x } => {
                at.x = x;
                path.line_to(at);
            }
            PathStep::Down { y } => {
                at.y = y;
                path.line_to(at);
            }
            PathStep::AcrossBy { dx } => {
                at.x += dx;
                path.line_to(at);
            }
            PathStep::DownBy { dy } => {
                at.y += dy;
                path.line_to(at);
            }
            PathStep::Quad { control, to } => {
                at = point_of(to);
                path.quad_to(point_of(control), at);
            }
            PathStep::Cubic { first, second, to } => {
                at = point_of(to);
                path.curve_to(point_of(first), point_of(second), at);
            }
            PathStep::Arc {
                radius,
                clockwise,
                to,
            } => {
                let end = point_of(to);
                arc(&mut path, at, radius, clockwise, end);
                at = end;
            }
            PathStep::ArcBy {
                radius,
                clockwise,
                by,
            } => {
                let end = at + Vec2::new(by.x, by.y);
                arc(&mut path, at, radius, clockwise, end);
                at = end;
            }
            PathStep::Close => {
                path.close_path();
                at = start;
            }
        }
    }
    path
}

/// One piece of a route, added to a path.
pub(crate) fn segment_onto(path: &mut BezPath, segment: &Segment) {
    match *segment {
        Segment::Line { to } => path.line_to(point_of(to)),
        Segment::Cubic { first, second, to } => {
            path.curve_to(point_of(first), point_of(second), point_of(to));
        }
    }
}

/// A geometry as a path, with the box a gradient or a clip measures it by.
pub(crate) fn outline_of(geometry: &Geometry) -> (BezPath, kurbo::Rect) {
    let (path, bounds) = match geometry {
        Geometry::Rect { rect, radius } => {
            let plain = rect_of(rect);
            let path = match radius {
                Some(radius) if *radius > 0.0 => {
                    kurbo::RoundedRect::from_rect(plain, *radius).to_path(TOLERANCE)
                }
                _ => plain.to_path(TOLERANCE),
            };
            (path, Some(plain))
        }
        Geometry::Circle { centre, radius } => {
            let centre = centre.map_or(kurbo::Point::ZERO, point_of);
            let circle = kurbo::Circle::new(centre, *radius);
            (circle.to_path(TOLERANCE), Some(circle.bounding_box()))
        }
        Geometry::Line { from, to } => {
            let mut path = BezPath::new();
            path.move_to(point_of(*from));
            path.line_to(point_of(*to));
            (path, None)
        }
        Geometry::Path { steps } => (path_of(steps), None),
    };
    let bounds = bounds.unwrap_or_else(|| path.bounding_box());
    (path, bounds)
}

/// A path cut into straight pieces, ready to dash. A dash measures each curve to
/// one part in a million, which took a quarter of a flight's frames, and a
/// straight piece takes no measuring.
pub(crate) fn straightened(path: &BezPath) -> BezPath {
    let mut straight = BezPath::new();
    kurbo::flatten(path, DASH_TOLERANCE, |element| straight.push(element));
    straight
}

/// A stroke as a canvas takes it, its width times `scale`.
pub(crate) fn stroke_of(stroke: &Stroke, scale: f64) -> kurbo::Stroke {
    let mut drawn = kurbo::Stroke::new(stroke.width.unwrap_or(1.0) * scale)
        .with_caps(match stroke.cap {
            Some(Cap::Round) => kurbo::Cap::Round,
            Some(Cap::Butt) | None => kurbo::Cap::Butt,
        })
        .with_join(match stroke.join {
            Some(Join::Round) => kurbo::Join::Round,
            None => kurbo::Join::Miter,
        })
        .with_miter_limit(MITER_LIMIT);
    if !stroke.dashes.is_empty() {
        drawn = drawn.with_dashes(
            stroke.dash_offset.unwrap_or(0.0),
            stroke.dashes.iter().copied(),
        );
    }
    drawn
}

/// Where a path ends and the angle a marker takes there. A start marker turns
/// round, as `orient="auto-start-reverse"` says.
pub(crate) fn end_of(path: &BezPath, start: bool) -> Option<(kurbo::Point, f64)> {
    let mut segments = path.segments();
    let segment = if start {
        segments.next()?
    } else {
        segments.last()?
    };
    let cubic = segment.to_cubic();
    let (near, whole) = if start {
        (cubic.p1 - cubic.p0, cubic.p3 - cubic.p0)
    } else {
        (cubic.p3 - cubic.p2, cubic.p3 - cubic.p0)
    };
    let way = if near.hypot2() > 1e-9 { near } else { whole };
    let angle = way.y.atan2(way.x);
    Some(if start {
        (cubic.start(), angle + std::f64::consts::PI)
    } else {
        (cubic.end(), angle)
    })
}

/// The transform of one group: a move, and a scale inside it.
pub(crate) fn placed(x: f64, y: f64, scale: Option<f64>) -> Affine {
    Affine::translate((x, y)) * Affine::scale(scale.unwrap_or(1.0))
}

#[cfg(test)]
mod tests {
    use super::{end_of, outline_of, path_of, stroke_of};
    use archboard_scene::geometry::{Point, Rect};
    use archboard_scene::scene::{Cap, Geometry, PathStep, Stroke, Token};

    fn at(x: f64, y: f64) -> Point {
        Point { x, y }
    }

    #[test]
    fn relative_steps_continue_from_where_the_path_is() {
        let path = path_of(&[
            PathStep::Move { to: at(10.0, 10.0) },
            PathStep::AcrossBy { dx: 5.0 },
            PathStep::DownBy { dy: 5.0 },
            PathStep::Close,
            PathStep::AcrossBy { dx: 1.0 },
        ]);
        let last = path.elements().last().and_then(kurbo::PathEl::end_point);
        assert_eq!(last, Some(kurbo::Point::new(11.0, 10.0)));
    }

    #[test]
    fn a_start_marker_faces_back_along_the_line() {
        let path = path_of(&[
            PathStep::Move { to: at(0.0, 0.0) },
            PathStep::Line { to: at(10.0, 0.0) },
        ]);
        let (point, angle) = end_of(&path, true).expect("a line has a start");
        assert_eq!(point, kurbo::Point::ZERO);
        assert!((angle - std::f64::consts::PI).abs() < 1e-9);
        let (point, angle) = end_of(&path, false).expect("a line has an end");
        assert_eq!(point, kurbo::Point::new(10.0, 0.0));
        assert!(angle.abs() < 1e-9);
    }

    #[test]
    fn a_box_measures_the_shape_and_not_its_stroke() {
        let rect = Rect {
            x: 1.0,
            y: 2.0,
            width: 3.0,
            height: 4.0,
        };
        let (_, bounds) = outline_of(&Geometry::Rect {
            rect,
            radius: Some(1.0),
        });
        assert_eq!(bounds, kurbo::Rect::new(1.0, 2.0, 4.0, 6.0));
    }

    #[test]
    fn a_stroke_keeps_its_ends_and_scales_its_width() {
        let drawn = stroke_of(&Stroke::new(Token::Border, 2.0).capped(Cap::Round), 1.5);
        assert_eq!(drawn.width, 3.0);
        assert_eq!(drawn.start_cap, kurbo::Cap::Round);
    }
}
