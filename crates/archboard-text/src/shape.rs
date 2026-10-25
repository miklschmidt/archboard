//! A run of words shaped into glyphs with `harfrust`, in the units of its face.
//!
//! A run is shaped once per face, unhinted and at the face's own units, so a
//! size scales it and nothing else: every size a layout tries reads the same
//! glyphs. Each process keeps the runs it shaped, up to a bound.
//!
//! A character the run's face has no glyph for is set in the first of the
//! face's fallbacks that has one (`Face::fallbacks`), and in the run's own face
//! where none has. The run is cut where the face changes, each piece is shaped
//! in its face, and the pieces follow one another along the baseline. A
//! grapheme goes with its first character, so a mark stays on its letter, and
//! a space stays in the run's own face.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use harfrust::{Buffer, ShapeOptions, ShaperFont};
use unicode_segmentation::UnicodeSegmentation;

use crate::faces::Face;

/// One glyph of a shaped run, in the units of its face.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Glyph {
    /// The face the glyph is drawn from: the run's own, or a fallback.
    pub face: Face,
    /// The glyph in its face.
    pub id: u32,
    /// Where its origin stands along the run's baseline, from the run's start.
    pub x: i32,
    /// How far its origin stands below the baseline: a mark set above a
    /// letter stands at a negative distance.
    pub y: i32,
}

/// A run shaped: its glyphs in the order they are drawn, left to right, and
/// how far the pen moves over all of them, in the units of its face.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Shaped {
    /// The glyphs, placed.
    pub glyphs: Vec<Glyph>,
    /// The run's advance.
    pub advance: i64,
    /// Each glyph's advance and the byte of the words its cluster begins at.
    clusters: Vec<(usize, i32)>,
}

impl Shaped {
    /// How far the pen moves over the glyphs whose clusters begin before a
    /// byte of the words.
    pub(crate) fn advance_before(&self, byte: usize) -> i64 {
        self.clusters
            .iter()
            .filter(|(cluster, _)| *cluster < byte)
            .map(|(_, advance)| i64::from(*advance))
            .sum()
    }
}

/// How many runs a process keeps shaped before it starts again.
const KEPT: usize = 50_000;

thread_local! {
    static SHAPED: RefCell<HashMap<(Face, String), Rc<Shaped>>> = RefCell::new(HashMap::new());
}

/// Some words shaped in a face: shaped once, then read again.
pub fn shape(face: Face, words: &str) -> Rc<Shaped> {
    let key = (face, words.to_owned());
    if let Some(known) = SHAPED.with(|shaped| shaped.borrow().get(&key).cloned()) {
        return known;
    }
    let shaped = Rc::new(shape_now(face, words));
    SHAPED.with(|kept| {
        let mut kept = kept.borrow_mut();
        if kept.len() >= KEPT {
            kept.clear();
        }
        kept.insert(key, Rc::clone(&shaped));
    });
    shaped
}

/// Some words shaped in a face, each piece in the face that has its glyphs.
fn shape_now(face: Face, words: &str) -> Shaped {
    let pieces = pieces(face, words);
    if let [(only, _)] = pieces.as_slice() {
        return shape_piece(*only, words);
    }
    let mut shaped = Shaped {
        glyphs: Vec::new(),
        advance: 0,
        clusters: Vec::new(),
    };
    let mut ends = pieces.iter().map(|&(_, start)| start).skip(1);
    for &(piece_face, start) in &pieces {
        let end = ends.next().unwrap_or(words.len());
        let piece = shape_piece(piece_face, &words[start..end]);
        shaped.glyphs.extend(piece.glyphs.iter().map(|glyph| Glyph {
            x: units(i64::from(glyph.x) + shaped.advance),
            ..*glyph
        }));
        shaped.clusters.extend(
            piece
                .clusters
                .iter()
                .map(|&(cluster, advance)| (cluster + start, advance)),
        );
        shaped.advance += piece.advance;
    }
    shaped
}

/// Where the face a run's characters are set in changes: each piece's face
/// and the byte it starts at. Words with no characters are one piece.
fn pieces(face: Face, words: &str) -> Vec<(Face, usize)> {
    let mut pieces: Vec<(Face, usize)> = Vec::new();
    for (at, grapheme) in words.grapheme_indices(true) {
        let set_in = grapheme
            .chars()
            .next()
            .map_or(face, |first| face_for(face, first));
        if pieces.last().is_none_or(|&(last, _)| last != set_in) {
            pieces.push((set_in, at));
        }
    }
    if pieces.is_empty() {
        pieces.push((face, 0));
    }
    pieces
}

/// The face a character is set in: the run's face where it has a glyph for
/// it, or a space, else its first fallback that has one, else the run's face.
fn face_for(face: Face, character: char) -> Face {
    if character.is_whitespace() || face.covers(character) {
        return face;
    }
    face.fallbacks()
        .iter()
        .copied()
        .find(|fallback| fallback.covers(character))
        .unwrap_or(face)
}

/// Some words shaped in one face, with `harfrust`'s own choice of script and
/// direction.
fn shape_piece(face: Face, words: &str) -> Shaped {
    let font = ShaperFont::new(face.font());
    let mut buffer = Buffer::new();
    buffer.push_str(words);
    buffer.guess_segment_properties();
    // A buffer that guessed its direction always shapes: the only refusals
    // are an unset direction and a plan made for other text.
    if harfrust::shape(&font, &mut buffer, ShapeOptions::new()).is_err() {
        return Shaped {
            glyphs: Vec::new(),
            advance: 0,
            clusters: Vec::new(),
        };
    }
    let mut pen: i64 = 0;
    let mut glyphs = Vec::with_capacity(buffer.len());
    let mut clusters = Vec::with_capacity(buffer.len());
    for (info, position) in buffer.glyph_infos().iter().zip(buffer.glyph_positions()) {
        glyphs.push(Glyph {
            face,
            id: info.glyph_id,
            x: units(pen + i64::from(position.x_offset)),
            y: -position.y_offset,
        });
        clusters.push((info.cluster as usize, position.x_advance));
        pen += i64::from(position.x_advance);
    }
    Shaped {
        glyphs,
        advance: pen,
        clusters,
    }
}

/// A distance along a run, which no run of a picture's words comes near
/// the bounds of.
fn units(distance: i64) -> i32 {
    i32::try_from(distance).unwrap_or(if distance < 0 { i32::MIN } else { i32::MAX })
}

/// How wide some words are set in a face at a size, in the units of the size,
/// to a hundredth of a unit held in single precision.
pub fn width(face: Face, words: &str, size: f64) -> f64 {
    hundredths(scaled(shape(face, words).advance, face, size))
}

/// A width to a hundredth of a unit, held in single precision: the number a
/// canvas reported for every width before the core shaped text. Words break
/// and cards size as they did, to the bit for nearly every run, so a layout
/// that compares widths makes the choices it made then (TASK-520.07).
#[expect(
    clippy::cast_possible_truncation,
    reason = "single precision is the rule: the canvas held its widths so"
)]
pub(crate) fn hundredths(width: f64) -> f64 {
    f64::from(((width * 100.0).round() / 100.0) as f32)
}

/// A distance in a face's units, at a size.
pub(crate) fn scaled(distance: i64, face: Face, size: f64) -> f64 {
    distance as f64 * size / f64::from(face.units_per_em())
}
