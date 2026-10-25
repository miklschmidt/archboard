//! Measured cards and frames: the words at supplied baselines, near and far.

use crate::drawing::Node;
use crate::geometry::Rect;
use crate::markup::{Markup, group, lines};
use crate::paint::Ctx;
use crate::paint::appearance::{appearance_attributes, tray_look};
use crate::paint::cards::{halo, paint_slab_card};
use crate::paint::design::{ARCHITECTURE_CARD_PADDING, BAND_RADIUS, CARD_THICKNESS};
use crate::paint::far_card::{NearCard, Part, paint_card_views, words_in};
use crate::paint::palette::Palette;
use crate::paint::slab::{Lift, slab_seat, slab_shadow};
use crate::paint::standing::{
    PART_ATTRIBUTE, standing_palette, standing_pin, subject, warning_badge,
};
use crate::paint::styles::Styles;
use crate::paint::tray::{header_of, tray};
use crate::request::{NodeAppearance, Standing};
use crate::scene::{Role, SubjectKind};

/// One measured card with its kind glyph and its standing's treatment: the
/// card drawn as `part`, its words where the layout measured them.
pub(super) fn paint_measured_card(
    ctx: &Ctx<'_>,
    placed: &Node,
    part: &Part<'_>,
    palette: &Palette,
    cut: Option<&str>,
) -> Markup {
    let (rect, standing) = (placed.bounds, part.standing);
    let near = NearCard {
        chip_x: rect.x + ARCHITECTURE_CARD_PADDING,
        chip_y: rect.y + ARCHITECTURE_CARD_PADDING,
        words: words_in(
            &placed.measured.runs,
            rect,
            &standing_palette(palette, standing),
        ),
    };
    paint_slab_card(ctx, part, palette, cut, near)
}

/// A containing frame below its children and all connections: a neutral well
/// with a header slab standing on its floor.
pub(super) fn paint_measured_frame(
    placed: &Node,
    palette: &Palette,
    standing: Option<Standing>,
    appearance: &NodeAppearance,
) -> Markup {
    let rect = placed.bounds;
    let styles = Styles::of(palette);
    let look = tray_look(
        header_of(rect, placed.measured.header_height),
        palette,
        placed.depth,
    );
    group(
        Role::Frame,
        Some(subject(
            SubjectKind::Region,
            &placed.measured.node.id,
            standing,
        )),
        appearance_attributes(appearance),
        lines(vec![
            slab_seat(rect, BAND_RADIUS),
            slab_shadow(rect, BAND_RADIUS, Lift::Tray, palette, standing),
            halo(rect, BAND_RADIUS, &styles, standing),
            tray(rect, &look, palette, standing),
            standing_pin(rect, standing, palette),
        ]),
    )
}

/// A frame's heading, above the connection layer.
pub(super) fn paint_measured_header(
    ctx: &Ctx<'_>,
    placed: &Node,
    palette: &Palette,
    standing: Option<Standing>,
    unsettled: bool,
    appearance: &NodeAppearance,
) -> Markup {
    let header = header_of(placed.bounds, placed.measured.header_height);
    let face = Rect {
        height: header.height - CARD_THICKNESS,
        ..header
    };
    let node = &placed.measured.node;
    let part = Part {
        kind: SubjectKind::Region,
        node,
        rect: face,
        appearance,
        standing,
        unsettled,
    };
    let near = NearCard {
        chip_x: header.x + ARCHITECTURE_CARD_PADDING,
        chip_y: header.y + ARCHITECTURE_CARD_PADDING,
        words: words_in(
            &placed.measured.runs,
            placed.bounds,
            &standing_palette(palette, standing),
        ),
    };
    group(
        Role::Header,
        Some(subject(SubjectKind::Region, &node.id, standing)),
        appearance_attributes(appearance).set(PART_ATTRIBUTE, "header"),
        lines(vec![
            paint_card_views(ctx, &part, palette, near),
            warning_badge(header, unsettled, palette),
        ]),
    )
}
