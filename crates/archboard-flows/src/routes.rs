//! The route helper the flowchart needs that the painter's geometry does not
//! hold: a copy of a TypeScript rule the painter's hops still use
//! (`shared/rules/layout/routes/curves.ts` `reversed`).

use archboard_scene::geometry::{Curve, Segment, segment_start};

/// A line read backwards: the same pieces, from its end to its start.
pub(crate) fn reversed(curve: &Curve) -> Curve {
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

#[cfg(test)]
mod tests {
    use super::*;
    use archboard_scene::geometry::Point;

    fn point(x: f64, y: f64) -> Point {
        Point { x, y }
    }

    #[test]
    fn a_reversed_line_runs_the_same_pieces_backwards() {
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
}
