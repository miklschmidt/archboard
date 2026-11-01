//! Turning one drawn route into another, as arithmetic.
//!
//! Both routes are read into the one shape every step can be written as, a
//! chain of cubic segments. The shorter chain is cut until the two have the
//! same number of segments, and then every point is a straight interpolation.
//! A cubic interpolated pointwise is still a cubic, which keeps the corners
//! round in flight.

use archboard_scene::geometry::Point;
use archboard_scene::scene::{Geometry, PathStep};
use kurbo::{CubicBez, ParamCurve as _, PathEl};

use crate::path::path_of;

/// How finely a cubic is walked when its length is wanted.
const LENGTH_STEPS: u8 = 16;

/// A route as one chain of cubics, and whether the source closed it.
#[derive(Clone, Debug, PartialEq)]
struct Chain {
    segments: Vec<CubicBez>,
    closed: bool,
}

/// The steps of a geometry that draws a route, when it draws one.
pub(super) fn route_of(geometry: &Geometry) -> Option<Vec<PathStep>> {
    match geometry {
        Geometry::Path { steps } => Some(steps.clone()),
        Geometry::Line { from, to } => Some(vec![
            PathStep::Move { to: *from },
            PathStep::Line { to: *to },
        ]),
        Geometry::Rect { .. } | Geometry::Circle { .. } => None,
    }
}

/// A straight leg as the cubic that draws exactly that line.
fn leg(from: kurbo::Point, to: kurbo::Point) -> CubicBez {
    CubicBez::new(from, from.lerp(to, 1.0 / 3.0), from.lerp(to, 2.0 / 3.0), to)
}

impl Chain {
    /// Read a route. A route with several pieces is not one this carries.
    fn of(steps: &[PathStep]) -> Option<Chain> {
        let path = path_of(steps);
        let mut segments = Vec::new();
        let (mut start, mut at) = (None, kurbo::Point::ZERO);
        let mut closed = false;
        for element in path.elements() {
            if closed {
                return None;
            }
            match *element {
                PathEl::MoveTo(to) if start.is_none() => {
                    start = Some(to);
                    at = to;
                    continue;
                }
                PathEl::MoveTo(_) => return None,
                PathEl::LineTo(to) => segments.push(leg(at, to)),
                PathEl::QuadTo(control, to) => {
                    segments.push(kurbo::QuadBez::new(at, control, to).raise());
                }
                PathEl::CurveTo(first, second, to) => {
                    segments.push(CubicBez::new(at, first, second, to));
                }
                PathEl::ClosePath => {
                    closed = true;
                    let to = start?;
                    if to != at {
                        segments.push(leg(at, to));
                    }
                }
            }
            at = segments.last()?.p3;
        }
        (!segments.is_empty()).then_some(Chain { segments, closed })
    }

    /// The chain in more segments, the longest cut in half each time.
    ///
    /// Cutting the longest keeps the added anchors spread along the line, so
    /// when the other chain's anchors are interpolated against them nothing
    /// bunches up at one end.
    fn refined(mut self, count: usize) -> Chain {
        while self.segments.len() < count {
            let longest = self.segments.iter().map(length_of).enumerate().fold(
                (0, -1.0),
                |best, (index, length)| {
                    if length > best.1 {
                        (index, length)
                    } else {
                        best
                    }
                },
            );
            let (first, second) = self.segments[longest.0].subdivide();
            self.segments.splice(longest.0..=longest.0, [first, second]);
        }
        self
    }

    /// The chain some way between two of the same length.
    fn between(&self, other: &Chain, t: f64) -> Chain {
        let mix = |a: kurbo::Point, b: kurbo::Point| a.lerp(b, t);
        Chain {
            closed: other.closed,
            segments: self
                .segments
                .iter()
                .zip(&other.segments)
                .map(|(a, b)| {
                    CubicBez::new(
                        mix(a.p0, b.p0),
                        mix(a.p1, b.p1),
                        mix(a.p2, b.p2),
                        mix(a.p3, b.p3),
                    )
                })
                .collect(),
        }
    }

    /// The chain as steps: a move, then a cubic for each segment.
    fn steps(&self) -> Vec<PathStep> {
        let point = |p: kurbo::Point| Point { x: p.x, y: p.y };
        let mut steps = vec![PathStep::Move {
            to: point(self.segments[0].p0),
        }];
        steps.extend(self.segments.iter().map(|segment| PathStep::Cubic {
            first: point(segment.p1),
            second: point(segment.p2),
            to: point(segment.p3),
        }));
        if self.closed {
            steps.push(PathStep::Close);
        }
        steps
    }
}

