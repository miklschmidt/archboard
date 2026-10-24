//! What a picture is painted from: the drawing that layout answered, and what
//! the host resolved beside it (the appearance the vault's policy gives each
//! subject, the comparison's standings, the export's frame, the document's
//! settings and the icons it draws).

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::drawing::{NodeFacts, Painted, TextRun};
use crate::geometry::Rect;

/// How one subject of a proposal stands against the variant it came from.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum Standing {
    Added,
    Removed,
    Changed,
    Unchanged,
}

impl Standing {
    /// The word the document spells it with.
    pub fn as_str(self) -> &'static str {
        match self {
            Standing::Added => "added",
            Standing::Removed => "removed",
            Standing::Changed => "changed",
            Standing::Unchanged => "unchanged",
        }
    }
}

/// One of the vault policy's named colours.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum PaletteColor {
    Red,
    Orange,
    Amber,
    Yellow,
    Lime,
    Green,
    Emerald,
    Teal,
    Cyan,
    Sky,
    Blue,
    Indigo,
    Violet,
    Purple,
    Fuchsia,
    Pink,
    Rose,
}

impl PaletteColor {
    /// The colour's name, as its page token and the document spell it.
    pub fn as_str(self) -> &'static str {
        match self {
            PaletteColor::Red => "red",
            PaletteColor::Orange => "orange",
            PaletteColor::Amber => "amber",
            PaletteColor::Yellow => "yellow",
            PaletteColor::Lime => "lime",
            PaletteColor::Green => "green",
            PaletteColor::Emerald => "emerald",
            PaletteColor::Teal => "teal",
            PaletteColor::Cyan => "cyan",
            PaletteColor::Sky => "sky",
            PaletteColor::Blue => "blue",
            PaletteColor::Indigo => "indigo",
            PaletteColor::Violet => "violet",
            PaletteColor::Purple => "purple",
            PaletteColor::Fuchsia => "fuchsia",
            PaletteColor::Pink => "pink",
            PaletteColor::Rose => "rose",
        }
    }

    /// The colour a name names, if it is one of the palette's.
    pub fn named(name: &str) -> Option<PaletteColor> {
        ALL_COLORS.iter().copied().find(|color| color.as_str() == name)
    }
}

/// Every named colour.
const ALL_COLORS: [PaletteColor; 17] = [
    PaletteColor::Red,
    PaletteColor::Orange,
    PaletteColor::Amber,
    PaletteColor::Yellow,
    PaletteColor::Lime,
    PaletteColor::Green,
    PaletteColor::Emerald,
    PaletteColor::Teal,
    PaletteColor::Cyan,
    PaletteColor::Sky,
    PaletteColor::Blue,
    PaletteColor::Indigo,
    PaletteColor::Violet,
    PaletteColor::Purple,
    PaletteColor::Fuchsia,
    PaletteColor::Pink,
    PaletteColor::Rose,
];

/// Which way the board a part opens lies from the board it is drawn on.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum DrillDirection {
    Up,
    Down,
    Across,
    Elsewhere,
}

impl DrillDirection {
    /// The word the document spells it with.
    pub fn as_str(self) -> &'static str {
        match self {
            DrillDirection::Up => "up",
            DrillDirection::Down => "down",
            DrillDirection::Across => "across",
            DrillDirection::Elsewhere => "elsewhere",
        }
    }
}

/// The independent visual channels of a node in this reading.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct NodeAppearance {
    pub container: bool,
    /// Its body's colour: a card's placing group's (ADR 0038). A container's well
    /// and header are made of what the well is cut into, so it has none (TASK-474).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub body_color: Option<PaletteColor>,
    /// The group whose colour it takes, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub group: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub type_color: Option<PaletteColor>,
    pub icon: String,
    pub type_name: String,
    pub type_kind: String,
    /// Which way the board it opens lies, or null when it opens none.
    pub drill: Option<DrillDirection>,
}

/// How a line is dashed.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum Dash {
    Solid,
    Dashed,
    Dotted,
}

impl Dash {
    /// The word the document spells it with.
    pub fn as_str(self) -> &'static str {
        match self {
            Dash::Solid => "solid",
            Dash::Dashed => "dashed",
            Dash::Dotted => "dotted",
        }
    }
}

/// Which arrowhead a line ends in.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum Arrowhead {
    Filled,
    Open,
    None,
}

impl Arrowhead {
    /// The word the document spells it with.
    pub fn as_str(self) -> &'static str {
        match self {
            Arrowhead::Filled => "filled",
            Arrowhead::Open => "open",
            Arrowhead::None => "none",
        }
    }
}

