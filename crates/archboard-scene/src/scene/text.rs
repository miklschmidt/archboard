//! The words of a scene, its icons, and the boxes some items are drawn in.
//!
//! A run of words is shaped by the core (`archboard-text`): it carries its
//! glyphs and their places, which every painter draws, and its words, for the
//! reader who searches, copies or listens.

use archboard_text::Face;
use serde::Serialize;
use ts_rs::TS;

use crate::drawing::DiagramFont;
use crate::geometry::{Point, Rect};
use crate::measure;
use crate::scene::Item;
use crate::scene::colour::Colour;

/// One glyph of a run: the glyph in its face, and where its origin stands
/// from the run's point, in font units (every face has 1000 to the em).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, TS)]
pub struct GlyphPlace {
    /// The face the glyph is drawn from: the run's own, or the face a
    /// character the run's face has no glyph for falls back to.
    pub face: Face,
    /// The glyph, by its id in its face.
    pub id: u32,
    /// How far along the baseline its origin stands.
    pub x: i32,
    /// How far below the baseline its origin stands: nought for all but a mark.
    pub y: i32,
}

/// One run of words, shaped.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Text {
    /// The left end of its baseline: where its first glyph's origin stands.
    pub at: Point,
    /// The face it is set in.
    pub font: DiagramFont,
    /// Its size.
    pub size: f64,
    /// Its colour.
    pub fill: Colour,
    /// How far its glyphs advance, at its size.
    pub width: f64,
    /// The units of one em of its face, which its glyphs' places are in: a
    /// place times `size / unitsPerEm` is a distance in the picture.
    pub units_per_em: u16,
    /// Its glyphs, in the order they are drawn.
    pub glyphs: Vec<GlyphPlace>,
    /// The words.
    pub words: String,
}

impl Text {
    /// Words shaped in a face at a size, their baseline starting at a point.
    pub fn set(at: Point, font: DiagramFont, size: f64, fill: Colour, words: &str) -> Text {
        let face = measure::face(font);
        let shaped = archboard_text::shape(face, words);
        Text {
            at,
            font,
            size,
            fill,
            width: measure::width(words, font, size),
            units_per_em: face.units_per_em(),
            glyphs: shaped
                .glyphs
                .iter()
                .map(|glyph| GlyphPlace {
                    face: glyph.face,
                    id: glyph.id,
                    x: glyph.x,
                    y: glyph.y,
                })
                .collect(),
            words: words.to_owned(),
        }
    }

    /// The run moved so its middle across stands on its point.
    #[must_use]
    pub fn centred(self) -> Text {
        Text {
            at: Point {
                x: self.at.x - self.width / 2.0,
                ..self.at
            },
            ..self
        }
    }

    /// The run moved so its middle down stands on its point: halfway between
    /// how far its face reaches above the baseline and below it.
    #[must_use]
    pub fn central(self) -> Text {
        let extent = measure::face(self.font).extent();
        let rise =
            (extent.ascent - extent.descent) / 2.0 * self.size / f64::from(extent.units_per_em);
        Text {
            at: Point {
                y: self.at.y + rise,
                ..self.at
            },
            ..self
        }
    }
}

/// A Remix Icon, by the name it is exported under, drawn from its own 24-unit
/// square into a square `size` wide at the origin.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
pub struct Icon {
    /// The icon drawn: the one asked for, or the icon for a name the set does not have.
    pub name: String,
    /// The side of the square it is drawn into.
    pub size: f64,
    /// Its ink.
    pub ink: Colour,
}

/// What is drawn in a box of its own: everything in `view` scaled and moved
/// to fill `frame`, nothing outside it.
#[derive(Clone, Debug, PartialEq, Serialize, TS)]
pub struct Viewport {
    /// Where it is drawn.
    pub frame: Rect,
    /// What part of its items' own space it shows.
    pub view: Rect,
    /// What it draws, in order.
    pub items: Vec<Item>,
}
