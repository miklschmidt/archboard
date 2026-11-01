//! What a frame in motion is seen through. A move is a rack of focus: what the
//! reader goes to stays sharp, and what they leave falls out of focus and sinks
//! into the ground. A picture at rest has no lens.

use archboard_scene::geometry::Rect;
use peniko::Color;

use super::Stage;
use crate::between::phase;
use crate::canvas::{Focus, Lens};
use crate::flight::Dive;
use crate::presentation::Camera;
use crate::timing::{Curve, EMPHASISED};

/// The most a picture goes out of focus, as a share of the canvas's height.
const MOST_BLUR: f64 = 0.02;

/// How soft the board round a door goes, as a share of the canvas's height. The
/// reader goes on reading this board, so it stays near.
const DOOR_BLUR: f64 = 0.006;

/// How far the board round a card sinks into the ground as the reader flies in.
const MOST_SINK: f64 = 0.72;

/// A card's corners, in the picture's units.
const CARD_RADIUS: f64 = 10.0;

/// How far past a card's edge the focus goes, as a share of the canvas's height.
const CARD_SOFT: f64 = 0.03;

/// How far past a door's edge the focus goes, as a share of the canvas's height.
const DOOR_SOFT: f64 = 0.08;

/// The part of a flight that the board round the card falls out of focus over,
/// and the part it sinks over. Both are places on the camera's path.
const FLIGHT_BLURS: (f64, f64) = (0.0, 0.42);
const FLIGHT_SINKS: (f64, f64) = (0.04, 0.5);

/// The parts of a door's move that the board softens over and comes back over.
const DOOR_SOFTENS: (f64, f64) = (0.0, 0.3);
const DOOR_RETURNS: (f64, f64) = (0.6, 1.0);

/// How far the focus of an entrance opens past the picture, and how soft its
/// edge is, as shares of the reach from the picture's middle to its corner.
const OPENS_TO: f64 = 1.5;
const OPENING_SOFT: f64 = 0.6;

/// The part of an entrance that its focus opens over, and the part its last
/// softness goes over.
const ENTRANCE_OPENS: (f64, f64) = (0.0, 0.86);
const ENTRANCE_CLEARS: (f64, f64) = (0.5, 0.92);

/// The curve the focus goes on: slow to begin, and gone quickly.
const RACK: Curve = Curve(0.3, 0.0, 0.4, 1.0);

/// The curve at a place in a part of a move.
fn racked(place: f64, (start, end): (f64, f64)) -> f64 {
    RACK.at(phase(place, start, end))
}

/// A box of the picture as a camera shows it.
fn through(camera: Camera, frame: Rect) -> Rect {
    Rect {
        x: frame.x * camera.scale + camera.x,
        y: frame.y * camera.scale + camera.y,
        width: frame.width * camera.scale,
        height: frame.height * camera.scale,
    }
}

/// What a flight is seen through: the card in focus, and the board round it
/// falling away.
fn flight_lens(dive: &Dive, now: f64, camera: Camera, height: f64) -> Lens {
    let along = dive.along(now);
    Lens {
        focus: Some(Focus {
            place: through(camera, dive.card_box.unwrap_or(dive.frame)),
            radius: CARD_RADIUS * camera.scale,
            soft: height * CARD_SOFT,
        }),
        blur: height * MOST_BLUR * racked(along, FLIGHT_BLURS),
        sink: MOST_SINK * racked(along, FLIGHT_SINKS),
    }
}

/// What a door that opens is seen through: the door in focus, and the board
/// round it a little soft while it makes way.
fn door_lens(door: Rect, share: f64, height: f64) -> Lens {
    let swell = racked(share, DOOR_SOFTENS) * (1.0 - racked(share, DOOR_RETURNS));
    Lens {
        focus: Some(Focus {
            place: door,
            radius: height * CARD_SOFT,
            soft: height * DOOR_SOFT,
        }),
        blur: height * DOOR_BLUR * swell,
        sink: 0.0,
    }
}

/// What an entrance is seen through: a circle that opens from the middle of the
/// picture, with the picture coming into focus inside it. What is left of the
/// last picture holds the rest out of focus until it has gone.
fn entrance_lens(page: Rect, share: f64, left: f64, (width, height): (f64, f64)) -> Lens {
    let (x, y) = (page.x + page.width / 2.0, page.y + page.height / 2.0);
    let reach = page.width.hypot(page.height).max(width.min(height)) / 2.0;
    let radius = reach * OPENS_TO * EMPHASISED.at(phase(share, ENTRANCE_OPENS.0, ENTRANCE_OPENS.1));
    let soft = 1.0 - phase(share, ENTRANCE_CLEARS.0, ENTRANCE_CLEARS.1);
    Lens {
        focus: Some(Focus {
            place: Rect {
                x: x - radius,
                y: y - radius,
                width: radius * 2.0,
                height: radius * 2.0,
            },
            radius,
            soft: reach * OPENING_SOFT,
        }),
        blur: height * MOST_BLUR * soft.max(left),
        sink: 0.0,
    }
}

impl Stage {
    /// What the frame of a moment is seen through, and the ground the picture
    /// sinks into, if anything. A flight comes first, then a picture's arrival,
    /// then a picture on its way out.
    pub(super) fn lens_at(&self, now: f64) -> Option<(Lens, Color)> {
        let scene = &self.shown.as_ref()?.picture.scene;
        let camera = self.presentation.camera;
        let height = self.size.1;
        let flying = self.dive.as_ref().filter(|dive| !dive.ended(now));
        let entrance = self.flight.as_ref().and_then(|flight| flight.entering(now));
        let door = self.flight.as_ref().and_then(|flight| flight.opening(now));
        let lens = if let Some(dive) = flying {
            flight_lens(dive, now, camera, height)
        } else if let Some(share) = entrance {
            let page = Rect {
                x: 0.0,
                y: 0.0,
                width: scene.width,
                height: scene.height,
            };
            let left = self
                .ghost
                .as_ref()
                .map_or(0.0, |ghost| 1.0 - ghost.gone_by(now));
            entrance_lens(through(camera, page), share, left, self.size)
        } else if let Some((box_at, share)) = door {
            door_lens(through(camera, box_at), share, height)
        } else {
            Lens {
                focus: None,
                blur: height * MOST_BLUR * RACK.at(self.leaving.as_ref()?.progress(now)),
                sink: 0.0,
            }
        };
        (lens.blur > 0.0 || lens.sink > 0.0)
            .then(|| (lens, self.palette.colour(&scene.background, 1.0)))
    }
}