/// How a drawn line reads: a relationship in its kind's appearance, or a flow
/// step in its own.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct LineAppearance {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub color: Option<PaletteColor>,
    pub dash: Dash,
    pub arrowhead: Arrowhead,
}

/// Which shape a flowchart draws a step as (ADR 0053).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum FlowchartShape {
    Decision,
    Loop,
    Terminal,
}

/// One card a flowchart draws as a shape, and its wrapped words.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct ShapedCard {
    pub shape: FlowchartShape,
    pub words: Vec<String>,
}

/// What a flowchart adds to an architecture's painting.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct FlowchartParts {
    /// The cards drawn as shapes of their own, by id.
    pub shapes: BTreeMap<String, ShapedCard>,
    /// What a reader can pick: the flows and their steps. The atlas holds only these.
    pub subjects: Vec<String>,
}

/// An architecture, or a flowchart drawn as one.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ArchitecturePicture {
    /// What the picture draws.
    pub drawing: Painted,
    /// The whole layout, when the picture draws only part of it: the page is
    /// fitted to the whole, so leaving some out moves nothing that is kept.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub whole: Option<Painted>,
    /// Every node the page lays out, drawn or not.
    pub appearances: BTreeMap<String, NodeAppearance>,
    /// How each drawn line reads, by relationship id.
    pub lines: BTreeMap<String, LineAppearance>,
    /// The lines that are flow steps drawn on the board, not authored relationships.
    pub steps: Vec<String>,
    /// Each group's colour, by group id, for a group that has one.
    pub groups: BTreeMap<String, PaletteColor>,
    /// The size every card's name is set at from far away, measured by the host.
    pub far_size: f64,
    /// The shapes of a flowchart; absent on an architecture.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub flowchart: Option<FlowchartParts>,
}

/// One stretch of a column where its participant is busy.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct Activation {
    pub top: f64,
    pub bottom: f64,
}

/// The card heading one column of a sequence.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SequenceCard {
    pub node: NodeFacts,
    #[serde(rename = "box")]
    #[ts(rename = "box")]
    pub bounds: Rect,
    pub title_size: f64,
    pub notes: Vec<TextRun>,
    /// The run its name has: the text run, less the mark of a part that opens a board.
    pub title_room: f64,
}

/// One participant, as a column of the drawing.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SequenceColumn {
    pub card: SequenceCard,
    pub centre_x: f64,
    pub lifeline_top: f64,
    pub activations: Vec<Activation>,
}

/// What a message does.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum MessageKind {
    Sync,
    Async,
    Return,
    #[serde(rename = "self")]
    #[ts(rename = "self")]
    Myself,
}

/// What the painter reads of a message.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct MessageFacts {
    pub id: String,
    pub kind: MessageKind,
    pub from: String,
    pub to: String,
}

/// One line of a message's words, with its painted width.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct WordLine {
    pub text: String,
    pub width: f64,
}

/// A message's words as drawn.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct MessageWords {
    pub lines: Vec<WordLine>,
}

/// A step's note, placed under its message.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct StepNote {
    #[serde(rename = "box")]
    #[ts(rename = "box")]
    pub bounds: Rect,
    pub lines: Vec<TextRun>,
}

/// This message's turn on the drawing's shared clock.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct Slot {
    pub start: u32,
    pub count: u32,
}

/// One message, placed on its row, with where its line runs.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SequenceStep {
    pub step: MessageFacts,
    pub words: MessageWords,
    /// The height its line runs at.
    pub y: f64,
    pub slot: Slot,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub note: Option<StepNote>,
    /// Which way its line runs: -1 left, 1 right, 0 a message to itself.
    pub travel: i8,
    /// Where its line starts: past the sender's bar, or a self-message's loop.
    pub start: f64,
    /// Where its line ends, short of its arrowhead; a self-message's start.
    pub end: f64,
    /// Where its words' plate stands.
    pub label_box: Rect,
    /// The row it takes, its note included.
    #[serde(rename = "box")]
    #[ts(rename = "box")]
    pub bounds: Rect,
    /// How tall its row is.
    pub pitch: f64,
}

/// What the painter reads of a decision or a loop.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct StepId {
    pub id: String,
}

/// One alternative's label row inside a decision's frame.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct FrameGuard {
    pub label: String,
    pub top: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub divider: Option<f64>,
}

/// What a frame's tab says.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum FrameOperator {
    Alt,
    Loop,
}

