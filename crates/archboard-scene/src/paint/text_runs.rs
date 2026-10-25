//! Measured lines painted where measurement placed them. No fitting happens here.

use crate::drawing::{TextRole, TextRun};
use crate::geometry::{Point, Rect, round_coord};
use crate::paint::build::{Items, lines, text};
use crate::paint::palette::Palette;
use crate::scene::{Colour, Setting, Text};

/// Measured lines, unchanged in content, font and placement.
pub(super) fn paint_text_runs(
    runs: &[TextRun],
    rect: Rect,
    palette: &Palette,
    fill: Option<&Colour>,
) -> Items {
    lines(
        runs.iter()
            .map(|run| {
                text(Text {
                    setting: Setting::Run,
                    at: Point {
                        x: round_coord(rect.x + run.x),
                        y: round_coord(rect.y + run.y),
                    },
                    font: run.font,
                    size: run.font_size,
                    fill: fill.unwrap_or_else(|| ink_of(run, palette)).clone(),
                    anchor: None,
                    baseline: None,
                    keeps_spaces: true,
                    words: run.text.clone(),
                })
            })
            .collect(),
    )
}

/// The ink a measured line takes by its role.
fn ink_of<'p>(run: &TextRun, palette: &'p Palette) -> &'p Colour {
    match run.role {
        TextRole::Title => &palette.foreground,
        TextRole::Label => &palette.pill_text,
        TextRole::Note => &palette.muted,
    }
}
