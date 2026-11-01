//! What a frame in motion is seen through. A move is a rack of focus: what the
//! reader goes to stays sharp, and what they leave falls out of focus and sinks
//! into the ground. A picture at rest has no lens.

use std::f64::consts::PI;

use archboard_scene::geometry::Rect;
use archboard_scene::scene::Scene;
use peniko::Color;

use super::Stage;
use crate::between::phase;
use crate::canvas::{Focus, Lens};
use crate::flight::Dive;
use crate::passage::Axis;
use crate::path::rect_of;
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

/// The parts of a passage out of a board that the board arrived at falls out of
/// focus over and comes back over.
const OUT_FALLS: (f64, f64) = (0.0, 0.2);
const OUT_RETURNS: (f64, f64) = (0.4, 0.98);

/// How soft the two boards go at the middle of a sideways passage, as a share of
/// the canvas's height.
const ACROSS_BLUR: f64 = 0.003;

/// How long a frame's shutter stands open, in milliseconds. A moving frame
/// smears by as far as it goes in this time.
const SHUTTER_MS: f64 = 8.0;

/// How far the focus of an entrance opens past the picture, and how soft its
/// edge is, as shares of the reach from the picture's middle to its corner.
const OPENS_TO: f64 = 1.5;
const OPENING_SOFT: f64 = 0.6;

/// The part of an entrance that its focus opens over, and the part its last
/// softness goes over.
const ENTRANCE_OPENS: (f64, f64) = (0.0, 0.86);
const ENTRANCE_CLEARS: (f64, f64) = (0.5, 0.92);

/// The part of an entrance that the picture before it racks out of focus over.
/// It goes on from where the picture stood when the next one arrived.
const GHOST_RACKS: (f64, f64) = (0.0, 0.16);

/// The curve the focus goes on: slow to begin, and gone quickly.
const RACK: Curve = Curve(0.3, 0.0, 0.4, 1.0);

/// The curve at a place in a part of a move.
fn racked(place: f64, (start, end): (f64, f64)) -> f64 {
    RACK.at(phase(place, start, end))
}

/// The whole of a scene.
fn page_of(scene: &Scene) -> Rect {
    Rect {
        x: 0.0,
        y: 0.0,
        width: scene.width,
        height: scene.height,
    }
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
        smear: 0.0,
    }
}

/// What a passage is seen through. Along the strip of boards the frame smears
/// with its speed, and a little softness joins the two boards. Along the axis of
/// depth the nearer board stays sharp and the board behind it falls away, so
/// going in holds the board arrived at, and going out the board left.
fn passage_lens((axis, place): (Axis, f64), near: Rect, speed: f64, height: f64) -> Lens {
    let radius = height * CARD_SOFT;
    let in_focus = Focus {
        place: near,
        radius,
        soft: radius,
    };
    match axis {
        Axis::Across { .. } => Lens {
            focus: None,
            blur: height * ACROSS_BLUR * (place * PI).sin(),
            sink: 0.0,
            smear: axis.sideways(speed),
        },
        Axis::In(_) => Lens {
            focus: Some(in_focus),
            blur: height * MOST_BLUR * racked(place, FLIGHT_BLURS),
            sink: MOST_SINK * racked(place, FLIGHT_SINKS),
            smear: 0.0,
        },
        Axis::Out(_) => {
            let swell = racked(place, OUT_FALLS) * (1.0 - racked(place, OUT_RETURNS));
            Lens {
                focus: Some(in_focus),
                blur: height * MOST_BLUR * swell,
                sink: MOST_SINK * swell,
                smear: 0.0,
            }
        }
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
        smear: 0.0,
    }
}

/// What is left of the last picture as an entrance sees it.
#[derive(Clone, Copy)]
struct Before {
    /// How far out of focus it stood when the entrance began, from 0 to 1.
    racked: f64,
    /// How much of its end is left, from 0 to 1.
    left: f64,
}

