//! A route read backwards, and route equality at the precision a picture
//! draws: the two ways the crossing pass compares and turns the routes it moves.

use archboard_geometry::{Curve, Point, Segment, round_coord, segment_start};

/// A line read backwards: the same pieces, from its end to its start.
pub(super) fn reversed(curve: &Curve) -> Curve {
    let segments = curve
        .segments
        .iter()
        .enumerate()
        .map(|(index, segment)| {
            let to = segment_start(curve, index);
            match *segment {
                Segment::Line { .. } => Segment::Line { to },
                Segment::Cubic { first, second, .. } => Segment::Cubic {
                    first: second,
                    second: first,
                    to,
                },
            }
        })
        .rev()
        .collect();
    Curve {
        from: curve.end(),
        segments,
    }
}

/// Whether two coordinates have the same value at drawing precision.
/// All indeterminate coordinates compare alike, as their written values do.
fn same_rounded_coordinate(a: f64, b: f64) -> bool {
    let a = round_coord(a);
    let b = round_coord(b);
    a == b || (a.is_nan() && b.is_nan())
}

/// Whether two points coincide at drawing precision.
fn same_rounded_point(a: Point, b: Point) -> bool {
    same_rounded_coordinate(a.x, b.x) && same_rounded_coordinate(a.y, b.y)
}

/// Whether two pieces have the same kind, control points and end at drawing precision.
fn same_rounded_segment(a: &Segment, b: &Segment) -> bool {
    match (a, b) {
        (Segment::Line { to: a }, Segment::Line { to: b }) => same_rounded_point(*a, *b),
        (
            Segment::Cubic {
                first: first_a,
                second: second_a,
                to: to_a,
            },
            Segment::Cubic {
                first: first_b,
                second: second_b,
                to: to_b,
            },
        ) => [(*first_a, *first_b), (*second_a, *second_b), (*to_a, *to_b)]
            .into_iter()
            .all(|(a, b)| same_rounded_point(a, b)),
        _ => false,
    }
}

/// Whether two routes have the same ordered pieces after rounding every
/// coordinate to a hundredth. This keeps the drawing unchanged when a layout
/// pass reconstructs a route from its vertices.
pub(super) fn same_rounded_curve(a: &Curve, b: &Curve) -> bool {
    same_rounded_point(a.from, b.from)
        && a.segments.len() == b.segments.len()
        && a.segments
            .iter()
            .zip(&b.segments)
            .all(|(a, b)| same_rounded_segment(a, b))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_reversed_line_runs_the_same_pieces_backwards() {
        let point = |x, y| Point { x, y };
        let curve = Curve {
            from: point(0.0, 0.0),
            segments: vec![
                Segment::Line {
                    to: point(0.0, 10.0),
                },
                Segment::Cubic {
                    first: point(0.0, 14.0),
                    second: point(4.0, 18.0),
                    to: point(8.0, 18.0),
                },
            ],
        };
        let back = reversed(&curve);
        assert_eq!(back.from, point(8.0, 18.0));
        assert_eq!(
            back.segments,
            [
                Segment::Cubic {
                    first: point(4.0, 18.0),
                    second: point(0.0, 14.0),
                    to: point(0.0, 10.0),
                },
                Segment::Line {
                    to: point(0.0, 0.0)
                },
            ]
        );
        assert_eq!(reversed(&back), curve);
    }

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
}
