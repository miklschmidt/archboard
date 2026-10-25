//! How much of the page one message's row takes: its label, its pitch, and
//! its note. A note is the caveat a sequence carries on one message (a branch,
//! a loop's condition), so it is drawn whole under the message it qualifies,
//! never cut, and the message's row grows to hold it.

use archboard_scene::drawing::TextRun;
use archboard_scene::geometry::Rect;
use archboard_scene::js;
use archboard_scene::request::WordLine;

use crate::board::{Flow, Message, MessageKind, messages_of};
use crate::sequence::design::{
    ACTIVATION_HALF_WIDTH, COLUMN_GAP, LABEL_BAR_CLEARANCE, MESSAGE_LINE_STEP, MESSAGE_PITCH,
    NOTE_SIZE, PILL_PADDING_X, PILL_TEXT_SIZE, SELF_LABEL_GAP, SELF_LOOP_EXTENT,
    SELF_MESSAGE_PITCH, STEP_NOTE_GAP, STEP_NOTE_INSET, STEP_NOTE_MAX_WIDTH, STEP_NOTE_MIN_WIDTH,
    STEP_NOTE_PADDING_X, STEP_NOTE_PADDING_Y, TEXT_LINE_HEIGHT,
};
use crate::text::Text;

/// `Number.MAX_SAFE_INTEGER`: the width of a line nothing stands beside.
const UNBOUNDED: f64 = 9_007_199_254_740_991.0;

/// A step's note, placed under its message.
#[derive(Clone, Debug)]
pub struct PlacedNote {
    /// The plate the words sit on.
    pub bounds: Rect,
    /// Every line, whole, its baseline measured from the plate's inner top.
    pub lines: Vec<TextRun>,
}

/// Where a message runs: the lifelines it leaves and reaches, and its height.
#[derive(Clone, Copy, Debug)]
pub struct MessageEnds {
    pub from_x: f64,
    pub to_x: f64,
    pub y: f64,
}

/// The left and right edges of a flow's columns, which a note stays inside.
#[derive(Clone, Copy, Debug)]
pub struct ColumnBounds {
    pub left: f64,
    pub right: f64,
    pub pitch: f64,
    pub first_centre: f64,
    pub last_centre: f64,
}

/// A message's words as drawn: their lines, and where a long hop centres them.
#[derive(Clone, Debug)]
pub struct MessageWords {
    /// Every line, whole, with its painted width.
    pub lines: Vec<WordLine>,
    /// The x a crossing message's plate is centred on; a self-message's plate
    /// starts at its loop.
    pub centre: Option<f64>,
}

/// Whether a note says anything.
fn has_words(note: Option<&str>) -> bool {
    note.is_some_and(|note| !js::trim(note).is_empty())
}

/// One note measured against the narrowest readable corridor: its plate's
/// width, or zero for no note.
fn minimum_note_width(text: &impl Text, note: Option<&str>) -> f64 {
    let Some(note) = note.filter(|note| has_words(Some(note))) else {
        return 0.0;
    };
    let lines = text.note_lines(
        note,
        STEP_NOTE_MIN_WIDTH - STEP_NOTE_PADDING_X * 2.0,
        NOTE_SIZE,
        NOTE_SIZE * TEXT_LINE_HEIGHT,
    );
    let painted = lines
        .iter()
        .fold(0.0, |painted, line| js::js_max(painted, line.width));
    js::js_max(
        STEP_NOTE_MIN_WIDTH,
        painted.ceil() + STEP_NOTE_PADDING_X * 2.0,
    )
}

/// The column width that leaves every note a readable corridor, or zero when
/// no message carries one.
pub fn required_note_column_width(text: &impl Text, flows: &[Flow]) -> f64 {
    let mut width: f64 = 0.0;
    for flow in flows {
        for step in messages_of(&flow.steps) {
            width = js::js_max(width, minimum_note_width(text, step.note.as_deref()));
        }
    }
    if width == 0.0 {
        0.0
    } else {
        width + (ACTIVATION_HALF_WIDTH + STEP_NOTE_INSET) * 2.0 - COLUMN_GAP
    }
}

/// Where a note's leading edge goes: in the next corridor, or the previous one
/// for a self-message on the last column.
fn note_anchor(step: &Message, ends: MessageEnds, bounds: ColumnBounds) -> f64 {
    let inset = ACTIVATION_HALF_WIDTH + STEP_NOTE_INSET;
    if step.kind != MessageKind::Myself {
        return js::js_min(ends.from_x, ends.to_x) + inset;
    }
    if ends.from_x == bounds.last_centre && bounds.first_centre != bounds.last_centre {
        return ends.from_x - bounds.pitch + inset;
    }
    ends.from_x + inset
}

