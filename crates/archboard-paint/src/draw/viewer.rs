//! What a viewer adds to a picture: the lines that are drawn on as they light,
//! the code check's warnings, the light under a control that the pointer
//! rests on, and the lines the far view draws wider. The walk draws each
//! where the SVG viewer's layer or class stood.

use archboard_scene::geometry::Point;
use archboard_scene::paint::ViewerMarks;
use archboard_scene::scene::{Geometry, Group, Item, Role, Stroke, Transform};
use kurbo::Affine;

use super::{Inside, Walk};
use crate::canvas::Canvas;

/// How solid the light under a hovered control is.
const HOVER_LIGHT: f64 = 0.2;

impl<C: Canvas> Walk<'_, C> {
    /// The width a line's direct stroke grows by in the far view.
    pub(super) fn far_scale(&self, stroke: &Stroke, geometry: &Geometry, inside: Inside) -> f64 {
        match stroke.width {
            Some(width) if inside.line && matches!(geometry, Geometry::Path { .. }) => {
                far_line_scale(self.marks, width, self.seen.far)
            }
            _ => 1.0,
        }
    }

    /// Draw the lines that are being drawn on.
    pub(super) fn sweep(&mut self, inside: Inside) {
        let seen = self.seen;
        let Some(sweep) = &seen.sweep else {
            return;
        };
        self.canvas.set_transform(inside.transform);
        for copy in sweep.showing() {
            let alpha = copy.paint.opacity.unwrap_or(1.0) * copy.opacity;
            if let Some(ink) = self.ink(&copy.paint.paint, alpha, copy.bounds) {
                self.canvas.stroke(copy.path, &copy.stroke, &ink);
            }
        }
    }

    /// Draw the warning of each line among some items that has no words, in a
    /// group of words made for it, which stands with the line.
    pub(super) fn bare_marks(&mut self, items: &[Item], inside: Inside) {
        let warnings = &self.seen.warnings;
        for item in items {
            let Item::Group(line) = item else {
                continue;
            };
            let Some(at) = warnings.bare_on(line) else {
                continue;
            };
            let words = Group {
                subject: line.subject.clone(),
                transform: Some(Transform::translate(at.x, at.y)),
                opacity: line.opacity,
                ..Group::new(Role::Label, warnings.glyph().to_vec())
            };
            self.group(&words, inside);
        }
    }

    /// Draw the warnings that stand in a group.
    pub(super) fn marks(&mut self, group: &Group, held: Inside) {
        let warnings = &self.seen.warnings;
        for at in warnings.held_in(group) {
            self.warning(*at, held);
        }
    }

    /// Draw one warning where a point of a group is.
    fn warning(&mut self, at: Point, held: Inside) {
        let moved = Inside {
            transform: held.transform * Affine::translate((at.x, at.y)),
            ..held
        };
        self.items(self.seen.warnings.glyph(), moved);
    }

    /// Draw a control under the pointer: the light it keeps hidden shows.
    pub(super) fn lit_control(&mut self, control: &Group, held: Inside) {
        let mut items = control.items.clone();
        let light = items
            .iter_mut()
            .filter(|item| !matches!(item, Item::Break | Item::Definitions { .. }))
            .nth(1);
        if let Some(Item::Shape(light)) = light
            && matches!(light.geometry, Geometry::Rect { .. })
        {
            light.fill_opacity = Some(HOVER_LIGHT);
        }
        self.items(&items, held);
    }
}

/// How much wider the far view draws a line of a stroke width, `far` of the
/// way from the near view (0) to the far view (1): a line it does not widen
/// keeps its width.
fn far_line_scale(marks: &ViewerMarks, width: f64, far: f64) -> f64 {
    if marks.far_lines.iter().any(|&(near, _)| near == width) {
        1.0 + (marks.far_scale - 1.0) * far
    } else {
        1.0
    }
}
