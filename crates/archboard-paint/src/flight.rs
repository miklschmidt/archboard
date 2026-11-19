//! What moves a whole picture: a picture arriving, carried from the last one or
//! part by part, a picture leaving, the ghost of one that left, and the picture
//! inside a card that the camera flies into. Each holds what it needs from its
//! start and answers for a moment of the host's clock.

use archboard_scene::geometry::Rect;
use archboard_scene::scene::{Item, Scene, Transform, Viewport};
use serde::Deserialize;

use crate::between::{Between, Focus, departing};
use crate::definitions::Definitions;
use crate::draw::Picture;
use crate::passage::{Axis, Heading, Plane, first_step, place_at};
use crate::presentation::{Camera, Seen};
use crate::timing::{EASE_IN_OUT, EASE_OUT, EMPHASISED};

/// How far through a stretch of time a moment is, from 0 to 1.
fn share(now: f64, start: f64, ms: f64) -> f64 {
    if ms <= 0.0 {
        1.0
    } else {
        ((now - start) / ms).clamp(0.0, 1.0)
    }
}

/// A stretch of time that starts with the first frame drawn of it, so that the
/// work of getting a picture up does not eat the start of its move.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Stretch {
    start: Option<f64>,
    ms: f64,
}

impl Stretch {
    /// A stretch of a time in milliseconds, not yet begun.
    pub(crate) fn of(ms: f64) -> Stretch {
        Stretch { start: None, ms }
    }

    /// Start at a moment, unless it has started.
    pub(crate) fn begin(&mut self, now: f64) {
        self.start.get_or_insert(now);
    }

    /// How far through it a moment is, from 0 to 1.
    fn share(&self, now: f64) -> f64 {
        share(now, self.start.unwrap_or(now), self.ms)
    }

    /// When it ends, if it starts by a moment.
    fn end(&self, now: f64) -> f64 {
        self.start.unwrap_or(now) + self.ms
    }
}

/// A picture on its way in: a move into it, and the time the move takes.
#[derive(Debug)]
pub(crate) struct Arriving {
    between: Between,
    /// The definitions a carry draws with, the moving masks put in each frame.
    definitions: Option<Definitions>,
    time: Stretch,
}

impl Arriving {
    /// A move into a picture that takes some milliseconds for each share of it.
    pub(crate) fn new(between: Between, ms: f64) -> Arriving {
        Arriving {
            definitions: between.definitions().map(Definitions::listed),
            time: Stretch::of(ms * between.length()),
            between,
        }
    }

    /// An entrance that went on inside a card and has landed, so that its sparks
    /// run on over the picture that took over.
    pub(crate) fn landed_from(bloom: Between, ms: f64, now: f64) -> Option<Arriving> {
        let length = bloom.length();
        (length > 1.0).then_some(Arriving {
            definitions: None,
            time: Stretch {
                start: Some(now - ms),
                ms: ms * length,
            },
            between: bloom,
        })
    }

    /// The box of the tray the last picture leaves inside, when it has one.
    pub(crate) fn holder_at(&self, now: f64) -> Option<Rect> {
        self.between.holder_at(self.progress(now))
    }

    /// Tell the move how the ghost's picture maps onto the one that comes in.
    pub(crate) fn rebase(&mut self, ghost: Camera, camera: Camera) {
        self.between.rebase(Transform {
            x: (ghost.x - camera.x) / camera.scale,
            y: (ghost.y - camera.y) / camera.scale,
            scale: Some(ghost.scale / camera.scale),
        });
    }

    /// Start at the moment of the first frame.
    pub(crate) fn begin(&mut self, now: f64) {
        self.time.begin(now);
    }

    /// How far through the move a moment is, as a share of the time of its
    /// move: past 1 while a spark runs on.
    fn progress(&self, now: f64) -> f64 {
        self.time.share(now) * self.between.length()
    }

    /// Whether the picture has landed by a moment.
    pub(crate) fn landed(&self, now: f64) -> bool {
        self.time.share(now) >= 1.0
    }

    /// What the move shows at a moment.
    pub(crate) fn items(&mut self, now: f64) -> Vec<Item> {
        let (items, masks) = self.between.at(self.progress(now));
        if let Some(definitions) = &mut self.definitions {
            definitions.replace_masks(masks);
        }
        items
    }

    /// What the move shows at a moment as a scene, and how far back of its
    /// place it stands. `landed` is the picture the move lands on.
    pub(crate) fn seen_at(&self, now: f64, landed: &Scene) -> (Scene, (f64, f64)) {
        self.between.seen_at(self.progress(now), landed)
    }

    /// What the move is about at a moment.
    pub(crate) fn focus(&self, now: f64) -> Option<Focus> {
        self.between.focus(self.progress(now))
    }

