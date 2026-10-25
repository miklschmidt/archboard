//! A card's words and least box, and a container's header at each width it can
//! take, settled before the card gains neighbours.

use archboard_text::Paragraph;

use crate::drawing::{DiagramFont, MeasuredNode, TextRole, TextRun};
use crate::measure::{exact_width, paragraph};
use crate::paint::design::{
    ARCHITECTURE_CARD_PADDING, ARCHITECTURE_ICON_GAP, ARCHITECTURE_NOTE_GAP, CARD_NOTE_FONT,
    CARD_TITLE_FONT, DRILL_MARK_ROOM, HEADER_SLAB_INSET, ICON_CHIP_SIZE, PART_NOTE_LINE,
    PART_NOTE_SIZE, PART_TITLE_LINE, PART_TITLE_SIZE,
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
            width: exact_width(&line.text, style.font, style.size),
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

/// Reserve all title and responsibility lines before a card gains neighbours.
///
/// A container's header is a slab measured as a card is, standing in the
/// container's well a small gap inside its walls; it is as tall as its words
/// need and no taller. Its width is the box's least width, between a card's
/// least and most, and its words are placed relative to the box, on the slab.
/// A container laid out wider than that wraps its header's words wider and
/// stands its header shorter: its `headers` are each width at which the header
/// takes a line fewer.
pub fn measure_node<N: Clone>(node: N, words: &CardWords<'_>, container: bool) -> MeasuredNode<N> {
    if !container {
        return slab(
            node,
            words,
            Size {
                least: CARD_LEAST,
                most: CARD_MOST,
                height: CARD_HEIGHT,
            },
        );
    }
    let inset = 2.0 * HEADER_SLAB_INSET;
    let least = header(node.clone(), words, CARD_LEAST - inset, CARD_MOST - inset);
    let mut headers = vec![least.clone()];
    let mut wider = next_break(words, &least);
    while let Some(width) = wider {
        let next = header(node.clone(), words, width, width);
        if headers
            .last()
            .is_some_and(|last| next.height >= last.height)
        {
            break;
        }
        wider = next_break(words, &next);
        headers.push(next);
    }
    if headers.len() == 1 {
        least
    } else {
        MeasuredNode {
            headers: Some(headers),
            ..least
        }
    }
}

/// A container's header slab at a width, and the header row it stands in.
fn header<N>(node: N, words: &CardWords<'_>, least: f64, most: f64) -> MeasuredNode<N> {
    let slab = slab(
        node,
        words,
        Size {
            least,
            most,
            height: ICON_CHIP_SIZE + 2.0 * ARCHITECTURE_CARD_PADDING,
        },
    );
    let header_height = HEADER_SLAB_INSET + slab.height;
    MeasuredNode {
        width: slab.width + 2.0 * HEADER_SLAB_INSET,
        height: header_height,
        header_height,
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

/// The next width a container's header slab takes a line fewer at: the
/// narrowest at which its name or its responsibility wraps into fewer lines
/// than in a header; nothing when both already take one line.
fn next_break<N>(words: &CardWords<'_>, header: &MeasuredNode<N>) -> Option<f64> {
    let slab = header.width - 2.0 * HEADER_SLAB_INSET;
    let inner = ARCHITECTURE_CARD_PADDING * 2.0 + ICON_CHIP_SIZE + ARCHITECTURE_ICON_GAP;
    let marked = words.marked();
    let title = paragraph(words.name, TITLE.font, TITLE.size)
        .fewer_lines_at(slab - inner - marked)
        .map(|room| room + inner + marked);
    let note = paragraph(words.responsibility.unwrap_or(""), NOTE.font, NOTE.size)
        .fewer_lines_at(slab - inner)
        .map(|room| room + inner);
    match (title, note) {
        (Some(title), Some(note)) => Some(crate::js::js_min(title, note)),
        (one, other) => one.or(other),
    }
}

/// A card's slab, or a container's header slab: its words set inside the
/// card's padding, beside its type chip, relative to its top left.
fn slab<N>(node: N, words: &CardWords<'_>, size: Size) -> MeasuredNode<N> {
    use crate::js::js_max;

    let padding = ARCHITECTURE_CARD_PADDING;
    let left = padding + ICON_CHIP_SIZE + ARCHITECTURE_ICON_GAP;
    // A part that opens another board keeps its name clear of the mark in its
    // top-right corner; the words under the name run beneath the mark.
    let marked = words.marked();
    let title = paragraph(words.name, TITLE.font, TITLE.size);
    let note = paragraph(words.responsibility.unwrap_or(""), NOTE.font, NOTE.size);
    let natural = js_max(title.natural_width() + marked, note.natural_width());
    let width = crate::js::js_min(size.most, js_max(size.least, natural + left + padding));
    let available = width - left - padding;
    let titles = runs_for(&title, TITLE, available - marked, left, padding);
    let note_top = padding + titles.len() as f64 * TITLE.line + ARCHITECTURE_NOTE_GAP;
    let notes = runs_for(&note, NOTE, available, left, note_top);
    let bottom = if notes.is_empty() {
        padding + titles.len() as f64 * TITLE.line
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
