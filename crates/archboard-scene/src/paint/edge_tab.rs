//! A frame and its edge tab, one silhouette: the tab stands on the frame's edge
//! at the top left, and the side of the tab is the side of the frame. The tab
//! holds one line, the frame's kind, name and code path, on a face of its own
//! that is lighter than the floor. The frame's responsibility stays out of the
//! picture and goes with the tab's group as the title of the picture's file.

use crate::drawing::Node;
use crate::geometry::{Point, Rect};
use crate::js;
use crate::measure::{TAB_FAR, tab_runs};
use crate::paint::Ctx;
use crate::paint::appearance::{tray_look, type_chip};
use crate::paint::build::{Items, concat, grouped, lines, point, shape};
use crate::paint::design::{
    BAND_RADIUS, PARENT_ICON_SIZE, TAB_CHIP, TAB_FAR_CHIP, TAB_HEIGHT, TAB_PADDING, TAB_SHOULDER,
    TRAY_CREASE, TRAY_LIP, TRAY_WALL,
};
use crate::paint::drill_mark::corner_drill_mark;
use crate::paint::far_card::words_in;
use crate::paint::far_view::{Place, far_layer, moving_words, near_layer, shared_chip};
use crate::paint::flowchart_shapes::ring;
use crate::paint::palette::Palette;
use crate::paint::polygon::Polygon;
use crate::paint::slab::{glint_of, plate, slab_seat, solid, solid_ghost, standing_border};
use crate::paint::standing::{standing_palette, standing_pin, subject, warning_badge};
use crate::paint::tray::{FLOOR_RADIUS, TrayLook, floor_of, wall_shadow};
use crate::request::{NodeAppearance, Standing};
use crate::scene::{Group, PathStep, Pointer, Purpose, Role, Shape, SubjectKind};

/// How much larger a drill mark stands in a tab seen from far away.
const FAR_MARK: f64 = 1.2;
/// How far down a tab its drill mark stands, for its ring to be level with the words.
const MARK_DROP: f64 = 2.0;

/// What a frame draws: its box, and the box of its tab.
struct Shapes {
    frame: Rect,
    tab: Rect,
}

impl Shapes {
    /// A placed frame. A tab keeps a shoulder of the frame beside it.
    fn of(placed: &Node) -> Shapes {
        let frame = placed.bounds;
        let wide = js::js_min(placed.measured.width, frame.width) - TAB_SHOULDER;
        let tab = Rect {
            width: js::js_max(wide, 0.0),
            height: placed.measured.header_height,
            ..frame
        };
        Shapes { frame, tab }
    }

    /// The silhouette of a box taken out of the frame: it steps down at the tab's end.
    fn outline(&self, rect: Rect) -> Polygon {
        let end = self.frame.x + self.tab.width;
        let shoulder = rect.y + self.tab.height;
        let (right, bottom) = (rect.x + rect.width, rect.y + rect.height);
        let corner = |x: f64, y: f64| Point { x, y };
        vec![
            corner(rect.x, rect.y),
            corner(end, rect.y),
            corner(end, shoulder),
            corner(right, shoulder),
            corner(right, bottom),
            corner(rect.x, bottom),
        ]
    }

    /// The frame's body: what stands below the tab.
    fn body(&self) -> Rect {
        Rect {
            y: self.frame.y + self.tab.height,
            height: self.frame.height - self.tab.height,
            ..self.frame
        }
    }
}

/// A tab's face, rounded at the top and square where it meets the frame's floor.
fn tab_face(rect: Rect, foot: f64) -> Shape {
    let (left, top) = (rect.x, rect.y);
    let right = rect.x + rect.width;
    let bend = BAND_RADIUS;
    Shape::path(
        Purpose::Solid,
        vec![
            PathStep::Move {
                to: point(left, foot),
            },
            PathStep::Line {
                to: point(left, top + bend),
            },
            PathStep::Quad {
                control: point(left, top),
                to: point(left + bend, top),
            },
            PathStep::Line {
                to: point(right - bend, top),
            },
            PathStep::Quad {
                control: point(right, top),
                to: point(right, top + bend),
            },
            PathStep::Line {
                to: point(right, foot),
            },
            PathStep::Close,
        ],
    )
    .pointer(Pointer::None)
}

