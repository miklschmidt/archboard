//! A board whose author wrote an exchange and no relationships draws each
//! message of a flow as a line of its own on the architecture: a step between
//! two participants, drawn unlike any relationship, carrying the step's id so
//! selection and standing resolve to the step. Nothing here is written to the
//! board (ADR 0023): the line is a reading of content the board holds.

use std::collections::HashSet;

use archboard_flows::board::{Message, MessageKind, messages_of};
use archboard_layout::Edge;
use archboard_scene::drawing::Emphasis;
use archboard_scene::names::word;
use indexmap::IndexMap;

use crate::request::Reading;

/// Whether a step can be a line of its own on a reading: a message, not the
/// answer travelling back, between two distinct participants both drawn
/// there as cards, never as containers.
fn drawable(step: &Message, reading: &Reading) -> bool {
    if step.from == step.to || step.kind == MessageKind::Return {
        return false;
    }
    let ends = reading
        .nodes
        .iter()
        .filter(|node| node.id == step.from || node.id == step.to)
        .count();
    ends == 2
        && !reading.nodes.iter().any(|node| {
            node.parent
                .as_deref()
                .is_some_and(|parent| parent == step.from || parent == step.to)
        })
}

/// The line a step draws as: the step's own id, ends, kind and words.
fn line_of(step: &Message, order: f64) -> Edge {
    Edge {
        id: step.id.clone(),
        order,
        from: step.from.clone(),
        to: step.to.clone(),
        kind: word(&step.kind).to_owned(),
        label: Some(step.label.clone()),
        emphasis: Emphasis::Normal,
        traffic: None,
    }
}

/// One line for each pair of participants a drawable message runs between:
/// the first message over it the variant holds, or the first over it when
/// the variant holds none. Whether a message the variant holds is drawable is
/// asked of the variant's own reading. In the order the pairs first appear.
fn step_lines_of(content: &Reading, held: &Reading) -> Vec<Edge> {
    let own: HashSet<&str> = held
        .flows
        .iter()
        .flat_map(|flow| messages_of(&flow.steps))
        .map(|step| step.id.as_str())
        .collect();
    let mut riders: IndexMap<String, (bool, Edge)> = IndexMap::new();
    let messages = content
        .flows
        .iter()
        .flat_map(|flow| messages_of(&flow.steps));
    for (index, step) in messages.enumerate() {
        let held_here = own.contains(step.id.as_str());
        let reading = if held_here { held } else { content };
        let pair = format!("{}>{}", step.from, step.to);
        let takes = riders
            .get(&pair)
            .is_none_or(|(riding_held, _)| !riding_held && held_here);
        if drawable(step, reading) && takes {
            let order = ((index + 1) * 1000) as f64;
            riders.insert(pair, (held_here, line_of(step, order)));
        }
    }
    riders.into_values().map(|(_, line)| line).collect()
}

/// The reading laid out, with one line for each pair a drawable message runs
/// between on a board whose own reading holds no relationships, and the ids
/// of those lines in the order they were added.
///
/// A board that has relationships is drawn from them: a flow there restates
/// the wiring as messages and answers, and drawing those again doubles every
/// line. Whether it has any, and which message stands for a pair, are asked
/// of the variant's own reading, so a picture with its comparison and one
/// without lay out the same lines.
pub(crate) fn with_step_lines(content: &Reading, held: &Reading) -> (Reading, Vec<String>) {
    if !held.edges.is_empty() {
        return (content.clone(), Vec::new());
    }
    let lines = step_lines_of(content, held);
    let steps: Vec<String> = lines.iter().map(|line| line.id.clone()).collect();
    let mut laid = content.clone();
    laid.edges.extend(lines);
    (laid, steps)
}
