//! What a scene defines once and refers to: arrowheads, gradients, the masks
//! that hide where lines cross, and the clips that ports cut. Each is named by
//! what it is made for, a value of the scene, so the same definition has the
//! same name wherever the picture is painted.

use serde::Serialize;
use ts_rs::TS;

use crate::drawing::Emphasis;
use crate::geometry::{Point, Rect};
use crate::scene::colour::Colour;
use crate::scene::shape::{PathStep, Shape};

/// The two forms of arrowhead a line can end in.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum Head {
    /// A solid head, whose tip reaches a little past the end of its line.
    Filled,
    /// An open head, whose tip lies at the end of its line.
    Open,
}

/// The ink of an arrowhead every line of some standing shares.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum HeadInk {
    /// A neutral line's.
    Neutral,
    /// An added subject's.
    Added,
    /// A changed subject's.
    Changed,
    /// A removed subject's.
    Removed,
    /// The selection's, for a line drawn lit.
    Lit,
}

/// Which arrowhead a line ends in.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[serde(tag = "for", rename_all = "camelCase")]
pub enum MarkerId {
    /// One every line of a weight and an ink shares.
    Shared {
        /// Its form.
        head: Head,
        /// The weight of the lines it ends.
        weight: Emphasis,
        /// Its ink.
        ink: HeadInk,
    },
    /// One a relationship's line draws for itself, in its own ink.
    Line {
        /// Its form.
        head: Head,
        /// The weight of the line it ends.
        weight: Emphasis,
        /// Its ink.
        ink: Colour,
    },
}

/// Which gradient a paint is.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(tag = "gradient", rename_all = "camelCase")]
pub enum GradientId {
    /// One of the nine patches of a box's soft shadow, by its row and column from the top left.
    Shadow {
        /// Its row: 0, 1 or 2.
        row: u8,
        /// Its column: 0, 1 or 2.
        column: u8,
    },
    /// The light that falls off down a face.
    Sheen,
    /// The softer light down a face a group may tint.
    SoftSheen,
    /// A port's well.
    PortWell,
    /// The fade down a port's slot.
    PortFade,
    /// The gold of a flowchart shape's face.
    FlowGold,
    /// The light along a legend's sample of a pulse.
    LegendPulse,
}

/// The mask that hides what one line must not show.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, TS)]
pub struct MaskId {
    /// The relationship whose line it masks.
    pub line: String,
}

/// The clip one card is drawn through, with a hole for each of its ports.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, TS)]
pub struct ClipId {
    /// The card it clips.
    pub card: String,
}

/// An arrowhead, drawn in a square of its own and laid on the end of a path.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
pub struct Marker {
    /// Its name.
    pub id: MarkerId,
    /// The side of the square it is drawn in.
    pub view: f64,
    /// The point of the square laid on the path's end.
    pub reference: Point,
    /// How big the square is drawn, in widths of the path's stroke.
    pub size: f64,
    /// What it draws in its square.
    pub shapes: Vec<Shape>,
}

/// How a gradient runs.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, TS)]
#[serde(tag = "form", rename_all = "camelCase")]
pub enum GradientForm {
    /// Along a line, in shares of the painted shape's box unless it runs in
    /// the picture's own units; from the box's left edge to its right when it
    /// states no line.
    Linear {
        /// Where it starts and ends.
        #[serde(skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        line: Option<(Point, Point)>,
        /// Whether the line is in the picture's own units.
        user_space: bool,
    },
    /// Out from a centre, in shares of the painted shape's box.
    Radial {
        /// Its centre.
        centre: Point,
        /// How far out its last stop lies.
        radius: f64,
    },
}

/// One stop of a gradient.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
pub struct Stop {
    /// Where it stands along the gradient, from 0 to 1; at the start when it states none.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub offset: Option<f64>,
    /// Its colour.
    pub colour: Colour,
    /// How solid it is; fully when it states none.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub opacity: Option<f64>,
}

/// A gradient.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
pub struct Gradient {
    /// Its name.
    pub id: GradientId,
    /// How it runs.
    pub form: GradientForm,
    /// Its stops, in order.
    pub stops: Vec<Stop>,
}

/// A mask in the picture's own units: what it shows where its shapes are white,
/// and hides where they are black, inside its bounds.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
pub struct Mask {
    /// Its name.
    pub id: MaskId,
    /// Where it applies; nothing outside shows.
    pub bounds: Rect,
    /// What it is drawn of.
    pub shapes: Vec<Shape>,
}

/// A clip in shares of the clipped shape's box: what lies inside its outline
/// shows, a region inside it an even number of times being outside.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
pub struct Clip {
    /// Its name.
    pub id: ClipId,
    /// Its outline.
    pub outline: Vec<PathStep>,
}

/// One thing a scene defines.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[serde(tag = "definition", rename_all = "camelCase")]
pub enum Definition {
    /// An arrowhead.
    Marker(Marker),
    /// A gradient.
    Gradient(Gradient),
    /// A mask.
    Mask(Mask),
    /// A clip.
    Clip(Clip),
}
