//! A shape as the walk draws it: filled, then stroked, under the clip it
//! names, with the markers its stroke ends in.

use archboard_scene::paint::design::{far_line_scale, widens_far};
use archboard_scene::scene::{Colour, Geometry, Marker, Paint, Purpose, Shape, Stroke, Token};
use kurbo::{Affine, BezPath, Rect};

use super::{Inside, Walk};
use crate::canvas::Canvas;
use crate::path::{end_of, outline_of, path_of, straightened, stroke_of};

/// A marker laid on one end of a line, and where it is drawn.
struct Mark<'m> {
    marker: &'m Marker,
    /// Whether it ends the line's start.
    start: bool,
    /// Where it is drawn, under the line's own transform.
    transform: Affine,
}

impl<C: Canvas> Walk<'_, C> {
    /// How much of a mark shows that stands with its members: as much as the
    /// brightest of them. Any other shape shows as its group does.
    fn shown_with_members(&self, shape: &Shape) -> f64 {
        let recede = &self.presentation.recede;
        shape
            .members
            .iter()
            .map(|member| *recede.subjects.get(member).unwrap_or(&recede.rest))
            .reduce(f64::max)
            .unwrap_or(1.0)
    }

    /// The width a line's direct stroke grows by in the far view.
    fn far_scale(&self, stroke: &Stroke, geometry: &Geometry, inside: Inside) -> f64 {
        let grows = inside.line
            && matches!(geometry, Geometry::Path { .. })
            && stroke.width.is_some_and(widens_far);
        if grows {
            far_line_scale(self.presentation.far)
        } else {
            1.0
        }
    }

    /// Draw a shape, its markers with it.
    pub(super) fn shape(&mut self, shape: &Shape, inside: Inside) {
        let ring = matches!(
            shape.purpose,
            Purpose::Halo | Purpose::Ring | Purpose::LitLine
        );
        // A relationship's label wears the ring; its line keeps its own ink.
        if ring && (!inside.selected || inside.line) {
            return;
        }
        if matches!(shape.purpose, Purpose::Imprint | Purpose::Glow) {
            self.imprint(shape, inside);
            return;
        }
        let (path, bounds) = outline_of(&shape.geometry);
        self.canvas.set_transform(inside.transform);
        let clip = self.clip_of(shape, bounds);
        if let Some(clip) = &clip {
            self.canvas.push(Some((clip, true)), 1.0);
        }
        self.paint(shape, &path, bounds, ring, inside);
        if clip.is_some() {
            self.canvas.pop();
        }
    }

    /// The clip a shape names, laid over the shape's own box.
    fn clip_of(&self, shape: &Shape, bounds: Rect) -> Option<BezPath> {
        let clip = self.definitions.clip(&shape.clip.as_ref()?.card)?;
        let unit = Affine::translate(bounds.origin().to_vec2())
            * Affine::scale_non_uniform(bounds.width(), bounds.height());
        Some(unit * path_of(&clip.outline))
    }

    /// Fill a shape, then stroke it.
    fn paint(&mut self, shape: &Shape, path: &BezPath, bounds: Rect, ring: bool, inside: Inside) {
        let black = Paint::Colour {
            colour: Colour::Black,
        };
        let fill = shape.fill.as_ref().unwrap_or(&black);
        let alpha = shape.fill_opacity.unwrap_or(1.0) * self.shown_with_members(shape);
        if let Some(ink) = self.ink(fill, alpha, bounds) {
            let ink = self.glowing(ink, inside.glow);
            self.canvas.fill(path, &ink, false);
        }
        if let Some(stroke) = &shape.stroke {
            self.outline(shape, stroke, path, bounds, ring, inside);
        }
    }

    /// Stroke a shape and draw what its stroke ends in.
    fn outline(
        &mut self,
        shape: &Shape,
        stroke: &Stroke,
        path: &BezPath,
        bounds: Rect,
        ring: bool,
        inside: Inside,
    ) {
        let selection = Paint::from(Token::DiagramSelection);
        let paint = if ring { &selection } else { &stroke.paint };
        let alpha = stroke.opacity.unwrap_or(1.0) * self.shown_with_members(shape);
        let Some(ink) = self.ink(paint, alpha, bounds) else {
            return;
        };
        let ink = self.glowing(ink, inside.glow);
        let grown = self.far_scale(stroke, &shape.geometry, inside);
        let width = stroke.width.unwrap_or(1.0) * grown;
        let marks: Vec<Mark<'_>> = [(&shape.start_marker, true), (&shape.marker, false)]
            .into_iter()
            .filter_map(|(marker, start)| {
                let marker = self.definitions.marker(marker.as_ref()?)?;
                let (at, angle) = end_of(path, start)?;
                Some(mark(marker, (at, angle), start))
            })
            .collect();
        let straight = (!stroke.dashes.is_empty()).then(|| straightened(path));
        self.canvas.stroke(
            straight.as_ref().unwrap_or(path),
            &stroke_of(stroke, grown),
            &ink,
        );
        if let Some(play) = inside
            .play
            .filter(|_| inside.line && shape.purpose == Purpose::Line)
        {
            self.spark(path, &stroke.paint, width, play, inside);
        }
        for mark in marks {
            let held = Inside {
                transform: inside.transform * mark.transform,
                line: false,
                glow: inside.play.map_or(0.0, |play| play.mark_glow(mark.start)),
                ..inside
            };
            for head in &mark.marker.shapes {
                self.shape(head, held);
            }
        }
    }
}

/// A marker laid on one end of a line, at its own size in the picture's units.
fn mark(marker: &Marker, (at, angle): (kurbo::Point, f64), start: bool) -> Mark<'_> {
    Mark {
        marker,
        start,
        transform: Affine::translate(at.to_vec2())
            * Affine::rotate(angle)
            * Affine::scale(marker.size / marker.view)
            * Affine::translate((-marker.reference.x, -marker.reference.y)),
    }
}
