//! What a card draws when the picture is seen from far away, beside what it draws
//! near: both views are drawn here together, as one shared element transition
//! (TASK-428). A far card is its near card at the one type scale of its picture,
//! with what its box holds (`measure::far_words`).

use crate::drawing::{NodeFacts, TextRole, TextRun};
use crate::geometry::Rect;
use crate::js;
use crate::measure::{self, FarCard, FarWords, far_words, tag_end};
use crate::paint::Ctx;
use crate::paint::appearance::type_chip;
use crate::paint::build::{Items, concat, lines, point};
use crate::paint::design::{
    CARD_NOTE_FONT, CARD_TITLE_FONT, ICON_CHIP_SIZE, TAB_FAR_NAME, TAB_PADDING,
};
use crate::paint::drill_mark::corner_drill_mark;
use crate::paint::far_view::{Place, far_layer, moving_words, near_layer, shared_chip};
use crate::paint::icons::ICON_SIZE;
use crate::paint::palette::Palette;
use crate::paint::standing::standing_palette;
use crate::paint::tag::{tag_marks, tag_row};
use crate::paint::text_runs::paint_text_runs;
use crate::request::{GroupTag, NodeAppearance, Standing};
use crate::scene::SubjectKind;

/// How much larger a drill mark stands on a far card.
const MARK_SCALE: f64 = 1.2;
/// A far name's size where the far view sets it, and its gist's.
const NAME_SIZE: f64 = TAB_FAR_NAME;
const NOTE_SIZE: f64 = 13.0;
/// How far below the middle of its line a heading's baseline stands, per unit of its size.
const HEADING_MIDDLE: f64 = 0.35;
/// The step from the middle of a heading's far name to the middle of its note.
const NOTE_STEP: f64 = 21.0;

/// A block of words as a view draws them, and where they start.
#[derive(Clone)]
pub(super) struct Words {
    pub items: Items,
    pub anchor: Place,
}

/// Measured lines as a block of words, with where they start.
pub(super) fn words_in(runs: &[TextRun], rect: Rect, palette: &Palette) -> Words {
    let anchor = runs.first().map_or_else(
        || Place {
            x: rect.x,
            y: rect.y,
            size: NAME_SIZE,
        },
        |first| Place {
            x: rect.x + first.x,
            y: rect.y + first.y,
            size: first.font_size,
        },
    );
    Words {
        items: paint_text_runs(runs, rect, palette, None),
        anchor,
    }
}

/// A part as its card or its heading draws it: what it is, the box its views
/// fill, its look, and how it stands.
pub(super) struct Part<'a> {
    pub kind: SubjectKind,
    pub node: &'a NodeFacts,
    pub rect: Rect,
    pub appearance: &'a NodeAppearance,
    pub standing: Option<Standing>,
    pub unsettled: bool,
}

/// What a card draws near: where its chip stands, its words, and where its tags stand.
pub(super) struct NearCard {
    pub chip_x: f64,
    pub chip_y: f64,
    pub words: Words,
    /// How many lines it sets its name on.
    pub lines: usize,
    /// The top of its row of tags, from the top of its box.
    pub tag_top: f64,
}

/// The gist a heading or a card draws: none where it says nothing but white space.
fn gist_of(text: Option<&str>) -> Option<&str> {
    text.filter(|text| !js::trim(text).is_empty())
}

/// The tags a card draws: none on a card a comparison removed, which is a ghost.
fn tags_of<'a>(part: &Part<'a>) -> &'a [GroupTag] {
    if part.standing == Some(Standing::Removed) {
        &[]
    } else {
        &part.appearance.tags
    }
}

/// What a part's far view reads of it.
fn far_card_of<'a>(part: &'a Part<'_>, names: &'a [&'a str], near_lines: usize) -> FarCard<'a> {
    FarCard {
        name: &part.node.name,
        path: gist_of(part.node.code_path.as_deref()),
        gist: gist_of(part.node.responsibility.as_deref()),
        tags: names,
        drills: part.appearance.drill.is_some(),
        lines: near_lines,
        width: part.rect.width,
        height: part.rect.height,
    }
}

/// What a card draws far: its words, where its chip stands, and its tags. A box
/// too small for its far words keeps its near ones.
fn far_view_of(
    far: Option<FarWords>,
    rect: Rect,
    near: &NearCard,
    ink: &FarInk<'_>,
) -> (Words, Place, Items) {
    let Some(far) = far else {
        let chip = Place {
            x: near.chip_x,
            y: near.chip_y,
            size: ICON_CHIP_SIZE,
        };
        return (near.words.clone(), chip, Items::new());
    };
    let (x, y, size) = far.chip;
    let chip = Place {
        x: rect.x + x,
        y: rect.y + y,
        size,
    };
    let tags = far.tags.map_or_else(Items::new, |(x, y)| {
        tag_marks(ink.tags, point(rect.x + x, rect.y + y), ink.scale)
    });
    (words_in(&far.runs, rect, ink.words), chip, tags)
}

/// What a far view is drawn with.
struct FarInk<'a> {
    tags: &'a [GroupTag],
    scale: f64,
    words: &'a Palette,
}

