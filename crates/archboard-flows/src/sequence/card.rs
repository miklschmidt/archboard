//! The card heading a participant's column: compact, as wide as every other
//! column's, and as tall as its responsibility needs.

use archboard_scene::drawing::TextRun;
use archboard_scene::geometry::Rect;
use archboard_scene::js;

use crate::board::Node;
use crate::sequence::design::{
    CARD_HEIGHT, CARD_HEIGHT_WITH_NOTE, CARD_PADDING_X, DRILL_MARK_ROOM, ICON_CHIP_GAP,
    ICON_CHIP_SIZE, NOTE_SIZE, TEXT_LINE_HEIGHT, TITLE_SIZE,
};
use archboard_scene::paint::fonts::{CARD_NOTE_FONT, CARD_TITLE_FONT};

use crate::text::Text;

/// One participant's heading.
#[derive(Clone, Debug)]
pub struct Card {
    pub node: Node,
    pub bounds: Rect,
    pub title_size: f64,
    pub notes: Vec<TextRun>,
}

/// The horizontal run a card's words have, after its padding and its kind's chip.
pub fn card_text_width(card_width: f64) -> f64 {
    card_width - CARD_PADDING_X * 2.0 - ICON_CHIP_SIZE - ICON_CHIP_GAP
}

/// The room a participant keeps beside its name for the mark of a part that
/// opens another board.
pub fn mark_room(node: &Node) -> f64 {
    if node.opens_board() {
        DRILL_MARK_ROOM
    } else {
        0.0
    }
}

/// The run a participant's name has on its card: the text run, less the mark
/// of a part that opens another board.
pub fn title_room(node: &Node, card_width: f64) -> f64 {
    card_text_width(card_width) - mark_room(node)
}

/// A card's height, its responsibility's lines included.
pub fn card_height(notes: &[TextRun]) -> f64 {
    if notes.is_empty() {
        CARD_HEIGHT
    } else {
        CARD_HEIGHT_WITH_NOTE + (notes.len() as f64 - 1.0) * NOTE_SIZE * TEXT_LINE_HEIGHT
    }
}

/// Every line of a participant's responsibility, measured before any card or
/// lifeline is placed: whole, never cut.
pub fn card_notes(text: &impl Text, node: &Node, width: f64) -> Vec<TextRun> {
    text.note_lines(
        node.responsibility.as_deref().unwrap_or(""),
        card_text_width(width),
        NOTE_SIZE,
        NOTE_SIZE * TEXT_LINE_HEIGHT,
    )
}

/// The width one participant's card asks for: its chip, its name and its
/// responsibility's longest authored line, with the card's insets.
pub fn card_content_width(text: &impl Text, node: &Node) -> f64 {
    // Split at every line break, as `/\r\n?|\n/` splits it: the empty piece
    // between a `\r` and its `\n` measures nothing.
    let note_width = node
        .responsibility
        .as_deref()
        .unwrap_or("")
        .split(['\r', '\n'])
        .fold(0.0, |width, line| {
            js::js_max(width, text.width(line, CARD_NOTE_FONT, NOTE_SIZE))
        });
    CARD_PADDING_X * 2.0
        + ICON_CHIP_SIZE
        + ICON_CHIP_GAP
        + js::js_max(
            text.width(&node.name, CARD_TITLE_FONT, TITLE_SIZE) + mark_room(node),
            note_width,
        )
}
