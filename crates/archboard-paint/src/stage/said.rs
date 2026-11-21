//! What a page says to a stage, besides how the picture is seen: the pace it
//! keeps, how a picture arrives and what becomes of the last; and what a frame
//! is drawn on and what it answers.

use archboard_geometry::Rect;
use serde::Deserialize;

use crate::between::Phases;
use crate::flight::DiveWay;
use crate::passage::Heading;

/// How a stage keeps time: at which points of a move each of its parts
/// happens, and how long one step of its clock can be, in milliseconds. A stage
/// with no phases flies nothing, and with no longest step its clock loses no
/// stall.
#[derive(Clone, Copy, Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Pace {
    /// At which points of a move each of its parts happens.
    pub phases: Option<Phases>,
    /// How much of a stall one step of the stage's clock can take.
    pub longest_step: Option<f64>,
}

/// How a picture comes onto the stage. The page decides it (ADR 0071).
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Arrival {
    /// In place of what stands there, with nothing of the last one left moving.
    /// The sparks of a picture that bloomed inside a card run on over it.
    Cut,
    /// Carried from what shows now, over a time in milliseconds. `shift` says
    /// how far the cards the two pictures share moved, in the picture's units.
    /// A stage with nothing to carry shows the picture.
    Carried {
        /// How far the shared cards moved.
        shift: (f64, f64),
        /// How long the carry takes.
        ms: f64,
    },
    /// Part by part, what is left of the last one finishing over it where it
    /// was last seen, moved with its pane by `moved` canvas pixels.
    Entered {
        /// Where the reader went, when the last picture was never sent on its way.
        heading: Option<Heading>,
        /// How long the entrance takes, in milliseconds.
        ms: f64,
        /// How far the pane moved, in canvas pixels.
        moved: (f64, f64),
        /// The moment of the page's clock it starts, in milliseconds.
        at: f64,
    },
    /// Inside the card the camera flies into or out of, with the fades of the
    /// flight. The picture on the stage stays until the page shows this one.
    Into {
        /// Where the picture stands inside the card, in the outer picture's units.
        frame: Rect,
        /// Whether the flight goes into the card or back out of it.
        way: DiveWay,
        /// The card, by subject id.
        card: String,
        /// How long the flight takes, in milliseconds.
        ms: f64,
        /// The moment of the page's clock it starts, in milliseconds.
        at: f64,
    },
}

/// What becomes of a picture already on the stage.
#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Departure {
    /// It goes on its way out while the next is drawn. A picture that a passage
    /// is still bringing in finishes coming in first.
    Leaving {
        /// Where the reader went.
        heading: Heading,
        /// How long it takes to leave, in milliseconds.
        ms: f64,
        /// The moment of the page's clock it starts, in milliseconds.
        at: f64,
    },
    /// It stays: the reader came back before anything else arrived.
    Stayed,
    /// It comes off the stage, and nothing takes its place.
    Cleared,
    /// The picture inside a card comes out of it, and the flight's fades with it.
    OutOfCard,
}

/// What a frame is drawn on.
#[derive(Debug)]
pub enum Surface<'a, C> {
    /// A canvas drawn as the walk asks, whole. One that keeps parts keeps them itself.
    Direct(&'a mut C),
    /// A canvas that cuts each path into strips where it lands (ADR 0074): the
    /// stage keeps for the next frame the parts it drew, and leaves out what
    /// lands off the canvas.
    Strips(&'a mut C),
}

/// What the frames after this one show.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Motion {
    /// Nothing moves: the next frame looks as this one does.
    Still,
    /// Only the traffic moves.
    TrafficAlone,
    /// The picture or how it is seen moves.
    Moving,
}
