//! What a card draws when the picture is seen from far away: a tile at its top
//! left that holds its kind's glyph large, and beside it its name and the start
//! of its responsibility, sized to the room its box holds. Both views are drawn
//! here together, as one shared element transition (TASK-428).

use crate::drawing::{DiagramFont, TextRole, TextRun};
use crate::geometry::{Point, Rect};
use crate::js;
use crate::markup::{Markup, concat, lines};
use crate::paint::Ctx;
use crate::paint::design::ICON_CHIP_SIZE;
use crate::paint::drill_mark::{DRILL_MARK_ROOM, corner_drill_mark};
use crate::paint::far_view::{Place, far_layer, moving_words, near_layer, shared_chip};
use crate::paint::fonts::{CARD_NOTE_FONT, CARD_TITLE_FONT};
use crate::paint::palette::Palette;
use crate::paint::text_runs::paint_text_runs;
use crate::request::DrillDirection;

const NAME_LINE: f64 = 1.15;
const GIST_LINE: f64 = 1.25;
const GIST_GAP: f64 = 3.0;
const PAD_Y: f64 = 10.0;
const EDGE: f64 = 12.0;
const END: f64 = 14.0;
const TILE: f64 = 52.0;
const NAME_MAX: u32 = 20;
const NAME_MIN: u32 = 15;
const NAME_LINES: usize = 2;
const GIST_LINES: usize = 2;
const GIST_SHARE: f64 = 0.68;
const GIST_MIN: f64 = 13.0;
const MARK_SCALE: f64 = 1.2;

/// A card's name and gist, broken into lines and sized.
struct Stack {
    name_size: f64,
    names: Vec<String>,
    /// Whether the name keeps all its words, whole, on its lines.
    kept: bool,
    gist_size: f64,
    gists: Vec<String>,
    height: f64,
}

/// What to try, in order: a name as large as it can be with a gist as long as
/// it can be, the gist dropped last.
fn attempts() -> Vec<(f64, usize)> {
    let sizes: Vec<f64> = (NAME_MIN..=NAME_MAX).rev().map(f64::from).collect();
    let mut tried = Vec::new();
    for size in &sizes {
        for gist_lines in (1..=GIST_LINES).rev() {
            tried.push((*size, gist_lines));
        }
    }
    tried.extend(sizes.iter().map(|size| (*size, 0)));
    tried
}

/// The words of a text, split at white space.
fn words_of(text: &str) -> Vec<&str> {
    js::split_spaces(text)
        .into_iter()
        .filter(|word| !word.is_empty())
        .collect()
}

/// A text broken into lines by words, balanced, and cut with an ellipsis where
/// it takes more than some lines.
fn break_lines(
    ctx: &Ctx,
    text: &str,
    face: DiagramFont,
    size: f64,
    room: f64,
    most: usize,
) -> Vec<String> {
    let words = words_of(text);
    let greedy = |limit: f64| -> Vec<String> {
        let mut broken = Vec::new();
        let mut line = String::new();
        for word in &words {
            let next = if line.is_empty() {
                (*word).to_owned()
            } else {
                format!("{line} {word}")
            };
            if !line.is_empty() && ctx.measurer.measure(&next, face, size) > limit {
                broken.push(std::mem::replace(&mut line, (*word).to_owned()));
            } else {
                line = next;
            }
        }
        if !line.is_empty() {
            broken.push(line);
        }
        broken
    };
    let mut broken = greedy(room);
    if broken.len() > 1 && broken.len() <= most {
        let count = broken.len();
        let mut limit = room - 4.0;
        while limit > room / 2.0 {
            let narrower = greedy(limit);
            if narrower.len() != count {
                break;
            }
            broken = narrower;
            limit -= 4.0;
        }
    }
    if broken.len() > most {
        let rest = broken[most - 1..].join(" ");
        broken.truncate(most - 1);
        broken.push(rest);
    }
    broken
        .iter()
        .map(|line| ctx.measurer.truncate(line, face, size, room))
        .collect()
}

/// A card's words at one name size, broken to the room they have.
fn stack_at(
    ctx: &Ctx,
    name: &str,
    gist: Option<&str>,
    size: f64,
    gist_lines: usize,
    room: f64,
) -> Stack {
    let names = break_lines(ctx, name, CARD_TITLE_FONT, size, room, NAME_LINES);
    let gist_size = js::js_max(GIST_MIN, js::round(size * GIST_SHARE));
    let gists = match gist {
        Some(gist) if gist_lines > 0 => {
            break_lines(ctx, gist, CARD_NOTE_FONT, gist_size, room, gist_lines)
        }
        _ => Vec::new(),
    };
    let height = names.len() as f64 * size * NAME_LINE
        + if gists.is_empty() {
            0.0
        } else {
            GIST_GAP + gists.len() as f64 * gist_size * GIST_LINE
        };
    Stack {
        name_size: size,
        kept: names.join(" ") == name,
        names,
        gist_size,
        gists,
        height,
    }
}

/// A card's name and gist sized to the room its box holds.
fn settle(ctx: &Ctx, name: &str, gist: Option<&str>, room: f64, height: f64) -> Stack {
    let whole = words_of(name).join(" ");
    for (size, gist_lines) in attempts() {
        if gist.is_none() && gist_lines > 0 {
            continue;
        }
        let stack = stack_at(ctx, &whole, gist, size, gist_lines, room);
        if stack.kept && stack.height <= height {
            return stack;
        }
    }
    stack_at(ctx, &whole, None, f64::from(NAME_MIN), 0, room)
}

