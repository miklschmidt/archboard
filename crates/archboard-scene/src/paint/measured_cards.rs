//! Measured cards: the words at supplied baselines, near and far.

use crate::drawing::{Node, TextRole, TextRun};
use crate::measure::tag_top;
use crate::paint::Ctx;
use crate::paint::build::Items;
use crate::paint::cards::paint_slab_card;
use crate::paint::design::ARCHITECTURE_CARD_PADDING;
use crate::paint::far_card::{NearCard, Part, words_in};
use crate::paint::palette::Palette;
use crate::paint::standing::standing_palette;
use crate::scene::ClipId;

/// Where a measured name starts, from the top of its box: the chip stands level with it.
pub(super) fn name_top(placed: &Node) -> f64 {
    let runs = &placed.measured.runs;
    runs.first()
        .map_or(ARCHITECTURE_CARD_PADDING, |name| name.y - name.font_size)
}

/// A card's words where its box stands them: a row can stretch a card, and its
/// path stays at its foot.
fn placed_runs(placed: &Node) -> Vec<TextRun> {
    let grown = placed.bounds.height - placed.measured.height;
    let at_foot = |run: &TextRun| matches!(run.role, TextRole::Folder | TextRole::File);
    (placed.measured.runs.iter())
        .map(|run| TextRun {
            y: run.y + if at_foot(run) { grown } else { 0.0 },
            ..run.clone()
        })
        .collect()
}

/// One measured card with its kind glyph and its standing's treatment: the
/// card drawn as `part`, its words where the layout measured them.
pub(super) fn paint_measured_card(
    ctx: &Ctx<'_>,
    placed: &Node,
    part: &Part<'_>,
    palette: &Palette,
    cut: Option<&ClipId>,
) -> Items {
    let (rect, standing) = (placed.bounds, part.standing);
    let runs = placed_runs(placed);
    let baseline = runs.first().map_or(0.0, |name| name.y);
    let near = NearCard {
        chip_x: rect.x + ARCHITECTURE_CARD_PADDING,
        chip_y: rect.y + name_top(placed),
        words: words_in(&runs, rect, &standing_palette(palette, standing)),
        lines: (runs.iter())
            .filter(|run| run.role == TextRole::Title)
            .count(),
        tag_top: tag_top(baseline),
    };
    paint_slab_card(ctx, part, palette, cut, near)
}
