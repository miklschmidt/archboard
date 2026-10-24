//! The scene: the ordered and positioned list of what a picture is made of
//! (ADR 0057). Each painter turns it into what a frontend shows; the SVG
//! painter writes it as a document.
//!
//! A group names the subject it draws, when it draws one, and its role, so a
//! painter can light, recede or pick out a part without reading the structure
//! of the picture. Traffic is data: the route a train of pulses rides, and how
//! fast and how far apart they fly (ADR 0027). The scene holds no interaction
//! state: the light, the recede, the far view, the camera and the flight are
//! each painter's own (ADR 0023).
//!
//! Every other element carries its paint and geometry as the attributes it is
//! written with, in the order it is written, so the SVG painter writes the same
//! bytes the TypeScript painter wrote.

use serde::{Serialize, Serializer};
use ts_rs::TS;

use crate::drawing::ReadingDirection;
use crate::geometry::Curve;
use crate::request::Standing;

/// One attribute value: a number, spelt as ECMAScript spells it, or words.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[serde(untagged)]
pub enum Value {
    Number(f64),
    Text(String),
}

/// Which sort of subject a group draws, for the hook a viewer selects by.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "kebab-case")]
pub enum SubjectKind {
    Node,
    Edge,
    Region,
    Flow,
    Step,
    /// A group's region, named by the group's id.
    GroupRegion,
}

impl SubjectKind {
    /// The word the document spells it with.
    pub fn as_str(self) -> &'static str {
        match self {
            SubjectKind::Node => "node",
            SubjectKind::Edge => "edge",
            SubjectKind::Region => "region",
            SubjectKind::Flow => "flow",
            SubjectKind::Step => "step",
            SubjectKind::GroupRegion => "group-region",
        }
    }
}

/// The subject a group draws: which sort it is, its id, and how it stands.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
pub struct Subject {
    pub kind: SubjectKind,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub standing: Option<Standing>,
}

/// What a group is to the picture it is part of.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "kebab-case")]
pub enum Role {
    /// A part drawn as a card, or a participant's card.
    Card,
    /// A container's tray, a flow's frame.
    Frame,
    /// A container's header, with its words.
    Header,
    /// A relationship's or a step's line.
    Line,
    /// A relationship's or a message's words.
    Label,
    /// A participant's column of time.
    Lifeline,
    /// A decision's or a loop's frame in a sequence.
    Fragment,
    /// A flowchart's shape.
    Shape,
    /// A group's region, its frame and caption.
    Region,
    /// The shadow a block casts, laid under every line and block.
    Shadow,
    /// A part's type chip, which its near and far views share.
    Chip,
    /// What a part draws when the picture is seen near.
    NearView,
    /// What a part draws when the picture is seen from far away.
    FarView,
    /// A block of words that moves between the two views.
    Words,
    /// The mark of a board a part opens.
    DrillMark,
    /// A standing's pin on a corner.
    Pin,
    /// The warning on a subject nobody has decided yet.
    Warning,
    /// A kind's icon.
    Icon,
    /// A relationship's traffic layer.
    Traffic,
    /// The marks where lines join or part.
    Junctions,
    /// A port's inside, where a line runs into a card.
    Port,
    /// A marked row of a sequence: its band and its pin.
    RowMark,
    /// A flow's row of participant cards, which a viewer keeps in view.
    FlowHead,
    /// The frame's face behind a flow's head, shown while a viewer moves it.
    HeadShade,
    /// A flow's messages.
    Messages,
    /// Everything moved as one: onto the page, or under a title.
    Move,
    /// A part of the page an export adds: its title, its legend, the planned frame.
    Slot,
    /// One entry of a legend.
    LegendEntry,
    /// Marks that stand together and take no pointer.
    Marks,
}

/// A group: what it draws, what it is, and its parts.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
pub struct Group {
    pub role: Role,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub subject: Option<Subject>,
    /// Its attributes besides its subject's, in the order they are written.
    #[ts(type = "ReadonlyArray<[string, Value]>")]
    pub attrs: Vec<(&'static str, Value)>,
    pub children: Vec<Item>,
}

/// Any other element: a shape, a definition, a text run, a stop of a gradient.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
pub struct Element {
    /// Its SVG name.
    #[ts(type = "string")]
    pub name: &'static str,
    #[ts(type = "ReadonlyArray<[string, Value]>")]
    pub attrs: Vec<(&'static str, Value)>,
    pub children: Vec<Item>,
    /// Whether it is written as one empty-element tag.
    pub empty: bool,
}

/// The colours of a pulse and how thick the line it rides is.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PulseLook {
    /// The colour of the beam's body.
    pub head: String,
    /// The colour of its hot front, nearer white than the body is.
    pub hot: String,
    /// How thick what it rides is, so a heavier line carries a heavier pulse.
    pub line_width: f64,
}

/// How the pulses on a route move.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, TS)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Motion {
    /// A steady train: pulses `spacing` apart flying at `speed`, one `phase`
    /// along the route at time zero.
    Steady { speed: f64, spacing: f64, phase: f64 },
    /// One pulse a turn of a clock `cycle` seconds long, leaving the route's
    /// start `start` seconds into it and flying at `speed`.
    Turn { speed: f64, cycle: f64, start: f64 },
}

/// A train of pulses on a route (ADR 0027).
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
pub struct TrafficMark {
    pub look: PulseLook,
    /// The part of the line the pulses ride.
    pub route: Curve,
    pub motion: Motion,
}

/// One thing in a scene's order.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Item {
    Group(Group),
    Element(Element),
    /// Words, inside a text element.
    Text { text: String },
    /// A line break between two things, where the document has one.
    Break,
    Traffic(TrafficMark),
}

/// One subject's box in the picture, in the units of the document.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, TS)]
#[ts(rename = "DiagramBox")]
pub struct AtlasBox {
    pub x: f64,
    pub y: f64,
    pub width: f64,
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
    pub nodes: Boxes,
    pub edges: Boxes,
    pub regions: Boxes,
}

/// A whole picture.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
pub struct Scene {
    pub width: f64,
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
    pub background: String,
    /// What the body refers to: arrowheads, gradients, the light of a face.
    pub definitions: Vec<Item>,
    pub body: Vec<Item>,
    pub atlas: Atlas,
}
