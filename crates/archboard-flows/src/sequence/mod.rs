//! A variant's flows drawn as a stack of message sequences: laid out here,
//! and handed to the painter as the drawing it reads.
//!
//! Every flow the content holds is laid out, because the caller has already
//! said what it wants seen. A picture without its comparison draws of it only
//! the flows, and in each flow the participants and messages, that the
//! variant's own reading holds, and those keep the places they have with the
//! comparison.

mod activations;
mod card;
mod design;
mod frames;
mod layout;
mod messages;
mod placing;
mod rows;

use std::collections::{BTreeMap, HashMap, HashSet};

use archboard_scene::drawing::NodeFacts;
use archboard_scene::request::{
    DocumentRequest, FlowFacts, MessageFacts, NodeAppearance, PageRequest, PaintRequest, Picture,
    SequenceCard, SequenceClock, SequenceColumn, SequenceDrawing, SequenceFlow, SequenceFrame,
    SequencePicture, SequenceStep, StepId, StepNote,
};
use serde::Deserialize;

use crate::board::{Flow, Node, every_step};
use crate::text::Text;
use card::title_room;
use layout::{ActiveAt, Column, DataFlowLayout, FlowLayout, PlacedStep};
use messages::{Ends, ends_for, label_box, self_start, step_box, travel_of};
use rows::pitch_of;

/// Everything a sequence is laid out and painted from.
#[derive(Clone, Debug, Deserialize)]
pub struct SequenceRequest {
    /// Every flow the content holds, in document order.
    pub flows: Vec<Flow>,
    /// The content's nodes, which the participants are.
    pub nodes: Vec<Node>,
    /// The flows of the variant's own reading, when the picture is drawn
    /// without its comparison.
    #[serde(default)]
    pub held: Option<Vec<Flow>>,
    /// Each participant's appearance.
    pub appearances: BTreeMap<String, NodeAppearance>,
    pub clock: SequenceClock,
    pub page: PageRequest,
    pub document: DocumentRequest,
    pub icons: BTreeMap<String, Vec<String>>,
}

/// A sequence laid out, as the painter's request.
pub fn picture(request: SequenceRequest, text: &impl Text) -> PaintRequest {
    let laid = layout::lay_out(text, &request.flows, &request.nodes);
    let shown = request
        .held
        .as_deref()
        .map(|held| drawing_of(&shown_flows(&laid, held)));
    let sequence = SequencePicture {
        laid: drawing_of(&laid),
        shown,
        appearances: request.appearances,
        clock: request.clock,
    };
    PaintRequest {
        picture: Picture::Sequence(sequence),
        page: request.page,
        document: request.document,
        icons: request.icons,
    }
}

/// Where a message's line starts and where it ends: a message to itself
/// starts and ends at its loop.
fn ends_of(placed: &PlacedStep, active: &ActiveAt, travel: i8) -> Ends {
    if travel != 0 {
        return ends_for(placed, active, travel);
    }
    let start = self_start(placed, active.at(&placed.step.from, placed.y));
    Ends { start, end: start }
}

