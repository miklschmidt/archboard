//! What a card draws when the picture is seen from far away: a tile at its top
//! left that holds its kind's glyph large, and beside it its name, its code path
//! and the start of its responsibility in the room its box holds. Both views are
//! drawn here together, as one shared element transition (TASK-428).

use crate::drawing::{DiagramFont, NodeFacts, TextRole, TextRun};
use crate::geometry::{Point, Rect};
use crate::js;
use crate::measure;
use crate::paint::Ctx;
use crate::paint::appearance::type_chip;
use crate::paint::build::{Items, concat, lines};
use crate::paint::design::{
    CARD_NOTE_FONT, CARD_PATH_FONT, CARD_TITLE_FONT, ICON_CHIP_SIZE, PARENT_ICON_SIZE,
};
use crate::paint::drill_mark::{DRILL_MARK_ROOM, corner_drill_mark};
use crate::paint::far_view::{Place, far_layer, moving_words, near_layer, shared_chip};
use crate::paint::palette::Palette;
use crate::paint::standing::standing_palette;
use crate::paint::text_runs::paint_text_runs;
use crate::request::{NodeAppearance, Standing};
use crate::scene::SubjectKind;

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
/// The most lines of a responsibility a far card draws, however tall its box.
const GIST_LINES: usize = 8;
const GIST_SHARE: f64 = 0.68;
const GIST_MIN: f64 = 13.0;
/// A far path's size: 9 px on a screen at the lowest scale a reading lands at.
const PATH_SIZE: f64 = 15.0;
const PATH_LINE: f64 = 1.2;
const MARK_SCALE: f64 = 1.2;

/// What a far card can say under its name.
#[derive(Clone, Copy, Default)]
struct Under<'a> {
    /// Where its code lives, cut to its tail.
    path: Option<&'a str>,
    /// The start of its responsibility.
    gist: Option<&'a str>,
}

/// A card's name, path and gist, broken into lines and sized.
struct Stack {
    name_size: f64,
    names: Vec<String>,
    /// Whether the name keeps all its words, whole, on its lines.
    kept: bool,
    path: Option<String>,
    gist_size: f64,
    gists: Vec<String>,
    height: f64,
}

