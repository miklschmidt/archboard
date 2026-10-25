//! A run of words shaped into glyphs with `harfrust`, in the units of its face.
//!
//! A run is shaped once per face, unhinted and at the face's own units, so a
//! size scales it and nothing else: every size a layout tries reads the same
//! glyphs. Each process keeps the runs it shaped, up to a bound.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use harfrust::{Buffer, ShapeOptions, ShaperFont};

use crate::faces::Face;

/// One glyph of a shaped run, in the units of its face.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Glyph {
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

/// Some words shaped in a face, with `harfrust`'s own choice of script and direction.
fn shape_now(face: Face, words: &str) -> Shaped {
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

/// How wide some words are set in a face at a size, in the units of the size.
pub fn width(face: Face, words: &str, size: f64) -> f64 {
    scaled(shape(face, words).advance, face, size)
}

/// A distance in a face's units, at a size.
pub(crate) fn scaled(distance: i64, face: Face, size: f64) -> f64 {
    distance as f64 * size / f64::from(face.units_per_em())
}