    /// The definitions that what the move shows refers to, when they are its own.
    pub(crate) fn definitions(&self) -> Option<&Definitions> {
        self.definitions.as_ref()
    }
}

/// The picture on the stage on its way out, while the next is drawn.
#[derive(Debug)]
pub(crate) struct Leaving {
    pub(crate) heading: Heading,
    /// The line of the passage it starts, when it starts one.
    pub(crate) axis: Option<Axis>,
    pub(crate) start: f64,
    pub(crate) ms: f64,
}

impl Ghost {
    /// Where the reader is on the passage at a moment, when the ghost is the
    /// picture left on one.
    pub(crate) fn passage(&self, now: f64) -> Option<(Axis, f64)> {
        let (axis, from) = self.axis?;
        Some((axis, place_at(from, self.time.share(now))))
    }

    /// How far through its end a moment is, from 0 to 1.
    pub(crate) fn gone_by(&self, now: f64) -> f64 {
        self.from + (1.0 - self.from) * self.time.share(now)
    }
}

impl Leaving {
    /// How far it has gone by a moment.
    pub(crate) fn progress(&self, now: f64) -> f64 {
        share(now, self.start, self.ms)
    }

    /// Where the reader is on the passage at a moment, when it starts one.
    pub(crate) fn passage(&self, now: f64) -> Option<(Axis, f64)> {
        self.axis.map(|axis| (axis, first_step(self.progress(now))))
    }
}

/// What is left of the last picture, finishing on the spot where it was seen,
/// over the picture arriving. The camera no longer moves it.
#[derive(Debug)]
pub(crate) struct Ghost {
    pub(crate) picture: Picture,
    pub(crate) camera: Camera,
    pub(crate) from: f64,
    pub(crate) time: Stretch,
    /// The line of the passage, and the place on it where the reader stood when
    /// the next picture arrived.
    pub(crate) axis: Option<(Axis, f64)>,
    /// The passage that was still bringing this picture in, if one was: the picture
    /// goes on along it as it leaves, so a change of mind has no stop in it.
    pub(crate) held: Option<(Axis, f64, Stretch)>,
    /// How the picture looked when it was last seen: it leaves in its own light.
    pub(crate) look: Seen,
}

impl Ghost {
    /// Whether the ghost is gone by a moment.
    pub(crate) fn gone(&self, now: f64) -> bool {
        self.time.share(now) >= 1.0
    }

    /// When a passage under way ends, if one is.
    pub(crate) fn passage_end(&self, now: f64) -> Option<f64> {
        self.axis.map(|_| self.time.end(now))
    }

    /// Where the passage that brought this picture in has taken it by a moment.
    pub(crate) fn held_at(&self, now: f64) -> Plane {
        self.held.map_or(Plane::STILL, |(axis, from, time)| {
            axis.arrived(place_at(from, time.share(now)))
        })
    }

    /// What the ghost shows at a moment.
    pub(crate) fn items(&self, now: f64) -> Vec<Item> {
        if self.axis.is_some() {
            return self.picture.scene.body.clone();
        }
        let rest = EASE_OUT.at(self.time.share(now));
        let progress = self.from + (1.0 - self.from) * rest;
        let scene = &self.picture.scene;
        departing(scene.body.clone(), (scene.width, scene.height), progress)
    }

    /// What the ghost shows at a moment, kept inside a box of a picture that a
    /// camera shows.
    pub(crate) fn items_inside(&self, now: f64, tray: Rect, camera: Camera) -> Vec<Item> {
        let ours = self.camera;
        let frame = Rect {
            x: (tray.x * camera.scale + camera.x - ours.x) / ours.scale,
            y: (tray.y * camera.scale + camera.y - ours.y) / ours.scale,
            width: tray.width * camera.scale / ours.scale,
            height: tray.height * camera.scale / ours.scale,
        };
        vec![Item::Viewport(Viewport {
            frame,
            view: frame,
            items: self.items(now),
        })]
    }
}

/// Which way a flight goes between a picture and the picture inside its card.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DiveWay {
    /// Into the card.
    In,
    /// Back out of it.
    Out,
}

/// Opacity at points of the flight into a card, from 0 to 1, in order.
type Stops = [(f64, f64); 4];

/// What a card says goes first, so the picture inside it is not read through its label.
const WORDS: Stops = [(0.0, 1.0), (0.03, 1.0), (0.16, 0.0), (1.0, 0.0)];

/// The picture above stays until the picture inside can be made out.
const PARENT: Stops = [(0.0, 1.0), (0.3, 1.0), (0.82, 0.0), (1.0, 0.0)];

/// The picture inside comes up before the card fills the pane.
const INSET: Stops = [(0.0, 0.0), (0.02, 0.0), (0.16, 1.0), (1.0, 1.0)];

