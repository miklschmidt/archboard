//! A shape as the walk draws it: filled, then stroked, under the clip it
//! names, with the markers its stroke ends in grown to the least size a head
//! keeps on screen.

use archboard_scene::paint::design::{far_line_scale, widens_far};
use archboard_scene::scene::{Geometry, Marker, Paint, Purpose, Shape, Stroke, Token};
use kurbo::{Affine, BezPath, Rect};

use super::{Inside, Walk, play};
use crate::canvas::Canvas;
use crate::path::{end_of, outline_of, path_of, straightened, stroke_of, trimmed};

/// A marker laid on one end of a line: where it is drawn, and how far the
/// line's body gives way to it because it grew.
struct Mark<'m> {
    marker: &'m Marker,
    /// Whether it ends the line's start.
    start: bool,
    /// How far the body gives way to it at its end.
    back: f64,
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
        let grows =
            inside.line && matches!(geometry, Geometry::Path { .. }) && widens_far(stroke.width);
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
        if shape.purpose == Purpose::Imprint {
            let lit = inside.play.map_or(0.0, play::Play::imprint_glow);
            self.imprint(shape, inside, lit);
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
        let alpha = shape.fill_opacity * self.shown_with_members(shape);
        if let Some(ink) = self.ink(&shape.fill, alpha, bounds) {
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
        let alpha = stroke.opacity * self.shown_with_members(shape);
        let Some(ink) = self.ink(paint, alpha, bounds) else {
            return;
        };
        let ink = self.glowing(ink, inside.glow);
        let grown = self.far_scale(stroke, &shape.geometry, inside);
        let width = stroke.width * grown;
        let marks: Vec<Mark<'_>> = [(&shape.start_marker, true), (&shape.marker, false)]
            .into_iter()
            .filter_map(|(marker, start)| {
                let marker = self.definitions.marker(marker.as_ref()?)?;
                let (at, angle) = end_of(path, start)?;
                Some(self.mark(marker, width, (at, angle), start))
            })
            .collect();
        // A mark grown past its size keeps its hold in place, so the body
        // gives way to it by as much as it grew.
        let give = |start: bool| {
            marks
                .iter()
                .find(|mark| mark.start == start)
                .map_or(0.0, |mark| mark.back)
        };
        let body = trimmed(path, give(true), give(false));
        let straight = (!stroke.dashes.is_empty()).then(|| straightened(&body));
        self.canvas.stroke(
            straight.as_ref().unwrap_or(&body),
            &stroke_of(stroke, grown),
            &ink,
        );
        if let Some(play) = inside
            .play
            .filter(|_| inside.line && shape.purpose == Purpose::Line)
        {
            self.spark(&body, &stroke.paint, width, play, inside);
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

    /// A marker laid on one end of a line of some width: drawn at its size, or
    /// grown about its hold to the least size a head keeps on screen.
    fn mark<'m>(
        &self,
        marker: &'m Marker,
        width: f64,
        (at, angle): (kurbo::Point, f64),
        start: bool,
    ) -> Mark<'m> {
        let drawn = marker.size * width / marker.view;
        let scale = drawn * self.presentation.mark_growth.unwrap_or(1.0);
        let back = (marker.hold.x - marker.reference.x) * (scale - drawn);
        Mark {
            marker,
            start,
            back,
            transform: Affine::translate(at.to_vec2())
                * Affine::rotate(angle)
                * Affine::translate((-back, 0.0))
                * Affine::scale(scale)
                * Affine::translate((-marker.reference.x, -marker.reference.y)),
        }
    }
}