/// One line of words as a run, from the left of the line's top: its baseline
/// half a cap height below the line's middle.
fn run(
    ctx: &Ctx,
    text: &str,
    at: Point,
    size: f64,
    step: f64,
    face: DiagramFont,
    role: TextRole,
) -> TextRun {
    TextRun {
        text: text.to_owned(),
        width: ctx.measurer.measure(text, face, size),
        x: at.x,
        y: at.y + (size * step) / 2.0 + size * 0.35,
        font: face,
        font_size: size,
        role,
    }
}

/// A stack's runs, the name's lines and then the gist's, from one top.
fn runs_of(ctx: &Ctx, stack: &Stack, x: f64, top: f64) -> Vec<TextRun> {
    let name_step = stack.name_size * NAME_LINE;
    let gist_step = stack.gist_size * GIST_LINE;
    let gist_top = top + stack.names.len() as f64 * name_step + GIST_GAP;
    let mut runs: Vec<TextRun> = stack
        .names
        .iter()
        .enumerate()
        .map(|(index, text)| {
            let line_top = top + index as f64 * name_step;
            run(
                ctx,
                text,
                Point { x, y: line_top },
                stack.name_size,
                NAME_LINE,
                CARD_TITLE_FONT,
                TextRole::Title,
            )
        })
        .collect();
    runs.extend(stack.gists.iter().enumerate().map(|(index, text)| {
        let line_top = gist_top + index as f64 * gist_step;
        run(
            ctx,
            text,
            Point { x, y: line_top },
            stack.gist_size,
            GIST_LINE,
            CARD_NOTE_FONT,
            TextRole::Note,
        )
    }));
    runs
}

/// A block of words as the near view draws them, and where they start.
pub struct Words {
    pub markup: Markup,
    pub anchor: Place,
}

/// Measured lines as a block of words, with where they start.
pub fn words_in(runs: &[TextRun], rect: Rect, palette: &Palette) -> Words {
    let anchor = runs.first().map_or(
        Place {
            x: rect.x,
            y: rect.y,
            size: f64::from(NAME_MAX),
        },
        |first| Place {
            x: rect.x + first.x,
            y: rect.y + first.y,
            size: first.font_size,
        },
    );
    Words {
        markup: paint_text_runs(runs, rect, palette, None),
        anchor,
    }
}

/// What a card draws near: its chip drawn at the origin, where it stands, and its words.
pub struct NearCard {
    pub chip: Markup,
    pub chip_x: f64,
    pub chip_y: f64,
    pub words: Words,
}

/// The gist a heading or a card draws: none where it says nothing but white space.
fn gist_of(text: Option<&str>) -> Option<&str> {
    text.filter(|text| !js::trim(text).is_empty())
}

/// A card's near and far views, and the chip they share.
pub fn paint_card_views(
    ctx: &Ctx,
    name: &str,
    responsibility: Option<&str>,
    rect: Rect,
    drill: Option<DrillDirection>,
    palette: &Palette,
    near: NearCard,
) -> Markup {
    let mark = |scale: f64| match drill {
        None => Markup::new(),
        Some(direction) => corner_drill_mark(rect, direction, palette.glyph, scale),
    };
    let tile = js::js_min(TILE, rect.height - EDGE * 2.0);
    let x = EDGE + tile + EDGE;
    let room = rect.width
        - x
        - END
        - if drill.is_none() {
            0.0
        } else {
            DRILL_MARK_ROOM * MARK_SCALE
        };
    let stack = settle(
        ctx,
        name,
        gist_of(responsibility),
        room,
        rect.height - PAD_Y * 2.0,
    );
    let top = EDGE + js::js_max(0.0, (tile - stack.height) / 2.0);
    let far = words_in(&runs_of(ctx, &stack, x, top), rect, palette);
    let near_chip = Place {
        x: near.chip_x,
        y: near.chip_y,
        size: ICON_CHIP_SIZE,
    };
    let far_chip = Place {
        x: rect.x + EDGE,
        y: rect.y + EDGE,
        size: tile,
    };
    lines(vec![
        shared_chip(near.chip, near_chip, far_chip),
        near_layer(concat(vec![
            moving_words(near.words.markup, near.words.anchor, far.anchor),
            mark(1.0),
        ])),
        far_layer(concat(vec![
            moving_words(far.markup, far.anchor, near.words.anchor),
            mark(MARK_SCALE),
        ])),
    ])
}

/// The near and far views of a heading that has no kind of its own to show, a flow's.
pub fn paint_heading_views(
    ctx: &Ctx,
    name: &str,
    summary: Option<&str>,
    rect: Rect,
    palette: &Palette,
    near: Words,
) -> Markup {
    let stack = settle(
        ctx,
        name,
        gist_of(summary),
        rect.width,
        rect.height - PAD_Y * 2.0,
    );
    let far = words_in(
        &runs_of(ctx, &stack, 0.0, (rect.height - stack.height) / 2.0),
        rect,
        palette,
    );
    lines(vec![
        near_layer(moving_words(near.markup, near.anchor, far.anchor)),
        far_layer(moving_words(far.markup, far.anchor, near.anchor)),
    ])
}
