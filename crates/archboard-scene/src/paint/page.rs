//! The page a painting is drawn on: moved clear of the canvas edge, framed as
//! planned when nothing it describes is built, and the boxes of its atlas.

use crate::geometry::{Canvas, Point, Rect, covering, round_coord};
use crate::paint::Ctx;
use crate::paint::build::{Items, grouped, lines, shape, text};
use crate::paint::design::{PILL_FONT, PLANNED_FRAME_INSET, PLANNED_FRAME_MARGIN};
use crate::paint::palette::Palette;
use crate::scene::{
    Atlas, AtlasBox, Baseline, Boxes, Group, Purpose, Role, Setting, Shape, Slot, Stroke, Text,
    Transform,
};

/// A painted page: its body, its size and where each subject landed on it.
#[derive(Debug)]
pub(super) struct PaintedPage {
    /// What is drawn, in page coordinates.
    pub body: Items,
    /// The page's width, in diagram units.
    pub width: f64,
    /// The page's height, in diagram units.
    pub height: f64,
    /// Where each subject landed on the page.
    pub atlas: Atlas,
}

/// Boxes onto the canvas, in the order they were drawn; an id drawn more than
/// once keeps the box covering every drawing of it.
pub(super) fn atlas_boxes(entries: &[(&str, Rect)], canvas: &Canvas) -> Boxes {
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
pub(super) fn shifted(canvas: &Canvas, body: Items) -> Items {
    if canvas.shift_x == 0.0 && canvas.shift_y == 0.0 {
        return body;
    }
    grouped(Group::new(Role::Move, body).moved(Transform::translate(
        round_coord(canvas.shift_x),
        round_coord(canvas.shift_y),
    )))
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
pub(super) fn moved_atlas(atlas: &Atlas, dx: f64, dy: f64) -> Atlas {
    Atlas {
        nodes: moved_all(&atlas.nodes, dx, dy),
        edges: moved_all(&atlas.edges, dx, dy),
        regions: moved_all(&atlas.regions, dx, dy),
    }
}

/// A page framed as planned: the drawing moved in, a dashed frame round it and
/// the label on the frame's top edge.
fn framed_as_planned(ctx: &Ctx<'_>, page: PaintedPage, palette: &Palette) -> PaintedPage {
    let label_width = ctx.measurer.measure(PLANNED_LABEL, PILL_FONT, LABEL_SIZE);
    let dx = PLANNED_FRAME_MARGIN;
    let dy = PLANNED_FRAME_MARGIN + LABEL_RISE;
    let needed = label_width + 2.0 * (PLANNED_FRAME_INSET + LABEL_INDENT + LABEL_CLEARANCE);
    let width = crate::js::js_max(page.width + 2.0 * dx, needed);
    let height = page.height + dx + dy;
    let top = PLANNED_FRAME_INSET + LABEL_RISE;
    let label_x = PLANNED_FRAME_INSET + LABEL_INDENT;
    let frame = shape(
        Shape::rect(
            Purpose::Box,
            Rect {
                x: PLANNED_FRAME_INSET,
                y: round_coord(top),
                width: round_coord(width - 2.0 * PLANNED_FRAME_INSET),
                height: round_coord(height - top - PLANNED_FRAME_INSET),
            },
            Some(10.0),
        )
        .unfilled()
        .stroked(Stroke::new(&palette.muted, 1.5).at(0.6).dashed(&[6.0, 4.0])),
    );
    let clearing = shape(
        Shape::rect(
            Purpose::Box,
            Rect {
                x: label_x - LABEL_CLEARANCE,
                y: round_coord(top - LABEL_SIZE / 2.0 - 1.0),
                width: round_coord(label_width + 2.0 * LABEL_CLEARANCE),
                height: LABEL_SIZE + 2.0,
            },
            None,
        )
        .filled(&palette.background),
    );
    let label = text(Text {
        setting: Setting::Caption,
        at: Point {
            x: label_x,
            y: round_coord(top),
        },
        font: PILL_FONT,
        size: LABEL_SIZE,
        fill: palette.muted.clone(),
        anchor: None,
        baseline: Some(Baseline::Central),
        keeps_spaces: false,
        words: PLANNED_LABEL.to_owned(),
    });
    PaintedPage {
        body: lines(vec![
            grouped(Group::new(
                Role::Slot(Slot::PlannedFrame),
                lines(vec![frame, clearing, label]),
            )),
            grouped(
                Group::new(Role::Inset, page.body).moved(Transform::translate(dx, round_coord(dy))),
            ),
        ]),
        width,
        height,
        atlas: moved_atlas(&page.atlas, dx, dy),
    }
}

/// The page a painting is drawn on: as painted, or framed as planned.
pub(super) fn page_for(
    ctx: &Ctx<'_>,
    painting: PaintedPage,
    palette: &Palette,
    unbuilt: bool,
) -> PaintedPage {
    if unbuilt {
        framed_as_planned(ctx, painting, palette)
    } else {
        painting
    }
}

/// The accessible name, saying what the frame says when the board is planned.
pub(super) fn planned_title(title: &str, unbuilt: bool) -> String {
    if unbuilt {
        format!("{title}. {PLANNED_LABEL}")
    } else {
        title.to_owned()
    }
}
