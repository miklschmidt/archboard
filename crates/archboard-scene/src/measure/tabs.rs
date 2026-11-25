//! A frame's edge tab and a door: words on one line, near and far.

use crate::drawing::{MeasuredNode, TextRun};
use crate::js::{js_max, js_min};
use crate::measure::cards::{CardWords, PATH, Style, TITLE};
use crate::measure::{keep_tail, width};
use crate::sizes::{
    DOOR_ARROW_ROOM, DOOR_FAR_ICON, DOOR_HEIGHT, DOOR_ICON, DOOR_PADDING, PARENT_TITLE_SIZE,
    PART_PATH_SIZE, PART_TITLE_SIZE, TAB_CHIP, TAB_FAR_CHIP, TAB_FAR_DROP, TAB_FAR_MOST,
    TAB_FAR_NAME, TAB_FAR_PATH, TAB_HEIGHT, TAB_ICON_GAP, TAB_MOST, TAB_PADDING, TAB_PATH_GAP,
};

/// Where a tab's words stand on its one line: their baseline and sizes.
#[derive(Clone, Copy, Debug)]
pub(crate) struct TabLine {
    /// Where its name starts.
    pub left: f64,
    /// The baseline its name and path share.
    pub baseline: f64,
    pub name: f64,
    pub path: f64,
    /// How far along its line a path may run.
    pub most: f64,
}

/// A tab's line as the picture draws it near.
pub(crate) const TAB_NEAR: TabLine = TabLine {
    left: TAB_PADDING + TAB_CHIP + TAB_ICON_GAP,
    baseline: 23.0,
    name: PARENT_TITLE_SIZE,
    path: PART_PATH_SIZE,
    most: TAB_MOST,
};

/// A tab's line from far away, in a picture that lands near.
pub(crate) const TAB_FAR: TabLine = TabLine {
    left: TAB_PADDING + TAB_FAR_CHIP + TAB_ICON_GAP,
    baseline: 25.0,
    name: TAB_FAR_NAME,
    path: TAB_FAR_PATH,
    most: TAB_MOST,
};

/// A tab's line from far away at its picture's far scale: as large as its picture's
/// cards, in the height of a tab and the room of its frame.
pub(crate) fn tab_far(name: &str, scale: f64, room: f64) -> TabLine {
    let wide = width(name, TITLE.font, TAB_FAR_NAME);
    let held = (room - TAB_FAR.left - TAB_PADDING) / wide * TAB_FAR_NAME;
    let size = js_min(PART_TITLE_SIZE * scale, js_min(TAB_FAR_MOST, held));
    let size = js_max(TAB_FAR_NAME, size);
    TabLine {
        baseline: TAB_FAR.baseline + (size - TAB_FAR_NAME) * TAB_FAR_DROP,
        name: size,
        path: TAB_FAR_PATH * size / TAB_FAR_NAME,
        most: js_min(TAB_MOST, room),
        ..TAB_FAR
    }
}

/// A door's line as the picture draws it near.
const DOOR_NEAR: TabLine = TabLine {
    left: DOOR_PADDING + DOOR_ICON + TAB_ICON_GAP - 2.0,
    baseline: 22.0,
    name: PARENT_TITLE_SIZE,
    path: PART_PATH_SIZE,
    most: TAB_MOST,
};

/// A door's line as the picture draws it from far away.
const DOOR_FAR: TabLine = TabLine {
    left: DOOR_PADDING + DOOR_FAR_ICON + TAB_ICON_GAP - 2.0,
    baseline: 24.0,
    name: TAB_FAR_NAME,
    path: TAB_FAR_PATH,
    most: TAB_MOST,
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
    let room = line.most - start;
    let shown = path.map(|path| keep_tail(path, PATH.font, line.path, room));
    let path = shown.map(|text| set(text, start, line.path, PATH));
    std::iter::once(title).chain(path).collect()
}

/// A door's name on its one line, as the picture draws it from far away.
pub(crate) fn door_far_runs(name: &str) -> Vec<TextRun> {
    tab_runs(DOOR_FAR, name, None)
}

/// A door: its name on one line, as wide as the name from far away, with its arrow.
pub(super) fn door<N>(node: N, words: &CardWords<'_>) -> MeasuredNode<N> {
    let far = door_far_runs(words.name);
    let end = far.last().map_or(0.0, |run| run.x + run.width);
    MeasuredNode {
        node,
        width: end + DOOR_ARROW_ROOM + words.toggled(),
        height: DOOR_HEIGHT,
        header_height: 0.0,
        runs: tab_runs(DOOR_NEAR, words.name, None),
        headers: None,
    }
}

/// A frame's edge tab: one line with its name and code path. It is as wide as
/// its words from far away, and its frame keeps a shoulder beside it. Its
/// responsibility stays out of the picture.
pub(super) fn one_line<N>(node: N, words: &CardWords<'_>, beside: f64) -> MeasuredNode<N> {
    let near = tab_runs(TAB_NEAR, words.name, words.path);
    let far = tab_runs(TAB_FAR, words.name, words.path);
    let end_of = |runs: &[TextRun]| runs.last().map_or(0.0, |run| run.x + run.width);
    let room = words.marked() + words.toggled();
    let width = js_max(end_of(&near), end_of(&far)) + TAB_PADDING + room + beside;
    MeasuredNode {
        node,
        width,
        height: TAB_HEIGHT,
        header_height: TAB_HEIGHT,
        runs: near,
        headers: None,
    }
}
