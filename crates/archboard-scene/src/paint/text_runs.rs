//! Measured lines painted where measurement placed them. No fitting happens here.

use crate::drawing::{TextRole, TextRun};
use crate::geometry::{Point, Rect, round_coord};
use crate::paint::build::{Items, lines, text};
use crate::paint::colour::translucent;
use crate::paint::palette::Palette;
use crate::scene::{Colour, Text};

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
                text(Text::set(
                    Point {
                        x: round_coord(rect.x + run.x),
                        y: round_coord(rect.y + run.y),
                    },
                    run.font,
                    run.font_size,
                    fill.map_or_else(|| ink_of(run, palette), Clone::clone),
                    &run.text,
                ))
            })
            .collect(),
    )
}

/// How much of the muted ink the folders of a path keep.
const FOLDER_INK: f64 = 0.62;

/// The ink a measured line takes by its role.
fn ink_of(run: &TextRun, palette: &Palette) -> Colour {
    match run.role {
        TextRole::Title | TextRole::File => palette.foreground.clone(),
        TextRole::Label => palette.pill_text.clone(),
        TextRole::Note => palette.muted.clone(),
        TextRole::Folder => translucent(&palette.muted, FOLDER_INK),
    }
}
