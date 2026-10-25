//! Every step of one flow, stacked down the page in the order it is stated.
//!
//! A message takes a row. A decision or loop takes a frame (ADR 0053): a head
//! row with its operator and its question or condition, then what it holds,
//! and for a decision a labelled row at the start of each alternative, parted
//! from the one before by a dashed line. The steps after a decision run below
//! every alternative, which is how a sequence says that the alternatives
//! rejoin.
//!
//! Only heights are decided here. A frame's sides come from the ink of what it
//! holds, which is known once every column's bars are (`frames.rs`).

use std::collections::HashMap;

use archboard_scene::js;
use archboard_scene::request::{FrameGuard, Slot};

use crate::board::{Decision, Message, MessageKind, Step};
use crate::sequence::design::{
    FRAME_GAP, FRAME_GUARD_HEIGHT, FRAME_HEAD_HEIGHT, MAX_PULSES_PER_STEP, MESSAGE_LINE_STEP,
    MESSAGE_PITCH, SELF_LOOP_EXTENT, STEP_NOTE_GAP,
};
use crate::sequence::layout::{Branch, FrameRows, FrameStep, PlacedStep};
use crate::sequence::rows::{ColumnBounds, MessageEnds, pitch_of, place_note, words_for};
use crate::text::Text;

/// What the walk down one flow has placed so far, and where it has got to.
struct Placing<'a, 'b, T: Text> {
    text: &'b T,
    /// Where each participant's lifeline runs.
    centre_of: &'b HashMap<&'b str, f64>,
    /// The flow's columns, which a note stays inside.
    bounds: ColumnBounds,
    /// The messages placed, in document order.
    steps: Vec<PlacedStep<'a>>,
    /// The frames closed, each after the frames inside it.
    frames: Vec<FrameRows<'a>>,
    /// The height the next message runs at.
    y: f64,
    /// The next turn of the drawing's clock.
    turn: u32,
}

/// The top of the row a message running at a height stands in.
fn row_top(y: f64) -> f64 {
    y - MESSAGE_PITCH / 2.0
}

