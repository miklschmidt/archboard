//! The drawing: the geometry that layout answers, which is the input contract
//! of the core (ADR 0057). Measurement and placement meet here; the painter
//! consumes these values unchanged.
//!
//! A drawing of an architecture is generic over what each card and each line
//! stands for: the layout in TypeScript holds the board's own nodes and
//! relationships in it, and the painter reads only the facts it needs
//! ([`NodeFacts`], [`EdgeFacts`]).

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::geometry::{Curve, Rect};

/// Which of the two families a piece of text is set in.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(rename = "DiagramFamily")]
#[expect(missing_docs, reason = "each variant is the family its name says")]
pub enum FontFamily {
    Sans,
    Mono,
}

/// One face: a family and a weight, which together name exactly one file.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
pub struct DiagramFont {
    /// Which family.
    pub family: FontFamily,
    /// Which weight: only 400 and 500 exist as files.
    #[ts(type = "400 | 500")]
    pub weight: u16,
}

/// What a measured line is, which decides its ink.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum TextRole {
    /// A name, set in the foreground ink.
    Title,
    /// A responsibility or a note, set in the muted ink.
    Note,
    /// A relationship's or a message's words, set in the ink of the label's plate.
    Label,
}

/// One measured line, positioned relative to its card or label box.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct TextRun {
    /// The words of the line.
    pub text: String,
    /// Where the line starts, from the left edge of its box.
    pub x: f64,
    /// Its baseline, from the top edge of its box.
    pub y: f64,
    /// How wide it is set.
    pub width: f64,
    /// The face it is set in.
    pub font: DiagramFont,
    /// Its size.
    pub font_size: f64,
    /// What the line is, which decides its ink.
    pub role: TextRole,
}

/// Text and minimum dimensions supplied to the layout engine.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct MeasuredNode<N> {
    /// The node it was measured for.
    pub node: N,
    /// Its least width.
    pub width: f64,
    /// Its least height.
    pub height: f64,
    /// Zero for a card; the reserved title area for a containing node.
    pub header_height: f64,
    /// The measured lines of its words.
    pub runs: Vec<TextRun>,
    /// A container's header as it stands at each width it can take, from its
    /// least, this node itself, to the width its words take one line each at;
    /// each wider one is shorter. A layout picks one once it knows how wide the
    /// container is (TASK-486). Absent where the header has one height.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub headers: Option<Vec<MeasuredNode<N>>>,
    /// For a card whose lines down leave it from its points, as out of a
    /// flowchart's decision: how far in from the left and right edges of its
    /// box the lines from its side points run down. Absent on a card whose
    /// lines spread along its face.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub pointed: Option<f64>,
}

/// A relationship label whose words and box are settled before routing.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct MeasuredLabel {
    /// How wide the label's box is.
    pub width: f64,
    /// How tall the label's box is.
    pub height: f64,
    /// The measured lines of its words.
    pub runs: Vec<TextRun>,
    /// The chips the label stands on, from the top of its box: one for a
    /// label, and one for each relationship a joined line stacks (ADR 0052).
    pub chips: Vec<Chip>,
}

/// One chip of a label, by its offset from the top of the label's box.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct Chip {
    /// Where the chip begins, from the top of the label's box.
    pub y: f64,
    /// How tall the chip is.
    pub height: f64,
}

/// One card or containing frame, in the final drawing coordinate space.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct DrawingNode<N> {
    /// The node and its measured words.
    pub measured: MeasuredNode<N>,
    /// Where the node stands in the drawing, and its size.
    #[serde(rename = "box")]
    #[ts(rename = "box")]
    pub bounds: Rect,
    /// How deeply it nests: 0 at the top level. Containers are painted shallowest first.
    pub depth: f64,
}

/// Where a caption or a label sits, and its words.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct PlacedLabel {
    /// The label's box in the drawing.
    #[serde(rename = "box")]
    #[ts(rename = "box")]
    pub bounds: Rect,
    /// The label's measured words.
    pub measured: MeasuredLabel,
}

impl PlacedLabel {
    /// Each chip's box, where the picture puts it.
    pub fn chips(&self) -> impl Iterator<Item = Rect> + '_ {
        self.measured.chips.iter().map(|chip| Rect {
            y: self.bounds.y + chip.y,
            height: chip.height,
            ..self.bounds
        })
    }
}