/// Where a message's note goes: under the message, starting where its own
/// words start, wrapped to the hop and held inside the flow's columns.
pub fn place_note(
    text: &impl Text,
    step: &Message,
    ends: MessageEnds,
    bounds: ColumnBounds,
) -> Option<PlacedNote> {
    let note = step.note.as_deref().filter(|note| has_words(Some(note)))?;
    let myself = step.kind == MessageKind::Myself;
    let inset = ACTIVATION_HALF_WIDTH + STEP_NOTE_INSET;
    let corridor_width = bounds.pitch - inset * 2.0;
    let wrap_width = js::min([
        bounds.right - bounds.left,
        STEP_NOTE_MAX_WIDTH,
        js::js_max(STEP_NOTE_MIN_WIDTH, (ends.to_x - ends.from_x).abs()),
        corridor_width,
    ]);
    let line_height = NOTE_SIZE * TEXT_LINE_HEIGHT;
    let lines = text.note_lines(
        note,
        wrap_width - STEP_NOTE_PADDING_X * 2.0,
        NOTE_SIZE,
        line_height,
    );
    // The painted width wins over the wrap width, as on a card: whole-line
    // kerning can run a hair past the measure, and no word is cut to fit.
    let widest = lines
        .iter()
        .fold(0.0, |widest, run| js::js_max(widest, run.width));
    let width = widest.ceil() + STEP_NOTE_PADDING_X * 2.0;
    let drop = if myself { SELF_LOOP_EXTENT } else { 0.0 };
    Some(PlacedNote {
        bounds: Rect {
            x: js::js_max(
                bounds.left,
                js::js_min(note_anchor(step, ends, bounds), bounds.right - width),
            ),
            y: ends.y + drop + STEP_NOTE_GAP,
            width,
            height: lines.len() as f64 * line_height + STEP_NOTE_PADDING_Y * 2.0,
        },
        lines,
    })
}

/// The widest a message's plate may be, and where a crossing message's plate
/// is centred. A plate stands between two lifelines, clear of the bars on
/// them: a message to the next column centred on the gap it crosses, one that
/// passes columns on the gap nearest its middle on the sender's side, since
/// its middle is a lifeline whenever it passes an odd number of them. A
/// self-message's plate runs from its loop to the next column; on the last
/// column nothing stands to its right.
fn room_for(step: &Message, ends: MessageEnds, bounds: ColumnBounds) -> (f64, Option<f64>) {
    let clear = ACTIVATION_HALF_WIDTH + LABEL_BAR_CLEARANCE;
    if step.kind == MessageKind::Myself {
        let last = ends.from_x >= bounds.last_centre;
        let width = if last {
            f64::INFINITY
        } else {
            bounds.pitch - clear - ACTIVATION_HALF_WIDTH - SELF_LABEL_GAP
        };
        return (width, None);
    }
    let hops = js::js_max(
        1.0,
        js::round((ends.to_x - ends.from_x).abs() / bounds.pitch),
    );
    let direction = js::sign(ends.to_x - ends.from_x);
    (
        bounds.pitch - clear * 2.0,
        Some(ends.from_x + direction * (((hops - 1.0) / 2.0).floor() + 0.5) * bounds.pitch),
    )
}

/// A message's words, wrapped to the room its plate has.
pub fn words_for(
    text: &impl Text,
    step: &Message,
    ends: MessageEnds,
    bounds: ColumnBounds,
) -> MessageWords {
    let (width, centre) = room_for(step, ends, bounds);
    let limit = if width.is_finite() {
        width - PILL_PADDING_X * 2.0
    } else {
        UNBOUNDED
    };
    MessageWords {
        lines: text.message_lines(
            &step.drawn_label(),
            limit,
            PILL_TEXT_SIZE,
            MESSAGE_LINE_STEP,
        ),
        centre,
    }
}

/// The vertical step from one message to the next. A self-message needs more,
/// because it drops below its own row before it comes back.
pub fn pitch_of(kind: MessageKind) -> f64 {
    if kind == MessageKind::Myself {
        SELF_MESSAGE_PITCH
    } else {
        MESSAGE_PITCH
    }
}
