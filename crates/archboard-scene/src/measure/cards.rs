//! A card's words and least box, and a container's header at each width it can
//! take, settled before the card gains neighbours.

use archboard_text::Paragraph;

use crate::drawing::{DiagramFont, MeasuredNode, TextRole, TextRun, Toggle};
use crate::js::{js_max, js_min};
use crate::measure::far::far_name_width;
use crate::measure::tabs::{door, one_line};
use crate::measure::{keep_tail, paragraph, width};
use crate::request::GroupTag;
use crate::sizes::{
    ARCHITECTURE_CARD_PADDING, ARCHITECTURE_ICON_GAP, ARCHITECTURE_NOTE_GAP, CARD_NOTE_FONT,
    CARD_PATH_FONT, CARD_THICKNESS, CARD_TITLE_FONT, DRILL_MARK_ROOM, ICON_CHIP_SIZE, NAME_CAP,
    PART_NOTE_LINE, PART_NOTE_SIZE, PART_PATH_GAP, PART_PATH_LINE, PART_PATH_SIZE, PART_TITLE_LINE,
    PART_TITLE_SIZE, TAB_SHOULDER, TAG_BESIDE, TAG_FONT, TAG_GAP, TAG_INSET, TAG_PADDING, TAG_SIZE,
    TOGGLE_ROOM,
};

/// A face, a size, the room a line takes and what the line is.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Style {
    pub font: DiagramFont,
    pub size: f64,
    pub line: f64,
    pub role: TextRole,
}