/// A group's region: the cards one group places inside one container, gathered and captioned.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct DrawingRegion {
    /// The id of the group.
    pub group: String,
    /// The container the region sits in; absent on the board itself.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub parent: Option<String>,
    /// The cards and containers the board places in this group inside that
    /// container, which a viewer lights the region for.
    pub members: Vec<String>,
    /// The region's box.
    #[serde(rename = "box")]
    #[ts(rename = "box")]
    pub bounds: Rect,
    /// Where its caption sits, and its words.
    pub caption: PlacedLabel,
    /// How deeply the region nests: 0 at the top level. Regions are painted shallowest first.
    pub depth: f64,
}

/// A final route and its optional measured label in the same coordinates.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct DrawingEdge<E> {
    /// What the route stands for.
    pub edge: E,
    /// Where the route runs, as straight runs and cubic bends.
    pub curve: Curve,
    /// The label that stands on the route, when it has words.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub label: Option<PlacedLabel>,
}

/// Which way content reads on the page: architecture diagrams read top to bottom.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[expect(
    missing_docs,
    reason = "the one variant is the direction the enum's own doc names"
)]
pub enum ReadingDirection {
    Down,
}

/// The single geometry result consumed by both SVG painting and the atlas.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct ArchitectureDrawing<N, E> {
    /// Which way this content reads on the page.
    pub direction: ReadingDirection,
    /// How wide the layout is.
    pub width: f64,
    /// How tall the layout is.
    pub height: f64,
    /// The parts drawn as cards.
    pub cards: Vec<DrawingNode<N>>,
    /// The parts drawn as containers, which hold others.
    pub containers: Vec<DrawingNode<N>>,
    /// The routes, one for each relationship drawn.
    pub edges: Vec<DrawingEdge<E>>,
    /// Group regions, when the engine gathers groups (TASK-347).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub regions: Option<Vec<DrawingRegion>>,
}

/// A raised arc where one route crosses others, on the route that carries it.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct DrawingBridge {
    /// The id of the route that carries the bridge.
    pub edge_id: String,
    /// The ids of the routes it crosses over.
    pub under: Vec<String>,
    /// The raised arc, which replaces the stretch of the route it spans.
    pub curve: Curve,
    /// A join on the upper line stands on this piece: the cut clears its mark too.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional, type = "true")]
    pub join: Option<bool>,
}

/// The routes with their bridges spliced in, and the bridges.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Bridged<E> {
    /// The routes, each with its bridges spliced in.
    pub edges: Vec<DrawingEdge<E>>,
    /// The bridges.
    pub bridges: Vec<DrawingBridge>,
}

/// The drawing as the painter draws it: the routes with their bridges spliced
/// in, beside the un-bridged routes that identify their corridors. The layout
/// owner returns both, so painter, atlas and interaction share one geometry.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct PaintedDrawing<N, E> {
    /// The drawing, with the routes before their bridges are spliced in.
    #[serde(flatten)]
    pub drawing: ArchitectureDrawing<N, E>,
    /// The routes with their bridges spliced in, and the bridges.
    pub bridged: Bridged<E>,
}

/// What the painter reads of a node: which it is, what it is called and what
/// it is responsible for, and where it stands in the board's order.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct NodeFacts {
    /// The node's id.
    pub id: String,
    /// Where it stands in the board's order.
    pub order: f64,
    /// What it is called.
    pub name: String,
    /// What it is responsible for, when the board says.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub responsibility: Option<String>,
}

/// How loudly a line speaks.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum Emphasis {
    /// The line that matters most: drawn thicker.
    Hero,
    /// An ordinary line.
    Normal,
    /// A line that recedes: drawn paler.
    Muted,
}

/// Illustration-only traffic on a relationship (ADR 0027).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct Traffic {
    /// How fast the pulses fly, in diagram units a second, as the author gave it.
    pub speed: f64,
    /// How many pulses a second the line carries, as the author gave it: speed divided by volume is the distance between pulses, within limits.
    pub volume: f64,
}

/// What the painter reads of a relationship.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct EdgeFacts {
    /// The relationship's id.
    pub id: String,
    /// The id of the node it starts at.
    pub from: String,
    /// The id of the node it ends at.
    pub to: String,
    /// The key of its kind in the vault's policy.
    pub kind: String,
    /// How loudly it speaks.
    pub emphasis: Emphasis,
    /// The traffic it carries; absent for a line with none.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub traffic: Option<Traffic>,
}

/// The architecture drawing as the painter reads it.
pub type Painted = PaintedDrawing<NodeFacts, EdgeFacts>;
/// One card or frame as the painter reads it.
pub type Node = DrawingNode<NodeFacts>;
/// One line as the painter reads it.
pub type Edge = DrawingEdge<EdgeFacts>;
