//! A card's words and least box, and a container's header at each width it can
//! take, settled before the card gains neighbours.

use archboard_text::Paragraph;

use crate::drawing::{DiagramFont, MeasuredNode, TextRole, TextRun};
use crate::measure::{keep_tail, paragraph, width};
use crate::paint::design::{
    ARCHITECTURE_CARD_PADDING, ARCHITECTURE_ICON_GAP, ARCHITECTURE_NOTE_GAP, CARD_NOTE_FONT,
    CARD_PATH_FONT, CARD_TITLE_FONT, DOOR_ARROW_ROOM, DOOR_FAR_ICON, DOOR_HEIGHT, DOOR_ICON,
    DOOR_PADDING, DRILL_MARK_ROOM, ICON_CHIP_SIZE, PARENT_TITLE_SIZE, PART_NOTE_LINE,
    PART_NOTE_SIZE, PART_PATH_LINE, PART_PATH_SIZE, PART_TITLE_LINE, PART_TITLE_SIZE, TAB_CHIP,
    TAB_FAR_CHIP, TAB_FAR_NAME, TAB_FAR_PATH, TAB_HEIGHT, TAB_ICON_GAP, TAB_MOST, TAB_PADDING,
    TAB_PATH_GAP, TAB_SHOULDER,
};
use crate::paint::far_name_width;

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

/// A card's code path.
pub(super) const PATH: Style = Style {
    font: CARD_PATH_FONT,
    size: PART_PATH_SIZE,
    line: PART_PATH_LINE,
    role: TextRole::Note,
};

/// The words a card shows.
#[derive(Clone, Copy, Debug)]
pub struct CardWords<'a> {
    /// Its name.
    pub name: &'a str,
    /// What it is responsible for, when it says.
    pub responsibility: Option<&'a str>,
    /// Where its code lives, when it says.
    pub path: Option<&'a str>,
    /// Whether it opens another board, which puts a mark beside its name.
    pub drills: bool,
    /// Whether it stands outside the open frame as a door.
    pub door: bool,
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

/// Measure a card or a frame's edge tab before layout.
pub fn measure_node<N: Clone>(node: N, words: &CardWords<'_>, container: bool) -> MeasuredNode<N> {
    if container {
        return one_line(node, words, TAB_SHOULDER);
    }
    if words.door {
        return door(node, words);
    }
    let size = Size {
        least: CARD_LEAST,
        most: CARD_MOST,
        height: CARD_HEIGHT,
    };
    slab(node, words, size, TITLE)
}

/// Where a tab's words stand on its one line: their baseline and sizes.
#[derive(Clone, Copy, Debug)]
pub(crate) struct TabLine {
    /// Where its name starts.
    pub left: f64,
    /// The baseline its name and path share.
    pub baseline: f64,
    pub name: f64,
    pub path: f64,
}

/// A tab's line as the picture draws it near.
pub(crate) const TAB_NEAR: TabLine = TabLine {
    left: TAB_PADDING + TAB_CHIP + TAB_ICON_GAP,
    baseline: 23.0,
    name: PARENT_TITLE_SIZE,
    path: PART_PATH_SIZE,
};

/// A tab's line as the picture draws it from far away.
pub(crate) const TAB_FAR: TabLine = TabLine {
    left: TAB_PADDING + TAB_FAR_CHIP + TAB_ICON_GAP,
    baseline: 25.0,
    name: TAB_FAR_NAME,
    path: TAB_FAR_PATH,
};

/// A door's line as the picture draws it near.
const DOOR_NEAR: TabLine = TabLine {
    left: DOOR_PADDING + DOOR_ICON + TAB_ICON_GAP - 2.0,
    baseline: 22.0,
    name: PARENT_TITLE_SIZE,
    path: PART_PATH_SIZE,
};

/// A door's line as the picture draws it from far away.
pub(crate) const DOOR_FAR: TabLine = TabLine {
    left: DOOR_PADDING + DOOR_FAR_ICON + TAB_ICON_GAP - 2.0,
    baseline: 24.0,
    name: TAB_FAR_NAME,
    path: TAB_FAR_PATH,
};

/// A tab's name and path on its one line. A name is never cut, and a path keeps its tail.
pub(crate) fn tab_runs(line: TabLine, name: &str, path: Option<&str>) -> Vec<TextRun> {
    let set = |text: String, x: f64, size: f64, style: Style| TextRun {
        width: width(&text, style.font, size),
        text,
        x,
        y: line.baseline,
        font: style.font,
        font_size: size,
        role: style.role,
    };
    let title = set(name.to_owned(), line.left, line.name, TITLE);
    let start = line.left + title.width + TAB_PATH_GAP;
    let room = TAB_MOST - start;
    let shown = path.map(|path| keep_tail(path, PATH.font, line.path, room));
    let path = shown.map(|text| set(text, start, line.path, PATH));
    std::iter::once(title).chain(path).collect()
}

/// A door: its name on one line, as wide as the name from far away, with its arrow.
fn door<N>(node: N, words: &CardWords<'_>) -> MeasuredNode<N> {
    let far = tab_runs(DOOR_FAR, words.name, None);
    let end = far.last().map_or(0.0, |run| run.x + run.width);
    MeasuredNode {
        node,
        width: end + DOOR_ARROW_ROOM,
        height: DOOR_HEIGHT,
        header_height: 0.0,
        runs: tab_runs(DOOR_NEAR, words.name, None),
        headers: None,
        pointed: None,
    }
}

