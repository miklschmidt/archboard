//! A mutation's imprint as a viewer draws it: a stripe along its target's
//! edge that fades out at both ends, on a soft glow in its ink. A document
//! draws the stripe as a flat bar and blurs the glow.

use archboard_scene::scene::{Geometry, Purpose, Shape, Stroke};
use kurbo::{Affine, BezPath, Ellipse, Line, Point, Shape as _};
use peniko::{Color, ColorStop, Gradient, InterpolationAlphaSpace};

use super::{Inside, Walk, play};
use crate::canvas::{Canvas, Ink};

/// How solid a glow is part way out from its heart to its rim, as a share of
/// its heart: it falls off fast, so it reads as light, not as a patch.
const FALLOFF: [(f32, f32); 4] = [(0.0, 1.0), (0.35, 0.55), (0.7, 0.15), (1.0, 0.0)];

/// How solid a stripe is along its length, as a share of its ink: solid
/// through its middle, so it reads as a bar, and fading out at each end.
const FADE: [(f32, f32); 4] = [(0.0, 0.0), (0.2, 1.0), (0.8, 1.0), (1.0, 0.0)];

impl<C: Canvas> Walk<'_, C> {
    /// Draw a mutation's imprint or the glow under it, lit as its play lands.
    pub(super) fn imprint(&mut self, shape: &Shape, inside: Inside) {
        let lit = inside.play.map_or(0.0, play::Play::imprint_glow);
        if shape.purpose == Purpose::Glow {
            self.glow(shape, inside, lit);
        } else {
            self.stripe_fading(shape, inside, lit);
        }
    }

    /// Draw a glow: an oval about its line, as broad as its stroke and reaching
    /// half that past each end, solid at its heart and fading to nothing at
    /// its rim. It brightens as `lit` rises.
    fn glow(&mut self, shape: &Shape, inside: Inside, lit: f64) {
        let Some((from, to, stroke, width)) = stripe(shape) else {
            return;
        };
        let ink = self.lit_colour(&stroke.paint, lit);
        let heart = ink.with_alpha(solid(
            f64::from(ink.components[3]) * stroke.opacity * (1.0 + lit),
        ));
        let along = to - from;
        let centre = from.midpoint(to);
        let radii = (along.length() / 2.0 + width / 4.0, width / 2.0);
        let angle = along.atan2();
        let oval = Ellipse::new(centre, radii, angle).to_path(0.1);
        let mut gradient = Gradient::new_radial((0.0, 0.0), 1.0);
        gradient.stops =
            stops(FALLOFF.map(|(offset, share)| (offset, heart.multiply_alpha(share))));
        gradient.interpolation_alpha_space = InterpolationAlphaSpace::Unpremultiplied;
        let unit = Affine::translate(centre.to_vec2())
            * Affine::rotate(angle)
            * Affine::scale_non_uniform(radii.0, radii.1);
        self.canvas.set_transform(inside.transform);
        self.canvas
            .fill(&oval, &Ink::Gradient(gradient, unit), false);
    }

    /// Draw a stripe, solid through its middle and fading at both ends.
    fn stripe_fading(&mut self, shape: &Shape, inside: Inside, lit: f64) {
        let Some((from, to, stroke, width)) = stripe(shape) else {
            return;
        };
        let colour = self.lit_colour(&stroke.paint, lit);
        let mut fading = Gradient::new_linear(from, to);
        fading.stops = stops(FADE.map(|(offset, share)| (offset, colour.multiply_alpha(share))));
        fading.interpolation_alpha_space = InterpolationAlphaSpace::Unpremultiplied;
        let path: BezPath = Line::new(from, to).to_path(0.1);
        let round = kurbo::Stroke::new(width).with_caps(kurbo::Cap::Round);
        self.canvas.set_transform(inside.transform);
        self.canvas
            .stroke(&path, &round, &Ink::Gradient(fading, Affine::IDENTITY));
    }
}

/// The ends of a shape drawn along a line, its stroke, and how wide it is.
fn stripe(shape: &Shape) -> Option<(Point, Point, &Stroke, f64)> {
    let (Geometry::Line { from, to }, Some(stroke)) = (&shape.geometry, &shape.stroke) else {
        return None;
    };
    Some((
        Point::new(from.x, from.y),
        Point::new(to.x, to.y),
        stroke,
        stroke.width,
    ))
}

/// A colour's alpha, no more than solid.
#[expect(clippy::cast_possible_truncation, reason = "a colour's alpha is f32")]
fn solid(alpha: f64) -> f32 {
    alpha.min(1.0) as f32
}

/// A gradient's stops.
fn stops<const N: usize>(stops: [(f32, Color); N]) -> peniko::ColorStops {
    stops
        .map(|(offset, color)| ColorStop {
            offset,
            color: color.into(),
        })
        .as_slice()
        .into()
}
