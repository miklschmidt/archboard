//! Where every participant column, lifeline and message of a message sequence
//! goes.
//!
//! Forked from PR Lens's `layout/dataflow.ts`. The skeleton is upstream's and
//! is why the rest reads as it does: a flow is a row of equal-width columns,
//! each with a card at its head and a lifeline hanging under it, and the
//! messages are horizontal runs stacked down the page in the order the flow
//! states them. Order is array position: a flow carries no step number.
//!
//! There is no cap on participants or steps: ADR 0023 refuses size-driven
//! limits, so nothing here may assume a small number of either.
//!
//! One shared animation clock advances through all flows in stated order, so
//! messages animate one after another instead of every exchange at once.
//!
//! What is new is the frame: a flow is a single named box around the whole
//! exchange, which is what lets several flows stack down one page and still be
//! told apart.

use std::collections::HashMap;

use archboard_scene::geometry::Rect;
use archboard_scene::js;
use archboard_scene::request::{Activation, FrameGuard, FrameOperator, Slot};

use crate::board::{Decision, Flow, Loop, Message, Node};
use crate::sequence::activations::activations_for;
use crate::sequence::card::{
    Card, card_content_width, card_height, card_notes, card_text_width, mark_room, title_room,
};
use crate::sequence::design::{
    ARCHITECTURE_CARD_PADDING, COLUMN_GAP, COLUMN_MAX_WIDTH, COLUMN_MIN_WIDTH,
    CONTAINER_BOTTOM_PAD, DIAGRAM_MARGIN, FIRST_MESSAGE_DROP, FLOW_BOTTOM_PADDING, FLOW_GAP,
    HEADER_HEIGHT, HEADER_HEIGHT_WITH_NOTE, HEADER_SLAB_INSET, ICON_MIN_CARD_WIDTH, LIFELINE_GAP,
    NEST_INSET, TITLE_SIZE, TITLE_SIZE_MIN, TITLE_SIZE_SMALL, TITLE_SIZE_STEP,
};
use crate::sequence::frames::{place_frames, span_around};
use crate::sequence::messages::frame_span;
use crate::sequence::placing::{lowest_drawn, place_steps};
use crate::sequence::rows::{ColumnBounds, MessageWords, PlacedNote, required_note_column_width};
use archboard_scene::paint::fonts::CARD_TITLE_FONT;

use crate::text::{Text, fitted_size};

/// Which alternative of each decision that holds a message it runs on, by
/// decision id. Two messages on different alternatives of one decision never
/// both run, so a reply on one cannot answer a call on the other.
#[derive(Clone, Debug, Default)]
pub(super) struct Branch(Vec<(String, String)>);

impl Branch {
    /// The alternative it runs on of one decision, if that decision holds it.
    pub(super) fn of(&self, decision: &str) -> Option<&str> {
        self.0
            .iter()
            .find(|(held, _)| held == decision)
            .map(|(_, alternative)| alternative.as_str())
    }

    /// Every decision that holds it, and the alternative it runs on.
    pub(super) fn iter(&self) -> impl Iterator<Item = (&str, &str)> {
        self.0
            .iter()
            .map(|(decision, alternative)| (decision.as_str(), alternative.as_str()))
    }

    /// It runs on one alternative of one more decision.
    pub(super) fn set(&mut self, decision: &str, alternative: &str) {
        match self.0.iter_mut().find(|(held, _)| held == decision) {
            Some(held) => held.1 = alternative.to_owned(),
            None => self.0.push((decision.to_owned(), alternative.to_owned())),
        }
    }
}

/// One participant, as a column of the drawing.
#[derive(Clone, Debug)]
pub(super) struct Column {
    /// The card heading the column.
    pub card: Card,
    /// Where its lifeline runs.
    pub centre_x: f64,
    /// Where its lifeline starts: the same air under its own card as under every other.
    pub lifeline_top: f64,
    /// The stretches where it is working on a call it received.
    pub activations: Vec<Activation>,
}

/// One message, placed on its row.
#[derive(Clone, Debug)]
pub(super) struct PlacedStep<'a> {
    pub step: &'a Message,
    pub branch: Branch,
    /// The label's lines, wrapped to the room between the lifelines it stands between.
    pub words: MessageWords,
    /// The height its line runs at.
    pub y: f64,
    /// The lifeline it leaves.
    pub from_x: f64,
    /// The lifeline it arrives at.
    pub to_x: f64,
    pub note: Option<PlacedNote>,
    /// Its turn on the drawing's shared clock. The clock is the whole
    /// drawing's, so turns keep counting across the stack of flows. Every
    /// message takes a turn and the turns do not overlap, so a reader sees the
    /// exchange told in order. A repeated step sends its repeat, capped, so a
    /// step somebody wrote `×40` on does not take the whole cycle.
    pub slot: Slot,
}

