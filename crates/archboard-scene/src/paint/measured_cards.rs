//! Measured cards and frames: the words at supplied baselines, near and far.

use crate::drawing::Node;
use crate::geometry::Rect;
use crate::paint::Ctx;
use crate::paint::appearance::tray_look;
use crate::paint::build::{Items, group, lines};
use crate::paint::cards::{halo, paint_slab_card};
use crate::paint::design::{ARCHITECTURE_CARD_PADDING, BAND_RADIUS, CARD_THICKNESS, SLAB_RADIUS};
use crate::paint::far_card::{NearCard, Part, paint_card_views, words_in};
use crate::paint::palette::Palette;
use crate::paint::slab::{Lift, slab_seat, slab_shadow};
use crate::paint::standing::{standing_palette, standing_pin, subject, warning_badge};
use crate::paint::styles::Styles;
use crate::paint::tray::{header_of as slab_box, tray};
use crate::request::{NodeAppearance, Standing};
use crate::scene::{ClipId, Role, SubjectKind};

/// The same compact slab for the tray surface and its painted words.
fn header_of(placed: &Node) -> Rect {
    slab_box(
        Rect {
            width: placed.measured.width,
            ..placed.bounds
        },
        placed.measured.header_height,
    )
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
) -> Items {
    let rect = placed.bounds;
    let styles = Styles::of(palette);
    let look = tray_look(header_of(placed), palette, placed.depth);
    group(
        Role::Frame(Some(Box::new(appearance.clone()))),
        Some(subject(
            SubjectKind::Region,
            &placed.measured.node.id,
            standing,
        )),
        lines(vec![
            slab_seat(rect, BAND_RADIUS),
            slab_shadow(rect, BAND_RADIUS, Lift::Tray, palette, standing),
            halo(rect, BAND_RADIUS, &styles, standing),
            if standing == Some(Standing::Removed) {
                slab_shadow(look.header, SLAB_RADIUS, Lift::Card, palette, standing)
            } else {
                tray(rect, &look, palette, standing)
            },
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
) -> Items {
    let header = header_of(placed);
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
        Role::Header(Box::new(appearance.clone())),
        Some(subject(SubjectKind::Region, &node.id, standing)),
        lines(vec![
            paint_card_views(ctx, &part, palette, near),
            warning_badge(header, unsettled, palette),
        ]),
    )
}

#[cfg(test)]
mod tests {
    use super::{header_of, paint_measured_frame};
    use crate::drawing::Node;
    use crate::paint::palette::Palette;
    use crate::request::{NodeAppearance, Standing};
    use crate::scene::{Geometry, Item, Paint, Purpose, Shape};

    /// Shapes in a frame, without the scene's grouping and line breaks.
    fn shapes(items: &[Item]) -> Vec<&Shape> {
        items
            .iter()
            .flat_map(|item| match item {
                Item::Shape(shape) => vec![shape],
                Item::Group(group) => shapes(&group.items),
                _ => Vec::new(),
            })
            .collect()
    }

    #[test]
    fn a_removed_container_keeps_its_header_as_a_flat_ghost() {
        // The contents widen the frame, but its header keeps its measured width.
        let placed: Node = serde_json::from_str(
            r#"{
            "measured": {"node": {"id": "box", "order": 0, "name": "Container"},
                "width": 240, "height": 80, "headerHeight": 80, "runs": []},
            "box": {"x": 20, "y": 40, "width": 600, "height": 300}, "depth": 1
        }"#,
        )
        .expect("a measured container");
        let appearance: NodeAppearance = serde_json::from_str(
            r#"{
            "container": true, "icon": "RiServerLine", "typeName": "System",
            "typeKind": "system", "drill": null
        }"#,
        )
        .expect("a container appearance");
        let palette = Palette::of_page();
        let plain = paint_measured_frame(&placed, &palette, None, &appearance);
        let removed = paint_measured_frame(&placed, &palette, Some(Standing::Removed), &appearance);
        let header = header_of(&placed);
        let removed_shapes = shapes(&removed);
        let face = removed_shapes
            .iter()
            .find(|shape| {
                shape.purpose == Purpose::Plate
                    && matches!(shape.geometry, Geometry::Rect { rect, .. } if rect == header)
            })
            .expect("a removed container paints its header slab");
        assert!(
            shapes(&plain)
                .iter()
                .any(|shape| shape.geometry == face.geometry),
            "the ghost keeps the plain header's box and corners"
        );
        assert_eq!(face.fill, Some(Paint::from(&palette.slab_face)));
        assert_eq!(face.fill_opacity, Some(0.5));
        assert!(
            removed_shapes.iter().any(|shape| {
                shape.purpose == Purpose::Border
                    && shape.stroke.as_ref().is_some_and(|stroke| {
                        stroke.paint == Paint::from(&palette.standing_removed)
                            && !stroke.dashes.is_empty()
                    })
                    && matches!(shape.geometry, Geometry::Rect { rect, .. }
                    if rect.x >= header.x && rect.y >= header.y
                        && rect.x + rect.width <= header.x + header.width
                        && rect.y + rect.height <= header.y + header.height)
            }),
            "the header has a removed outline inside its box"
        );
    }
}