/// A card's name.
pub(crate) const TITLE: Style = Style {
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
pub(crate) const PATH: Style = Style {
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
    /// The groups a card is in.
    pub tags: &'a [GroupTag],
    /// Whether it opens another picture, which puts a mark beside its name.
    pub drills: bool,
    /// Whether it stands outside the open frame as a door.
    pub door: bool,
    /// The control it wears for a live reader.
    pub toggle: Option<Toggle>,
}

impl CardWords<'_> {
    /// The room the drill mark keeps beside the name.
    pub(super) fn marked(&self) -> f64 {
        if self.drills { DRILL_MARK_ROOM } else { 0.0 }
    }

    /// The room a control keeps at the end of a door or a tab.
    pub(super) fn toggled(&self) -> f64 {
        if self.toggle.is_some() {
            TOGGLE_ROOM
        } else {
            0.0
        }
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
    slab(node, words, size)
}

/// How wide a row of tags stands at a scale of its near size.
fn tags_width(tags: &[&str], scale: f64) -> f64 {
    let wide = |tag: &&str| width(tag, TAG_FONT, TAG_SIZE * scale) + 2.0 * TAG_PADDING * scale;
    let words: f64 = tags.iter().map(wide).sum();
    words + (tags.len().saturating_sub(1)) as f64 * TAG_GAP * scale
}

/// How much of a name's row a row of tags takes: the tags end nearer the edge
/// than the words do.
fn tags_beside(tags: f64) -> f64 {
    if tags == 0.0 {
        0.0
    } else {
        tags + TAG_BESIDE - (ARCHITECTURE_CARD_PADDING - TAG_INSET)
    }
}

/// Where a card's row of tags ends: at its top right corner, clear of a drill mark.
pub(crate) fn tag_end(card_width: f64, drills: bool) -> f64 {
    card_width - TAG_INSET - if drills { DRILL_MARK_ROOM } else { 0.0 }
}

/// How far a row of tags beside a name stands above that name's baseline.
const TAG_ABOVE: f64 = 16.0;
/// Where a card's row of tags stands, from the baseline of its name.
pub(crate) fn tag_top(baseline: f64) -> f64 {
    baseline - TAG_ABOVE
}

/// How far a card's name stands below its top: the margin its path keeps at its foot.
fn cap_margin(style: Style) -> f64 {
    ARCHITECTURE_CARD_PADDING + style.size - style.size * NAME_CAP
}

/// The folders of a path and the name that ends it. A path that counts paths is all dim.
fn path_parts(path: &str) -> (&str, &str) {
    if path.contains(" · ") {
        return (path, "");
    }
    let end = crate::ecma::trim_end(path).trim_end_matches('/').len();
    path[..end]
        .rfind('/')
        .map_or(("", path), |at| path.split_at(at + 1))
}

/// A path on one line, its tail kept in the room it has: its folders dim and its file bright.
pub(crate) fn path_runs(path: &str, room: f64, x: f64, baseline: f64, size: f64) -> Vec<TextRun> {
    let kept = keep_tail(path, PATH.font, size, room);
    let (folders, file) = path_parts(&kept);
    let run = |text: &str, x: f64, role: TextRole| TextRun {
        width: width(text, PATH.font, size),
        text: text.to_owned(),
        x,
        y: baseline,
        font: PATH.font,
        font_size: size,
        role,
    };
    let dim = (!folders.is_empty()).then(|| run(folders, x, TextRole::Folder));
    let start = x + dim.as_ref().map_or(0.0, |run| run.width);
    let bright = (!file.is_empty()).then(|| run(file, start, TextRole::File));
    dim.into_iter().chain(bright).collect()
}

/// A card's slab at its least box: as wide as its words ask, within `size`.
fn slab<N>(node: N, words: &CardWords<'_>, size: Size) -> MeasuredNode<N> {
    let padding = ARCHITECTURE_CARD_PADDING;
    let left = padding + ICON_CHIP_SIZE + ARCHITECTURE_ICON_GAP;
    let marked = words.marked();
    let title = paragraph(words.name, TITLE.font, TITLE.size);
    let note = paragraph(words.responsibility.unwrap_or(""), NOTE.font, NOTE.size);
    let far = far_name_width(words.name);
    let name = title.natural_width() + marked;
    let least = js_max(js_max(size.least, far + marked), name + left + padding);
    // A note that outgrows the card takes the most width, never a width of its
    // own, so a row of cards reads as one set.
    let plain = if note.natural_width() + left + padding <= least {
        js_min(size.most, least)
    } else {
        size.most
    };
    // Tags stand on the name's row and the card widens for them, so the name
    // keeps the room it has without them.
    let width = js_max(
        plain,
        left + js_min(name, plain - left - padding) + beside(words) + padding,
    );
    stand(node, words, (&title, &note), width, size.height)
}

/// The room a card's tags take beside its name.
fn beside(words: &CardWords<'_>) -> f64 {
    let names: Vec<&str> = words.tags.iter().map(|tag| tag.name.as_str()).collect();
    tags_beside(tags_width(&names, 1.0))
}

/// A card's words in the box the layout gave it: wrapped at its width, where
/// its least box stands them, and its path at its foot. A layout can widen a
/// card or make it taller than its least box. The words stay where they stand,
/// so the far view, whose words start at the chip, keeps its room.
pub fn fit_card<N>(node: N, words: &CardWords<'_>, width: f64, height: f64) -> MeasuredNode<N> {
    let title = paragraph(words.name, TITLE.font, TITLE.size);
    let note = paragraph(words.responsibility.unwrap_or(""), NOTE.font, NOTE.size);
    let least = stand(node, words, (&title, &note), width, CARD_HEIGHT);
    let grown = height - least.height;
    let at_foot = |run: &TextRun| matches!(run.role, TextRole::Folder | TextRole::File);
    MeasuredNode {
        height,
        runs: (least.runs.into_iter())
            .map(|run| TextRun {
                y: run.y + if at_foot(&run) { grown } else { 0.0 },
                ..run
            })
            .collect(),
        ..least
    }
}

/// A card's slab at a width, at least as tall as `least`: its name and
/// responsibility inside the card's padding, beside its type chip, and its code
/// path at its foot, as far from its foot as its name's capitals stand from its
/// top. The tags stand on the name's row.
fn stand<N>(
    node: N,
    words: &CardWords<'_>,
    (title, note): (&Paragraph, &Paragraph),
    width: f64,
    least: f64,
) -> MeasuredNode<N> {
    let padding = ARCHITECTURE_CARD_PADDING;
    let left = padding + ICON_CHIP_SIZE + ARCHITECTURE_ICON_GAP;
    let marked = words.marked();
    let beside = beside(words);
    let available = width - left - padding;
    let titles = runs_for(title, TITLE, available - marked - beside, left, padding);
    let titled = padding + titles.len() as f64 * TITLE.line;
    let note_top = titled + ARCHITECTURE_NOTE_GAP;
    let notes = runs_for(note, NOTE, available, left, note_top);
    let told = if notes.is_empty() {
        titled
    } else {
        note_top + notes.len() as f64 * NOTE.line
    };
    let foot = cap_margin(TITLE) + CARD_THICKNESS;
    let height = js_max(
        least,
        match words.path {
            Some(_) => told + PART_PATH_GAP + PATH.size + foot,
            None => told + padding,
        },
    );
    // A card with no path keeps no empty band: its words stand in the middle.
    let slack = match words.path {
        Some(_) => 0.0,
        None => (height - told - padding) / 2.0,
    };
    let paths = words.path.map_or_else(Vec::new, |path| {
        path_runs(path, available, left, height - foot, PATH.size)
    });
    // The painted width wins, even when a single long word needs a little more
    // space than the preferred maximum; no character is hidden or cut.
    let painted = titles
        .iter()
        .map(|run| run.width + marked + beside)
        .chain(notes.iter().map(|run| run.width))
        .fold(0.0, js_max);
    let shifted = |run: TextRun| TextRun {
        y: run.y + slack,
        ..run
    };
    MeasuredNode {
        node,
        width: js_max(width, left + painted + padding),
        height,
        header_height: 0.0,
        runs: titles
            .into_iter()
            .chain(notes)
            .map(shifted)
            .chain(paths)
            .collect(),
        headers: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::measure::tabs::{TAB_FAR, tab_runs};
    use crate::request::PaletteColor;
    use crate::sizes::{TAB_HEIGHT, TAB_PADDING};

    fn card(path: Option<&str>) -> MeasuredNode<()> {
        tagged(path, "Run checks", &[])
    }

    fn tagged(path: Option<&str>, name: &str, tags: &[GroupTag]) -> MeasuredNode<()> {
        let words = CardWords {
            name,
            responsibility: Some("Checks the rules from one author run."),
            path,
            tags,
            drills: false,
            door: false,
            toggle: None,
        };
        measure_node((), &words, false)
    }

    fn tag(name: &str) -> GroupTag {
        GroupTag {
            name: name.to_owned(),
            color: PaletteColor::Teal,
        }
    }

    const LONG: &str = "apps/web/src/ui/rules/canvas/camera/a-long-way/camera.ts";

    #[test]
    fn a_path_stands_at_the_foot_as_far_from_it_as_the_capitals_of_the_name_from_the_top() {
        let bound = card(Some("apps/cli/src/bin.ts"));
        let name = &bound.runs[0];
        let path = bound.runs.last().expect("a path");
        assert!(bound.runs.iter().all(|run| run.y <= path.y));
        let above = name.y - name.font_size * NAME_CAP;
        let below = bound.height - CARD_THICKNESS - path.y;
        assert!((above - below).abs() < 1e-9, "{above} {below}");
    }

    #[test]
    fn a_card_the_layout_widens_and_raises_wraps_at_its_width_and_keeps_its_words_in_place() {
        let words = |path| CardWords {
            name: "Packages",
            responsibility: Some(
                "The workspace packages that the apps, the server and the CLI share: \
                 the model, the renderer, the workbench and their support",
            ),
            path,
            tags: &[],
            drills: false,
            door: false,
            toggle: None,
        };
        let notes = |card: &MeasuredNode<()>| -> Vec<f64> {
            (card.runs.iter())
                .filter(|run| run.role == TextRole::Note)
                .map(|run| run.y)
                .collect()
        };
        let pathed = words(Some("packages"));
        let least = measure_node((), &pathed, false);
        let fitted = fit_card((), &pathed, 560.0, least.height + 40.0);
        assert!(notes(&fitted).len() < notes(&least).len());
        let right = 560.0 - ARCHITECTURE_CARD_PADDING;
        assert!(fitted.runs.iter().all(|run| run.x + run.width <= right));
        let path = fitted.runs.last().expect("a path");
        assert_eq!(path.y, least.runs.last().expect("a path").y + 40.0);

        let plain = words(None);
        let least = measure_node((), &plain, false);
        let wide = fit_card((), &plain, 560.0, least.height);
        let tall = fit_card((), &plain, 560.0, least.height + 40.0);
        assert_eq!(tall.runs[0].y, wide.runs[0].y);
    }

    #[test]
    fn a_path_dims_its_folders_and_a_count_stays_dim() {
        let roles = |path: &str| -> Vec<(String, TextRole)> {
            let bound = card(Some(path));
            bound
                .runs
                .iter()
                .filter(|run| matches!(run.role, TextRole::Folder | TextRole::File))
                .map(|run| (run.text.clone(), run.role))
                .collect()
        };
        assert_eq!(
            roles("apps/cli/src/bin.ts"),
            [
                ("apps/cli/src/".to_owned(), TextRole::Folder),
                ("bin.ts".to_owned(), TextRole::File)
            ]
        );
        assert_eq!(
            roles("apps/portal-api · 3 paths"),
            [("apps/portal-api · 3 paths".to_owned(), TextRole::Folder)]
        );
    }

    #[test]
    fn a_long_path_keeps_its_tail_inside_the_card_and_never_widens_it() {
        let (plain, bound) = (card(None), card(Some(LONG)));
        assert_eq!(bound.width, plain.width);
        let last = bound.runs.last().expect("a path");
        assert_eq!(last.text, "camera.ts");
        assert!(last.x + last.width <= bound.width);
    }

    #[test]
    fn a_card_widens_for_its_tags_so_they_never_cover_its_name_or_move_it() {
        let name = "Canonical checkpoint operations";
        let ends = |node: &MeasuredNode<()>| {
            let title = node.runs.iter().filter(|run| run.role == TextRole::Title);
            title.map(|run| run.x + run.width).fold(0.0, f64::max)
        };
        let plain = tagged(Some("src"), name, &[]);
        for held in [
            vec![tag("Workhorse")],
            vec![tag("Agent"), tag("Workspace packages")],
            vec![
                tag("A very long group name of this model"),
                tag("And another"),
            ],
        ] {
            let card = tagged(Some("src"), name, &held);
            let names: Vec<&str> = held.iter().map(|tag| tag.name.as_str()).collect();
            let row = tags_width(&names, 1.0);
            assert!(ends(&card) <= tag_end(card.width, false) - row);
            assert_eq!(card.runs[0].y, plain.runs[0].y);
            assert_eq!(card.height, plain.height);
        }
    }

    #[test]
    fn a_name_that_wraps_alone_wraps_the_same_beside_its_tags() {
        let name = "A name far longer than any card is allowed to stand on one line of its own";
        let lines = |node: &MeasuredNode<()>| {
            let title = node.runs.iter().filter(|run| run.role == TextRole::Title);
            title.map(|run| run.text.clone()).collect::<Vec<_>>()
        };
        let plain = tagged(None, name, &[]);
        let card = tagged(None, name, &[tag("Agent"), tag("Workspace packages")]);
        assert_eq!(lines(&card), lines(&plain));
        assert!(card.width > plain.width);
    }

    #[test]
    fn a_card_is_wide_enough_for_its_far_name_at_the_full_size() {
        let words = CardWords {
            name: "codex-realtime-voice",
            responsibility: None,
            path: None,
            tags: &[],
            drills: false,
            door: false,
            toggle: None,
        };
        let far = far_name_width(words.name);
        assert_eq!(measure_node((), &words, false).width, far.max(CARD_LEAST));
    }

    #[test]
    fn a_frame_measures_one_line_and_its_far_words_fit_the_tab() {
        let words = CardWords {
            name: "Command startup",
            responsibility: Some("Takes argv from the process to one selected command."),
            path: Some("apps/cli/src"),
            tags: &[],
            drills: false,
            door: false,
            toggle: None,
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