/// A decision's or loop's frame, placed.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct SequenceFrame {
    pub step: StepId,
    #[serde(rename = "box")]
    #[ts(rename = "box")]
    pub bounds: Rect,
    pub tab: Rect,
    pub operator: FrameOperator,
    pub words: String,
    pub guards: Vec<FrameGuard>,
}

/// What the painter reads of a flow.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct FlowFacts {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub summary: Option<String>,
}

/// One flow, placed.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SequenceFlow {
    pub flow: FlowFacts,
    pub frame: Rect,
    pub header: Rect,
    pub slab: Rect,
    pub lifeline_bottom: f64,
    pub columns: Vec<SequenceColumn>,
    pub steps: Vec<SequenceStep>,
    /// Its decisions' and loops' frames, each after the frames inside it.
    pub frames: Vec<SequenceFrame>,
}

/// A stack of flows, placed down the page.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct SequenceDrawing {
    pub width: f64,
    pub height: f64,
    pub flows: Vec<SequenceFlow>,
}

/// How fast the pulses of a sequence fly, and the longest a turn of its clock may take.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SequenceClock {
    /// The speed of a relationship's default traffic, in diagram units a second.
    pub traffic_speed: f64,
    /// The longest one turn of the whole exchange's clock may take.
    pub cycle_cap_ms: f64,
}

/// One variant's flows, drawn as a stack of message sequences.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct SequencePicture {
    /// Every flow the content holds, laid out.
    pub laid: SequenceDrawing,
    /// What the picture draws of it, when that is less.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub shown: Option<SequenceDrawing>,
    /// Each participant's appearance.
    pub appearances: BTreeMap<String, NodeAppearance>,
    pub clock: SequenceClock,
}

/// What a picture is.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(tag = "grammar", rename_all = "lowercase")]
pub enum Picture {
    Architecture(ArchitecturePicture),
    Sequence(SequencePicture),
}

/// How an export's legend is laid out.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum LegendLayout {
    Horizontal,
    Vertical,
}

impl LegendLayout {
    /// The word the document spells it with.
    pub fn as_str(self) -> &'static str {
        match self {
            LegendLayout::Horizontal => "horizontal",
            LegendLayout::Vertical => "vertical",
        }
    }
}

/// What an export asks to carry beside the drawing.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ExportFrame {
    /// The words drawn above the picture; none when absent.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub title: Option<String>,
    /// How the legend is laid out; no legend when absent.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub legend: Option<LegendLayout>,
    /// Whether the legend is drawn without the picture.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub legend_only: Option<bool>,
}

/// The comparison a picture is read against, and the page around it.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PageRequest {
    /// How each subject stands, when the picture is a proposal read against another variant.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub standing: Option<BTreeMap<String, Standing>>,
    /// Whether the picture leaves out its comparison's marks.
    pub plain: bool,
    /// The subjects nobody has decided yet.
    pub unsettled: Vec<String>,
    /// Whether the board describes something nobody has built.
    pub unbuilt: bool,
    /// What an export carries beside its drawing.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub frame: Option<ExportFrame>,
}

/// Where a document's faces come from.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum FontSource {
    Linked,
    Embedded,
}

/// The theme a document that stands alone is drawn in.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum StandaloneTheme {
    Light,
    Dark,
    Auto,
}

/// Every theme colour by theme and custom property name.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct ThemeColors {
    pub light: BTreeMap<String, String>,
    pub dark: BTreeMap<String, String>,
}

/// What the document says about itself, and what it needs from its host.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRequest {
    /// What the picture is of, before the page's frame says more.
    pub name: String,
    /// A longer description, when there is one.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub description: Option<String>,
    pub fonts: FontSource,
    /// How long a picture takes to swap its cards' near and far views.
    pub far_view_swap_ms: f64,
    /// Each diagram font file as base64, by name, for a document that embeds its faces.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub font_data: Option<BTreeMap<String, String>>,
    /// The theme a document that stands alone is drawn in; absent, it takes the
    /// theme of the page it is shown in.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub theme: Option<StandaloneTheme>,
    /// The theme colours, where a document that stands alone can be drawn.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub theme_colors: Option<ThemeColors>,
}

/// Everything one picture is painted from.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct PaintRequest {
    pub picture: Picture,
    pub page: PageRequest,
    pub document: DocumentRequest,
    /// Each icon's path data, by its export name: every icon the picture's
    /// appearances name that the host has.
    pub icons: BTreeMap<String, Vec<String>>,
}
