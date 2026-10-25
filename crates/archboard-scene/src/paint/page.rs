//! The page a painting is drawn on: moved clear of the canvas edge, framed as
//! planned when nothing it describes is built, and the boxes of its atlas.

use crate::attrs;
use crate::geometry::{Canvas, Rect, coord, covering, round_coord};
use crate::markup::{Markup, group, lines, tag, text_node};
use crate::paint::Ctx;
use crate::paint::design::{PLANNED_FRAME_INSET, PLANNED_FRAME_MARGIN};
use crate::paint::fonts::{PILL_FONT, font_attributes};
use crate::paint::palette::Palette;
use crate::scene::{Atlas, AtlasBox, Boxes, Role};

/// A painted page: its body, its size and where each subject landed on it.
pub struct PaintedPage {
    pub body: Markup,
    pub width: f64,
    pub height: f64,
    pub atlas: Atlas,
}

/// Boxes onto the canvas, in the order they were drawn; an id drawn more than
/// once keeps the box covering every drawing of it.
pub fn atlas_boxes(entries: &[(&str, Rect)], canvas: &Canvas) -> Boxes {
    let mut grown: Vec<(String, Rect)> = Vec::new();
    for (id, rect) in entries {
        match grown.iter_mut().find(|(held, _)| held == id) {
            Some(entry) => entry.1 = covering(entry.1, *rect),
            None => grown.push(((*id).to_owned(), *rect)),
        }
    }
    Boxes(
        grown
            .into_iter()
            .map(|(id, rect)| {
                (
                    id,
                    AtlasBox {
                        x: round_coord(rect.x + canvas.shift_x),
                        y: round_coord(rect.y + canvas.shift_y),
                        width: round_coord(rect.width),
                        height: round_coord(rect.height),
                    },
                )
            })
            .collect(),
    )
}

/// The body moved clear of the canvas edge, when something was drawn above or
/// left of the origin.
pub fn shifted(canvas: &Canvas, body: Markup) -> Markup {
    if canvas.shift_x == 0.0 && canvas.shift_y == 0.0 {
        return body;
    }
    group(
        Role::Move,
        None,
        attrs! { "transform": format!("translate({},{})", coord(canvas.shift_x), coord(canvas.shift_y)) },
        body,
    )
}

/// What the planned frame says.
const PLANNED_LABEL: &str = "Planned — nothing on this board is built";
const LABEL_SIZE: f64 = 12.0;
const LABEL_RISE: f64 = LABEL_SIZE / 2.0 + 2.0;
const LABEL_INDENT: f64 = 16.0;
const LABEL_CLEARANCE: f64 = 6.0;

/// Every box of one kind, moved with the body.
fn moved_all(boxes: &Boxes, dx: f64, dy: f64) -> Boxes {
    Boxes(
        boxes
            .0
            .iter()
            .map(|(id, rect)| {
                (
                    id.clone(),
                    AtlasBox {
                        x: round_coord(rect.x + dx),
                        y: round_coord(rect.y + dy),
                        ..*rect
                    },
                )
            })
            .collect(),
    )
}

/// An atlas moved with its body.
pub fn moved_atlas(atlas: &Atlas, dx: f64, dy: f64) -> Atlas {
    Atlas {
        nodes: moved_all(&atlas.nodes, dx, dy),
        edges: moved_all(&atlas.edges, dx, dy),
        regions: moved_all(&atlas.regions, dx, dy),
    }
}

/// A page framed as planned: the drawing moved in, a dashed frame round it and
/// the label on the frame's top edge.
fn framed_as_planned(ctx: &Ctx, page: PaintedPage, palette: &Palette) -> PaintedPage {
    let label_width = ctx.measurer.measure(PLANNED_LABEL, PILL_FONT, LABEL_SIZE);
    let dx = PLANNED_FRAME_MARGIN;
    let dy = PLANNED_FRAME_MARGIN + LABEL_RISE;
    let needed = label_width + 2.0 * (PLANNED_FRAME_INSET + LABEL_INDENT + LABEL_CLEARANCE);
    let width = crate::js::js_max(page.width + 2.0 * dx, needed);
    let height = page.height + dx + dy;
    let top = PLANNED_FRAME_INSET + LABEL_RISE;
    let label_x = PLANNED_FRAME_INSET + LABEL_INDENT;
    let frame = tag(
        "rect",
        attrs! {
            "x": PLANNED_FRAME_INSET,
            "y": round_coord(top),
            "width": round_coord(width - 2.0 * PLANNED_FRAME_INSET),
            "height": round_coord(height - top - PLANNED_FRAME_INSET),
            "rx": 10.0,
            "fill": "none",
            "stroke": palette.muted,
            "stroke-opacity": 0.6,
            "stroke-width": 1.5,
            "stroke-dasharray": "6 4",
        },
    );
    let clearing = tag(
        "rect",
        attrs! {
            "x": label_x - LABEL_CLEARANCE,
            "y": round_coord(top - LABEL_SIZE / 2.0 - 1.0),
            "width": round_coord(label_width + 2.0 * LABEL_CLEARANCE),
            "height": LABEL_SIZE + 2.0,
            "fill": palette.background,
        },
    );
    let label = text_node(
        attrs! {
            "x": label_x,
            "y": round_coord(top),
            "dominant-baseline": "central",
            "font-size": LABEL_SIZE,
            "fill": palette.muted,
        }
        .with(font_attributes(PILL_FONT)),
        PLANNED_LABEL,
    );
    PaintedPage {
        body: lines(vec![
            group(
                Role::Slot,
                None,
                attrs! { "data-slot": "planned-frame" },
                lines(vec![frame, clearing, label]),
            ),
            group(
                Role::Move,
                None,
                attrs! { "transform": format!("translate({} {})", crate::js::number(dx), crate::js::number(round_coord(dy))) },
                page.body,
            ),
        ]),
        width,
        height,
        atlas: moved_atlas(&page.atlas, dx, dy),
    }
}

/// The page a painting is drawn on: as painted, or framed as planned.
pub fn page_for(ctx: &Ctx, painting: PaintedPage, palette: &Palette, unbuilt: bool) -> PaintedPage {
    if unbuilt {
        framed_as_planned(ctx, painting, palette)
    } else {
        painting
    }
}

/// The accessible name, saying what the frame says when the board is planned.
pub fn planned_title(title: &str, unbuilt: bool) -> String {
    if unbuilt {
        format!("{title}. {PLANNED_LABEL}")
    } else {
        title.to_owned()
    }
}
