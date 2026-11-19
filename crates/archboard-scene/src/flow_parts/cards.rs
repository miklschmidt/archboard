//! The cards heading a sequence's columns: the one width every column takes,
//! and each card's responsibility, title size and height at that width.

use crate::drawing::{DiagramFont, TextRun};
use crate::js;
use crate::measure::{CardWords, note_lines, width};
use crate::sizes::{
    CARD_HEIGHT, CARD_HEIGHT_WITH_NOTE, CARD_NOTE_FONT, CARD_PADDING_X, CARD_TITLE_FONT,
    DRILL_MARK_ROOM, ICON_CHIP_GAP, ICON_CHIP_SIZE, LIFELINE_GAP, NOTE_SIZE, TEXT_LINE_HEIGHT,
    TITLE_SIZE,
};

/// Below this a card's name starts a size down, to keep its room.
const ICON_MIN_CARD_WIDTH: f64 = 190.0;
const TITLE_SIZE_SMALL: f64 = 11.5;
/// How a name that overruns its shared column gives way: half a point at a
/// time, to a floor, before the column widens.
const TITLE_SIZE_MIN: f64 = 10.5;
const TITLE_SIZE_STEP: f64 = 0.5;

/// How wide a column may be: the least and the most a card's own words ask
/// for, and the floor the layout needs for something else in the columns.
#[derive(Clone, Copy, Debug)]
pub struct ColumnLimits {
    /// The narrowest a column is, whatever its card asks.
    pub least: f64,
    /// The widest a card's words widen it before they wrap.
    pub most: f64,
    /// The width the layout needs beside the cards, or zero.
    pub floor: f64,
}

/// One card, measured at its column's width.
#[derive(Clone, Debug)]
pub struct HeadCard {
    /// Its height, its responsibility's lines included.
    pub height: f64,
    /// The size its name is set at, fitted to the room it has.
    pub title_size: f64,
    /// The run its name has: the text run, less the mark of a part that opens a picture.
    pub title_room: f64,
    /// Every line of its responsibility, whole, its baseline measured from the
    /// top of the block.
    pub notes: Vec<TextRun>,
}

/// The cards heading a sequence's columns.
#[derive(Clone, Debug)]
pub struct HeadCards {
    /// The width every column is drawn at.
    pub width: f64,
    /// How far under a card its lifeline starts.
    pub lifeline_drop: f64,
    /// Each card, in the order asked.
    pub cards: Vec<HeadCard>,
}

/// The cards heading a sequence's columns, measured together, in the order asked.
///
/// One width for every column, because a column's width is also the step
/// between lifelines. The widest card's words ask for it, within the limits;
/// past the most, a name sets its title smaller, and what still does not fit
/// at the smallest title size, or a responsibility's whole line, widens every
/// column together rather than being cut. Each responsibility wraps at the
/// width the cards asked for before any widening, and stays whole.
pub fn sequence_cards(cards: &[CardWords<'_>], limits: ColumnLimits) -> HeadCards {
    let asked = cards.iter().map(asked_width);
    // A whole unit: adding measured widths leaves floating-point dust, and a
    // card handed back exactly the width its name measured would cut it.
    let preferred = js::js_min(limits.most, largest(asked, limits.least).ceil());
    let notes: Vec<Vec<TextRun>> = cards
        .iter()
        .map(|card| card_notes(card, preferred))
        .collect();
    let painted = notes
        .iter()
        .flat_map(|runs| runs.iter().map(|run| run.width));
    let names = cards
        .iter()
        .map(|card| width(card.name, CARD_TITLE_FONT, TITLE_SIZE_MIN) + mark_room(card));
    let insets = preferred - card_text_width(preferred);
    let column = js::max([
        preferred,
        (largest(painted, 0.0) + insets).ceil(),
        (largest(names, 0.0) + insets).ceil(),
        limits.floor,
    ]);
    let earned = if column >= ICON_MIN_CARD_WIDTH {
        TITLE_SIZE
    } else {
        TITLE_SIZE_SMALL
    };
    HeadCards {
        width: column,
        lifeline_drop: LIFELINE_GAP,
        cards: cards
            .iter()
            .zip(notes)
            .map(|(card, notes)| HeadCard {
                height: card_height(&notes),
                title_size: fitted_size(
                    card.name,
                    CARD_TITLE_FONT,
                    earned,
                    title_room(card, column),
                    TITLE_SIZE_MIN,
                    TITLE_SIZE_STEP,
                ),
                title_room: title_room(card, column),
                notes,
            })
            .collect(),
    }
}

/// The largest of some numbers, and the floor when there are none.
fn largest(values: impl IntoIterator<Item = f64>, floor: f64) -> f64 {
    values.into_iter().fold(floor, js::js_max)
}

/// The horizontal run a card's words have, after its padding and its kind's chip.
fn card_text_width(card_width: f64) -> f64 {
    card_width - CARD_PADDING_X * 2.0 - ICON_CHIP_SIZE - ICON_CHIP_GAP
}

/// The room a card keeps beside its name for the mark of a part that opens
/// another picture.
fn mark_room(card: &CardWords<'_>) -> f64 {
    if card.drills { DRILL_MARK_ROOM } else { 0.0 }
}

/// The run a card's name has: the text run, less the mark of a part that
/// opens another picture.
fn title_room(card: &CardWords<'_>, card_width: f64) -> f64 {
    card_text_width(card_width) - mark_room(card)
}

/// A card's height, its responsibility's lines included.
fn card_height(notes: &[TextRun]) -> f64 {
    if notes.is_empty() {
        CARD_HEIGHT
    } else {
        CARD_HEIGHT_WITH_NOTE + (notes.len() as f64 - 1.0) * NOTE_SIZE * TEXT_LINE_HEIGHT
    }
}

/// Every line of a card's responsibility at a card width: whole, never cut.
fn card_notes(card: &CardWords<'_>, card_width: f64) -> Vec<TextRun> {
    note_lines(
        card.responsibility.unwrap_or(""),
        card_text_width(card_width),
        NOTE_SIZE,
        NOTE_SIZE * TEXT_LINE_HEIGHT,
    )
}

/// The width one card asks for: its chip, its name and its responsibility's
/// longest authored line, with the card's insets.
fn asked_width(card: &CardWords<'_>) -> f64 {
    // Split at every line break, as `/\r\n?|\n/` splits it: the empty piece
    // between a `\r` and its `\n` measures nothing.
    let note_width = card
        .responsibility
        .unwrap_or("")
        .split(['\r', '\n'])
        .fold(0.0, |widest, line| {
            js::js_max(widest, width(line, CARD_NOTE_FONT, NOTE_SIZE))
        });
    CARD_PADDING_X * 2.0
        + ICON_CHIP_SIZE
        + ICON_CHIP_GAP
        + js::js_max(
            width(card.name, CARD_TITLE_FONT, TITLE_SIZE) + mark_room(card),
            note_width,
        )
}

/// The size a title is set at: the largest step, at or below the size it
/// earned, where the whole title fits its run, and never below the floor.
fn fitted_size(
    label: &str,
    font: DiagramFont,
    earned: f64,
    budget: f64,
    floor: f64,
    step: f64,
) -> f64 {
    let mut size = earned;
    while size > floor && width(label, font, size) > budget {
        size = js::js_max(floor, size - step);
    }
    size
}