impl<'a, T: Text> Placing<'a, '_, T> {
    /// Place one message on its row and move the walk below it.
    fn place_message(&mut self, step: &'a Message, branch: &Branch) {
        let count = step.repeat.unwrap_or(1).min(MAX_PULSES_PER_STEP);
        let from_x = self
            .centre_of
            .get(step.from.as_str())
            .copied()
            .unwrap_or(0.0);
        let to_x = self.centre_of.get(step.to.as_str()).copied().unwrap_or(0.0);
        let words = words_for(
            self.text,
            step,
            MessageEnds {
                from_x,
                to_x,
                y: self.y,
            },
            self.bounds,
        );
        // A label stands above its arrow, so every line past the first lowers the row.
        let y = self.y + (words.lines.len() as f64 - 1.0) * MESSAGE_LINE_STEP;
        let note = place_note(
            self.text,
            step,
            MessageEnds { from_x, to_x, y },
            self.bounds,
        );
        // The row grows by the note it holds, so the next message's words sit
        // where they would have without it, only lower.
        let grown = note
            .as_ref()
            .map_or(0.0, |note| note.bounds.height + STEP_NOTE_GAP);
        self.steps.push(PlacedStep {
            step,
            branch: branch.clone(),
            words,
            y,
            from_x,
            to_x,
            note,
            slot: Slot {
                start: self.turn,
                count,
            },
        });
        self.turn += count;
        self.y = y + pitch_of(step.kind) + grown;
    }

    /// Place a run of steps in order.
    fn place_all(&mut self, steps: &'a [Step], branch: &Branch) {
        for step in steps {
            match step {
                Step::Message(message) => self.place_message(message, branch),
                Step::Decision(decision) => self.place_frame(FrameStep::Decision(decision), branch),
                Step::Loop(repeat) => self.place_frame(FrameStep::Loop(repeat), branch),
            }
        }
    }

    /// Place one decision or loop: its head row, what it holds, and its foot,
    /// and close its frame.
    fn place_frame(&mut self, step: FrameStep<'a>, branch: &Branch) {
        let top = row_top(self.y) + FRAME_GAP;
        let held_messages = self.steps.len();
        let held_frames = self.frames.len();
        self.y = top + FRAME_HEAD_HEIGHT + FRAME_GAP / 2.0 + MESSAGE_PITCH / 2.0;
        let guards = match step {
            FrameStep::Decision(decision) => self.place_alternatives(decision, branch),
            FrameStep::Loop(repeat) => {
                self.place_all(&repeat.steps, branch);
                Vec::new()
            }
        };
        let bottom = row_top(self.y) + FRAME_GAP;
        // The next message's words stand above its arrow, so they need the gap as well.
        self.y = bottom + FRAME_GAP * 2.0 + MESSAGE_PITCH / 2.0;
        let inner = &self.frames[held_frames..];
        let nested: Vec<&str> = inner
            .iter()
            .flat_map(|frame| frame.inner.iter().map(String::as_str))
            .collect();
        let inner: Vec<String> = inner
            .iter()
            .map(|frame| frame.step.id().to_owned())
            .filter(|id| !nested.contains(&id.as_str()))
            .collect();
        let messages = self.steps[held_messages..]
            .iter()
            .map(|placed| placed.step.id.clone())
            .collect();
        self.frames.push(FrameRows {
            step,
            top,
            bottom,
            guards,
            messages,
            inner,
        });
    }

    /// Place each alternative of a decision under its labelled row, parted from
    /// the one before by a dashed line.
    fn place_alternatives(&mut self, step: &'a Decision, branch: &Branch) -> Vec<FrameGuard> {
        let mut guards = Vec::new();
        for (index, alternative) in step.alternatives.iter().enumerate() {
            let divider = (index > 0).then(|| row_top(self.y) + FRAME_GAP);
            let guard_top =
                divider.map_or_else(|| row_top(self.y), |divider| divider + FRAME_GAP / 2.0);
            guards.push(FrameGuard {
                label: alternative.label.clone(),
                top: guard_top,
                divider,
            });
            self.y = guard_top + FRAME_GUARD_HEIGHT + FRAME_GAP / 2.0 + MESSAGE_PITCH / 2.0;
            let mut within = branch.clone();
            within.set(&step.id, &alternative.label);
            self.place_all(&alternative.steps, &within);
        }
        guards
    }
}

/// Every step of one flow, stacked down the page in the order it is stated:
/// the placed messages, and the frames closed, inner before outer.
pub fn place_steps<'a>(
    text: &impl Text,
    steps: &'a [Step],
    centre_of: &HashMap<&str, f64>,
    bounds: ColumnBounds,
    y: f64,
    turn: u32,
) -> (Vec<PlacedStep<'a>>, Vec<FrameRows<'a>>) {
    let mut placing = Placing {
        text,
        centre_of,
        bounds,
        steps: Vec::new(),
        frames: Vec::new(),
        y,
        turn,
    };
    placing.place_all(steps, &Branch::default());
    (placing.steps, placing.frames)
}

/// How far down the page one flow's own drawing reaches: the lowest row
/// anything was drawn on, or the first message's row when nothing is below it.
pub fn lowest_drawn(steps: &[PlacedStep], frames: &[FrameRows], floor: f64) -> f64 {
    let mut lowest = floor;
    for placed in steps {
        let reach = if placed.step.kind == MessageKind::Myself {
            SELF_LOOP_EXTENT
        } else {
            0.0
        };
        let note = placed
            .note
            .as_ref()
            .map_or(0.0, |note| note.bounds.y + note.bounds.height);
        lowest = js::max([lowest, placed.y + reach, note]);
    }
    for frame in frames {
        lowest = js::js_max(lowest, frame.bottom);
    }
    lowest
}
