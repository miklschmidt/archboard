//! Traffic drawn as a beam of light, the same beam the SVG writes: the scene
//! resolves a mark into a gradient on a bar that slides along each piece of the
//! route, and a soft mask in the shape of that piece. The SVG moves the bar
//! with SMIL. Here the bar sits where the slide stands at the clock's moment.

use archboard_scene::scene::{BeamGradient, BeamPiece, Item, TrafficMark, every};
use kurbo::{Affine, Shape as _};
use peniko::{Color, ColorStop, Extend, Gradient, InterpolationAlphaSpace};

#[cfg(test)]
pub(crate) mod parity;

use crate::canvas::{Canvas, Ink};
use crate::palette::Palette;
use crate::path::{path_of, rect_of};

/// The gradient of a pulse, painted along the frame's x axis.
fn gradient_of(palette: &Palette, gradient: &BeamGradient) -> Gradient {
    let mut painted =
        Gradient::new_linear((0.0, 0.0), (gradient.span, 0.0)).with_extend(if gradient.repeat {
            Extend::Repeat
        } else {
            Extend::Pad
        });
    let stops: Vec<ColorStop> = gradient
        .stops
        .iter()
        .map(|stop| {
            #[expect(
                clippy::cast_possible_truncation,
                reason = "a gradient's offsets are f32"
            )]
            let offset = stop.offset as f32;
            ColorStop {
                offset,
                color: palette.stop(stop, 1.0).into(),
            }
        })
        .collect();
    painted.stops = stops.as_slice().into();
    painted.interpolation_alpha_space = InterpolationAlphaSpace::Unpremultiplied;
    painted
}

/// One piece of a pulse at a moment: the bar, cut down to the soft shape of the piece.
fn draw_piece<C: Canvas>(
    canvas: &mut C,
    transform: Affine,
    piece: &BeamPiece,
    ink: &Ink,
    seconds: f64,
) {
    let frame = Affine::translate((piece.frame.origin.x, piece.frame.origin.y))
        * Affine::rotate(piece.frame.angle)
        * Affine::scale_non_uniform(piece.frame.stretch, 1.0);
    let at = Affine::translate((piece.rest + piece.slide.at(seconds), 0.0));
    canvas.set_transform(transform);
    canvas.push(Some((&rect_of(&piece.bounds).to_path(0.1), false)), 1.0);
    canvas.set_transform(transform * frame * at);
    canvas.fill(&rect_of(&piece.bar).to_path(0.1), ink, false);
    canvas.set_transform(transform);
    canvas.push_keep();
    for layer in &piece.mask {
        #[expect(clippy::cast_possible_truncation, reason = "a colour's alpha is f32")]
        let white = Ink::Solid(Color::WHITE.with_alpha(layer.light as f32));
        // Match the SVG mask's stroke style.
        let stroke = kurbo::Stroke::new(layer.width)
            .with_caps(kurbo::Cap::Butt)
            .with_join(kurbo::Join::Miter);
        canvas.stroke(&path_of(&layer.path), &stroke, &white);
    }
    canvas.pop();
    canvas.pop();
}

/// Whether any traffic runs among some items.
pub(crate) fn holds_traffic(items: &[Item]) -> bool {
    every(items).any(|item| matches!(item, Item::Traffic(_)))
}

/// A line's traffic at a moment of the traffic's clock.
pub(crate) fn draw_traffic<C: Canvas>(
    canvas: &mut C,
    palette: &Palette,
    transform: Affine,
    mark: &TrafficMark,
    seconds: f64,
) {
    let beam = mark.beam();
    let ink = Ink::Gradient(gradient_of(palette, &beam.gradient), Affine::IDENTITY);
    for piece in &beam.pieces {
        draw_piece(canvas, transform, piece, &ink, seconds);
    }
}