/// How long a cubic is, near enough: the polyline through sixteen points of it.
fn length_of(segment: &CubicBez) -> f64 {
    let mut previous = segment.p0;
    let mut total = 0.0;
    for step in 1..=LENGTH_STEPS {
        let next = segment.eval(f64::from(step) / f64::from(LENGTH_STEPS));
        total += (next - previous).hypot();
        previous = next;
    }
    total
}

/// How long a route is, for drawing it on from one end.
pub(super) fn length(steps: &[PathStep]) -> Option<f64> {
    Chain::of(steps).map(|chain| chain.segments.iter().map(length_of).sum())
}

/// A route on its way to another.
#[derive(Clone, Debug, PartialEq)]
pub(super) struct Morph {
    from: Vec<PathStep>,
    to: Vec<PathStep>,
    left: Chain,
    right: Chain,
}

impl Morph {
    /// The morph between two routes: none when they are one route, or when
    /// either is not one this carries.
    pub(super) fn new(from: &[PathStep], to: &[PathStep]) -> Option<Morph> {
        if from == to {
            return None;
        }
        let (left, right) = (Chain::of(from)?, Chain::of(to)?);
        let count = left.segments.len().max(right.segments.len());
        Some(Morph {
            from: from.to_vec(),
            to: to.to_vec(),
            left: left.refined(count),
            right: right.refined(count),
        })
    }

    /// The route this far along. It is exact at both ends: the first route as
    /// it was given at 0 and the second at 1.
    pub(super) fn at(&self, t: f64) -> Vec<PathStep> {
        if t <= 0.0 {
            self.from.clone()
        } else if t >= 1.0 {
            self.to.clone()
        } else {
            self.left.between(&self.right, t).steps()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{Morph, length};
    use archboard_scene::geometry::Point;
    use archboard_scene::scene::PathStep;

    fn at(x: f64, y: f64) -> Point {
        Point { x, y }
    }

    fn run(points: &[(f64, f64)]) -> Vec<PathStep> {
        let mut steps = vec![PathStep::Move {
            to: at(points[0].0, points[0].1),
        }];
        steps.extend(
            points[1..]
                .iter()
                .map(|&(x, y)| PathStep::Line { to: at(x, y) }),
        );
        steps
    }

    fn end_of(steps: &[PathStep]) -> Point {
        match steps.last() {
            Some(PathStep::Cubic { to, .. } | PathStep::Line { to }) => *to,
            other => panic!("a route ends in a leg, not {other:?}"),
        }
    }

    #[test]
    fn routes_of_different_lengths_meet_in_the_middle() {
        let short = run(&[(0.0, 0.0), (100.0, 0.0)]);
        let long = run(&[(0.0, 100.0), (50.0, 100.0), (50.0, 150.0), (100.0, 150.0)]);
        let morph = Morph::new(&short, &long).expect("both are routes");
        assert_eq!(morph.at(0.0), short);
        assert_eq!(morph.at(1.0), long);
        let half = morph.at(0.5);
        assert_eq!(half.len(), 4, "a move and the longer route's three legs");
        let end = end_of(&half);
        assert!((end.x - 100.0).abs() < 1e-9 && (end.y - 75.0).abs() < 1e-9);
    }

    #[test]
    fn one_route_has_no_morph_and_a_route_of_pieces_has_none_either() {
        let line = run(&[(0.0, 0.0), (10.0, 0.0)]);
        assert!(Morph::new(&line, &line).is_none());
        let pieces = vec![
            PathStep::Move { to: at(0.0, 0.0) },
            PathStep::Line { to: at(5.0, 0.0) },
            PathStep::Move { to: at(8.0, 8.0) },
            PathStep::Line { to: at(9.0, 9.0) },
        ];
        assert!(Morph::new(&line, &pieces).is_none());
    }

    #[test]
    fn a_straight_route_is_as_long_as_it_looks() {
        let measured = length(&run(&[(0.0, 0.0), (30.0, 40.0)])).expect("a route");
        assert!((measured - 50.0).abs() < 1e-9);
    }
}
