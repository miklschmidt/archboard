//! A move between two pictures, as the reader's place in the module tree says it.
//!
//! The modules nest, so the pictures stand at depths. A picture at the same depth
//! stands beside this one, so the reader is carried sideways along a strip of
//! pictures. A deeper picture stands inside this one and a shallower picture round it,
//! so the reader moves along one axis of depth. Either way there are two planes
//! on one timeline, the picture left and the picture arrived at, and one number says
//! where the reader is between them. Nothing about a plane is staged by itself,
//! so the two can never drift apart.

use kurbo::{Affine, Point};
use serde::Deserialize;
use std::f64::consts::PI;

use crate::between::phase;
use crate::timing::{EASE_OUT, EMPHASISED};

/// Which way along the strip of pictures the reader travels.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    /// To a picture earlier in the module tree.
    Left,
    /// To a picture later in the module tree.
    Right,
}

impl Side {
    /// The sign of the reader's way across the canvas.
    fn sign(self) -> f64 {
        match self {
            Side::Left => -1.0,
            Side::Right => 1.0,
        }
    }
}

/// How much further in one picture stands than the next, as a scale.
const ONE_LEVEL: f64 = 2.6;

/// How much further than the edge of the canvas a picture goes, so that it has gone
/// before the slow end of the move.
const CLEAR: f64 = 1.08;

/// How far the planes pull back at the middle of a sideways move, so that the
/// reader is lifted and set down and does not skid.
const LIFT: f64 = 0.08;

/// Where the reader stands once a picture has answered a click, before the next
/// picture is there: a small part of the whole passage, so the picture answers at
/// once and the passage runs on from that place.
const FIRST_STEP: f64 = 0.05;

/// A picture's place on a passage, as the canvas shows it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Plane {
    /// What the plane does to the picture, on top of the camera.
    pub(crate) transform: Affine,
    /// How much of the picture shows.
    pub(crate) shown: f64,
}

impl Plane {
    /// A plane that does nothing.
    pub(crate) const STILL: Plane = Plane {
        transform: Affine::IDENTITY,
        shown: 1.0,
    };
}

/// How a scale about a point moves the canvas.
fn scaled_about(about: Point, scale: f64) -> Affine {
    Affine::translate(about.to_vec2()) * Affine::scale(scale) * Affine::translate(-about.to_vec2())
}

/// A smooth rise over a part of the way.
fn rising(place: f64, start: f64, end: f64) -> f64 {
    let t = phase(place, start, end);
    t * t * (3.0 - 2.0 * t)
}

/// The line a passage runs along.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Axis {
    /// Along the strip of pictures.
    Across {
        /// Which way, as a sign.
        sign: f64,
        /// The canvas's middle.
        middle: Point,
        /// How far one picture stands from the next.
        reach: f64,
    },
    /// Into the picture, about a point of the canvas.
    In(Point),
    /// Out of the picture, about a point of the canvas.
    Out(Point),
}

impl Axis {
    /// The line along the strip of pictures of a canvas of a size. The pictures stand
    /// as near as lets the widest of them clear the canvas, so that the next picture
    /// is in sight before the last has gone.
    pub(crate) fn across(side: Side, (width, height): (f64, f64), widest: f64) -> Axis {
        Axis::Across {
            sign: side.sign(),
            middle: Point::new(width / 2.0, height / 2.0),
            reach: CLEAR * (width + widest.min(width)) / 2.0,
        }
    }

    /// Where a place on this line stands on the next one, so that a picture that
    /// goes from one line to the other does not jump.
    pub(crate) fn place_on(self, next: Axis, place: f64) -> f64 {
        match (self, next) {
            (Axis::Across { reach: from, .. }, Axis::Across { reach: to, .. }) => place * from / to,
            _ => place,
        }
    }

    /// How far a share of the way carries a frame sideways, in canvas pixels.
    pub(crate) fn sideways(self, share: f64) -> f64 {
        match self {
            Axis::Across { reach, .. } => reach * share,
            Axis::In(_) | Axis::Out(_) => 0.0,
        }
    }

    /// The picture left, at a place on the passage.
    pub(crate) fn left(self, place: f64) -> Plane {
        match self {
            Axis::Across {
                sign,
                middle,
                reach,
            } => Plane {
                transform: Affine::translate((-sign * reach * place, 0.0))
                    * scaled_about(middle, lift_at(place)),
                shown: 1.0,
            },
            Axis::In(about) => Plane {
                transform: scaled_about(about, ONE_LEVEL.powf(place)),
                shown: 1.0 - rising(place, 0.12, 0.6),
            },
            Axis::Out(about) => Plane {
                transform: scaled_about(about, ONE_LEVEL.powf(-place)),
                shown: 1.0 - rising(place, 0.22, 0.62),
            },
        }
    }

