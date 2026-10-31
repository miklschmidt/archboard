//! A frame and its edge tab: the tab stands on the edge of the frame's well at
//! the top left (`tray`), and it holds one line, the frame's kind, name and code
//! path. The frame's responsibility stays out of the picture and goes with the
//! tab's group as the title of the picture's file.

use crate::drawing::{Node, TextRun};
use crate::geometry::Rect;
use crate::js;
use crate::measure::{tab_far, tab_runs};
use crate::paint::Ctx;
use crate::paint::appearance::{tray_look, type_chip};
use crate::paint::build::{Items, concat, grouped, lines};
use crate::paint::design::{
    BAND_RADIUS, DRILL_MARK_ROOM, PARENT_ICON_SIZE, TAB_CHIP, TAB_FAR_CHIP, TAB_HEIGHT,
    TAB_PADDING, TAB_SHOULDER, TOGGLE_ROOM,
};
use crate::paint::drill_mark::corner_drill_mark;
use crate::paint::far_card::words_in;
use crate::paint::far_view::{Place, far_layer, moving_words, near_layer, shared_chip};
use crate::paint::palette::Palette;
use crate::paint::slab::slab_seat;
use crate::paint::standing::{standing_palette, standing_pin, subject, warning_badge};
use crate::paint::toggle::toggle_end;
use crate::paint::tray::{Well, tab_view, well_body};
use crate::request::{NodeAppearance, Standing};
use crate::scene::{Group, Role, SubjectKind};

/// How much larger a drill mark stands in a tab seen from far away.
const FAR_MARK: f64 = 1.2;

/// A frame near and far. Its tab hugs its words in each view, and the words differ.
struct Views {
    near: Well,
    far: Well,
    far_runs: Vec<TextRun>,
}

impl Views {
    /// A placed frame at its picture's far scale. A tab keeps a shoulder of the frame beside it.
    fn of(placed: &Node, appearance: &NodeAppearance, far_scale: f64) -> Views {
        let frame = placed.bounds;
        let node = &placed.measured.node;
        let room = js::js_min(placed.measured.width, frame.width) - TAB_SHOULDER;
        let drill = if appearance.drill.is_some() {
            DRILL_MARK_ROOM
        } else {
            0.0
        };
        let mark = drill + node.toggle.map_or(0.0, |_| TOGGLE_ROOM);
        let hugging = |runs: &[TextRun]| {
            let words = runs.last().map_or(0.0, |run| run.x + run.width);
            js::js_max(js::js_min(words + TAB_PADDING + mark, room), 0.0)
        };
        let line = tab_far(&node.name, far_scale, room - mark);
        let far_runs = tab_runs(line, &node.name, node.code_path.as_deref());
        let well = |width: f64| Well {
            frame,
            tab: Rect {
                width,
                height: placed.measured.header_height,
                ..frame
            },
        };
        Views {
            near: well(hugging(&placed.measured.runs)),
            far: well(hugging(&far_runs)),
            far_runs,
        }
    }
}

/// A containing frame below its children and all connections.
pub(super) fn paint_measured_frame(
    ctx: &Ctx<'_>,
    placed: &Node,
    palette: &Palette,
    standing: Option<Standing>,
    appearance: &NodeAppearance,
) -> Items {
    let views = Views::of(placed, appearance, ctx.far_scale);
    let look = tray_look(palette, placed.depth);
    let view = |well: &Well| tab_view(well, &look, palette, standing);
    let frame = Group::new(
        Role::Frame(Some(Box::new(appearance.clone()))),
        lines(vec![
            slab_seat(views.near.body(), BAND_RADIUS),
            well_body(&views.near, &look, palette, standing),
            near_layer(view(&views.near)),
            far_layer(view(&views.far)),
            standing_pin(placed.bounds, standing, palette),
        ]),
    )
    .drawing(subject(
        SubjectKind::Region,
        &placed.measured.node.id,
        standing,
    ));
    grouped(frame)
}

/// What a tab draws near and far, and the chip both views share.
fn line_views(
    ctx: &Ctx<'_>,
    placed: &Node,
    views: &Views,
    palette: &Palette,
    standing: Option<Standing>,
    appearance: &NodeAppearance,
) -> Items {
    let ink = standing_palette(palette, standing);
    let (near_tab, far_tab) = (views.near.tab, views.far.tab);
    let mark = |tab: Rect, scale: f64| match appearance.drill {
        None => Items::new(),
        Some(direction) => corner_drill_mark(tab, direction, &ink.glyph, scale),
    };
    let control = |tab: Rect, scale: f64| {
        placed
            .measured
            .node
            .toggle
            .map_or_else(Items::new, |toggle| {
                toggle_end(tab, toggle, &ink.foreground, scale)
            })
    };
    let near = words_in(&placed.measured.runs, near_tab, &ink);
    let far = words_in(&views.far_runs, far_tab, &ink);
    let chip = |size: f64| Place {
        x: near_tab.x + TAB_PADDING,
        y: near_tab.y + (TAB_HEIGHT - size) / 2.0,
        size,
    };
    lines(vec![
        shared_chip(
            type_chip(appearance, palette, standing, ctx.icons, PARENT_ICON_SIZE),
            chip(TAB_CHIP),
            chip(TAB_FAR_CHIP),
        ),
        near_layer(concat(vec![
            moving_words(near.items, near.anchor, far.anchor),
            mark(near_tab, 1.0),
            control(near_tab, 1.0),
        ])),
        far_layer(concat(vec![
            moving_words(far.items, far.anchor, near.anchor),
            mark(far_tab, FAR_MARK),
            control(far_tab, FAR_MARK),
        ])),
    ])
}