/// The sizes a far name can take, the largest first.
fn name_sizes() -> impl Iterator<Item = f64> {
    (NAME_MIN..=NAME_MAX).rev().map(f64::from)
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
fn break_lines(text: &str, face: DiagramFont, size: f64, room: f64, most: usize) -> Vec<String> {
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
            if !line.is_empty() && measure::width(&next, face, size) > limit {
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
        .map(|line| measure::truncate(line, face, size, room))
        .collect()
}

/// The width a card needs to set its name whole from far away at the full size,
/// on the fewest lines' widest line, beside its tile: a name that reads 12 px on
/// a screen at the lowest scale a reading lands at.
pub(crate) fn far_name_width(name: &str, emphasis: f64) -> f64 {
    let words = words_of(name);
    let size = f64::from(NAME_MAX) + emphasis;
    let line = |part: &[&str]| measure::width(&part.join(" "), CARD_TITLE_FONT, size);
    let widest = (0..=words.len())
        .map(|cut| {
            let (first, second) = words.split_at(cut);
            js::js_max(line(first), line(second))
        })
        .fold(f64::INFINITY, js::js_min);
    EDGE + TILE + EDGE + widest + END
}

/// A card's words at one name size, broken to the room they have: the name, the
/// path, and as much of the gist as the height holds below them.
fn stack_at(name: &str, under: Under<'_>, size: f64, room: f64, height: f64) -> Stack {
    let names = break_lines(name, CARD_TITLE_FONT, size, room, NAME_LINES);
    let path = under
        .path
        .map(|path| measure::keep_tail(path, CARD_PATH_FONT, PATH_SIZE, room));
    let above = names.len() as f64 * size * NAME_LINE
        + path
            .as_ref()
            .map_or(0.0, |_| GIST_GAP + PATH_SIZE * PATH_LINE);
    let gist_size = js::js_max(GIST_MIN, js::round(size * GIST_SHARE));
    let gist_room = |lines: usize| GIST_GAP + lines as f64 * gist_size * GIST_LINE;
    let most = (1..=GIST_LINES)
        .rev()
        .find(|lines| above + gist_room(*lines) <= height);
    let gists = match (under.gist, most) {
        (Some(gist), Some(most)) => break_lines(gist, CARD_NOTE_FONT, gist_size, room, most),
        _ => Vec::new(),
    };
    Stack {
        name_size: size,
        kept: names.join(" ") == name,
        names,
        path,
        gist_size,
        height: above
            + if gists.is_empty() {
                0.0
            } else {
                gist_room(gists.len())
            },
        gists,
    }
}

/// A card's words sized to the room its box holds: the name as large as it can
/// be with its path, and the path dropped last.
fn settle(name: &str, under: Under<'_>, room: f64, height: f64, emphasis: f64) -> Stack {
    let whole = words_of(name).join(" ");
    let fitting = |under: Under<'_>| {
        name_sizes()
            .map(|size| stack_at(&whole, under, size + emphasis, room, height))
            .find(|stack| stack.kept && stack.height <= height)
    };
    fitting(under)
        .or_else(|| fitting(Under::default()))
        .unwrap_or_else(|| {
            let size = f64::from(NAME_MIN) + emphasis;
            stack_at(&whole, Under::default(), size, room, height)
        })
}

/// One line of words as a run, from the left of the line's top: its baseline
/// half a cap height below the line's middle.
fn run(text: &str, at: Point, size: f64, step: f64, face: DiagramFont, role: TextRole) -> TextRun {
    TextRun {
        text: text.to_owned(),
        width: measure::width(text, face, size),
        x: at.x,
        y: at.y + (size * step) / 2.0 + size * 0.35,
        font: face,
        font_size: size,
        role,
    }
}

/// A stack's runs, the name's lines, the path and the gist's lines, from one top.
fn runs_of(stack: &Stack, x: f64, top: f64) -> Vec<TextRun> {
    let name_step = stack.name_size * NAME_LINE;
    let mut below = top + stack.names.len() as f64 * name_step;
    let mut runs: Vec<TextRun> = stack
        .names
        .iter()
        .enumerate()
        .map(|(index, text)| {
            let at = Point {
                x,
                y: top + index as f64 * name_step,
            };
            run(
                text,
                at,
                stack.name_size,
                NAME_LINE,
                CARD_TITLE_FONT,
                TextRole::Title,
            )
        })
        .collect();
    if let Some(path) = &stack.path {
        below += GIST_GAP;
        let at = Point { x, y: below };
        runs.push(run(
            path,
            at,
            PATH_SIZE,
            PATH_LINE,
            CARD_PATH_FONT,
            TextRole::Note,
        ));
        below += PATH_SIZE * PATH_LINE;
    }
    let gist_step = stack.gist_size * GIST_LINE;
    runs.extend(stack.gists.iter().enumerate().map(|(index, text)| {
        let at = Point {
            x,
            y: below + GIST_GAP + index as f64 * gist_step,
        };
        run(
            text,
            at,
            stack.gist_size,
            GIST_LINE,
            CARD_NOTE_FONT,
            TextRole::Note,
        )
    }));
    runs
}

/// A block of words as the near view draws them, and where they start.
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
            size: f64::from(NAME_MAX),
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

/// What a card draws near: where its chip stands, and its words.
pub(super) struct NearCard {
    pub chip_x: f64,
    pub chip_y: f64,
    pub words: Words,
}

/// The gist a heading or a card draws: none where it says nothing but white space.
fn gist_of(text: Option<&str>) -> Option<&str> {
    text.filter(|text| !js::trim(text).is_empty())
}

/// A part's near and far views, and the kind chip they share.
pub(super) fn paint_card_views(
    ctx: &Ctx<'_>,
    part: &Part<'_>,
    palette: &Palette,
    near: NearCard,
) -> Items {
    let rect = part.rect;
    let drill = part.appearance.drill;
    let words = standing_palette(palette, part.standing);
    let mark = |scale: f64| match drill {
        None => Items::new(),
        Some(direction) => corner_drill_mark(rect, direction, &words.glyph, scale),
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
        &part.node.name,
        Under {
            path: gist_of(part.node.code_path.as_deref()),
            gist: gist_of(part.node.responsibility.as_deref()),
        },
        room,
        rect.height - PAD_Y * 2.0,
        if part.kind == SubjectKind::Region {
            1.0
        } else {
            0.0
        },
    );
    let far = words_in(
        &runs_of(&stack, x, (rect.height - stack.height) / 2.0),
        rect,
        &words,
    );
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
        shared_chip(
            type_chip(
                part.appearance,
                palette,
                part.standing,
                ctx.icons,
                if part.kind == SubjectKind::Region {
                    PARENT_ICON_SIZE
                } else {
                    super::icons::ICON_SIZE
                },
            ),
            near_chip,
            far_chip,
        ),
        near_layer(concat(vec![
            moving_words(near.words.items, near.words.anchor, far.anchor),
            mark(1.0),
        ])),
        far_layer(concat(vec![
            moving_words(far.items, far.anchor, near.words.anchor),
            mark(MARK_SCALE),
        ])),
    ])
}

