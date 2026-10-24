//! Measured cards and frames: the words at supplied baselines, near and far.

use crate::drawing::Node;
use crate::geometry::Rect;
use crate::markup::{Markup, group, lines};
use crate::paint::Ctx;
use crate::paint::appearance::{appearance_attributes, card_look, tray_look, type_chip};
use crate::paint::cards::halo;
use crate::paint::design::{ARCHITECTURE_CARD_PADDING, BAND_RADIUS, CARD_THICKNESS, SLAB_RADIUS};
use crate::paint::far_card::{NearCard, paint_card_views, words_in};
use crate::paint::palette::Palette;
use crate::paint::slab::{Lift, slab, slab_seat, slab_shadow};
use crate::paint::standing::{
    PART_ATTRIBUTE, standing_palette, standing_pin, subject, warning_badge,
};
use crate::paint::styles::Styles;
use crate::paint::tray::{header_of, tray};
use crate::request::{NodeAppearance, Standing};
use crate::scene::{Role, SubjectKind};

/// One measured card with its kind glyph and its standing's treatment.
#[allow(clippy::too_many_arguments)]
pub fn paint_measured_card(
    ctx: &Ctx,
    placed: &Node,
    palette: &Palette,
    standing: Option<Standing>,
    unsettled: bool,
    appearance: &NodeAppearance,
    cut: Option<&str>,
    kind: SubjectKind,
) -> Markup {
    let rect = placed.bounds;
    let styles = Styles::of(palette);
    let words = standing_palette(palette, standing);
    let look = card_look(appearance.body_color, palette);
    let node = &placed.measured.node;
    group(
        Role::Card,
        subject(kind, &node.id, standing),
        appearance_attributes(appearance),
        lines(vec![
            slab_seat(rect, SLAB_RADIUS),
            if standing == Some(Standing::Removed) {
                slab_shadow(rect, SLAB_RADIUS, Lift::Card, palette, standing)
            } else {
                Markup::new()
            },
            halo(rect, SLAB_RADIUS, &styles, standing),
            slab(rect, &look, palette, standing, cut),
            paint_card_views(
                ctx,
                &node.name,
                node.responsibility.as_deref(),
                rect,
                appearance.drill,
                &words,
                NearCard {
                    chip: type_chip(0.0, 0.0, appearance, palette, standing, ctx.icons),
                    chip_x: rect.x + ARCHITECTURE_CARD_PADDING,
                    chip_y: rect.y + ARCHITECTURE_CARD_PADDING,
                    words: words_in(&placed.measured.runs, rect, &words),
                },
            ),
            standing_pin(rect, standing, palette),
            warning_badge(rect, unsettled, palette),
        ]),
    )
}

/// A containing frame below its children and all connections: a neutral well
/// with a header slab standing on its floor.
pub fn paint_measured_frame(
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
        subject(SubjectKind::Region, &placed.measured.node.id, standing),
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
pub fn paint_measured_header(
    ctx: &Ctx,
    placed: &Node,
    palette: &Palette,
    standing: Option<Standing>,
    unsettled: bool,
    appearance: &NodeAppearance,
) -> Markup {
    let words = standing_palette(palette, standing);
    let header = header_of(placed.bounds, placed.measured.header_height);
    let face = Rect {
        height: header.height - CARD_THICKNESS,
        ..header
    };
    let node = &placed.measured.node;
    group(
        Role::Header,
        subject(SubjectKind::Region, &node.id, standing),
        appearance_attributes(appearance).set(PART_ATTRIBUTE, "header"),
        lines(vec![
            paint_card_views(
                ctx,
                &node.name,
                node.responsibility.as_deref(),
                face,
                appearance.drill,
                &words,
                NearCard {
                    chip: type_chip(0.0, 0.0, appearance, palette, standing, ctx.icons),
                    chip_x: header.x + ARCHITECTURE_CARD_PADDING,
                    chip_y: header.y + ARCHITECTURE_CARD_PADDING,
                    words: words_in(&placed.measured.runs, placed.bounds, &words),
                },
            ),
            warning_badge(header, unsettled, palette),
        ]),
    )
}
