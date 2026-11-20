//! The words a layout settles on a plate before it routes: a relationship's
//! label, a message's words and a note's lines.

use crate::measure::cards::{NOTE, Style, runs_for};
use crate::measure::paragraph;
use crate::sizes::{ARCHITECTURE_LABEL_PADDING_X, ARCHITECTURE_LABEL_PADDING_Y, PILL_FONT};
use archboard_ecma::max;
use archboard_scene::drawing::{MeasuredLabel, TextRole, TextRun};
use archboard_scene::request::WordLine;

/// A relationship's words on its plate.
const LABEL: Style = Style {
    font: PILL_FONT,
    size: 10.0,
    line: 15.0,
    role: TextRole::Label,
};

/// The widest a relationship's plate grows before its words wrap.
const LABEL_MAX_WIDTH: f64 = 200.0;
/// The narrowest plate, so a one-glyph label still reads as a plate.
const LABEL_MIN_WIDTH: f64 = 40.0;
/// The widest a narrow plate grows, for a route with no room for the wide one.
const LABEL_NARROW_WIDTH: f64 = 120.0;

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

/// A relationship's words on the plates a route can take.
#[derive(Clone, Debug, PartialEq)]
pub struct LabelPlates {
    /// The plate a route takes where it finds a spot for it.
    pub wide: MeasuredLabel,
    /// The same words wrapped onto a narrower plate, where they wrap narrower at all: a route
    /// takes it only where the wide plate finds no spot. It holds its longest word whole.
    pub narrow: Option<MeasuredLabel>,
}

/// Settle a relationship's complete words and padded plates before routing it.
///
/// The words wrap balanced, each plate hugs its widest line, and every line is
/// centred, so the text sits on the line the plate is centred on.
pub fn measure_label(text: &str) -> LabelPlates {
    let wide = plate(text, LABEL_MAX_WIDTH);
    let narrow = narrow_plate(text, wide.width);
    LabelPlates { wide, narrow }
}

/// The words on a narrower plate than the wide one of some width, where they
/// wrap narrower at all.
fn narrow_plate(text: &str, wide: f64) -> Option<MeasuredLabel> {
    let word = |word: &str| paragraph(word, LABEL.font, LABEL.size).natural_width();
    let longest = max(std::iter::once(0.0).chain(text.split_whitespace().map(word)));
    let width = max([
        LABEL_NARROW_WIDTH,
        longest + 2.0 * ARCHITECTURE_LABEL_PADDING_X,
    ]);
    let narrow = plate(text, width);
    (narrow.width < wide - 1.0).then_some(narrow)
}

/// Words on a plate no wider than a width, wrapped balanced.
fn plate(text: &str, max_width: f64) -> MeasuredLabel {
    let limit = max_width - 2.0 * ARCHITECTURE_LABEL_PADDING_X;
    let lines = balanced_lines(text, LABEL, limit);
    let widest = max(std::iter::once(0.0).chain(lines.iter().map(|line| line.width)));
    let width = max([LABEL_MIN_WIDTH, widest + 2.0 * ARCHITECTURE_LABEL_PADDING_X]);
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

/// A note's words wrapped to a width in the note face, as a card's
/// responsibility wraps, each line whole with its painted width, its baseline
/// measured from the block's top.
pub(crate) fn note_lines(text: &str, width: f64, size: f64, line_height: f64) -> Vec<TextRun> {
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
pub(crate) fn message_lines(text: &str, width: f64, size: f64, line_height: f64) -> Vec<WordLine> {
    let style = Style {
        size,
        line: line_height,
        ..LABEL
    };
    balanced_lines(text, style, width)
}