/// A frame's tab, above the connection layer. Its group's title keeps the
/// frame's responsibility for a reader of the picture's file.
pub(super) fn paint_measured_header(
    ctx: &Ctx<'_>,
    placed: &Node,
    palette: &Palette,
    standing: Option<Standing>,
    unsettled: bool,
    appearance: &NodeAppearance,
) -> Items {
    let views = Views::of(placed, appearance, ctx.far_scale);
    let node = &placed.measured.node;
    let header = Group::new(
        Role::Header(Box::new(appearance.clone())),
        lines(vec![
            line_views(ctx, placed, &views, palette, standing, appearance),
            near_layer(warning_badge(views.near.tab, unsettled, palette)),
            far_layer(warning_badge(views.far.tab, unsettled, palette)),
        ]),
    )
    .drawing(subject(SubjectKind::Region, &node.id, standing))
    .titled(node.responsibility.clone());
    grouped(header)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::{Views, paint_measured_frame};
    use crate::drawing::Node;
    use crate::measure::{TAB_NEAR, tab_runs};
    use crate::paint::Ctx;
    use crate::paint::design::{TAB_PADDING, TAB_SHOULDER};
    use crate::paint::palette::Palette;
    use crate::request::{NodeAppearance, Standing};
    use crate::scene::{Item, Paint, Purpose, Shape};

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

    fn frame() -> (Node, NodeAppearance) {
        let placed = serde_json::from_str(
            r#"{
            "measured": {"node": {"id": "box", "order": 0, "name": "Container"},
                "width": 240, "height": 36, "headerHeight": 36, "runs": []},
            "box": {"x": 20, "y": 40, "width": 600, "height": 300}, "depth": 1
        }"#,
        )
        .expect("a measured container");
        let appearance = serde_json::from_str(
            r#"{
            "container": true, "icon": "RiServerLine", "typeName": "System",
            "typeKind": "system", "drill": null
        }"#,
        )
        .expect("a container appearance");
        (placed, appearance)
    }

    #[test]
    fn a_tab_hugs_its_words_in_each_view_and_shares_the_side_of_the_frame() {
        let (mut placed, appearance) = frame();
        placed.measured.runs = tab_runs(TAB_NEAR, "Container", None);
        let views = Views::of(&placed, &appearance, 1.0);
        for (well, runs) in [
            (views.near, &placed.measured.runs),
            (views.far, &views.far_runs),
        ] {
            let outline = well.outline();
            assert_eq!(well.tab.x, placed.bounds.x);
            assert_eq!(outline[0].x, outline[5].x);
            assert_eq!(outline[3].y, placed.bounds.y + 36.0);
            let words = runs.last().expect("a name");
            assert_eq!(well.tab.width, words.x + words.width + TAB_PADDING);
        }
    }

    #[test]
    fn a_far_tab_grows_with_its_picture_and_stays_in_its_frame() {
        let (mut placed, appearance) = frame();
        let size =
            |placed: &Node, scale: f64| Views::of(placed, &appearance, scale).far_runs[0].font_size;
        assert!(size(&placed, 1.9) > size(&placed, 1.0));
        placed.bounds.width = 200.0;
        let far = Views::of(&placed, &appearance, 3.0);
        assert!(far.far.tab.width <= 200.0 - TAB_SHOULDER);
    }

    #[test]
    fn a_removed_frame_is_a_ghost_of_its_whole_silhouette_with_its_border() {
        let (placed, appearance) = frame();
        let palette = Palette::of_page();
        let icons = BTreeMap::new();
        let ctx = Ctx {
            icons: &icons,
            far_scale: 1.0,
        };
        let plain = paint_measured_frame(&ctx, &placed, &palette, None, &appearance);
        let removed = paint_measured_frame(
            &ctx,
            &placed,
            &palette,
            Some(Standing::Removed),
            &appearance,
        );
        let removed_shapes = shapes(&removed);
        assert!(
            removed_shapes
                .iter()
                .any(|shape| shape.fill == Some(Paint::from(&palette.slab_face))
                    && shape.fill_opacity == Some(0.5))
        );
        assert!(removed_shapes.iter().any(|shape| {
            shape.purpose == Purpose::Solid
                && shape.stroke.as_ref().is_some_and(|stroke| {
                    stroke.paint == Paint::from(&palette.standing_removed)
                        && !stroke.dashes.is_empty()
                })
        }));
        assert!(
            shapes(&plain)
                .iter()
                .all(|shape| shape.fill_opacity.is_none())
        );
    }
}