/// A frame's edge tab: one line with its name and code path. It is as wide as
/// its words from far away, and its frame keeps a shoulder beside it. Its
/// responsibility stays out of the picture.
fn one_line<N>(node: N, words: &CardWords<'_>, beside: f64) -> MeasuredNode<N> {
    let far = tab_runs(TAB_FAR, words.name, words.path);
    let end = far.last().map_or(0.0, |run| run.x + run.width);
    let width = end + TAB_PADDING + words.marked() + beside;
    MeasuredNode {
        node,
        width,
        height: TAB_HEIGHT,
        header_height: TAB_HEIGHT,
        runs: tab_runs(TAB_NEAR, words.name, words.path),
        headers: None,
        pointed: None,
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
    let far = far_name_width(words.name, title_style.size - TITLE.size);
    let named = title.natural_width() + marked + left + padding;
    let least = js_max(js_max(size.least, far + marked), named);
    // A note that outgrows the card takes the most width, never a width of its
    // own, so a row of cards reads as one set.
    let width = if note.natural_width() + left + padding <= least {
        crate::js::js_min(size.most, least)
    } else {
        size.most
    };
    let available = width - left - padding;
    let titles = runs_for(&title, title_style, available - marked, left, padding);
    let paths = path_run(
        words.path,
        available,
        left,
        padding + titles.len() as f64 * title_style.line,
    );
    let words_end =
        padding + titles.len() as f64 * title_style.line + paths.len() as f64 * PATH.line;
    let note_top = words_end + ARCHITECTURE_NOTE_GAP;
    let notes = runs_for(&note, NOTE, available, left, note_top);
    let bottom = if notes.is_empty() {
        words_end
    } else {
        note_top + notes.len() as f64 * NOTE.line
    };
    let height = js_max(size.height, bottom + padding);
    // The least height is the far view's: near words stand in the middle of it,
    // so a short card keeps no empty band under them.
    let slack = (height - bottom - padding) / 2.0;
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
        runs: titles
            .into_iter()
            .chain(paths)
            .chain(notes)
            .map(|run| TextRun {
                y: run.y + slack,
                ..run
            })
            .collect(),
        headers: None,
        pointed: None,
    }
}

/// A card's code path on one line under its name. A path never widens a card:
/// a long one keeps its tail.
fn path_run(path: Option<&str>, room: f64, x: f64, top: f64) -> Vec<TextRun> {
    path.iter()
        .map(|path| {
            let text = keep_tail(path, PATH.font, PATH.size, room);
            TextRun {
                width: width(&text, PATH.font, PATH.size),
                text,
                x,
                y: top + PATH.size,
                font: PATH.font,
                font_size: PATH.size,
                role: PATH.role,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn card(path: Option<&str>) -> MeasuredNode<()> {
        let words = CardWords {
            name: "Run checks",
            responsibility: Some("Checks the rules from one author run."),
            path,
            drills: false,
            door: false,
        };
        measure_node((), &words, false)
    }

    const LONG: &str = "apps/web/src/ui/rules/semantic-board-canvas/camera/a-long-way/camera.ts";

    #[test]
    fn a_path_takes_a_row_under_the_name_and_never_widens_a_card() {
        let (plain, bound) = (card(None), card(Some(LONG)));
        assert_eq!(bound.width, plain.width);
        assert!(bound.height > plain.height);
        assert!(bound.runs[0].y < bound.runs[1].y && bound.runs[1].y < bound.runs[2].y);
    }

    #[test]
    fn a_long_path_keeps_its_tail_inside_the_card() {
        let bound = card(Some(LONG));
        let row = &bound.runs[1];
        assert!(row.text.starts_with('…') && row.text.ends_with("/camera.ts"));
        assert!(row.x + row.width <= bound.width);
    }

    #[test]
    fn a_card_is_wide_enough_for_its_far_name_at_the_full_size() {
        let words = CardWords {
            name: "codex-realtime-voice",
            responsibility: None,
            path: None,
            drills: false,
            door: false,
        };
        let far = far_name_width(words.name, 0.0);
        assert!(far > CARD_LEAST);
        assert_eq!(measure_node((), &words, false).width, far);
    }

    #[test]
    fn a_frame_measures_one_line_and_its_far_words_fit_the_tab() {
        let words = CardWords {
            name: "Command startup",
            responsibility: Some("Takes argv from the process to one selected command."),
            path: Some("apps/cli/src"),
            drills: false,
            door: false,
        };
        let tab = measure_node((), &words, true);
        assert_eq!(tab.height, TAB_HEIGHT);
        assert_eq!(tab.header_height, TAB_HEIGHT);
        assert!(tab.runs.iter().all(|run| run.y == tab.runs[0].y));
        assert!(tab.runs.iter().all(|run| !run.text.contains("argv")));
        let far = tab_runs(TAB_FAR, words.name, words.path);
        let end = far.last().map_or(0.0, |run| run.x + run.width);
        assert!(end + TAB_PADDING + TAB_SHOULDER <= tab.width);
    }
}
