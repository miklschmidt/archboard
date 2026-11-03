//! A group drawn through its mask: its items, then its cuts out of them.

use archboard_scene::scene::{Cap, Colour, Group, Mask, Paint, Shape};
use kurbo::Shape as _;

use super::{BOX_TOLERANCE, Inside, Walk, opacity_of};
use crate::canvas::{Canvas, Ink};
use crate::path::{outline_of, rect_of, stroke_of};

/// A mask shape that cuts: the white ground of a mask lets everything through.
fn cuts(shape: &Shape) -> bool {
    !matches!(
        &shape.fill,
        Some(Paint::Colour {
            colour: Colour::White
        })
    )
}

/// A cut for a trunk that a line shares: a lit line draws that stretch again.
fn cuts_a_trunk(shape: &Shape) -> bool {
    matches!(
        shape.stroke.as_ref().and_then(|stroke| stroke.cap),
        Some(Cap::Butt)
    )
}

impl<C: Canvas> Walk<'_, C> {
    /// Draw a group through its mask: its items, then its cuts out of them.
    pub(super) fn masked(
        &mut self,
        group: &Group,
        mask: &Mask,
        opacity: f64,
        whole: bool,
        held: Inside,
    ) {
        let bounds = rect_of(&mask.bounds).to_path(BOX_TOLERANCE);
        self.canvas.set_transform(held.transform);
        self.canvas
            .push(Some((&bounds, false)), opacity_of(opacity));
        self.inner(group, held);
        self.canvas.set_transform(held.transform);
        self.canvas.push_cut();
        let black = |opacity: Option<f64>| {
            #[expect(clippy::cast_possible_truncation, reason = "a colour's alpha is f32")]
            let alpha = opacity.unwrap_or(1.0) as f32;
            Ink::Solid(peniko::Color::BLACK.with_alpha(alpha))
        };
        for shape in mask.shapes.iter().filter(|shape| cuts(shape)) {
            if whole && cuts_a_trunk(shape) {
                continue;
            }
            let (path, _) = outline_of(&shape.geometry);
            if shape.fill.as_ref().is_some_and(|fill| *fill != Paint::None) {
                self.canvas.fill(&path, &black(shape.fill_opacity), false);
            }
            if let Some(stroke) = &shape.stroke {
                self.canvas
                    .stroke(&path, &stroke_of(stroke, 1.0), &black(stroke.opacity));
            }
        }
        self.canvas.pop();
        self.canvas.pop();
    }
}
