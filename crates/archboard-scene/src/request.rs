//! What a picture is painted from: the drawing that layout answered, and what
//! the host resolved beside it (the appearance the vault's policy gives each
//! subject, the comparison's standings, the export's frame, the document's
//! settings and the icons it draws).

use std::collections::BTreeMap;

use serde::de::IntoDeserializer;
use serde::de::value::{Error as ValueError, StrDeserializer};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::drawing::{NodeFacts, Painted, TextRun};
use crate::geometry::Rect;

/// How one subject of a proposal stands against the variant it came from.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum Standing {
    /// The proposal has it and the variant it came from did not.
    Added,
    /// The variant it came from had it and the proposal does not.
    Removed,
    /// Both have it, and the proposal changed it.
    Changed,
    /// Both have it, as it was.
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
#[expect(
    missing_docs,
    reason = "each variant is the palette colour its name says, as the vault's policy spells it"
)]
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

    /// The colour a name names, if it is one of the palette's: read as the
    /// contract reads it.
    pub fn named(name: &str) -> Option<PaletteColor> {
        let name: StrDeserializer<'_, ValueError> = name.into_deserializer();
        PaletteColor::deserialize(name).ok()
    }
}

/// Which way the board a part opens lies from the board it is drawn on.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum DrillDirection {
    /// It lies at a coarser level of the vault's levels than the board drawn.
    Up,
    /// It lies at a finer level of the vault's levels than the board drawn.
    Down,
    /// It lies at the same level as the board drawn.
    Across,
    /// The vault lists no level for the part's kind or for the board drawn, so no way can be said.
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
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct NodeAppearance {
    /// Whether the part holds others, and so is drawn as a tray, not a card.
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
    /// The colour of its kind, from the vault's policy.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub type_color: Option<PaletteColor>,
    /// The export name of its kind's icon.
    pub icon: String,
    /// What its kind is called.
    pub type_name: String,
    /// The key of its kind in the vault's policy.
    pub type_kind: String,
    /// Which way the board it opens lies, or null when it opens none.
    pub drill: Option<DrillDirection>,
}

/// How a line is dashed.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[expect(missing_docs, reason = "each variant is the dash style its name says")]
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
#[expect(
    missing_docs,
    reason = "each variant is the arrowhead its name says, or none"
)]
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
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct LineAppearance {
    /// What its relationship kind is called, which the line carries as `data-type-name`.
    pub name: String,
    /// Its kind's colour; absent for the neutral line.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub color: Option<PaletteColor>,
    /// How it is dashed.
    pub dash: Dash,
    /// Which arrowhead it ends in.
    pub arrowhead: Arrowhead,
}

/// Which shape a flowchart draws a step as (ADR 0053).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum FlowchartShape {
    /// A decision, drawn as a diamond.
    Decision,
    /// A loop, drawn as a hexagon.
    Loop,
    /// Where a flow starts.
    Start,
    /// Where a flow ends.
    End,
}

impl FlowchartShape {
    /// Whether it is where a flow starts or ends, which no reader picks.
    pub fn is_terminal(self) -> bool {
        matches!(self, FlowchartShape::Start | FlowchartShape::End)
    }
}

/// One card a flowchart draws as a shape, and its wrapped words.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct ShapedCard {
    /// Which shape it is drawn as.
    pub shape: FlowchartShape,
    /// Its name, wrapped into the lines it is set in.
    pub words: Vec<String>,
}

/// What a flowchart adds to an architecture's painting.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
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
    /// The height where the bar begins.
    pub top: f64,
    /// The height where the bar ends.
    pub bottom: f64,
}

/// The card heading one column of a sequence.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SequenceCard {
    /// The participant it heads.
    pub node: NodeFacts,
    /// The card's box.
    #[serde(rename = "box")]
    #[ts(rename = "box")]
    pub bounds: Rect,
    /// The size its name is set at, fitted to the room it has.
    pub title_size: f64,
    /// The lines of its responsibility, positioned from the card's box.
    pub notes: Vec<TextRun>,
    /// The run its name has: the text run, less the mark of a part that opens a board.
    pub title_room: f64,
}

/// One participant, as a column of the drawing.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SequenceColumn {
    /// The card that heads it.
    pub card: SequenceCard,
    /// Where its lifeline runs, as a distance from the left edge.
    pub centre_x: f64,
    /// The height its lifeline starts at.
    pub lifeline_top: f64,
    /// The stretches where it is working on a call it received.
    pub activations: Vec<Activation>,
}

/// What a message does.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum MessageKind {
    /// A call whose sender waits for the answer.
    Sync,
    /// A message that is sent and not waited for.
    Async,
    /// The answer to an earlier call, which carries a result back.
    Return,
    /// A step that never leaves its sender; the document spells it `self`.
    #[serde(rename = "self")]
    #[ts(rename = "self")]
    Myself,
}

/// What the painter reads of a message.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct MessageFacts {
    /// The step's id.
    pub id: String,
    /// What the message does.
    pub kind: MessageKind,
    /// The id of the node that sends it.
    pub from: String,
    /// The id of the node that receives it: the sender again for a message to itself.
    pub to: String,
}

/// One line of a message's words, with its painted width.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct WordLine {
    /// The words of this line.
    pub text: String,
    /// How wide the words are painted.
    pub width: f64,
}

