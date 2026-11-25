//! A group drawn through its mask: its items, then its cuts out of them.

use archboard_scene::scene::{Colour, Group, Mask, Paint, Purpose, Shape};
use kurbo::Shape as _;

use super::{BOX_TOLERANCE, Inside, Walk, opacity_of};
use crate::canvas::{Canvas, Ink};
use crate::path::{outline_of, rect_of, stroke_of};

/// A mask shape that cuts: the white ground of a mask lets everything through.
fn cuts(shape: &Shape) -> bool {
    !matches!(
        &shape.fill,
        Paint::Colour {
            colour: Colour::White
        }
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
        let black = |opacity: f64| {
            #[expect(clippy::cast_possible_truncation, reason = "a colour's alpha is f32")]
            let alpha = opacity as f32;
            Ink::Solid(peniko::Color::BLACK.with_alpha(alpha))
        };
        for shape in mask.shapes.iter().filter(|shape| cuts(shape)) {
            // A lit line draws the shared stretch again and keeps its crossing gaps.
            if whole && shape.purpose == Purpose::Cutout {
                continue;
            }
            let (path, _) = outline_of(&shape.geometry);
            if shape.fill != Paint::None {
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