/// A part's near and far views, and the kind chip they share.
pub(super) fn paint_card_views(
    ctx: &Ctx<'_>,
    part: &Part<'_>,
    palette: &Palette,
    near: NearCard,
) -> Items {
    let rect = part.rect;
    let words = standing_palette(palette, part.standing);
    let mark = |scale: f64| match part.appearance.drill {
        None => Items::new(),
        Some(direction) => corner_drill_mark(rect, direction, &words.glyph, scale),
    };
    let tags = tags_of(part);
    let names: Vec<&str> = tags.iter().map(|tag| tag.name.as_str()).collect();
    let ink = FarInk {
        tags,
        scale: ctx.far_scale,
        words: &words,
    };
    let far = far_words(&far_card_of(part, &names, near.lines), ctx.far_scale);
    let (far_block, far_chip, far_tags) = far_view_of(far, rect, &near, &ink);
    let near_chip = Place {
        x: near.chip_x,
        y: near.chip_y,
        size: ICON_CHIP_SIZE,
    };
    let near_tags = point(
        rect.x + tag_end(rect.width, part.appearance.drill.is_some()),
        rect.y + near.tag_top,
    );
    let icon = type_chip(
        part.appearance,
        palette,
        part.standing,
        ctx.icons,
        ICON_SIZE,
    );
    lines(vec![
        shared_chip(icon, near_chip, far_chip),
        near_layer(concat(vec![
            moving_words(near.words.items, near.words.anchor, far_block.anchor),
            tag_row(tags, near_tags, 1.0),
            mark(1.0),
        ])),
        far_layer(concat(vec![
            moving_words(far_block.items, far_block.anchor, near.words.anchor),
            far_tags,
            mark(MARK_SCALE),
        ])),
    ])
}

/// One line of a heading's far words, around a middle.
fn heading_run(text: String, size: f64, middle: f64, note: bool) -> TextRun {
    let (font, role) = if note {
        (CARD_NOTE_FONT, TextRole::Note)
    } else {
        (CARD_TITLE_FONT, TextRole::Title)
    };
    TextRun {
        width: measure::width(&text, font, size),
        text,
        x: TAB_PADDING,
        y: middle + size * HEADING_MIDDLE,
        font,
        font_size: size,
        role,
    }
}

/// A heading's far words in a tab of some most width, from the tab's top left,
/// and the width its tab takes to hold them.
pub(super) fn heading_runs(name: &str, summary: Option<&str>, tab: Rect) -> (Vec<TextRun>, f64) {
    let words = tab.width - 2.0 * TAB_PADDING;
    let title = measure::truncate(name, CARD_TITLE_FONT, NAME_SIZE, words);
    let note =
        gist_of(summary).map(|gist| measure::truncate(gist, CARD_NOTE_FONT, NOTE_SIZE, words));
    let below = note.as_ref().map_or(0.0, |_| NOTE_STEP);
    let middle = (tab.height - below) / 2.0;
    let mut runs = vec![heading_run(title, NAME_SIZE, middle, false)];
    runs.extend(note.map(|line| heading_run(line, NOTE_SIZE, middle + NOTE_STEP, true)));
    let wide = js::max(runs.iter().map(|run| run.width));
    (runs, wide + 2.0 * TAB_PADDING)
}

/// The near and far views of a heading that has no kind of its own to show, a flow's.
pub(super) fn paint_heading_views(
    far: &[TextRun],
    tab: Rect,
    palette: &Palette,
    near: Words,
) -> Items {
    let far = words_in(far, tab, palette);
    lines(vec![
        near_layer(moving_words(near.items, near.anchor, far.anchor)),
        far_layer(moving_words(far.items, far.anchor, near.anchor)),
    ])
}
