//! The words a layout settles on a plate before it routes: a relationship's
//! label, a region's caption, a message's words and a note's lines.

use crate::drawing::{MeasuredLabel, TextRole, TextRun};
use crate::js::js_max;
use crate::measure::cards::{NOTE, Style, runs_for};
use crate::measure::{paragraph, set_width};
use crate::paint::design::{
    ARCHITECTURE_LABEL_PADDING_X, ARCHITECTURE_LABEL_PADDING_Y, CARD_TITLE_FONT, PILL_FONT,
};
use crate::sequence_picture::WordLine;

/// A relationship's words on its plate.
const LABEL: Style = Style {
    font: PILL_FONT,
    size: 10.0,
    line: 15.0,
    role: TextRole::Label,
};

/// A region's caption: the group's name, set larger than a card's title so a
/// reader finds the regions first and can still read them at overview scale.
const CAPTION: Style = Style {
    font: CARD_TITLE_FONT,
    size: 20.0,
    line: 26.0,
    role: TextRole::Label,
};
/// Room around a region caption's words, across and down.
const CAPTION_PADDING_X: f64 = 12.0;
const CAPTION_PADDING_Y: f64 = 8.0;

/// The widest a relationship's plate grows before its words wrap.
const LABEL_MAX_WIDTH: f64 = 200.0;
/// The narrowest plate, so a one-glyph label still reads as a plate.
const LABEL_MIN_WIDTH: f64 = 40.0;

/// Words wrapped, balanced, so no line runs wider than a width: each line
/// whole, with its painted width.
fn balanced_lines(words: &str, style: Style, width: f64) -> Vec<WordLine> {
    let prepared = paragraph(words, style.font, style.size);
    prepared
        .lines(prepared.balanced_width(width))
        .into_iter()
        .map(|line| WordLine {
            width: line.width,
            text: line.text,
        })
        .collect()
}

/// Settle a relationship's complete words and padded plate before routing it.
///
/// The words wrap balanced, the plate hugs the widest line, and every line is
/// centred, so the text sits on the line the plate is centred on.
pub fn measure_label(text: &str) -> MeasuredLabel {
    let limit = LABEL_MAX_WIDTH - 2.0 * ARCHITECTURE_LABEL_PADDING_X;
    let lines = balanced_lines(text, LABEL, limit);
    let widest = lines.iter().map(|line| line.width).fold(0.0, js_max);
    let width = js_max(LABEL_MIN_WIDTH, widest + 2.0 * ARCHITECTURE_LABEL_PADDING_X);
    let height = lines.len().max(1) as f64 * LABEL.line + 2.0 * ARCHITECTURE_LABEL_PADDING_Y;
    let runs = lines
        .into_iter()
        .enumerate()
        .map(|(index, line)| TextRun {
            x: (width - line.width) / 2.0,
            y: ARCHITECTURE_LABEL_PADDING_Y + LABEL.size + index as f64 * LABEL.line,
            width: line.width,
            text: line.text,
            font: LABEL.font,
            font_size: LABEL.size,
            role: LABEL.role,
        })
        .collect();
    MeasuredLabel {
        width,
        height,
        runs,
    }
}

/// A group's name as the caption its region is drawn with: one line.
pub fn measure_caption(name: &str) -> MeasuredLabel {
    let width = set_width(name, CAPTION.font, CAPTION.size);
    let height = CAPTION.line + 2.0 * CAPTION_PADDING_Y;
    MeasuredLabel {
        width: width + 2.0 * CAPTION_PADDING_X,
        height,
        runs: vec![TextRun {
            text: name.to_owned(),
            width,
            x: CAPTION_PADDING_X,
            y: CAPTION_PADDING_Y + CAPTION.size,
            font: CAPTION.font,
            font_size: CAPTION.size,
            role: CAPTION.role,
        }],
    }
}

/// A note's words wrapped to a width in the note face, as a card's
/// responsibility wraps, each line whole with its painted width, its baseline
/// measured from the block's top.
pub fn note_lines(text: &str, width: f64, size: f64, line_height: f64) -> Vec<TextRun> {
    let style = Style {
        size,
        line: line_height,
        ..NOTE
    };
    runs_for(&paragraph(text, style.font, size), style, width, 0.0, 0.0)
}

/// A message's words wrapped, balanced, in the label face, so no line runs
/// wider than the room between the lifelines it is drawn between: each line
/// whole, with its painted width.
pub fn message_lines(text: &str, width: f64, size: f64, line_height: f64) -> Vec<WordLine> {
    let style = Style {
        size,
        line: line_height,
        ..LABEL
    };
    balanced_lines(text, style, width)
}
