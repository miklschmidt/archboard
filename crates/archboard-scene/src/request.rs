//! What a picture is painted from: the drawing that layout answered, and what
//! the host resolved beside it (the appearance the vault's policy gives each
//! subject, the comparison's standings, the export's frame, the document's
//! settings and the icons it draws).

use std::collections::BTreeMap;

use serde::de::IntoDeserializer;
use serde::de::value::{Error as ValueError, StrDeserializer};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::drawing::Painted;
pub use crate::sequence_picture::{
    Activation, FlowFacts, FrameGuard, FrameOperator, MessageFacts, MessageKind, MessageWords,
    SequenceCard, SequenceClock, SequenceColumn, SequenceDrawing, SequenceFlow, SequenceFrame,
    SequencePicture, SequenceStep, Slot, StepId, StepNote, WordLine,
};

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
    /// The shapes of a flowchart; absent on an architecture.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub flowchart: Option<FlowchartParts>,
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
    /// How long a picture takes to swap its cards' near and far views.
    pub far_view_swap_ms: f64,
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