/// One flow as the painter reads it: each message's run, and each card's room
/// for its name.
fn flow_of(layout: &FlowLayout) -> SequenceFlow {
    let active = ActiveAt::of(&layout.columns);
    SequenceFlow {
        flow: FlowFacts {
            id: layout.flow.id.clone(),
            name: layout.flow.name.clone(),
            summary: layout.flow.summary.clone(),
        },
        frame: layout.frame,
        header: layout.header,
        slab: layout.slab,
        lifeline_bottom: layout.lifeline_bottom,
        columns: layout
            .columns
            .iter()
            .map(|column| SequenceColumn {
                card: SequenceCard {
                    node: NodeFacts {
                        id: column.card.node.id.clone(),
                        order: column.card.node.order,
                        name: column.card.node.name.clone(),
                        responsibility: column.card.node.responsibility.clone(),
                    },
                    bounds: column.card.bounds,
                    title_size: column.card.title_size,
                    notes: column.card.notes.clone(),
                    title_room: title_room(&column.card.node, column.card.bounds.width),
                },
                centre_x: column.centre_x,
                lifeline_top: column.lifeline_top,
                activations: column.activations.clone(),
            })
            .collect(),
        steps: layout
            .steps
            .iter()
            .map(|placed| {
                let travel = travel_of(placed.step.kind, placed.from_x, placed.to_x);
                let ends = ends_of(placed, &active, travel);
                SequenceStep {
                    step: MessageFacts {
                        id: placed.step.id.clone(),
                        kind: placed.step.kind,
                        from: placed.step.from.clone(),
                        to: placed.step.to.clone(),
                    },
                    words: archboard_scene::request::MessageWords {
                        lines: placed.words.lines.clone(),
                    },
                    y: placed.y,
                    slot: placed.slot,
                    note: placed.note.as_ref().map(|note| StepNote {
                        bounds: note.bounds,
                        lines: note.lines.clone(),
                    }),
                    travel,
                    start: ends.start,
                    end: ends.end,
                    label_box: label_box(placed, &active),
                    bounds: step_box(placed, &active),
                    pitch: pitch_of(placed.step.kind),
                }
            })
            .collect(),
        frames: layout
            .frames
            .iter()
            .map(|frame| SequenceFrame {
                step: StepId {
                    id: frame.rows.step.id().to_owned(),
                },
                bounds: frame.bounds,
                tab: frame.tab,
                operator: frame.operator,
                words: frame.words.clone(),
                guards: frame.rows.guards.clone(),
            })
            .collect(),
    }
}

/// A stack of flows as the painter reads it.
fn drawing_of(layout: &DataFlowLayout) -> SequenceDrawing {
    SequenceDrawing {
        width: layout.width,
        height: layout.height,
        flows: layout.flows.iter().map(flow_of).collect(),
    }
}

/// A column with the bars no kept message of its participant stands in. A
/// bar only dropped messages opened or held is dropped with them; a bar a kept
/// message stands in stays whole, since that message's ends are placed
/// against it.
fn shown_column(column: &Column, steps: &[PlacedStep]) -> Column {
    let node = column.card.node.id.as_str();
    let activations = column
        .activations
        .iter()
        .filter(|bar| {
            steps.iter().any(|placed| {
                (placed.step.from == node || placed.step.to == node)
                    && bar.top <= placed.y
                    && placed.y <= bar.bottom
            })
        })
        .copied()
        .collect();
    Column {
        activations,
        ..column.clone()
    }
}

/// A sequence with only what the variant's own reading of the view holds:
/// its flows, and in each of them its participants and messages, and the bars
/// those messages stand in. Every frame, column and message kept stands where
/// it stood, on the whole layout's page.
fn shown_flows<'a>(layout: &DataFlowLayout<'a>, held: &[Flow]) -> DataFlowLayout<'a> {
    let own: HashMap<&str, &Flow> = held.iter().map(|flow| (flow.id.as_str(), flow)).collect();
    let flows = layout
        .flows
        .iter()
        .filter_map(|laid| {
            let flow = own.get(laid.flow.id.as_str())?;
            let participants: HashSet<&str> =
                flow.participants.iter().map(String::as_str).collect();
            let told: HashSet<&str> = every_step(&flow.steps)
                .iter()
                .map(|step| step.id())
                .collect();
            let steps: Vec<PlacedStep<'a>> = laid
                .steps
                .iter()
                .filter(|placed| told.contains(placed.step.id.as_str()))
                .cloned()
                .collect();
            let frames = laid
                .frames
                .iter()
                .filter(|frame| told.contains(frame.rows.step.id()))
                .cloned()
                .collect();
            let columns = laid
                .columns
                .iter()
                .filter(|column| participants.contains(column.card.node.id.as_str()))
                .map(|column| shown_column(column, &steps))
                .collect();
            Some(FlowLayout {
                columns,
                steps,
                frames,
                ..laid.clone()
            })
        })
        .collect();
    DataFlowLayout {
        width: layout.width,
        height: layout.height,
        flows,
    }
}