/// Where a fade stands at a point of the flight into the card. Each stretch
/// between two stops eases on its own, as keyframes do.
fn fade_at(stops: &Stops, progress: f64) -> f64 {
    let (from, to) = stops
        .windows(2)
        .map(|pair| (pair[0], pair[1]))
        .find(|(_, to)| progress <= to.0)
        .unwrap_or((stops[2], stops[3]));
    let span = (to.0 - from.0).max(f64::MIN_POSITIVE);
    let eased = EASE_IN_OUT.at(((progress - from.0) / span).clamp(0.0, 1.0));
    from.1 + (to.1 - from.1) * eased
}

/// Which part of a flight the picture inside the card blooms over.
const BLOOM: (f64, f64) = (0.06, 0.96);

/// Where a moment of a flight stands on the way in. Each part shows at one place
/// of the camera's path both ways. The clock cannot say that, because a glide
/// takes off at once and settles slowly in both directions.
fn along_flight(way: DiveWay, progress: f64) -> f64 {
    match way {
        DiveWay::In => progress,
        DiveWay::Out => EMPHASISED.time_of(1.0 - EMPHASISED.at(progress)),
    }
}

/// The picture inside a card, in the parent's own coordinates, so the camera
/// carries it along.
#[derive(Debug)]
pub(crate) struct Dive {
    pub(crate) inset: Picture,
    /// The picture's parts on their way out of its middle.
    pub(crate) bloom: Option<Between>,
    pub(crate) frame: Rect,
    /// The card's own box, when the picture says where it is.
    pub(crate) card_box: Option<Rect>,
    pub(crate) card: String,
    pub(crate) way: DiveWay,
    pub(crate) start: f64,
    pub(crate) ms: f64,
}

/// How much of each part of a dive shows at a moment.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct DiveFades {
    pub(crate) parent: f64,
    pub(crate) inset: f64,
    pub(crate) words: f64,
}

impl Dive {
    /// The fades at a moment.
    pub(crate) fn fades(&self, now: f64) -> DiveFades {
        let along = along_flight(self.way, share(now, self.start, self.ms));
        DiveFades {
            parent: fade_at(&PARENT, along),
            inset: fade_at(&INSET, along),
            words: fade_at(&WORDS, along),
        }
    }

    /// Where a moment of the flight stands on the way in, from 0 to 1.
    pub(crate) fn along(&self, now: f64) -> f64 {
        along_flight(self.way, share(now, self.start, self.ms))
    }

    /// What the picture inside the card shows at a moment.
    pub(crate) fn inset_at(&self, now: f64) -> Vec<Item> {
        let bloomed = ((self.along(now) - BLOOM.0) / (BLOOM.1 - BLOOM.0)).clamp(0.0, 1.0);
        self.bloom.as_ref().map_or_else(
            || self.inset.scene.body.clone(),
            |bloom| match self.way {
                DiveWay::In => bloom.at(bloomed).0,
                DiveWay::Out => bloom.at(bloomed * bloom.length()).0,
            },
        )
    }

    /// Whether the fades have ended by a moment.
    pub(crate) fn ended(&self, now: f64) -> bool {
        share(now, self.start, self.ms) >= 1.0
    }
}

#[cfg(test)]
mod tests {
    use super::{DiveWay, INSET, PARENT, WORDS, along_flight, fade_at};

    #[test]
    fn what_a_card_says_goes_before_the_picture_above_it() {
        assert_eq!(fade_at(&WORDS, 0.03), 1.0);
        assert_eq!(fade_at(&WORDS, 0.16), 0.0);
        assert!(fade_at(&PARENT, 0.16) > 0.5);
        assert_eq!(fade_at(&PARENT, 0.82), 0.0);
    }

    #[test]
    fn the_picture_inside_is_up_before_the_picture_above_has_gone() {
        assert_eq!(fade_at(&INSET, 0.02), 0.0);
        assert_eq!(fade_at(&INSET, 0.16), 1.0);
        assert!(fade_at(&PARENT, 0.16) > 0.0);
    }

    #[test]
    fn the_way_back_finds_the_picture_above_around_the_picture_it_leaves() {
        let halfway = along_flight(DiveWay::Out, 0.5);
        assert!(fade_at(&PARENT, halfway) > 0.5);
        assert!(fade_at(&INSET, halfway) > 0.5);
        assert!((along_flight(DiveWay::Out, 0.0) - 1.0).abs() < 1e-6);
        assert!(along_flight(DiveWay::Out, 1.0) < 1e-6);
    }

    #[test]
    fn each_fade_ends_where_its_last_stop_says() {
        assert_eq!(fade_at(&PARENT, 1.0), 0.0);
        assert_eq!(fade_at(&INSET, 1.0), 1.0);
    }
}
