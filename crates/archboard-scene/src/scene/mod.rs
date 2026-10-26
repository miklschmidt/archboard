//! The scene: the ordered and positioned list of what a picture is made of
//! (ADR 0059), as typed values a frontend paints without reading SVG or CSS.
//! Each painter turns it into what a frontend shows; the SVG painter
//! (`archboard-svg`) writes it as a document.
//!
//! A scene is items in the order they are drawn: groups ([`group`]), shapes
//! ([`shape`]), runs of words, icons and viewports ([`text`]), definitions
//! ([`definition`]) and trains of pulses ([`traffic`]). Colours name the
//! page's tokens and the operations that mix them ([`colour`]); the frontend
//! resolves them in its theme. The scene holds no interaction state: the
//! light, the recede, the far view, the camera and the flight are each
//! painter's own (ADR 0023).

use serde::{Serialize, Serializer};
use ts_rs::TS;

use crate::drawing::ReadingDirection;

pub mod colour;
pub mod definition;
pub mod group;
pub mod shape;
pub mod text;
pub mod traffic;

pub use colour::{Colour, Paint, Token};
pub use definition::{
    Clip, ClipId, Definition, Gradient, GradientForm, GradientId, Head, HeadInk, Marker, MarkerId,
    Mask, MaskId, Stop,
};
pub use group::{
    EntryKind, Group, LineFacts, Role, ShadowOf, Slot, Subject, SubjectKind, Transform,
};
pub use shape::{Cap, Geometry, Join, PathStep, Pointer, Purpose, Shape, Stroke};
pub use text::{GlyphPlace, Icon, Text, Viewport};
pub use traffic::{Motion, PulseLook, TrafficMark};

/// One thing in a scene's order.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[serde(tag = "item", rename_all = "camelCase")]
pub enum Item {
    /// A group, which a painter can light or pick out by its role and subject.
    Group(Group),
    /// A shape.
    Shape(Shape),
    /// A run of words.
    Text(Text),
    /// An icon.
    Icon(Icon),
    /// What is drawn in a box of its own.
    Viewport(Viewport),
    /// What the items after it refer to.
    Definitions {
        /// The definitions, in order.
        definitions: Vec<Definition>,
    },
    /// A train of pulses on a route.
    Traffic(TrafficMark),
    /// A line break between two things, where the document has one.
    Break,
}

/// One subject's box in the picture, in the units of the document.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, TS)]
#[ts(rename = "DiagramBox")]
pub struct AtlasBox {
    /// Distance from the left edge of the document.
    pub x: f64,
    /// Distance from the top edge of the document.
    pub y: f64,
    /// How wide the subject's box is.
    pub width: f64,
    /// How tall the subject's box is.
    pub height: f64,
}

/// Boxes by subject id, in the order they were drawn.
#[derive(Clone, Debug, Default, PartialEq, TS)]
#[ts(type = "Record<string, DiagramBox>")]
pub struct Boxes(pub Vec<(String, AtlasBox)>);

impl Serialize for Boxes {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_map(self.0.iter().map(|(id, rect)| (id, rect)))
    }
}

/// Where every subject landed in the picture.
#[derive(Clone, Debug, Default, PartialEq, Serialize, TS)]
#[ts(rename = "DiagramAtlas")]
pub struct Atlas {
    /// The box of each node, by node id.
    pub nodes: Boxes,
    /// The box of each drawn line, by relationship id.
    pub edges: Boxes,
    /// The box of each group's region, by the region's id.
    pub regions: Boxes,
}

/// A whole picture.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
pub struct Scene {
    /// The page's width, in the document's units.
    pub width: f64,
    /// The page's height, in the document's units.
    pub height: f64,
    /// The accessible name.
    pub title: String,
    /// A longer description, when there is one.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub description: Option<String>,
    /// Which way the page reads, when the grammar has a reading direction.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub reading: Option<ReadingDirection>,
    /// The page behind everything.
    pub background: Colour,
    /// What the body refers to: arrowheads, gradients, the light of a face.
    pub definitions: Vec<Definition>,
    /// What the page draws, in the order it is drawn.
    pub body: Vec<Item>,
    /// Where every subject landed.
    pub atlas: Atlas,
    /// Every subject the drawing placed, legend and title aside: what a key counts.
    pub placed: Vec<String>,
}

/// A picture written as a document: what the core answers its host.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PaintedDocument {
    /// The whole SVG document.
    pub svg: String,
    /// The page width, in the document's own units.
    pub width: f64,
    /// The page height, in the document's own units.
    pub height: f64,
    /// Where every subject the renderer drew ended up.
    pub atlas: Atlas,
    /// Every subject the drawing placed, by id: what its key counts the marks
    /// of, and what an answer says the picture draws. A legend drawn alone keys
    /// the drawing it leaves out, so these are still that drawing's.
    pub placed: Vec<String>,
    /// Which way an architecture reads (ADR 0032). A sequence reads one way and
    /// says nothing.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub reading_direction: Option<ReadingDirection>,
}