/// A decision or a loop of a flow.
#[derive(Clone, Copy, Debug)]
pub(super) enum FrameStep<'a> {
    Decision(&'a Decision),
    Loop(&'a Loop),
}

impl FrameStep<'_> {
    /// Its id.
    pub(super) fn id(&self) -> &str {
        match self {
            FrameStep::Decision(decision) => &decision.id,
            FrameStep::Loop(repeat) => &repeat.id,
        }
    }
}

/// A decision or loop placed down the page, before its sides are known.
#[derive(Clone, Debug)]
pub(super) struct FrameRows<'a> {
    pub step: FrameStep<'a>,
    /// Where its frame begins.
    pub top: f64,
    /// Where it ends.
    pub bottom: f64,
    /// Each alternative's label row, in order; none for a loop.
    pub guards: Vec<FrameGuard>,
    /// The messages it holds, at any depth.
    pub messages: Vec<String>,
    /// The frames directly inside it.
    pub inner: Vec<String>,
}

/// A decision's or loop's frame, placed.
#[derive(Clone, Debug)]
pub(super) struct PlacedFrame<'a> {
    pub rows: FrameRows<'a>,
    /// The frame.
    pub bounds: Rect,
    /// The tab at its top left corner that its operator stands in.
    pub tab: Rect,
    /// What the tab says: `alt` for a decision, `loop` for a loop.
    pub operator: FrameOperator,
    /// What the head row says beside the tab: the question, or the condition.
    pub words: String,
}

/// One flow, placed.
#[derive(Clone, Debug)]
pub(super) struct FlowLayout<'a> {
    pub flow: &'a Flow,
    /// The box around the whole exchange.
    pub frame: Rect,
    /// Where the frame's name and summary go.
    pub header: Rect,
    /// The header slab the name and summary stand on, its front edge included.
    pub slab: Rect,
    /// Where the lifelines stop.
    pub lifeline_bottom: f64,
    /// Its participants, in the order the flow states them.
    pub columns: Vec<Column>,
    /// Its messages, in the order the flow states them.
    pub steps: Vec<PlacedStep<'a>>,
    /// Its decisions' and loops' frames, each after the frames inside it.
    pub frames: Vec<PlacedFrame<'a>>,
}

/// A stack of flows, placed down one page.
#[derive(Clone, Debug)]
pub(super) struct DataFlowLayout<'a> {
    /// The width the frames asked for.
    pub width: f64,
    /// The height they asked for.
    pub height: f64,
    /// The flows, in document order.
    pub flows: Vec<FlowLayout<'a>>,
}

/// Which columns are busy where, as one question a caller can ask. An
/// activated column is a bar rather than a line, so an arrow that touches one
/// stops at its edge; every caller that draws or measures a message asks this
/// first.
pub(super) struct ActiveAt<'a> {
    by_node: HashMap<&'a str, &'a [Activation]>,
}

impl<'a> ActiveAt<'a> {
    /// The question for one flow's columns.
    pub(super) fn of(columns: &'a [Column]) -> Self {
        ActiveAt {
            by_node: columns
                .iter()
                .map(|column| (column.card.node.id.as_str(), column.activations.as_slice()))
                .collect(),
        }
    }

    /// Whether a participant is busy at a height.
    pub(super) fn at(&self, node: &str, y: f64) -> bool {
        self.by_node
            .get(node)
            .is_some_and(|bars| bars.iter().any(|bar| bar.top <= y && y <= bar.bottom))
    }
}

/// The largest of some numbers, and the floor when there are none.
pub(super) fn largest(values: impl IntoIterator<Item = f64>, floor: f64) -> f64 {
    values.into_iter().fold(floor, js::js_max)
}

/// The node a column stands for. A board whose flows name nodes it does not
/// hold is refused before it is read, so the stand-in is a backstop: a column
/// named after the id, because a sequence that silently lost a participant
/// would be a different sequence.
fn participant_node(id: &str, by_id: &HashMap<&str, &Node>) -> Node {
    by_id.get(id).map_or_else(
        || Node {
            id: id.to_owned(),
            order: 0.0,
            name: id.to_owned(),
            kind: "other".to_owned(),
            responsibility: None,
            drill_down: None,
        },
        |node| (*node).clone(),
    )
}

