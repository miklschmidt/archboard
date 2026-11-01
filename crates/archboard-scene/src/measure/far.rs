//! What a card says from far away, at the one type scale of every far card. A
//! card keeps its box, its padding, its chip and the build of its near view: the
//! name beside the chip, the path at the foot. The scale is fixed, so words stay
//! in proportion to their card wherever a picture lands, and the room between
//! them takes as many lines of its responsibility as it holds.

use crate::drawing::{DiagramFont, TextRole, TextRun};
use crate::js::{self, js_max, js_min};
use crate::measure::cards::{Style, TITLE, path_runs};
use crate::measure::width;
use crate::paint::design::{
    ARCHITECTURE_CARD_PADDING, ARCHITECTURE_ICON_GAP, CARD_NOTE_FONT, CARD_THICKNESS,
    DRILL_MARK_ROOM, FAR_SCALE, FAR_TAG, ICON_CHIP_SIZE, PART_NOTE_SIZE, PART_PATH_SIZE,
    PART_TITLE_SIZE, TAG_BESIDE, TAG_GAP,
};

/// Below this scale a card's far words are no larger than its near ones.
const FAR_FLOOR: f64 = 1.0;
/// How finely a picture's scale is sought: half a unit of a name.
const FAR_STEP: f64 = 0.5 / PART_TITLE_SIZE;
/// The room a far card keeps round its words: its near padding.
const PAD: f64 = ARCHITECTURE_CARD_PADDING;
/// Where a far card's words start across its box: where its near words start.
const WORDS_X: f64 = PAD + ICON_CHIP_SIZE + ARCHITECTURE_ICON_GAP;
/// The steps from one line to the next, per unit of the size of their words.
const NAME_LINE: f64 = 1.15;
const GIST_LINE: f64 = 1.3;
const FOOT_LINE: f64 = 1.2;
/// The room between the name, the responsibility and the foot of a far card.
const ROW_GAP: f64 = 4.0;
/// How far below the middle of a line its baseline stands, per unit of its size.
const MIDDLE: f64 = 0.35;
/// The most lines a far name takes, unless the near card sets it on more.
const NAME_LINES: usize = 2;

/// A card as its far view reads it.
#[derive(Clone, Copy, Debug)]
pub struct FarCard<'a> {
    /// Its name.
    pub name: &'a str,
    /// Where its code lives.
    pub path: Option<&'a str>,
    /// What it is responsible for.
    pub gist: Option<&'a str>,
    /// The names of its groups.
    pub tags: &'a [&'a str],
    /// Whether a drill mark stands in its top right corner.
    pub drills: bool,
    /// How many lines its near view sets its name on.
    pub lines: usize,
    /// How wide its box stands.
    pub width: f64,
    /// How tall its box stands.
    pub height: f64,
    /// Where its chip stands, from the top of its box.
    pub chip_top: f64,
}

/// A card's far words at one scale, placed from the top left of its box.
#[derive(Clone, Debug)]
pub struct FarWords {
    /// The words, the first line of the name first.
    pub runs: Vec<TextRun>,
    /// Where the row of group marks ends on the right and its middle, at this scale.
    pub tags: Option<(f64, f64)>,
}

/// One word of a name or a note and what follows it: a space, or nothing after a hyphen.
#[derive(Clone, Copy)]
struct Piece<'a> {
    text: &'a str,
    spaced: bool,
}

/// The pieces of a text: its words, a hyphenated one broken after each hyphen.
fn pieces(text: &str) -> Vec<Piece<'_>> {
    let mut all = Vec::new();
    for word in js::split_spaces(text)
        .into_iter()
        .filter(|word| !word.is_empty())
    {
        let mut rest = word;
        while let Some(at) = rest.find('-').filter(|at| at + 1 < rest.len()) {
            all.push(Piece {
                text: &rest[..=at],
                spaced: false,
            });
            rest = &rest[at + 1..];
        }
        all.push(Piece {
            text: rest,
            spaced: true,
        });
    }
    all
}

/// A line with one more piece after it, spaced as the piece before it asks.
fn joined(line: &str, spaced: bool, piece: &str) -> String {
    let space = if spaced && !line.is_empty() { " " } else { "" };
    format!("{line}{space}{piece}")
}

/// A line of pieces, set as far as they go.
#[derive(Default)]
struct Filling {
    line: String,
    spaced: bool,
    full: Vec<String>,
}

