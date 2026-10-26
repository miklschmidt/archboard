//! A group of a scene: what it is to the picture, the subject it draws, and
//! how its parts are placed and shown together.
//!
//! A group names the subject it draws, when it draws one, and its role, so a
//! painter can light, recede or pick out a part without reading the structure
//! of the picture (ADR 0059). A role carries the facts that come with it: how
//! a part was drawn, which way the board it opens lies, where a view's words
//! move to.

use serde::Serialize;
use ts_rs::TS;

use crate::request::{DrillDirection, LegendLayout, LineAppearance, NodeAppearance, Standing};
use crate::scene::Item;
use crate::scene::definition::MaskId;
use crate::scene::shape::Pointer;

/// Which sort of subject a group draws.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "kebab-case")]
#[expect(
    missing_docs,
    reason = "each variant is the sort of subject its name says"
)]
pub enum SubjectKind {
    Node,
    Edge,
    Region,
    Flow,
    Step,
    /// A group's region, named by the group's id.
    GroupRegion,
}

/// The subject a group draws: which sort it is, its id, and how it stands.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, TS)]
pub struct Subject {
    /// Which sort of subject it is.
    pub kind: SubjectKind,
    /// The subject's id: the group's id for a group region.
    pub id: String,
    /// How the subject stands against the variant it came from, when the picture is a comparison.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub standing: Option<Standing>,
}

/// A scale about the origin, followed by a move.
/// A point `(px, py)` maps to `(px * scale + x, py * scale + y)`.
/// An absent scale is 1.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, TS)]
pub struct Transform {
    /// How far right.
    pub x: f64,
    /// How far down.
    pub y: f64,
    /// How much bigger, when it is scaled.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub scale: Option<f64>,
}

impl Transform {
    /// A move.
    pub const fn translate(x: f64, y: f64) -> Self {
        Transform { x, y, scale: None }
    }
}

/// How a relationship's line was drawn: its kind's appearance and its kind.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, TS)]
pub struct LineFacts {
    /// The appearance its kind gives it.
    pub appearance: LineAppearance,
    /// The key of its kind in the vault's policy.
    pub kind: String,
}

/// Which part of its subject a shadow is cast by, when not its whole block.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum ShadowOf {
    /// A message's label plate.
    Label,
    /// A participant's activation bar.
    Activation,
}

/// A part of the page an export adds, or the frame of a planned board.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(tag = "slot", rename_all = "camelCase")]
pub enum Slot {
    /// The dashed frame and label of a board nothing on which is built.
    PlannedFrame,
    /// The title an export draws above its picture.
    ExportTitle,
    /// The legend an export draws, and how it is laid out.
    ExportLegend {
        /// How the legend is laid out.
        layout: LegendLayout,
    },
}

/// What a legend's entry keys.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    /// A comparison's mark.
    Mark,
    /// A part kind.
    Kind,
    /// A relationship kind.
    Relationship,
    /// A line drawn with more emphasis.
    Emphasis,
    /// A line's traffic.
    Traffic,
}

/// What a group is to the picture it is part of, with the facts that come with it.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[serde(tag = "role", content = "facts", rename_all = "kebab-case")]
pub enum Role {
    /// A part drawn as a card, or a participant's card, and how it was drawn.
    Card(Box<NodeAppearance>),
    /// A container's tray and how it was drawn, or a flow's frame.
    Frame(Option<Box<NodeAppearance>>),
    /// A container's header, with its words, and how the container was drawn.
    Header(Box<NodeAppearance>),
    /// A relationship's line and how it was drawn, or a message's line.
    Line(Option<Box<LineFacts>>),
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
    Shadow(Option<ShadowOf>),
    /// A part's type chip, which its near and far views share: it stands at
    /// its group's transform when the picture is seen near, and at `far` from
    /// far away.
    Chip {
        /// Where it stands from far away.
        far: Transform,
    },
    /// What a part draws when the picture is seen near.
    NearView,
    /// What a part draws when the picture is seen from far away, hidden until then.
    FarView,
    /// A block of words that moves to where the other view's words stand.
    Words {
        /// Where the words move to when the other view shows.
        away: Transform,
    },
    /// The mark of a board a part opens, and which way that board lies.
    DrillMark(DrillDirection),
    /// A standing's pin on a corner.
    Pin,
    /// The warning on a subject nobody has decided yet.
    Warning,
    /// A kind's icon, and the icon the kind asked for, when a part's.
    Icon(Option<String>),
    /// A relationship's traffic layer.
    Traffic(String),
    /// The marks where lines join or part.
    Junctions,
    /// A port's inside, where a line runs into a card.
    Port,
    /// A marked row of a sequence: its band and its pin.
    RowMark,
    /// A flow's row of participant cards, which a viewer keeps in view.
    FlowHead(String),
    /// The frame's face behind a flow's head, hidden until a viewer moves the head.
    HeadShade,
    /// A flow's messages.
    Messages,
    /// Everything moved clear of the page's edge.
    Move,
    /// Everything moved to make room for what the page adds: the planned frame, a title.
    Inset,
    /// A part of the page an export adds, or the planned frame.
    Slot(Slot),
    /// One entry of a legend.
    LegendEntry(EntryKind),
    /// Marks that stand together.
    Marks,
}

/// A group: what it is, what it draws, how its parts are shown, and its parts.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
pub struct Group {
    /// What the group is to the picture.
    pub role: Role,
    /// The subject it draws, when it draws one.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub subject: Option<Subject>,
    /// How its parts are moved and scaled.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub transform: Option<Transform>,
    /// How solid its parts are drawn together, from 0 to 1.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub opacity: Option<f64>,
    /// The mask its parts are drawn through.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub mask: Option<MaskId>,
    /// Whether its parts take the pointer.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub pointer: Option<Pointer>,
    /// The subjects it stands with, which a viewer lights and recedes it with.
    pub members: Vec<String>,
    /// What it holds, in the order it is drawn.
    pub items: Vec<Item>,
}

impl Group {
    /// A group of some role, holding some items.
    pub fn new(role: Role, items: Vec<Item>) -> Self {
        Group {
            role,
            subject: None,
            transform: None,
            opacity: None,
            mask: None,
            pointer: None,
            members: Vec::new(),
            items,
        }
    }

    /// The group drawing a subject.
    #[must_use]
    pub fn drawing(mut self, subject: Subject) -> Self {
        self.subject = Some(subject);
        self
    }

    /// The group moved and scaled.
    #[must_use]
    pub fn moved(mut self, transform: Transform) -> Self {
        self.transform = Some(transform);
        self
    }

    /// The group taking the pointer or not.
    #[must_use]
    pub fn pointer(mut self, pointer: Pointer) -> Self {
        self.pointer = Some(pointer);
        self
    }

    /// The group standing with some subjects.
    #[must_use]
    pub fn standing_with(mut self, members: Vec<String>) -> Self {
        self.members = members;
        self
    }
}
