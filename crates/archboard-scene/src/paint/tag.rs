//! A group's tag: a small bright piece with the group's name, in the finish of a
//! door. It takes that finish on both themes, whatever the card under it. A far
//! card draws a flat spot of the group's colour in its place.

use crate::geometry::{Point, Rect, round_coord};
use crate::measure::width;
use crate::paint::build::{Items, concat, lines, shape, text};
use crate::paint::colour::translucent;
use crate::paint::design::{
    FAR_TAG, TAG_FONT, TAG_GAP, TAG_HEIGHT, TAG_PADDING, TAG_RADIUS, TAG_SIZE,
};
use crate::paint::finish::finish_of;
use crate::paint::slab::{Rim, boxed, rim_band};
use crate::request::GroupTag;
use crate::scene::{Colour, GradientId, Paint, Pointer, Purpose, Shape, Stroke, Text};

/// How heavy a tag's rim is, near.
const RIM: f64 = 1.0;
/// How strong the highlight along its top is.
const HIGHLIGHT: f64 = 0.5;
/// How far below its middle a tag's baseline stands, per unit of its words' size.
const MIDDLE: f64 = 0.35;

/// One tag at a scale of its near size, with its left end at a point.
fn tag(group: &GroupTag, at: Point, scale: f64) -> Items {
    let size = TAG_SIZE * scale;
    let finish = finish_of(Some(group.color));
    let words = width(&group.name, TAG_FONT, size);
    let rect = Rect {
        x: at.x,
        y: at.y,
        width: words + 2.0 * TAG_PADDING * scale,
        height: TAG_HEIGHT * scale,
    };
    let radius = TAG_RADIUS * scale;
    let rim = RIM * scale.sqrt();
    let inner = Rect {
        x: rect.x + rim / 2.0,
        y: rect.y + rim / 2.0,
        width: rect.width - rim,
        height: rect.height - rim,
    };
    lines(vec![
        shape(
            Shape::rect(Purpose::Plate, boxed(rect), Some(round_coord(radius)))
                .pointer(Pointer::None)
                .filled(Paint::Gradient {
                    id: GradientId::Door {
                        color: Some(group.color),
                    },
                })
                .stroked(Stroke::new(&finish.rim, rim)),
        ),
        rim_band(
            inner,
            radius - rim / 2.0,
            rim,
            Rim::Top,
            &translucent(&Colour::White, HIGHLIGHT),
        ),
        text(Text::set(
            Point {
                x: round_coord(rect.x + TAG_PADDING * scale),
                y: round_coord(rect.y + rect.height / 2.0 + size * MIDDLE),
            },
            TAG_FONT,
            size,
            finish.ink,
            &group.name,
        )),
    ])
}

/// A row of tags, at a scale of their near size, that ends at a point on the right.
pub(super) fn tag_row(tags: &[GroupTag], end: Point, scale: f64) -> Items {
    let wide = |group: &GroupTag| width(&group.name, TAG_FONT, TAG_SIZE * scale);
    let mut x = end.x;
    let mut row = Vec::new();
    for group in tags.iter().rev() {
        x -= wide(group) + 2.0 * TAG_PADDING * scale;
        row.push(tag(group, Point { x, y: end.y }, scale));
        x -= TAG_GAP * scale;
    }
    row.reverse();
    concat(row)
}

/// A row of flat group marks, at a scale of their near size, that ends at a
/// point on the right of their middle line.
pub(super) fn tag_marks(tags: &[GroupTag], end: Point, scale: f64) -> Items {
    let side = FAR_TAG * scale;
    let step = side + TAG_GAP * scale;
    let spots = tags.iter().rev().enumerate().map(|(index, group)| {
        let rect = Rect {
            x: end.x - side - index as f64 * step,
            y: end.y - side / 2.0,
            width: side,
            height: side,
        };
        let bright = Colour::Bright { color: group.color };
        shape(
            Shape::rect(Purpose::Plate, boxed(rect), Some(round_coord(side / 2.0)))
                .pointer(Pointer::None)
                .filled(Paint::from(&bright)),
        )
    });
    concat(spots.rev().collect())
}