impl Filling {
    /// Add a piece to the line, or start the next line with it where the line is
    /// full. Answers whether the line it stands on holds it.
    fn add(&mut self, piece: Piece<'_>, font: DiagramFont, size: f64, limit: f64) -> bool {
        let next = joined(&self.line, self.spaced, piece.text);
        if self.line.is_empty() || width(&next, font, size) <= limit {
            self.line = next;
        } else {
            self.full
                .push(std::mem::replace(&mut self.line, piece.text.to_owned()));
        }
        self.spaced = piece.spaced;
        width(&self.line, font, size) <= limit
    }

    /// The same lines, to try one more piece on.
    fn clone_short(&self) -> Filling {
        Filling {
            line: self.line.clone(),
            spaced: self.spaced,
            full: self.full.clone(),
        }
    }

    /// Every line.
    fn done(mut self) -> Vec<String> {
        if !self.line.is_empty() {
            self.full.push(self.line);
        }
        self.full
    }
}

/// Pieces broken greedily at a width. None when one piece is wider than the width.
fn greedy(pieces: &[Piece<'_>], size: f64, font: DiagramFont, limit: f64) -> Option<Vec<String>> {
    let mut filling = Filling::default();
    pieces
        .iter()
        .all(|piece| filling.add(*piece, font, size, limit))
        .then(|| filling.done())
}

/// A name on the fewest lines the room takes, balanced, or none where it cannot
/// stand whole on at most some lines.
fn name_lines(name: &str, size: f64, room: f64, most: usize) -> Option<Vec<String>> {
    let parts = pieces(name);
    let font = TITLE.font;
    let mut broken = greedy(&parts, size, font, room)?;
    if broken.len() > most {
        return None;
    }
    let count = broken.len();
    let mut limit = room - 4.0;
    while count > 1 && limit > room / 2.0 {
        match greedy(&parts, size, font, limit) {
            Some(narrower) if narrower.len() == count => broken = narrower,
            _ => break,
        }
        limit -= 4.0;
    }
    Some(broken)
}

/// A line cut at a whole word, with an ellipsis, inside a width.
fn cut_at_word(line: &str, font: DiagramFont, size: f64, room: f64) -> String {
    let mut kept = line;
    while !kept.is_empty() && width(&format!("{kept}…"), font, size) > room {
        kept = kept.rfind(' ').map_or("", |at| &kept[..at]);
    }
    if kept.is_empty() {
        String::new()
    } else {
        format!("{kept}…")
    }
}

/// As many whole lines of a responsibility as some lines hold. A text that goes
/// on ends at a whole word with an ellipsis.
fn gist_lines(gist: &str, size: f64, room: f64, most: usize) -> Vec<String> {
    let font = CARD_NOTE_FONT;
    let mut filling = Filling::default();
    for piece in pieces(gist) {
        let mut held = filling.clone_short();
        let fits = held.add(piece, font, size, room);
        if !fits || held.full.len() == most {
            let last = filling.line.clone();
            filling.line = cut_at_word(&last, font, size, room);
            return filling.done();
        }
        filling = held;
    }
    filling.done()
}

/// A far card's sizes at one scale.
#[derive(Clone, Copy)]
struct Sizes {
    name: f64,
    note: f64,
    path: f64,
    /// The room its words have across, its name's room beside its group marks,
    /// and the room its box has down.
    room: f64,
    name_room: f64,
    height: f64,
}

impl Sizes {
    fn of(card: &FarCard<'_>, scale: f64) -> Sizes {
        let name = PART_TITLE_SIZE * scale;
        let height = card.height - CARD_THICKNESS - card.chip_top - PAD;
        let marked = if card.drills { DRILL_MARK_ROOM } else { 0.0 };
        let room = card.width - WORDS_X - PAD - marked;
        let beside = if card.tags.is_empty() {
            0.0
        } else {
            marks_width(card.tags.len(), scale) + TAG_BESIDE * scale
        };
        Sizes {
            name,
            note: PART_NOTE_SIZE * scale,
            path: PART_PATH_SIZE * scale,
            room,
            name_room: room - beside,
            height,
        }
    }
}

/// How wide a far card's row of group marks stands at a scale.
pub(crate) fn marks_width(count: usize, scale: f64) -> f64 {
    let gaps = count.saturating_sub(1) as f64 * TAG_GAP;
    (count as f64 * FAR_TAG + gaps) * scale
}

/// The height of a far card's foot, which holds its path.
fn foot_of(card: &FarCard<'_>, sizes: Sizes) -> f64 {
    card.path.map_or(0.0, |_| sizes.path * FOOT_LINE)
}

/// The stack of a far card at one scale: what it holds, and how tall each part stands.
struct Stack {
    names: Vec<String>,
    gists: Vec<String>,
    /// How far the name stands below the top of the chip it is set beside.
    lead: f64,
    named: f64,
    foot: f64,
}

/// The room above a foot row, when there is one.
fn foot_room(foot: f64) -> f64 {
    if foot > 0.0 { ROW_GAP } else { 0.0 }
}

/// The lines of a responsibility the room left under a name holds.
fn gist_in(card: &FarCard<'_>, sizes: Sizes, spare: f64) -> Vec<String> {
    let Some(gist) = card.gist else {
        return Vec::new();
    };
    let step = sizes.note * GIST_LINE;
    let holds = |lines: &usize| *lines as f64 * step <= spare - ROW_GAP;
    // A responsibility takes no more lines than it has words.
    let words = gist.split_whitespace().count();
    match (1..=words).take_while(holds).last() {
        Some(most) => gist_lines(gist, sizes.note, sizes.room, most),
        None => Vec::new(),
    }
}

/// What a card holds at one scale, or none where its box does not hold it.
fn stacked(card: &FarCard<'_>, sizes: Sizes) -> Option<Stack> {
    let most = card.lines.max(NAME_LINES);
    let names = name_lines(card.name, sizes.name, sizes.name_room, most)?;
    let foot = foot_of(card, sizes);
    let line = sizes.name * NAME_LINE;
    let lead = js_max(0.0, (ICON_CHIP_SIZE - line) / 2.0);
    let named = names.len() as f64 * line;
    let spare = sizes.height - lead - named - foot - foot_room(foot);
    if spare < 0.0 {
        return None;
    }
    let gists = gist_in(card, sizes, spare);
    Some(Stack {
        names,
        gists,
        lead,
        named,
        foot,
    })
}

/// One line of words, its baseline half a cap height under its middle.
fn line_run(text: &str, style: Style, x: f64, middle: f64) -> TextRun {
    TextRun {
        text: text.to_owned(),
        width: width(text, style.font, style.size),
        x,
        y: middle + style.size * MIDDLE,
        font: style.font,
        font_size: style.size,
        role: style.role,
    }
}

/// The lines of a block of words, from its top.
fn block_runs(lines: &[String], style: Style, x: f64, top: f64) -> Vec<TextRun> {
    let at = |index: usize| top + (index as f64 + 0.5) * style.line;
    lines
        .iter()
        .enumerate()
        .map(|(index, line)| line_run(line, style, x, at(index)))
        .collect()
}

/// The path on a far card's foot.
fn foot_path(card: &FarCard<'_>, sizes: Sizes, middle: f64) -> Vec<TextRun> {
    card.path.map_or_else(Vec::new, |path| {
        let baseline = middle + sizes.path * MIDDLE;
        path_runs(path, sizes.room, WORDS_X, baseline, sizes.path)
    })
}

/// A card's far words at one scale, or none where they do not fit its box. As on
/// a near card the name stands beside the chip and the path at the foot.
pub fn far_words(card: &FarCard<'_>, scale: f64) -> Option<FarWords> {
    let sizes = Sizes::of(card, scale);
    let stack = stacked(card, sizes)?;
    let name_top = card.chip_top + stack.lead;
    let names = Style {
        font: TITLE.font,
        size: sizes.name,
        line: sizes.name * NAME_LINE,
        role: TextRole::Title,
    };
    let notes = Style {
        font: CARD_NOTE_FONT,
        size: sizes.note,
        line: sizes.note * GIST_LINE,
        role: TextRole::Note,
    };
    let mut runs = block_runs(&stack.names, names, WORDS_X, name_top);
    runs.extend(block_runs(
        &stack.gists,
        notes,
        WORDS_X,
        name_top + stack.named + ROW_GAP,
    ));
    let foot_top = card.chip_top + sizes.height - stack.foot;
    runs.extend(foot_path(card, sizes, foot_top + stack.foot / 2.0));
    Some(FarWords {
        runs,
        tags: (!card.tags.is_empty()).then_some((
            WORDS_X + sizes.room,
            name_top + sizes.name * NAME_LINE / 2.0,
        )),
    })
}

/// The largest scale of a card's words, no larger than the far scale.
fn largest(card: &FarCard<'_>) -> f64 {
    if far_words(card, FAR_SCALE).is_some() {
        return FAR_SCALE;
    }
    let (mut low, mut high) = (FAR_FLOOR, FAR_SCALE);
    while high - low > FAR_STEP {
        let middle = f64::midpoint(low, high);
        if far_words(card, middle).is_some() {
            low = middle;
        } else {
            high = middle;
        }
    }
    low
}

/// The scale a picture sets every far card at: the far scale, or less where a
/// box of the picture does not hold its words.
pub fn far_scale_for(cards: &[FarCard<'_>]) -> f64 {
    cards.iter().map(largest).fold(FAR_SCALE, js_min)
}

/// The width a card needs to set its name whole from far away, on the fewest
/// lines' widest line, beside its chip.
pub(crate) fn far_name_width(name: &str) -> f64 {
    let size = PART_TITLE_SIZE * FAR_SCALE;
    let parts = pieces(name);
    let line = |part: &[Piece<'_>]| {
        let (text, _) = part
            .iter()
            .fold((String::new(), false), |(line, spaced), piece| {
                (joined(&line, spaced, piece.text), piece.spaced)
            });
        width(&text, TITLE.font, size)
    };
    let widest = (0..=parts.len())
        .map(|cut| {
            let (first, second) = parts.split_at(cut);
            js_max(line(first), line(second))
        })
        .fold(f64::INFINITY, js_min);
    WORDS_X + widest + PAD
}

#[cfg(test)]
mod tests {
    use super::*;

    fn card(name: &'static str, gist: Option<&'static str>, height: f64) -> FarCard<'static> {
        FarCard {
            name,
            path: Some("src/checks.ts"),
            gist,
            tags: &[],
            drills: false,
            lines: 1,
            width: 300.0,
            height,
            chip_top: PAD,
        }
    }

    const GIST: &str = "Checks the rules, outcomes, captures and commands from one author run, \
        then reports every failure with the rule that named it and what to do next.";

    #[test]
    fn a_far_card_ends_a_cut_responsibility_at_a_whole_word() {
        let words = far_words(&card("Run checks", Some(GIST), 130.0), FAR_SCALE).expect("it fits");
        let last = (words.runs.iter())
            .rfind(|run| run.role == TextRole::Note)
            .expect("some of the gist");
        let stem = last.text.trim_end_matches('…');
        assert!(last.text.ends_with('…'));
        assert!(GIST.contains(&format!("{stem} ")), "{}", last.text);
    }

    #[test]
    fn a_taller_box_holds_more_of_a_responsibility_and_nothing_overflows() {
        let lines = |height: f64| {
            let card = card("Run checks", Some(GIST), height);
            let words = far_words(&card, FAR_SCALE).expect("it fits");
            let foot = height - CARD_THICKNESS;
            assert!(words.runs.iter().all(|run| run.y < foot && run.y > 0.0));
            assert!(words.runs.iter().all(|run| run.x + run.width <= 300.0));
            words
                .runs
                .iter()
                .filter(|run| run.role == TextRole::Note)
                .count()
        };
        assert!(lines(160.0) > lines(110.0));
    }

    #[test]
    fn one_scale_holds_every_card_of_a_picture() {
        let cards = [
            card("Run checks", None, 96.0),
            card(
                "Canonical checkpoint operations and retained readings",
                None,
                96.0,
            ),
        ];
        let scale = far_scale_for(&cards);
        assert!(scale > FAR_FLOOR);
        assert!(cards.iter().all(|card| far_words(card, scale).is_some()));
    }

    #[test]
    fn a_group_on_a_far_card_leaves_its_path_alone() {
        let plain = card("Run checks", Some(GIST), 130.0);
        let tagged = FarCard {
            tags: &["Core", "Shell"],
            ..plain
        };
        let path = |words: FarWords| {
            let runs = words.runs.into_iter();
            runs.filter(|run| matches!(run.role, TextRole::Folder | TextRole::File))
                .map(|run| run.text)
                .collect::<String>()
        };
        let far = |card: &FarCard<'_>| far_words(card, FAR_SCALE).expect("it fits");
        assert_eq!(path(far(&tagged)), path(far(&plain)));
        assert!(far(&tagged).tags.is_some());
    }

    #[test]
    fn a_hyphenated_name_breaks_after_a_hyphen_and_a_word_never_breaks() {
        let broken = name_lines("codex-realtime-voice", 28.0, 240.0, 2).expect("two lines");
        assert_eq!(broken.len(), 2);
        assert_eq!(broken.concat(), "codex-realtime-voice");
        assert!(broken[0].ends_with('-'));
        assert_eq!(name_lines("Serialization", 40.0, 120.0, 2), None);
    }
}
