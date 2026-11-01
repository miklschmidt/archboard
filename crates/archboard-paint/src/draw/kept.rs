//! Parts a canvas can encode once and draw again: whole settled items and
//! glyph runs that occur in more than one place.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash as _, Hasher as _};

use archboard_scene::scene::Text;
use kurbo::Affine;

use super::{Inside, Walk};
use crate::canvas::{Canvas, Ink, PartKey};
use crate::path::placed;

impl<C: Canvas> Walk<'_, C> {
    /// Draw something that stands the same from frame to frame under a
    /// transform: again, when the canvas kept it, and otherwise from scratch.
    pub(super) fn part(
        &mut self,
        key: PartKey,
        transform: Affine,
        draw: impl FnOnce(&mut Self, Affine),
    ) {
        if self.canvas.again(key, transform) {
            return;
        }
        if self.canvas.keep() {
            draw(self, Affine::IDENTITY);
            self.canvas.kept(key, transform);
        } else {
            draw(self, transform);
        }
    }

    /// Draw a run of words from its glyphs. The same words in the same face,
    /// size and colour are the same part, wherever they stand.
    pub(super) fn text(&mut self, text: &Text, inside: Inside) {
        let mut key = DefaultHasher::new();
        text.words.hash(&mut key);
        text.font.hash(&mut key);
        text.size.to_bits().hash(&mut key);
        self.palette
            .colour(&text.fill, 1.0)
            .components
            .map(f32::to_bits)
            .hash(&mut key);
        let at = inside.transform * Affine::translate((text.at.x, text.at.y));
        self.part(PartKey::Text(key.finish()), at, |walk, at| {
            walk.glyphs(text, at);
        });
    }

    /// Draw the glyphs of a run, its baseline starting under a transform.
    fn glyphs(&mut self, text: &Text, at: Affine) {
        let scale = text.size / f64::from(text.units_per_em);
        let ink = Ink::Solid(self.palette.colour(&text.fill, 1.0));
        for glyph in &text.glyphs {
            let outline = self.outlines.glyph(glyph.face, glyph.id);
            if outline.elements().is_empty() {
                continue;
            }
            let x = f64::from(glyph.x) * scale;
            let y = f64::from(glyph.y) * scale;
            self.canvas.set_transform(at * placed(x, y, Some(scale)));
            self.canvas.fill(&outline, &ink, false);
        }
    }
}
