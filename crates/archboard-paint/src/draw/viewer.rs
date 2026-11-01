//! What a viewer adds to a picture: the lines that are drawn on as they light,
//! the code check's warnings, and the light under a control that the pointer
//! rests on. The walk draws each where the SVG viewer's layer or class stood.

use archboard_scene::geometry::Point;
use archboard_scene::scene::{Geometry, Group, Item, Role, Transform};
use kurbo::Affine;

use super::{Inside, Walk};
use crate::canvas::Canvas;

/// How solid the light under a hovered control is.
const HOVER_LIGHT: f64 = 0.2;

impl<C: Canvas> Walk<'_, C> {
    /// Draw the lines that are being drawn on.
    pub(super) fn sweep(&mut self, inside: Inside) {
        let presentation = self.presentation;
        let Some(sweep) = &presentation.sweep else {
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
        let warnings = &self.presentation.warnings;
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
        let warnings = &self.presentation.warnings;
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
        self.items(self.presentation.warnings.glyph(), moved);
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
