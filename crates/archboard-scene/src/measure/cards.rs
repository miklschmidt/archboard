//! A card's words and least box, and a container's header at each width it can
//! take, settled before the card gains neighbours.

use archboard_text::Paragraph;

use crate::drawing::{DiagramFont, MeasuredNode, TextRole, TextRun};
use crate::measure::paragraph;
use crate::paint::design::{
    ARCHITECTURE_CARD_PADDING, ARCHITECTURE_ICON_GAP, ARCHITECTURE_NOTE_GAP, CARD_NOTE_FONT,
    CARD_TITLE_FONT, DRILL_MARK_ROOM, HEADER_SLAB_INSET, ICON_CHIP_SIZE, PARENT_TITLE_SIZE,
    PART_NOTE_LINE, PART_NOTE_SIZE, PART_TITLE_LINE, PART_TITLE_SIZE,
};

/// A face, a size, the room a line takes and what the line is.
#[derive(Clone, Copy, Debug)]
pub(super) struct Style {
    pub font: DiagramFont,
    pub size: f64,
    pub line: f64,
    pub role: TextRole,
}

/// A card's name.
pub(super) const TITLE: Style = Style {
    font: CARD_TITLE_FONT,
    size: PART_TITLE_SIZE,
    line: PART_TITLE_LINE,
    role: TextRole::Title,
};

/// A card's responsibility.
pub(super) const NOTE: Style = Style {
    font: CARD_NOTE_FONT,
    size: PART_NOTE_SIZE,
    line: PART_NOTE_LINE,
    role: TextRole::Note,
};

/// The words a card shows.
#[derive(Clone, Copy, Debug)]
pub struct CardWords<'a> {
    /// Its name.
    pub name: &'a str,
    /// What it is responsible for, when it says.
    pub responsibility: Option<&'a str>,
    /// Whether it opens another board, which puts a mark beside its name.
    pub drills: bool,
}

impl CardWords<'_> {
    /// The room the drill mark keeps beside the name.
    fn marked(&self) -> f64 {
        if self.drills { DRILL_MARK_ROOM } else { 0.0 }
    }
}

/// Lines broken at a width, with their baselines, each whole with its painted width.
pub(super) fn runs_for(
    prepared: &Paragraph,
    style: Style,
    width: f64,
    x: f64,
    top: f64,
) -> Vec<TextRun> {
    prepared
        .lines(width)
        .into_iter()
        .enumerate()
        .map(|(index, line)| TextRun {
            width: line.width,
            text: line.text,
            x,
            y: top + style.size + index as f64 * style.line,
            font: style.font,
            font_size: style.size,
            role: style.role,
        })
        .collect()
}

/// The narrowest a card is, and the widest it grows before its words wrap.
const CARD_LEAST: f64 = 260.0;
const CARD_MOST: f64 = 340.0;
/// The least height of a card.
const CARD_HEIGHT: f64 = 72.0;

/// How wide a slab may be, and how tall at the least.
#[derive(Clone, Copy, Debug)]
struct Size {
    least: f64,
    most: f64,
    height: f64,
}

/// Measure a card or a parent's compact header before layout. A parent keeps
/// the normal card width rules and one measured box, regardless of frame size.
pub fn measure_node<N: Clone>(node: N, words: &CardWords<'_>, container: bool) -> MeasuredNode<N> {
    let size = Size {
        least: CARD_LEAST,
        most: CARD_MOST,
        height: CARD_HEIGHT,
    };
    let title = if container {
        Style {
            size: PARENT_TITLE_SIZE,
            ..TITLE
        }
    } else {
        TITLE
    };
    let slab = slab(node, words, size, title);
    if !container {
        return slab;
    }
    let height = HEADER_SLAB_INSET + slab.height;
    MeasuredNode {
        width: slab.width + 2.0 * HEADER_SLAB_INSET,
        height,
        header_height: height,
        runs: slab
            .runs
            .into_iter()
            .map(|run| TextRun {
                x: run.x + HEADER_SLAB_INSET,
                y: run.y + HEADER_SLAB_INSET,
                ..run
            })
            .collect(),
        ..slab
    }
}

/// A card's slab, or a container's header slab: its words set inside the
/// card's padding, beside its type chip, relative to its top left.
fn slab<N>(node: N, words: &CardWords<'_>, size: Size, title_style: Style) -> MeasuredNode<N> {
    use crate::js::js_max;

    let padding = ARCHITECTURE_CARD_PADDING;
    let left = padding + ICON_CHIP_SIZE + ARCHITECTURE_ICON_GAP;
    // A part that opens another board keeps its name clear of the mark in its
    // top-right corner; the words under the name run beneath the mark.
    let marked = words.marked();
    let title = paragraph(words.name, title_style.font, title_style.size);
    let note = paragraph(words.responsibility.unwrap_or(""), NOTE.font, NOTE.size);
    let natural = js_max(title.natural_width() + marked, note.natural_width());
    let width = crate::js::js_min(size.most, js_max(size.least, natural + left + padding));
    let available = width - left - padding;
    let titles = runs_for(&title, title_style, available - marked, left, padding);
    let note_top = padding + titles.len() as f64 * title_style.line + ARCHITECTURE_NOTE_GAP;
    let notes = runs_for(&note, NOTE, available, left, note_top);
    let bottom = if notes.is_empty() {
        padding + titles.len() as f64 * title_style.line
    } else {
        note_top + notes.len() as f64 * NOTE.line
    };
    let height = js_max(size.height, bottom + padding);
    // The painted width wins, even when a single long word needs a little more
    // space than the preferred maximum; no character is hidden or cut.
    let painted = titles
        .iter()
        .map(|run| run.width + marked)
        .chain(notes.iter().map(|run| run.width))
        .fold(0.0, js_max);
    MeasuredNode {
        node,
        width: js_max(width, left + painted + padding),
        height,
        header_height: 0.0,
        runs: titles.into_iter().chain(notes).collect(),
        headers: None,
        pointed: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parents_use_normal_card_width_and_one_measured_header() {
        let words = CardWords {
            name: "Run checks",
            responsibility: Some(
                "Checks the rules, outcomes, captures, and commands from one author run.",
            ),
            drills: false,
        };
        let card = measure_node((), &words, false);
        let parent = measure_node((), &words, true);
        assert_eq!(parent.width - 2.0 * HEADER_SLAB_INSET, card.width);
        assert!(parent.headers.is_none());
        let title_size = |node: &MeasuredNode<()>| {
            node.runs
                .iter()
                .find(|run| run.role == TextRole::Title)
                .expect("a name")
                .font_size
        };
        assert!(title_size(&parent) > title_size(&card));
    }
}
