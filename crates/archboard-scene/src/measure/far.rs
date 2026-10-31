//! What a card says from far away, and the one type scale a picture sets every
//! far card at. A card keeps its box, so the scale is the largest at which every
//! card of the picture holds its name, its tags and its path, and the rest of a
//! card's box takes as much of its responsibility as whole lines hold.

use crate::drawing::{DiagramFont, TextRole, TextRun};
use crate::geometry::Rect;
use crate::js::{self, js_max, js_min};
use crate::measure::cards::{Style, TITLE, path_runs, tags_width};
use crate::measure::width;
use crate::paint::design::{
    CARD_NOTE_FONT, CARD_THICKNESS, DRILL_MARK_ROOM, FAR_START, ICON_CHIP_SIZE, LANDING_ROOM,
    PART_NOTE_SIZE, PART_PATH_SIZE, PART_TITLE_SIZE, TAG_GAP, TAG_HEIGHT,
};

/// The scale of a far card a picture that lands near is set at, for a reader who
/// zooms out: a name of 20 units, 12 px at a scale of 0.6.
const FAR_LEAST: f64 = 20.0 / PART_TITLE_SIZE;
/// Below this scale a card's far words are no larger than its near ones.
const FAR_FLOOR: f64 = 1.0;
/// How finely a picture's scale is sought: half a unit of a name.
const FAR_STEP: f64 = 0.5 / PART_TITLE_SIZE;
/// The room a far card keeps at its sides, above and below its words.
const PAD_X: f64 = 14.0;
const PAD_Y: f64 = 7.0;
/// The steps from one line to the next, per unit of the size of their words.
const NAME_LINE: f64 = 1.15;
const GIST_LINE: f64 = 1.25;
const FOOT_LINE: f64 = 1.2;
/// The room between the name, the responsibility and the foot of a far card.
const ROW_GAP: f64 = 3.0;
/// A far chip's side, and the room beside it, per unit of its name's size.
const CHIP: f64 = 1.45;
const CHIP_GAP: f64 = 0.45;
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
}

/// A card's far words at one scale, placed from the top left of its box.
#[derive(Clone, Debug)]
pub struct FarWords {
    /// The words, the first line of the name first.
    pub runs: Vec<TextRun>,
    /// Where the chip stands and its side.
    pub chip: (f64, f64, f64),
    /// Where the row of tags ends on the right and its top, at this scale.
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
    chip: f64,
    x: f64,
    /// The room its words have across, and the room its box has down.
    room: f64,
    height: f64,
}

impl Sizes {
    fn of(card: &FarCard<'_>, scale: f64) -> Sizes {
        let name = PART_TITLE_SIZE * scale;
        let height = card.height - CARD_THICKNESS - PAD_Y * 2.0;
        let chip = js_min(name * CHIP, js_min(height, ICON_CHIP_SIZE * scale));
        let x = PAD_X + chip + name * CHIP_GAP;
        let marked = if card.drills { DRILL_MARK_ROOM } else { 0.0 };
        Sizes {
            name,
            note: PART_NOTE_SIZE * scale,
            path: PART_PATH_SIZE * scale,
            chip,
            x,
            room: card.width - x - PAD_X - marked,
            height,
        }
    }
}

/// The height of a far card's foot row, which holds its path and its tags.
fn foot_of(card: &FarCard<'_>, scale: f64, sizes: Sizes) -> f64 {
    let tagged = if card.tags.is_empty() {
        0.0
    } else {
        TAG_HEIGHT * scale
    };
    js_max(tagged, card.path.map_or(0.0, |_| sizes.path * FOOT_LINE))
}

/// The stack of a far card at one scale: what it holds, and how tall each part stands.
struct Stack {
    names: Vec<String>,
    gists: Vec<String>,
    named: f64,
    told: f64,
    foot: f64,
}