/// The one width every column of every flow is drawn at, and each
/// participant's measured responsibility.
///
/// One width rather than one per flow, because stacked flows share a page and
/// columns that almost line up read as a mistake; one rather than one per
/// column, because a column's width is also the step between lifelines. The
/// cap keeps one long name from widening every column, and a name past it
/// shrinks its title first; what still does not fit at the smallest title
/// size widens every column together rather than being cut.
fn measure_columns(
    text: &impl Text,
    flows: &[Flow],
    by_id: &HashMap<&str, &Node>,
) -> (f64, HashMap<String, Vec<archboard_scene::drawing::TextRun>>) {
    let asked = flows.iter().flat_map(|flow| {
        flow.participants
            .iter()
            .map(|participant| card_content_width(text, &participant_node(participant, by_id)))
    });
    // A whole unit: adding measured widths leaves floating-point dust, and a
    // card handed back exactly the width its name measured would cut it.
    let preferred = js::js_min(COLUMN_MAX_WIDTH, largest(asked, COLUMN_MIN_WIDTH).ceil());
    // Whole-line kerning and unbroken identifiers can exceed the preferred
    // wrap width: every column widens together so whole notes fit their cards.
    let mut participants: Vec<&str> = Vec::new();
    for flow in flows {
        for participant in &flow.participants {
            if !participants.contains(&participant.as_str()) {
                participants.push(participant);
            }
        }
    }
    let nodes: Vec<Node> = participants
        .iter()
        .map(|id| participant_node(id, by_id))
        .collect();
    let notes: Vec<(String, Vec<_>)> = nodes
        .iter()
        .map(|node| (node.id.clone(), card_notes(text, node, preferred)))
        .collect();
    let painted = notes
        .iter()
        .flat_map(|(_, runs)| runs.iter().map(|run| run.width));
    let names = nodes
        .iter()
        .map(|node| text.width(&node.name, CARD_TITLE_FONT, TITLE_SIZE_MIN) + mark_room(node));
    let insets = preferred - card_text_width(preferred);
    let width = js::max([
        preferred,
        (largest(painted, 0.0) + insets).ceil(),
        (largest(names, 0.0) + insets).ceil(),
        required_note_column_width(text, flows),
    ]);
    (width, notes.into_iter().collect())
}

/// The card heading one column. A long name steps down in half-points before
/// it is cut, against the run the painter will use; the responsibility's
/// lines are whole and already measured.
fn place_column_card(
    text: &impl Text,
    node: Node,
    centre_x: f64,
    top: f64,
    width: f64,
    notes: Vec<archboard_scene::drawing::TextRun>,
) -> Card {
    let bounds = Rect {
        x: centre_x - width / 2.0,
        y: top,
        width,
        height: card_height(&notes),
    };
    let earned = if width >= ICON_MIN_CARD_WIDTH {
        TITLE_SIZE
    } else {
        TITLE_SIZE_SMALL
    };
    let title_size = fitted_size(
        text,
        &node.name,
        CARD_TITLE_FONT,
        earned,
        title_room(&node, width),
        TITLE_SIZE_MIN,
        TITLE_SIZE_STEP,
    );
    Card {
        node,
        bounds,
        title_size,
        notes,
    }
}

