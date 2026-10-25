//! The two route helpers the flowchart needs that the painter's geometry does
//! not hold. Each is a copy of a TypeScript rule another layout still uses
//! (`shared/rules/layout/routes/curves.ts` `reversed`,
//! `shared/rules/blocks/tree/joins.ts` `pairCrossings`); the port of that
//! layout points at these copies (TASK-520.04, TASK-520.05).

use std::collections::HashSet;

use archboard_scene::geometry::{Curve, Point, Segment, segment_start};
use archboard_scene::js;

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

/// Whether a value lies inside a run, more than a unit from either end.
fn clear(value: f64, one: f64, other: f64) -> bool {
    value > js::js_min(one, other) + 1.0 && value < js::js_max(one, other) - 1.0
}

/// One straight run of a line.
struct Run {
    line: usize,
    from: Point,
    to: Point,
}

/// A whole number as a crossing's place is keyed by: `Math.round`, negative
/// zero written as zero.
#[expect(
    clippy::cast_possible_truncation,
    reason = "a rounded coordinate of a drawing, far inside an i64"
)]
fn place(value: f64) -> i64 {
    js::round(value) as i64
}

/// How many times one line crosses another, each pair of lines counted at each
/// place: a trunk of several lines crosses a line once for each of them.
pub(crate) fn pair_crossings(lines: &[Vec<Point>]) -> usize {
    let runs: Vec<Run> = lines
        .iter()
        .enumerate()
        .flat_map(|(line, points)| {
            points.windows(2).map(move |pair| Run {
                line,
                from: pair[0],
                to: pair[1],
            })
        })
        .collect();
    let level = runs
        .iter()
        .filter(|run| (run.from.y - run.to.y).abs() < 0.5);
    let upright: Vec<&Run> = runs
        .iter()
        .filter(|run| (run.from.x - run.to.x).abs() < 0.5)
        .collect();
    let mut places: HashSet<(usize, usize, i64, i64)> = HashSet::new();
    for one in level {
        for other in &upright {
            if other.line != one.line
                && clear(other.from.x, one.from.x, one.to.x)
                && clear(one.from.y, other.from.y, other.to.y)
            {
                places.insert((one.line, other.line, place(other.from.x), place(one.from.y)));
            }
        }
    }
    places.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn point(x: f64, y: f64) -> Point {
        Point { x, y }
    }

    #[test]
    fn counts_each_pair_of_lines_once_at_each_place_they_cross() {
        let across = vec![point(0.0, 50.0), point(100.0, 50.0)];
        let down = vec![point(50.0, 0.0), point(50.0, 100.0)];
        let beside = vec![point(50.4, 0.0), point(50.4, 100.0)];
        assert_eq!(pair_crossings(&[across.clone(), down.clone()]), 1);
        // Two lines down one place cross the line across once each.
        assert_eq!(pair_crossings(&[across, down, beside]), 2);
        let touching = vec![point(0.0, 0.0), point(100.0, 0.0)];
        assert_eq!(
            pair_crossings(&[touching, vec![point(50.0, 0.0), point(50.0, 9.0)]]),
            0
        );
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