impl Stack {
    /// How tall it stands.
    fn height(&self) -> f64 {
        self.named + self.told + foot_room(self.foot) + self.foot
    }
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
fn stacked(card: &FarCard<'_>, scale: f64, sizes: Sizes) -> Option<Stack> {
    let most = card.lines.max(NAME_LINES);
    let names = name_lines(card.name, sizes.name, sizes.room, most)?;
    let foot = foot_of(card, scale, sizes);
    let named = names.len() as f64 * sizes.name * NAME_LINE;
    let spare = sizes.height - named - foot - foot_room(foot);
    if spare < 0.0 || tags_width(card.tags, scale) > sizes.room {
        return None;
    }
    let gists = gist_in(card, sizes, spare);
    let told = if gists.is_empty() {
        0.0
    } else {
        ROW_GAP + gists.len() as f64 * sizes.note * GIST_LINE
    };
    Some(Stack {
        names,
        gists,
        named,
        told,
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

/// The path on a far card's foot row, beside its tags.
fn foot_path(card: &FarCard<'_>, scale: f64, sizes: Sizes, middle: f64) -> Vec<TextRun> {
    let tags = if card.tags.is_empty() {
        0.0
    } else {
        tags_width(card.tags, scale) + TAG_GAP * scale
    };
    card.path.map_or_else(Vec::new, |path| {
        let baseline = middle + sizes.path * MIDDLE;
        path_runs(path, sizes.room - tags, sizes.x, baseline, sizes.path)
    })
}

/// A card's far words at one scale, or none where they do not fit its box. The
/// block stands in the middle of the box, so neither end keeps an empty band.
pub fn far_words(card: &FarCard<'_>, scale: f64) -> Option<FarWords> {
    let sizes = Sizes::of(card, scale);
    let stack = stacked(card, scale, sizes)?;
    let block = stack.height();
    let top = PAD_Y + (sizes.height - block) / 2.0;
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
    let foot_top = top + block - stack.foot;
    let mut runs = block_runs(&stack.names, names, sizes.x, top);
    runs.extend(block_runs(
        &stack.gists,
        notes,
        sizes.x,
        top + stack.named + ROW_GAP,
    ));
    runs.extend(foot_path(card, scale, sizes, foot_top + stack.foot / 2.0));
    let chip_top = PAD_Y + js_max(0.0, (sizes.height - js_max(block, sizes.chip)) / 2.0);
    Some(FarWords {
        runs,
        chip: (PAD_X, chip_top, sizes.chip),
        tags: (!card.tags.is_empty()).then_some((sizes.x + sizes.room, foot_top)),
    })
}

/// The largest scale of a card's words, no larger than some scale.
fn largest(card: &FarCard<'_>, most: f64) -> f64 {
    if far_words(card, most).is_some() {
        return most;
    }
    let (mut low, mut high) = (FAR_FLOOR, most);
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

/// The scale a picture sets every far card at: as large as a name of 12 px needs
/// where the picture lands, and as every card of the picture holds.
pub fn far_scale_for(cards: &[FarCard<'_>], page: Rect) -> f64 {
    let (room_x, room_y) = LANDING_ROOM;
    let landing = js_min(1.0, js_min(room_x / page.width, room_y / page.height));
    let wanted = js_max(FAR_LEAST, FAR_START / landing);
    cards
        .iter()
        .map(|card| largest(card, wanted))
        .fold(wanted, js_min)
}

/// The width a card needs to set its name whole from far away at the scale of a
/// picture that lands near, on the fewest lines' widest line, beside its chip.
pub(crate) fn far_name_width(name: &str) -> f64 {
    let size = PART_TITLE_SIZE * FAR_LEAST;
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
    PAD_X + size * CHIP + size * CHIP_GAP + widest + PAD_X
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
        }
    }

    const GIST: &str = "Checks the rules, outcomes, captures and commands from one author run, \
        then reports every failure with the rule that named it and what to do next.";

    #[test]
    fn a_far_card_ends_a_cut_responsibility_at_a_whole_word() {
        let words = far_words(&card("Run checks", Some(GIST), 110.0), FAR_LEAST).expect("it fits");
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
            let words = far_words(&card, FAR_LEAST).expect("it fits");
            let foot = height - CARD_THICKNESS;
            assert!(words.runs.iter().all(|run| run.y < foot && run.y > 0.0));
            assert!(words.runs.iter().all(|run| run.x + run.width <= 300.0));
            words
                .runs
                .iter()
                .filter(|run| run.role == TextRole::Note)
                .count()
        };
        assert!(lines(140.0) > lines(96.0));
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
        let page = Rect {
            x: 0.0,
            y: 0.0,
            width: 3800.0,
            height: 2200.0,
        };
        let scale = far_scale_for(&cards, page);
        assert!(scale > FAR_FLOOR);
        assert!(cards.iter().all(|card| far_words(card, scale).is_some()));
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
