//! Measured cards: the words at supplied baselines, near and far.

use crate::drawing::TextRole;
use crate::measure::tag_top;
use crate::paint::Ctx;
use crate::paint::Node;
use crate::paint::build::Items;
use crate::paint::cards::paint_slab_card;
use crate::paint::far_card::{NearCard, Part, words_in};
use crate::paint::palette::Palette;
use crate::paint::standing::standing_palette;
use crate::scene::ClipId;
use crate::sizes::ARCHITECTURE_CARD_PADDING;

/// Where a measured name starts, from the top of its box: the chip stands level with it.
pub(super) fn name_top(placed: &Node) -> f64 {
    let runs = &placed.measured.runs;
    runs.first()
        .map_or(ARCHITECTURE_CARD_PADDING, |name| name.y - name.font_size)
}

/// One measured card with its kind glyph and its standing's treatment: the
/// card drawn as `part`, its words fitted to the box the layout gave it.
pub(super) fn paint_measured_card(
    ctx: &Ctx<'_>,
    placed: &Node,
    part: &Part<'_>,
    palette: &Palette,
    cut: Option<&ClipId>,
) -> Items {
    let (rect, standing) = (placed.bounds, part.standing);
    let runs = &placed.measured.runs;
    let baseline = runs.first().map_or(0.0, |name| name.y);
    let near = NearCard {
        chip_x: rect.x + ARCHITECTURE_CARD_PADDING,
        chip_y: rect.y + name_top(placed),
        words: words_in(runs, rect, &standing_palette(palette, standing)),
        lines: (runs.iter())
            .filter(|run| run.role == TextRole::Title)
            .count(),
        tag_top: tag_top(baseline),
    };
    paint_slab_card(ctx, part, palette, cut, near)
}
