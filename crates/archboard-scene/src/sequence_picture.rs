//! The picture of a sequence: its participants' cards and columns, the messages,
//! notes, frames and flows laid out down the page, and the clock that times the
//! pulses (what `Picture::Sequence` carries).

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::drawing::{NodeFacts, TextRun};
use crate::geometry::Rect;
use crate::request::NodeAppearance;

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