/// The walls and floor of a frame, and the tab's face over the wall it stands on.
fn tray(shapes: &Shapes, look: &TrayLook, palette: &Palette) -> Items {
    let rect = shapes.frame;
    let plate_of = |rect: Rect| solid(&shapes.outline(rect), BAND_RADIUS);
    let lip = Rect {
        height: rect.height - TRAY_CREASE,
        ..rect
    };
    let walls = Rect {
        height: lip.height - TRAY_LIP,
        ..rect
    };
    let sides = Rect {
        y: walls.y + TRAY_WALL,
        height: walls.height - TRAY_WALL,
        ..walls
    };
    let floor = floor_of(shapes.body());
    let lit = Rect {
        y: rect.y + 1.0,
        ..shapes.tab
    };
    let tab_end = rect.x + shapes.tab.width;
    let beside = Rect {
        x: tab_end,
        width: floor.x + floor.width - tab_end,
        ..floor
    };
    lines(vec![
        shape(plate_of(rect).filled(&palette.slab_shadow)),
        shape(plate_of(lip).filled(&palette.tray_lip)),
        shape(plate_of(walls).filled(&look.top_wall)),
        shape(plate_of(sides).filled(&look.side_wall)),
        shape(plate(floor, FLOOR_RADIUS).filled(&look.floor)),
        wall_shadow(beside, palette),
        shape(tab_face(shapes.tab, floor.y).filled(glint_of(&palette.pill, palette))),
        shape(tab_face(lit, floor.y).filled(&palette.pill)),
    ])
}

/// A containing frame below its children and all connections.
pub(super) fn paint_measured_frame(
    placed: &Node,
    palette: &Palette,
    standing: Option<Standing>,
    appearance: &NodeAppearance,
) -> Items {
    let shapes = Shapes::of(placed);
    let rect = shapes.frame;
    let outline = shapes.outline(rect);
    let drawn = if standing == Some(Standing::Removed) {
        solid_ghost(&outline, BAND_RADIUS, palette)
    } else {
        lines(vec![
            tray(
                &shapes,
                &tray_look(shapes.tab, palette, placed.depth),
                palette,
            ),
            standing_border(shapes.tab, BAND_RADIUS, standing, palette),
        ])
    };
    let frame = Group::new(
        Role::Frame(Some(Box::new(appearance.clone()))),
        lines(vec![
            slab_seat(shapes.body(), BAND_RADIUS),
            slab_seat(shapes.tab, BAND_RADIUS),
            ring(&outline, BAND_RADIUS, standing, palette),
            drawn,
            standing_pin(rect, standing, palette),
        ]),
    )
    .drawing(subject(
        SubjectKind::Region,
        &placed.measured.node.id,
        standing,
    ));
    grouped(frame)
}

/// What a tab or a door draws near and far, and the chip both views share.
pub(super) fn line_views(
    ctx: &Ctx<'_>,
    placed: &Node,
    tab: Rect,
    palette: &Palette,
    standing: Option<Standing>,
    appearance: &NodeAppearance,
) -> Items {
    let ink = standing_palette(palette, standing);
    let node = &placed.measured.node;
    let drop = Rect {
        y: tab.y + MARK_DROP,
        ..tab
    };
    let mark = |scale: f64| match appearance.drill {
        None => Items::new(),
        Some(direction) => corner_drill_mark(drop, direction, &ink.glyph, scale),
    };
    let near = words_in(&placed.measured.runs, tab, &ink);
    let far_runs = tab_runs(TAB_FAR, &node.name, node.code_path.as_deref());
    let far = words_in(&far_runs, tab, &ink);
    let chip = |size: f64| Place {
        x: tab.x + TAB_PADDING,
        y: tab.y + (TAB_HEIGHT - size) / 2.0,
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
            mark(1.0),
        ])),
        far_layer(concat(vec![
            moving_words(far.items, far.anchor, near.anchor),
            mark(FAR_MARK),
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
    let tab = Shapes::of(placed).tab;
    let node = &placed.measured.node;
    let header = Group::new(
        Role::Header(Box::new(appearance.clone())),
        lines(vec![
            line_views(ctx, placed, tab, palette, standing, appearance),
            warning_badge(tab, unsettled, palette),
        ]),
    )
    .drawing(subject(SubjectKind::Region, &node.id, standing))
    .titled(node.responsibility.clone());
    grouped(header)
}

#[cfg(test)]
mod tests {
    use super::{Shapes, paint_measured_frame};
    use crate::drawing::Node;
    use crate::geometry::Rect;
    use crate::paint::design::TAB_SHOULDER;
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
    fn a_tab_keeps_its_silhouette_with_the_side_of_the_frame() {
        let (placed, _) = frame();
        let drawn = Shapes::of(&placed);
        let outline = drawn.outline(drawn.frame);
        assert_eq!(drawn.tab.x, placed.bounds.x);
        assert_eq!(outline[0].x, outline[5].x);
        assert_eq!(outline[1].x, placed.bounds.x + 240.0 - TAB_SHOULDER);
        assert_eq!(outline[3].y, placed.bounds.y + 36.0);
        assert_eq!(
            drawn.body(),
            Rect {
                x: 20.0,
                y: 76.0,
                width: 600.0,
                height: 264.0
            }
        );
    }

    #[test]
    fn a_removed_frame_is_a_ghost_of_its_whole_silhouette_with_its_border() {
        let (placed, appearance) = frame();
        let palette = Palette::of_page();
        let plain = paint_measured_frame(&placed, &palette, None, &appearance);
        let removed = paint_measured_frame(&placed, &palette, Some(Standing::Removed), &appearance);
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
