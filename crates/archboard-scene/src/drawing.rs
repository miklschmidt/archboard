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
    Title,
    Note,
    Label,
}

/// One measured line, positioned relative to its card or label box.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct TextRun {
    pub text: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub font: DiagramFont,
    pub font_size: f64,
    pub role: TextRole,
}

/// Text and minimum dimensions supplied to the layout engine.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct MeasuredNode<N> {
    pub node: N,
    pub width: f64,
    pub height: f64,
    /// Zero for a card; the reserved title area for a containing node.
    pub header_height: f64,
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
    pub width: f64,
    pub height: f64,
    pub runs: Vec<TextRun>,
}

/// One card or containing frame, in the final drawing coordinate space.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct DrawingNode<N> {
    pub measured: MeasuredNode<N>,
    #[serde(rename = "box")]
    #[ts(rename = "box")]
    pub bounds: Rect,
    pub depth: f64,
}

/// Where a caption or a label sits, and its words.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct PlacedLabel {
    #[serde(rename = "box")]
    #[ts(rename = "box")]
    pub bounds: Rect,
    pub measured: MeasuredLabel,
}

/// A group's region: the cards one group places inside one container, gathered and captioned.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct DrawingRegion {
    pub group: String,
    /// The container the region sits in; absent on the board itself.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub parent: Option<String>,
    /// The cards and containers the board places in this group inside that
    /// container, which a viewer lights the region for.
    pub members: Vec<String>,
    #[serde(rename = "box")]
    #[ts(rename = "box")]
    pub bounds: Rect,
    /// Where its caption sits, and its words.
    pub caption: PlacedLabel,
    pub depth: f64,
}

/// A final route and its optional measured label in the same coordinates.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct DrawingEdge<E> {
    pub edge: E,
    pub curve: Curve,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub label: Option<PlacedLabel>,
}

/// Which way content reads on the page: architecture diagrams read top to bottom.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum ReadingDirection {
    Down,
}

/// The single geometry result consumed by both SVG painting and the atlas.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct ArchitectureDrawing<N, E> {
    /// Which way this content reads on the page.
    pub direction: ReadingDirection,
    pub width: f64,
    pub height: f64,
    pub cards: Vec<DrawingNode<N>>,
    pub containers: Vec<DrawingNode<N>>,
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
    pub edge_id: String,
    pub under: Vec<String>,
    pub curve: Curve,
    /// A join on the upper line stands on this piece: the cut clears its mark too.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional, type = "true")]
    pub join: Option<bool>,
}

/// The routes with their bridges spliced in, and the bridges.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Bridged<E> {
    pub edges: Vec<DrawingEdge<E>>,
    pub bridges: Vec<DrawingBridge>,
}

/// The drawing as the painter draws it: the routes with their bridges spliced
/// in, beside the un-bridged routes that identify their corridors. The layout
/// owner returns both, so painter, atlas and interaction share one geometry.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct PaintedDrawing<N, E> {
    #[serde(flatten)]
    pub drawing: ArchitectureDrawing<N, E>,
    pub bridged: Bridged<E>,
}

/// What the painter reads of a node: which it is, what it is called and what
/// it is responsible for, and where it stands in the board's order.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct NodeFacts {
    pub id: String,
    pub order: f64,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub responsibility: Option<String>,
}

/// How loudly a line speaks.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum Emphasis {
    Hero,
    Normal,
    Muted,
}

/// Illustration-only traffic on a relationship (ADR 0027).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct Traffic {
    pub speed: f64,
    pub volume: f64,
}

/// What the painter reads of a relationship.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TS)]
pub struct EdgeFacts {
    pub id: String,
    pub from: String,
    pub to: String,
    pub kind: String,
    pub emphasis: Emphasis,
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
