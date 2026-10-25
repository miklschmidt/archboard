//! The words of a scene, its icons, and the faces its words are set in.
//!
//! A run of words is set at a baseline in one face and size, as the host
//! measured it. When the core shapes text itself (TASK-520.07), a run also
//! carries its glyphs and their places; its words stay, for the reader who
//! searches, copies or listens.

use serde::Serialize;
use ts_rs::TS;

use crate::drawing::{DiagramFont, FontFamily};
use crate::geometry::{Point, Rect};
use crate::scene::Item;
use crate::scene::colour::Colour;

/// How a run of words is set, which names how the SVG painter writes it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum Setting {
    /// A line the layout measured and placed: a card's, a label's, a caption's.
    Run,
    /// A heading or a line of words set where the painter put it.
    Caption,
    /// A line centred on a flowchart shape.
    Centred,
    /// A line on a row of a sequence's fragment.
    Row,
}

/// Where a run stands on its point across.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum Anchor {
    /// Its middle stands on the point.
    Middle,
}

/// Where a run stands on its point down.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum Baseline {
    /// Its middle stands on the point, not its baseline.
    Central,
}

/// One run of words.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
pub struct Text {
    /// How it is set.
    pub setting: Setting,
    /// Where it starts: the left end of its baseline, unless it says otherwise.
    pub at: Point,
    /// The face it is set in.
    pub font: DiagramFont,
    /// Its size.
    pub size: f64,
    /// Its colour.
    pub fill: Colour,
    /// Where it stands on its point across, when not at its start.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub anchor: Option<Anchor>,
    /// Where it stands on its point down, when not on its baseline.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub baseline: Option<Baseline>,
    /// Whether every space in it is kept as measured, runs of them too.
    pub keeps_spaces: bool,
    /// The words.
    pub words: String,
}

/// A Remix Icon, by the name it is exported under, drawn from its own 24-unit
/// square into a square `size` wide at the origin.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
pub struct Icon {
    /// The icon drawn: the one asked for, or the icon for a name the set does not have.
    pub name: String,
    /// The side of the square it is drawn into.
    pub size: f64,
    /// Its ink.
    pub ink: Colour,
}

/// What is drawn in a box of its own: everything in `view` scaled and moved
/// to fill `frame`, nothing outside it.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
pub struct Viewport {
    /// Where it is drawn.
    pub frame: Rect,
    /// What part of its items' own space it shows.
    pub view: Rect,
    /// What it draws, in order.
    pub items: Vec<Item>,
}

/// One face a scene's words are set in: its family and weight, and the file
/// of the bundled fonts that holds it.
#[derive(Debug)]
pub struct Face {
    /// Its family and weight.
    pub font: DiagramFont,
    /// The name of its font file.
    pub file: &'static str,
}

/// Every face a scene's words can be set in. Two weights, and only two: 400
/// and 500 ship as files.
pub const FACES: [Face; 4] = [
    Face {
        font: DiagramFont {
            family: FontFamily::Sans,
            weight: 400,
        },
        file: "Onest-wght-v1.000.ttf",
    },
    Face {
        font: DiagramFont {
            family: FontFamily::Sans,
            weight: 500,
        },
        file: "Onest-Medium-v1.000.ttf",
    },
    Face {
        font: DiagramFont {
            family: FontFamily::Mono,
            weight: 400,
        },
        file: "DMMono-Regular-v1.000.ttf",
    },
    Face {
        font: DiagramFont {
            family: FontFamily::Mono,
            weight: 500,
        },
        file: "DMMono-Medium-v1.000.ttf",
    },
];
