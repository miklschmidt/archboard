//! Route equality follows the coordinates and pieces that a picture draws.

use archboard_scene::geometry::{Curve, Point, Segment, same_rounded_curve};

const POINTS: [Point; 5] = [
    Point { x: 0.0, y: 0.0 },
    Point { x: 92.0, y: 0.0 },
    Point { x: 96.42, y: 0.0 },
    Point { x: 100.0, y: 3.58 },
    Point { x: 100.0, y: 8.0 },
];

/// A route with a straight run and a cubic bend, using each supplied point.
fn route([from, line, first, second, to]: [Point; 5]) -> Curve {
    Curve {
        from,
        segments: vec![
            Segment::Line { to: line },
            Segment::Cubic { first, second, to },
        ],
    }
}

#[test]
fn every_coordinate_compares_at_drawing_precision() {
    let original = route(POINTS);
    for index in 0..POINTS.len() {
        for (dx, dy, equal) in [
            (0.004, 0.0, true),
            (0.006, 0.0, false),
            (0.0, 0.004, true),
            (0.0, 0.006, false),
        ] {
            let mut points = POINTS;
            points[index].x += dx;
            points[index].y += dy;
            assert_eq!(same_rounded_curve(&original, &route(points)), equal);
        }
    }
}

#[test]
fn rounding_keeps_ties_zero_and_nonfinite_equality() {
    let start = |x| Curve {
        from: Point { x, y: 0.0 },
        segments: Vec::new(),
    };
    for (a, b, equal) in [
        (1.005, 1.0, true),
        (-0.125, -0.12, true),
        (-0.005, 0.0, true),
        (0.0049, 0.0051, false),
        (-0.004, 0.004, true),
        (f64::NAN, -f64::NAN, true),
        (f64::INFINITY, f64::INFINITY, true),
        (f64::NEG_INFINITY, f64::INFINITY, false),
        (f64::NAN, 0.0, false),
    ] {
        assert_eq!(same_rounded_curve(&start(a), &start(b)), equal);
    }
}

#[test]
fn equal_points_do_not_hide_different_route_pieces() {
    let original = route(POINTS);
    let mut changed = original.clone();
    changed.segments[1] = Segment::Line { to: original.end() };
    assert!(!same_rounded_curve(&original, &changed));
    let mut changed = original.clone();
    changed.segments.reverse();
    assert!(!same_rounded_curve(&original, &changed));
    let mut changed = original.clone();
    changed.segments.pop();
    assert!(!same_rounded_curve(&original, &changed));
    let mut changed = original.clone();
    changed.segments.push(Segment::Line { to: original.end() });
    assert!(!same_rounded_curve(&original, &changed));
}
