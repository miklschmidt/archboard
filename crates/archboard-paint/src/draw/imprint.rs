//! A mutation's imprint as a viewer draws it: a stripe along its target's
//! edge that fades out at both ends, with a soft glow round it. A document
//! draws the same shape as a flat bar.

use archboard_scene::scene::{Geometry, Shape};
use kurbo::{BezPath, Line, Shape as _};
use peniko::{ColorStop, Gradient, InterpolationAlphaSpace};

use super::{Inside, Walk};
use crate::canvas::{Canvas, Ink};

/// The glow round an imprint: how much wider than the stripe, and how solid.
const GLOW: (f64, f64) = (4.0, 0.22);

impl<C: Canvas> Walk<'_, C> {
    /// Draw an imprint, fading at both ends, with its glow under it. It grows
    /// as thick as the marks grow when the picture is seen from far.
    pub(super) fn imprint(&mut self, shape: &Shape, inside: Inside, lit: f64) {
        let (Geometry::Line { from, to }, Some(stroke)) = (&shape.geometry, &shape.stroke) else {
            return;
        };
        let grown = self.presentation.mark_growth.unwrap_or(1.0);
        let width = stroke.width.unwrap_or(1.0) * grown;
        let (from, to) = ((from.x, from.y), (to.x, to.y));
        let path: BezPath = Line::new(from, to).to_path(0.1);
        let colour = self.lit_colour(&stroke.paint, lit);
        let fading = |alpha: f32| {
            let mut gradient = Gradient::new_linear(from, to);
            gradient.stops = [0.0, 0.5, 1.0]
                .into_iter()
                .map(|offset: f32| ColorStop {
                    offset,
                    color: colour
                        .multiply_alpha(alpha * (1.0 - (2.0 * offset - 1.0).abs()))
                        .into(),
                })
                .collect::<Vec<_>>()
                .as_slice()
                .into();
            gradient.interpolation_alpha_space = InterpolationAlphaSpace::Unpremultiplied;
            Ink::Gradient(gradient, kurbo::Affine::IDENTITY)
        };
        self.canvas.set_transform(inside.transform);
        #[expect(clippy::cast_possible_truncation, reason = "a colour's alpha is f32")]
        let glow = (GLOW.1 * (1.0 + lit)) as f32;
        let round = |breadth: f64| kurbo::Stroke::new(breadth).with_caps(kurbo::Cap::Round);
        self.canvas
            .stroke(&path, &round(width + GLOW.0 * grown), &fading(glow));
        self.canvas.stroke(&path, &round(width), &fading(1.0));
    }
}