    /// The picture arrived at, at a place on the passage.
    pub(crate) fn arrived(self, place: f64) -> Plane {
        match self {
            Axis::Across {
                sign,
                middle,
                reach,
            } => Plane {
                transform: Affine::translate((sign * reach * (1.0 - place), 0.0))
                    * scaled_about(middle, lift_at(place)),
                shown: 1.0,
            },
            Axis::In(about) => Plane {
                transform: scaled_about(about, ONE_LEVEL.powf(place - 1.0)),
                shown: rising(place, 0.16, 0.66),
            },
            Axis::Out(about) => Plane {
                transform: scaled_about(about, ONE_LEVEL.powf(1.0 - place)),
                shown: rising(place, 0.12, 0.62),
            },
        }
    }
}

/// How far the planes stand back at a place on a sideways passage.
fn lift_at(place: f64) -> f64 {
    1.0 - LIFT * (place * PI).sin()
}

/// How far the reader has stepped when only the picture left has answered, by a
/// share of that first step's time.
pub(crate) fn first_step(progress: f64) -> f64 {
    FIRST_STEP * EASE_OUT.at(progress)
}

/// How far the reader is on a passage that started at a place, at a share of its
/// time.
pub(crate) fn place_at(from: f64, share: f64) -> f64 {
    from + (1.0 - from) * EMPHASISED.at(share)
}

#[cfg(test)]
mod tests {
    use kurbo::Point;

    use super::{Axis, Plane, Side, first_step, place_at};

    const SIZE: (f64, f64) = (1000.0, 500.0);
    const ABOUT: Point = Point::new(300.0, 200.0);

    /// Where a plane puts a point.
    fn seen(plane: Plane, point: Point) -> Point {
        plane.transform * point
    }

    #[test]
    fn a_picture_at_the_same_depth_stands_along_the_way_the_reader_goes_and_clears_the_canvas() {
        let right = Axis::across(Side::Right, SIZE, 400.0);
        let point = Point::new(500.0, 250.0);
        assert!(seen(right.arrived(0.0), point).x > 1200.0);
        assert!(seen(right.left(1.0), point).x < -200.0);
        assert_eq!(seen(right.arrived(1.0), point).x, 500.0);
        let left = Axis::across(Side::Left, SIZE, 400.0);
        assert!(seen(left.arrived(0.0), point).x < -200.0);
    }

    #[test]
    fn the_two_pictures_keep_their_distance_the_whole_way() {
        let axis = Axis::across(Side::Right, SIZE, 400.0);
        let point = Point::new(500.0, 250.0);
        for place in [0.0, 0.3, 0.5, 0.9, 1.0] {
            let gap = seen(axis.arrived(place), point).x - seen(axis.left(place), point).x;
            assert!((gap - 756.0).abs() < 1e-9);
        }
    }

    #[test]
    fn a_picture_keeps_its_place_when_the_next_picture_widens_the_strip() {
        let first = Axis::across(Side::Right, SIZE, 400.0);
        let next = Axis::across(Side::Right, SIZE, 800.0);
        let point = Point::new(500.0, 250.0);
        let place = first.place_on(next, 0.1);
        assert!((seen(next.left(place), point).x - seen(first.left(0.1), point).x).abs() < 1e-1);
    }

    #[test]
    fn a_deeper_picture_starts_unseen_far_inside_and_ends_at_rest() {
        let axis = Axis::In(ABOUT);
        assert_eq!(axis.arrived(0.0).shown, 0.0);
        assert!(axis.arrived(0.0).transform.determinant() < 1.0);
        assert_eq!(axis.arrived(1.0), Plane::STILL);
        assert_eq!(axis.left(1.0).shown, 0.0);
    }

    #[test]
    fn both_pictures_grow_as_one_on_the_way_in() {
        let axis = Axis::In(ABOUT);
        let growth = |plane: Plane| plane.transform.determinant();
        assert!(growth(axis.left(0.4)) > growth(axis.arrived(0.4)));
        assert!(growth(axis.left(0.6)) > growth(axis.left(0.4)));
    }

    #[test]
    fn a_shallower_picture_stands_round_the_picture_left_and_both_shrink_as_one() {
        let axis = Axis::Out(ABOUT);
        assert!(
            axis.arrived(0.0).transform.determinant() > 1.0,
            "it stands round the reader"
        );
        assert_eq!(axis.arrived(1.0), Plane::STILL);
        assert!(axis.left(0.6).transform.determinant() < axis.left(0.4).transform.determinant());
        assert_eq!(axis.left(1.0).shown, 0.0);
    }

    #[test]
    fn a_passage_runs_on_from_the_step_the_click_took() {
        let step = first_step(1.0);
        assert!(step > 0.0 && step < 0.1);
        assert_eq!(place_at(step, 0.0), step);
        assert_eq!(place_at(step, 1.0), 1.0);
    }
}