/// What an entrance is seen through: a circle that opens from the middle of the
/// picture, with the picture coming into focus inside it. What is left of the
/// last picture holds the rest out of focus until it has gone. A picture with
/// nothing before it has nothing to rack from.
fn entrance_lens(
    page: Rect,
    share: f64,
    before: Option<Before>,
    (width, height): (f64, f64),
) -> Lens {
    let (x, y) = (page.x + page.width / 2.0, page.y + page.height / 2.0);
    let reach = page.width.hypot(page.height).max(width.min(height)) / 2.0;
    let radius = reach * OPENS_TO * EMPHASISED.at(phase(share, ENTRANCE_OPENS.0, ENTRANCE_OPENS.1));
    let clearing = 1.0 - phase(share, ENTRANCE_CLEARS.0, ENTRANCE_CLEARS.1);
    let soft = before.map_or(clearing, |before| {
        let racks = before.racked + (1.0 - before.racked) * racked(share, GHOST_RACKS);
        racks * clearing.max(before.left)
    });
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
        blur: height * MOST_BLUR * soft,
        sink: 0.0,
        smear: 0.0,
    }
}

impl Stage {
    /// Where the reader is on a passage at a moment, if on one, and how much of
    /// the way a shutter's time at that moment covers.
    fn passage_at(&self, now: f64) -> Option<((Axis, f64), f64)> {
        let at = |moment: f64| {
            let ghost = self.ghost.as_ref().and_then(|ghost| ghost.passage(moment));
            ghost.or_else(|| self.leaving.as_ref()?.passage(moment))
        };
        let passage = at(now)?;
        let before = at(now - SHUTTER_MS).map_or(passage.1, |(_, place)| place);
        Some((passage, passage.1 - before))
    }

    /// What a passage is seen through at a moment, if one runs. The nearer board
    /// is the one the reader leaves on the way out, and the one they go to on the
    /// way in.
    fn passage_lens_at(&self, now: f64) -> Option<Lens> {
        let ((axis, place), speed) = self.passage_at(now)?;
        let last = self.ghost.as_ref().filter(|ghost| ghost.axis.is_some());
        let leaves = matches!(axis, Axis::Out(_));
        let (scene, camera, plane) = match last.filter(|_| leaves) {
            Some(ghost) => (&ghost.picture.scene, ghost.camera, axis.left(place)),
            None => (
                &self.shown.as_ref()?.picture.scene,
                self.presentation.camera,
                if leaves {
                    axis.left(place)
                } else {
                    axis.arrived(place)
                },
            ),
        };
        let seen = plane
            .transform
            .transform_rect_bbox(rect_of(&through(camera, page_of(scene))));
        let near = Rect {
            x: seen.x0,
            y: seen.y0,
            width: seen.width(),
            height: seen.height(),
        };
        Some(passage_lens((axis, place), near, speed, self.size.1))
    }

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
        let page = page_of(scene);
        let lens = if let Some(dive) = flying {
            flight_lens(dive, now, camera, height)
        } else if let Some(lens) = self.passage_lens_at(now) {
            lens
        } else if let Some(share) = entrance {
            let before = self.ghost.as_ref().map(|ghost| Before {
                racked: RACK.at(ghost.from),
                left: 1.0 - ghost.gone_by(now),
            });
            entrance_lens(through(camera, page), share, before, self.size)
        } else if let Some((box_at, share)) = door {
            door_lens(through(camera, box_at), share, height)
        } else {
            Lens {
                focus: None,
                blur: height * MOST_BLUR * RACK.at(self.leaving.as_ref()?.progress(now)),
                sink: 0.0,
                smear: 0.0,
            }
        };
        (lens.blur > 0.0 || lens.sink > 0.0 || lens.smear > 0.0)
            .then(|| (lens, self.palette.colour(&scene.background, 1.0)))
    }
}