/// A message's words as drawn.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct MessageWords {
    /// The lines the words wrap to, first line first.
    pub lines: Vec<WordLine>,
}

/// A step's note, placed under its message.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct StepNote {
    /// The note's plate.
    #[serde(rename = "box")]
    #[ts(rename = "box")]
    pub bounds: Rect,
    /// The note's words, positioned from its plate's box.
    pub lines: Vec<TextRun>,
}

/// This message's turn on the drawing's shared clock.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct Slot {
    /// The first turn of the clock that it takes.
    pub start: u32,
    /// How many turns it takes: a repeated step takes its repeat, capped.
    pub count: u32,
}

/// One message, placed on its row, with where its line runs.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SequenceStep {
    /// The message.
    pub step: MessageFacts,
    /// Its label, wrapped to the room between the lifelines it stands between.
    pub words: MessageWords,
    /// The height its line runs at.
    pub y: f64,
    /// Its turn on the drawing's clock.
    pub slot: Slot,
    /// The note set under it, when it has one.
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
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct StepId {
    /// The decision's or loop's id.
    pub id: String,
}

/// One alternative's label row inside a decision's frame.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct FrameGuard {
    /// The alternative's label.
    pub label: String,
    /// The height where its row begins.
    pub top: f64,
    /// The height of the dashed line that parts it from the alternative above; absent on the first.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub divider: Option<f64>,
}

/// What a frame's tab says.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum FrameOperator {
    /// A decision, which the tab spells `alt`.
    Alt,
    /// A loop, which the tab spells `loop`.
    Loop,
}

/// A decision's or loop's frame, placed.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct SequenceFrame {
    /// The decision or loop it frames.
    pub step: StepId,
    /// The frame's box.
    #[serde(rename = "box")]
    #[ts(rename = "box")]
    pub bounds: Rect,
    /// The tab at the frame's top left corner, which its operator stands in.
    pub tab: Rect,
    /// What the tab says.
    pub operator: FrameOperator,
    /// What the head row says beside the tab: the question, or the condition.
    pub words: String,
    /// Each alternative's label row, in order; empty for a loop.
    pub guards: Vec<FrameGuard>,
}

/// What the painter reads of a flow.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct FlowFacts {
    /// The flow's id.
    pub id: String,
    /// What the flow is called.
    pub name: String,
    /// A line on what the flow explains, when it has one.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub summary: Option<String>,
}

/// One flow, placed.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SequenceFlow {
    /// The flow.
    pub flow: FlowFacts,
    /// The box around the whole exchange.
    pub frame: Rect,
    /// Where the frame's name and summary go.
    pub header: Rect,
    /// The header slab the name and summary stand on, its front edge included.
    pub slab: Rect,
    /// The height where the lifelines stop.
    pub lifeline_bottom: f64,
    /// Its participants, in the order the flow states them.
    pub columns: Vec<SequenceColumn>,
    /// Its messages, in the order the flow states them.
    pub steps: Vec<SequenceStep>,
    /// Its decisions' and loops' frames, each after the frames inside it.
    pub frames: Vec<SequenceFrame>,
}

/// A stack of flows, placed down the page.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct SequenceDrawing {
    /// The width the frames asked for.
    pub width: f64,
    /// The height they asked for.
    pub height: f64,
    /// The flows, in document order, down the page.
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
    /// How the pulses of the exchange are timed.
    pub clock: SequenceClock,
}

/// What a picture is.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(tag = "grammar", rename_all = "lowercase")]
pub enum Picture {
    /// A board of parts and relationships, or a flowchart drawn as one.
    Architecture(Box<ArchitecturePicture>),
    /// A stack of message sequences.
    Sequence(SequencePicture),
}

/// How an export's legend is laid out.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[expect(missing_docs, reason = "each variant is the layout its name says")]
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
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
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
    /// The document names its faces by the URL the host serves them at.
    Linked,
    /// The document carries its faces as base64 data (`font_data`).
    Embedded,
}

/// The theme a document that stands alone is drawn in.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum StandaloneTheme {
    /// Drawn in the light theme's colours.
    Light,
    /// Drawn in the dark theme's colours.
    Dark,
    /// Drawn in both, and shown in the one the reader's page is in.
    Auto,
}

/// Every theme colour by theme and custom property name.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct ThemeColors {
    /// The colour of each custom property in the light theme.
    pub light: BTreeMap<String, String>,
    /// The colour of each custom property in the dark theme.
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
    /// Where the document's faces come from.
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
    /// What is drawn.
    pub picture: Picture,
    /// The comparison the picture is read against, and the page around it.
    pub page: PageRequest,
    /// What the document says about itself and what it needs from its host.
    pub document: DocumentRequest,
    /// Each icon's path data, by its export name: every icon the picture's
    /// appearances name that the host has.
    pub icons: BTreeMap<String, Vec<String>>,
}

#[cfg(test)]
mod tests {
    use super::PaletteColor;

    #[test]
    fn names_a_palette_colour_as_the_contract_spells_it() {
        assert_eq!(PaletteColor::named("fuchsia"), Some(PaletteColor::Fuchsia));
        assert_eq!(PaletteColor::named("neutral"), None);
        assert_eq!(PaletteColor::named("Rose"), None);
    }
}