/// The near and far views of a heading that has no kind of its own to show, a flow's.
pub(super) fn paint_heading_views(
    name: &str,
    summary: Option<&str>,
    rect: Rect,
    palette: &Palette,
    near: Words,
) -> Items {
    let stack = settle(
        name,
        Under {
            path: None,
            gist: gist_of(summary),
        },
        rect.width,
        rect.height - PAD_Y * 2.0,
        0.0,
    );
    let far = words_in(
        &runs_of(&stack, 0.0, (rect.height - stack.height) / 2.0),
        rect,
        palette,
    );
    lines(vec![
        near_layer(moving_words(near.items, near.anchor, far.anchor)),
        far_layer(moving_words(far.items, far.anchor, near.anchor)),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    const ROOM: f64 = 254.0;

    /// A card's far words in a box of one height.
    fn far(path: &str, gist: Option<&str>, height: f64) -> Stack {
        let under = Under {
            path: Some(path),
            gist,
        };
        settle("Run checks", under, ROOM, height - PAD_Y * 2.0, 0.0)
    }

    #[test]
    fn a_far_card_keeps_its_name_its_path_and_the_gist_its_box_holds() {
        let gist = "Checks the rules, outcomes, captures and commands from one author run, \
            then reports every failure with the rule that named it and what to do next.";
        let (short, tall) = (
            far("src/checks.ts", Some(gist), 87.0),
            far("src/checks.ts", Some(gist), 121.0),
        );
        assert_eq!(short.name_size, f64::from(NAME_MAX));
        assert_eq!(short.path.as_deref(), Some("src/checks.ts"));
        assert_eq!((short.gists.len(), tall.gists.len()), (1, 3));
        assert!(tall.height <= 121.0 - PAD_Y * 2.0);
    }

    #[test]
    fn a_far_path_keeps_its_tail() {
        let path = "apps/web/src/ui/rules/semantic-board-canvas/camera/camera.ts";
        let stack = far(path, None, 72.0);
        let kept = stack.path.expect("a path");
        assert!(kept.ends_with("/camera.ts"), "{kept}");
    }

    #[test]
    fn two_lines_of_a_name_and_a_path_fit_a_card_with_one_line_of_note() {
        let stack = settle(
            "Drive walkthrough focus",
            Under {
                path: Some("src/focus.ts"),
                gist: Some("Drives the focus of a walkthrough."),
            },
            200.0,
            87.0 - PAD_Y * 2.0,
            0.0,
        );
        assert_eq!(stack.name_size, f64::from(NAME_MAX));
        assert_eq!(stack.names.len(), 2);
        assert!(stack.path.is_some());
    }
}
