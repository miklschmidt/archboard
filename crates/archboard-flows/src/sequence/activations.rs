//! Where each participant of a sequence is busy: the activation bars its
//! column draws, from a call that waits to the reply that answers it.

use std::collections::HashSet;

use archboard_scene::js;
use archboard_scene::request::Activation;

use crate::board::MessageKind;
use crate::sequence::design::{BAR_OVERHANG, MESSAGE_PITCH};
use crate::sequence::layout::PlacedStep;

/// Whether two messages can both run in one pass through the flow: no
/// decision holds them on different alternatives.
fn together(one: &PlacedStep<'_>, other: &PlacedStep<'_>) -> bool {
    one.branch.iter().all(|(decision, alternative)| {
        other
            .branch
            .of(decision)
            .is_none_or(|theirs| theirs == alternative)
    })
}

/// Whether one message is the reply that answers a call.
fn answers(candidate: &PlacedStep<'_>, call: &PlacedStep<'_>) -> bool {
    candidate.step.kind == MessageKind::Return
        && candidate.step.from == call.step.to
        && candidate.step.to == call.step.from
        && together(candidate, call)
}

/// The later replies that answer a call and have not already answered one:
/// the first, and the first on each alternative of a decision that the first
/// does not run on, since a call answered on one answer of a decision is
/// answered on the others too.
fn answer_indexes(steps: &[PlacedStep<'_>], index: usize, claimed: &HashSet<usize>) -> Vec<usize> {
    let call = &steps[index];
    let mut found: Vec<usize> = Vec::new();
    for (position, candidate) in steps.iter().enumerate() {
        let fresh = position > index && !claimed.contains(&position) && answers(candidate, call);
        if fresh
            && !found
                .iter()
                .any(|prior| together(&steps[*prior], candidate))
        {
            found.push(position);
        }
    }
    found
}

/// The lowest row a participant is still involved in, from a given message on.
fn last_involvement(steps: &[PlacedStep<'_>], from: usize, node: &str) -> f64 {
    let mut lowest = steps.get(from).map_or(0.0, |step| step.y);
    for candidate in steps.iter().skip(from) {
        if candidate.step.from == node || candidate.step.to == node {
            lowest = js::js_max(lowest, candidate.y);
        }
    }
    lowest
}

/// Nested or unanswered calls hand one column overlapping stretches; one bar
/// per busy run keeps the column readable. The bars arrive ordered by top,
/// because a message's height only ever grows.
fn merged_bars(bars: Vec<Activation>) -> Vec<Activation> {
    let mut merged: Vec<Activation> = Vec::new();
    for bar in bars {
        match merged.last_mut() {
            Some(current) if bar.top <= current.bottom => {
                current.bottom = js::js_max(current.bottom, bar.bottom);
            }
            _ => merged.push(bar),
        }
    }
    merged
}

/// Where one participant is busy.
///
/// A synchronous call is the one kind whose sender waits, so it is the one
/// kind that activates its receiver: the bar starts where the call arrives
/// and runs to the reply that answers it. A call nothing answers keeps its
/// receiver busy through that participant's last involvement, because the
/// drawing never shows the work finishing. An asynchronous message and a
/// self-message activate nothing. A bar runs a little past the call and the
/// reply, so each arrow meets its straight side rather than its rounded end.
pub(super) fn activations_for(node: &str, steps: &[PlacedStep<'_>]) -> Vec<Activation> {
    let mut claimed = HashSet::new();
    let mut bars = Vec::new();
    for (index, call) in steps.iter().enumerate() {
        if call.step.kind != MessageKind::Sync || call.step.to != node {
            continue;
        }
        bars.push(bar_of(node, steps, index, &mut claimed));
    }
    merged_bars(bars)
}

/// The bar one synchronous call starts: to the last reply that answers it,
/// each of which it claims, or through its receiver's last involvement when
/// nothing answers it.
fn bar_of(
    node: &str,
    steps: &[PlacedStep<'_>],
    index: usize,
    claimed: &mut HashSet<usize>,
) -> Activation {
    let top = steps[index].y - BAR_OVERHANG;
    let answered = answer_indexes(steps, index, claimed);
    let Some(last) = answered.last().map(|at| &steps[*at]) else {
        return Activation {
            top,
            bottom: last_involvement(steps, index, node) + MESSAGE_PITCH / 3.0,
        };
    };
    let bottom = last.y + BAR_OVERHANG;
    claimed.extend(answered);
    Activation { top, bottom }
}
