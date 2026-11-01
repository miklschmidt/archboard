//! What moves a whole picture: a flight from the last picture, a part-by-part
//! entrance, a picture leaving, the ghost of one that left, and the board inside
//! a card that the camera flies into. Each holds what it needs from its start
//! and answers for a moment of the host's clock.

use std::collections::HashSet;

use archboard_scene::geometry::Rect;
use archboard_scene::scene::{Item, Scene};
use serde::Deserialize;

use crate::between::{
    Between, Entrance, Handover, Heading, Phases, departure, visible_at, without,
};
use crate::definitions::Definitions;
use crate::draw::Picture;
use crate::presentation::{Camera, Presentation};
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
}

/// A picture on its way in.
#[derive(Debug)]
pub(crate) enum Flight {
    /// The last picture carried into this one.
    Carry {
        between: Box<Between>,
        definitions: Definitions,
        time: Stretch,
    },
    /// A picture coming in part by part.
    Enter {
        entrance: Box<Entrance>,
        time: Stretch,
    },
}

impl Flight {
    /// A flight from one scene into another.
    pub(crate) fn carry(
        from: &Scene,
        to: &Scene,
        shift: (f64, f64),
        phases: &Phases,
        ms: f64,
    ) -> Flight {
        let between = Box::new(Between::new(from, to, shift, phases));
        Flight::Carry {
            definitions: Definitions::listed(&between.definitions()),
            between,
            time: Stretch::of(ms),
        }
    }

    /// An entrance, taking over from what is left of the last picture.
    pub(crate) fn enter(
        scene: &Scene,
        phases: &Phases,
        ms: f64,
        handover: Option<Handover<'_>>,
    ) -> Flight {
        Flight::Enter {
            entrance: Box::new(Entrance::new(scene, phases, handover)),
            time: Stretch::of(ms),
        }
    }

    /// The subjects that fly over from the last picture, when the flight is an
    /// entrance.
    pub(crate) fn flown(&self) -> Option<&HashSet<String>> {
        match self {
            Flight::Enter { entrance, .. } => Some(entrance.flown()),
            Flight::Carry { .. } => None,
        }
    }

    /// The flight's time.
    fn time(&self) -> Stretch {
        match self {
            Flight::Carry { time, .. } | Flight::Enter { time, .. } => *time,
        }
    }

    /// Start at the moment of the first frame.
    pub(crate) fn begin(&mut self, now: f64) {
        match self {
            Flight::Carry { time, .. } | Flight::Enter { time, .. } => time.begin(now),
        }
    }

    /// Whether the flight has landed by a moment.
    pub(crate) fn landed(&self, now: f64) -> bool {
        self.time().share(now) >= 1.0
    }

    /// What the flight shows at a moment.
    pub(crate) fn items(&mut self, now: f64) -> Vec<Item> {
        let share = self.time().share(now);
        match self {
            Flight::Carry {
                between,
                definitions,
                ..
            } => {
                definitions.replace_masks(between.masks_at(share));
                between.at(share)
            }
            Flight::Enter { entrance, .. } => entrance.at(share),
        }
    }

    /// What the flight shows at a moment as a scene, and how far back of its
    /// place it stands. `landed` is the picture the flight lands on.
    pub(crate) fn seen_at(&self, now: f64, landed: &Scene) -> (Scene, (f64, f64)) {
        let share = self.time().share(now);
        match self {
            Flight::Carry { between, .. } => between.seen_at(share, landed),
            Flight::Enter { entrance, .. } => {
                let body = entrance.at(share);
                let scene = Scene {
                    body,
                    ..landed.clone()
                };
                (scene, (0.0, 0.0))
            }
        }
    }

    /// The box of the door that opens at a moment, and how far through the move
    /// that moment is, when a door opens.
    pub(crate) fn opening(&self, now: f64) -> Option<(Rect, f64)> {
        let share = self.time().share(now);
        match self {
            Flight::Carry { between, .. } => Some((between.opening_at(share)?, share)),
            Flight::Enter { .. } => None,
        }
    }