/// One flow, placed, its frame starting at a height and its messages at a
/// turn of the drawing's clock.
fn layout_flow<'a>(
    text: &impl Text,
    flow: &'a Flow,
    by_id: &HashMap<&str, &Node>,
    (column_width, notes): &(f64, HashMap<String, Vec<archboard_scene::drawing::TextRun>>),
    top: f64,
    turn: u32,
) -> FlowLayout<'a> {
    let column_width = *column_width;
    let nodes: Vec<Node> = flow
        .participants
        .iter()
        .map(|participant| participant_node(participant, by_id))
        .collect();
    let content_left = DIAGRAM_MARGIN + NEST_INSET;
    let centres: Vec<f64> = (0..nodes.len())
        .map(|index| content_left + column_width / 2.0 + index as f64 * (column_width + COLUMN_GAP))
        .collect();
    let count = nodes.len() as f64;
    let content_width = column_width * count + COLUMN_GAP * (count - 1.0);

    // The header slab stands in the frame's well as a container's does, with
    // the words on it as a card's stand on its own, and the heads stand as far
    // under its foot as in from the frame's sides.
    let slab_top = top + HEADER_SLAB_INSET;
    let header_top = slab_top + ARCHITECTURE_CARD_PADDING;
    let header_height = if flow.summary.is_none() {
        HEADER_HEIGHT
    } else {
        HEADER_HEIGHT_WITH_NOTE
    };
    let slab_foot = header_top + header_height + ARCHITECTURE_CARD_PADDING;
    let cards_top = slab_foot + NEST_INSET;
    let placed_cards: Vec<Card> = nodes
        .into_iter()
        .enumerate()
        .map(|(index, node)| {
            let held = notes.get(&node.id).cloned().unwrap_or_default();
            place_column_card(text, node, centres[index], cards_top, column_width, held)
        })
        .collect();
    // The heads are one row of one height, so every lifeline starts level.
    let tallest = largest(placed_cards.iter().map(|card| card.bounds.height), 0.0);
    let cards: Vec<Card> = placed_cards
        .into_iter()
        .map(|mut card| {
            card.bounds.height = tallest;
            card
        })
        .collect();
    let first_row = cards_top + tallest + LIFELINE_GAP + FIRST_MESSAGE_DROP;

    let centre_of: HashMap<&str, f64> = flow
        .participants
        .iter()
        .zip(&centres)
        .map(|(participant, centre)| (participant.as_str(), *centre))
        .collect();
    let (steps, rows) = place_steps(
        text,
        &flow.steps,
        &centre_of,
        ColumnBounds {
            left: content_left,
            right: content_left + content_width,
            pitch: column_width + COLUMN_GAP,
            first_centre: centres.first().copied().unwrap_or(0.0),
            last_centre: centres.last().copied().unwrap_or(0.0),
        },
        first_row,
        turn,
    );
    let lifeline_bottom = lowest_drawn(&steps, &rows, first_row) + FLOW_BOTTOM_PADDING;

    let columns: Vec<Column> = cards
        .into_iter()
        .enumerate()
        .map(|(index, card)| {
            let activations = activations_for(&card.node.id, &steps);
            Column {
                centre_x: centres[index],
                lifeline_top: card.bounds.y + card.bounds.height + LIFELINE_GAP,
                activations,
                card,
            }
        })
        .collect();
    let active = ActiveAt::of(&columns);
    let frames = place_frames(text, rows, &steps, &active, content_left, content_width);

    // The title row spans the frame, which a message's words, or a decision's
    // or loop's frame, may have widened.
    let (x, width) = span_around(
        frame_span(
            &steps,
            &active,
            DIAGRAM_MARGIN,
            NEST_INSET * 2.0 + content_width,
        ),
        &frames,
    );
    FlowLayout {
        flow,
        frame: Rect {
            x,
            y: top,
            width,
            height: lifeline_bottom + CONTAINER_BOTTOM_PAD - top,
        },
        header: Rect {
            x: x + HEADER_SLAB_INSET + ARCHITECTURE_CARD_PADDING,
            y: header_top,
            width: width - (HEADER_SLAB_INSET + ARCHITECTURE_CARD_PADDING) * 2.0,
            height: header_height,
        },
        slab: Rect {
            x: x + HEADER_SLAB_INSET,
            y: slab_top,
            width: width - HEADER_SLAB_INSET * 2.0,
            height: slab_foot - slab_top,
        },
        lifeline_bottom,
        columns,
        steps,
        frames,
    }
}

/// Every flow of one variant, stacked down one page.
pub(super) fn lay_out<'a>(
    text: &impl Text,
    flows: &'a [Flow],
    nodes: &[Node],
) -> DataFlowLayout<'a> {
    let by_id: HashMap<&str, &Node> = nodes.iter().map(|node| (node.id.as_str(), node)).collect();
    let measurement = measure_columns(text, flows, &by_id);
    let mut placed = Vec::new();
    let mut cursor = DIAGRAM_MARGIN;
    // The clock's cursor runs straight through the stack, which is what makes
    // the flows on one page take their turns in the order they are stated.
    let mut turn = 0;
    for flow in flows {
        let laid = layout_flow(text, flow, &by_id, &measurement, cursor, turn);
        cursor = laid.frame.y + laid.frame.height + FLOW_GAP;
        turn = laid
            .steps
            .iter()
            .fold(turn, |total, step| total + step.slot.count);
        placed.push(laid);
    }
    DataFlowLayout {
        // Whole numbers, as the architecture canvas is: the page is reported to
        // a pane as pixels, and half a pixel of diagram is not a thing a person
        // can be shown.
        width: (largest(
            placed.iter().map(|laid| laid.frame.x + laid.frame.width),
            0.0,
        ) + DIAGRAM_MARGIN)
            .ceil(),
        height: (cursor - FLOW_GAP + DIAGRAM_MARGIN).ceil(),
        flows: placed,
    }
}
