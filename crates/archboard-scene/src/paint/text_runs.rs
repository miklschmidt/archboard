//! Measured lines painted where measurement placed them. No fitting happens here.

use crate::attrs;
use crate::drawing::{TextRole, TextRun};
use crate::geometry::{Rect, coord};
use crate::markup::{Markup, lines, text_node};
use crate::paint::fonts::font_attributes;
use crate::paint::palette::Palette;

/// Measured lines, unchanged in content, font and placement.
pub fn paint_text_runs(runs: &[TextRun], rect: Rect, palette: &Palette, fill: Option<&str>) -> Markup {
    lines(
        runs.iter()
            .map(|run| {
                text_node(
                    attrs! {
                        "xml:space": "preserve",
                        "x": coord(rect.x + run.x),
                        "y": coord(rect.y + run.y),
                        "fill": fill.unwrap_or_else(|| ink_of(run, palette)),
                    }
                    .with(font_attributes(run.font))
                    .set("font-size", run.font_size),
                    &run.text,
                )
            })
            .collect(),
    )
}

/// The ink a measured line takes by its role.
fn ink_of(run: &TextRun, palette: &Palette) -> &'static str {
    match run.role {
        TextRole::Title => palette.foreground,
        TextRole::Label => palette.pill_text,
        TextRole::Note => palette.muted,
    }
}
