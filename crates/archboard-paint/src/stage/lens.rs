//! What a frame in motion is seen through. A move is a rack of focus: what the
//! reader goes to stays sharp, and what they leave falls out of focus and sinks
//! into the ground. A picture at rest has no lens.

use archboard_scene::geometry::Rect;

use super::Stage;
use crate::canvas::{Focus, Lens};
use crate::flight::Dive;
use crate::presentation::Camera;
use crate::timing::{Curve, EMPHASISED};

/// The most a picture goes out of focus, as a share of the canvas's height.
const MOST_BLUR: f64 = 0.02;

/// How far the board round a card sinks into the ground as the reader flies in.
const MOST_SINK: f64 = 0.72;

/// A card's corners, in the picture's units.
const CARD_RADIUS: f64 = 10.0;

/// How far past a card's edge the focus goes, as a share of the canvas's height.
const CARD_SOFT: f64 = 0.03;

/// How soft the board round a door goes, as a share of the canvas's height.
const DOOR_BLUR: f64 = 0.006;

/// How far past a door's edge the focus goes, as a share of the canvas's height.
const DOOR_SOFT: f64 = 0.08;

/// The curve the focus goes on: slow to begin, and gone quickly.
const RACK: Curve = Curve(0.3, 0.0, 0.4, 1.0);

/// How far a value is between two points, from 0 to 1.
fn between(value: f64, start: f64, end: f64) -> f64 {
    ((value - start) / (end - start)).clamp(0.0, 1.0)
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

impl Dive {
    /// What the flight is seen through: the card in focus, the board round it
    /// falling away. Fades that need no blur are left to the picture.
    fn lens_at(&self, now: f64, camera: Camera, height: f64) -> Parts {
        let along = self.along(now);
        let shown = through(camera, self.card_box.unwrap_or(self.frame));
        Parts {
            focus: Some(Focus {
                place: shown,
                radius: CARD_RADIUS * camera.scale,
                soft: height * CARD_SOFT,
            }),
            blur: height * MOST_BLUR * RACK.at(between(along, 0.0, 0.42)),
            sink: MOST_SINK * RACK.at(between(along, 0.04, 0.5)),
        }
    }
}

/// A lens but for the ground.
struct Parts {
    focus: Option<Focus>,
    blur: f64,
    sink: f64,
}

/// What a door that opens is seen through: the door in focus, and the board
/// round it a little soft while it makes way.
fn door_lens(door: Rect, share: f64, height: f64) -> Parts {
    let swell = RACK.at(between(share, 0.0, 0.3)) * (1.0 - RACK.at(between(share, 0.6, 1.0)));
    Parts {
        focus: Some(Focus {
            place: door,
            radius: height * CARD_SOFT,
            soft: height * DOOR_SOFT,
        }),
        blur: height * DOOR_BLUR * swell,
        sink: 0.0,
    }
}

impl Stage {
    /// The focus of an entrance: a circle that opens from the middle of the
    /// picture, with the picture coming into focus inside it.
    fn entrance_lens(&self, share: f64, ghost: f64) -> Option<Parts> {
        let shown = self.shown.as_ref()?;
        let scene = &shown.picture.scene;
        let camera = self.presentation.camera;
        let (width, height) = self.size;
        let page = through(
            camera,
            Rect {
                x: 0.0,
                y: 0.0,
                width: scene.width,
                height: scene.height,
            },
        );
        let (x, y) = (page.x + page.width / 2.0, page.y + page.height / 2.0);
        let reach = page.width.hypot(page.height).max(width.min(height)) / 2.0;
        let radius = reach * 1.5 * EMPHASISED.at(between(share, 0.0, 0.86));
        let soft = reach * 0.6;
        let blur = height * MOST_BLUR * (1.0 - between(share, 0.5, 0.92)).max(ghost);
        Some(Parts {
            focus: Some(Focus {
                place: Rect {
                    x: x - radius,
                    y: y - radius,
                    width: radius * 2.0,
                    height: radius * 2.0,
                },
                radius,
                soft,
            }),
            blur,
            sink: 0.0,
        })
    }

    /// What the frame of a moment is seen through, if anything.
    pub(super) fn lens_at(&self, now: f64) -> Option<Lens> {
        let shown = self.shown.as_ref()?;
        let height = self.size.1;
        let camera = self.presentation.camera;
        let ghost = self
            .ghost
            .as_ref()
            .map_or(0.0, |ghost| 1.0 - ghost.gone_by(now));
        let parts = if let Some(dive) = self.dive.as_ref().filter(|dive| !dive.ended(now)) {
            dive.lens_at(now, camera, height)
        } else if let Some(share) = self.flight.as_ref().and_then(|flight| flight.entering(now)) {
            self.entrance_lens(share, ghost)?
        } else if let Some(opening) = self.flight.as_ref().and_then(|flight| flight.opening(now)) {
            door_lens(
                through(camera, opening),
                self.flight.as_ref()?.share(now),
                height,
            )
        } else if let Some(leaving) = &self.leaving {
            Parts {
                focus: None,
                blur: height * MOST_BLUR * RACK.at(leaving.progress(now)),
                sink: 0.0,
            }
        } else {
            return None;
        };
        (parts.blur > 0.0 || parts.sink > 0.0).then(|| Lens {
            focus: parts.focus,
            blur: parts.blur,
            sink: parts.sink,
            ground: self.palette.colour(&shown.picture.scene.background, 1.0),
        })
    }
}