    /// How far through an entrance a moment is, when the flight is one.
    pub(crate) fn entering(&self, now: f64) -> Option<f64> {
        match self {
            Flight::Enter { time, .. } => Some(time.share(now)),
            Flight::Carry { .. } => None,
        }
    }

    /// The definitions that what the flight shows refers to, when they are its own.
    pub(crate) fn definitions(&self) -> Option<&Definitions> {
        match self {
            Flight::Carry { definitions, .. } => Some(definitions),
            Flight::Enter { .. } => None,
        }
    }
}

/// The picture on the stage on its way out, while the next is drawn.
#[derive(Debug)]
pub(crate) struct Leaving {
    pub(crate) heading: Heading,
    pub(crate) start: f64,
    pub(crate) ms: f64,
}

impl Ghost {
    /// Take away what flies over to the next picture.
    pub(crate) fn hand_over(&mut self, flown: &HashSet<String>) {
        if !flown.is_empty() {
            self.picture.scene.body = without(&self.picture.scene.body, flown);
        }
    }

    /// How much of the ghost shows at its start.
    pub(crate) fn shown(&self) -> f64 {
        visible_at(self.from)
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
}

/// What is left of the last picture, finishing on the spot where it was seen,
/// over the picture arriving. The camera no longer moves it.
#[derive(Debug)]
pub(crate) struct Ghost {
    pub(crate) picture: Picture,
    pub(crate) heading: Heading,
    pub(crate) camera: Camera,
    pub(crate) from: f64,
    pub(crate) time: Stretch,
    /// How the picture looked when it was last seen: it leaves in its own light.
    pub(crate) look: Presentation,
}

impl Ghost {
    /// Whether the ghost is gone by a moment.
    pub(crate) fn gone(&self, now: f64) -> bool {
        self.time.share(now) >= 1.0
    }

    /// What the ghost shows at a moment.
    pub(crate) fn items(&self, now: f64) -> Vec<Item> {
        let rest = EASE_OUT.at(self.time.share(now));
        let progress = self.from + (1.0 - self.from) * rest;
        departure(&self.picture.scene, &self.heading, progress)
    }
}

/// Which way a flight goes between a board and the board inside its card.
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

/// What a card says goes first, so the board inside it is not read through its label.
const WORDS: Stops = [(0.0, 1.0), (0.03, 1.0), (0.16, 0.0), (1.0, 0.0)];

/// The board above stays until the board inside can be made out.
const PARENT: Stops = [(0.0, 1.0), (0.3, 1.0), (0.82, 0.0), (1.0, 0.0)];

/// The board inside comes up before the card fills the pane.
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

/// Which part of a flight the board inside the card blooms over.
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

/// The board inside a card, in the parent's own coordinates, so the camera
/// carries it along.
#[derive(Debug)]
pub(crate) struct Dive {
    pub(crate) inset: Picture,
    /// The board's parts on their way out of its middle.
    pub(crate) bloom: Option<Entrance>,
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

    /// What the board inside the card shows at a moment.
    pub(crate) fn inset_at(&self, now: f64) -> Vec<Item> {
        let bloomed = ((self.along(now) - BLOOM.0) / (BLOOM.1 - BLOOM.0)).clamp(0.0, 1.0);
        self.bloom
            .as_ref()
            .map_or_else(|| self.inset.scene.body.clone(), |bloom| bloom.at(bloomed))
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
    fn what_a_card_says_goes_before_the_board_above_it() {
        assert_eq!(fade_at(&WORDS, 0.03), 1.0);
        assert_eq!(fade_at(&WORDS, 0.16), 0.0);
        assert!(fade_at(&PARENT, 0.16) > 0.5);
        assert_eq!(fade_at(&PARENT, 0.82), 0.0);
    }

    #[test]
    fn the_board_inside_is_up_before_the_board_above_has_gone() {
        assert_eq!(fade_at(&INSET, 0.02), 0.0);
        assert_eq!(fade_at(&INSET, 0.16), 1.0);
        assert!(fade_at(&PARENT, 0.16) > 0.0);
    }

    #[test]
    fn the_way_back_finds_the_board_above_around_the_board_it_leaves() {
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
