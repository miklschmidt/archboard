//! Which lines may stand near a box while the search moves parts. Each axis of the scene is cut
//! into even stretches, each with the bits of the lines whose box round their ends, with the
//! margin of `Edges::near`, reaches into it. A line near a box shares a stretch with it on both
//! axes, so only those lines need the exact test.

use super::{Edges, MARGIN};

/// How many even stretches each axis is cut into.
const STRETCHES: usize = 64;

pub(super) struct Near {
    /// Where the stretches of each axis start, and how many stretches a unit of length takes.
    low: [f64; 2],
    scale: [f64; 2],
    /// How many words of bits each stretch takes.
    words: usize,
    /// For each axis, the lines in each stretch.
    bits: [Vec<u64>; 2],
    /// The first and the last stretch of each line on each axis.
    taken: Vec<[(usize, usize); 2]>,
}

impl Near {
    /// The lines by the boxes round their ends, in stretches of a box round the scene. A box
    /// past its sides stands in its first or last stretch.
    pub(super) fn new(bounds: &[Edges], scene: Edges) -> Near {
        let scale = |low: f64, high: f64| {
            let scale = STRETCHES as f64 / (high - low);
            if scale.is_finite() { scale } else { 0.0 }
        };
        let words = bounds.len().div_ceil(64);
        let mut near = Near {
            low: [scene.left, scene.top],
            scale: [
                scale(scene.left, scene.right),
                scale(scene.top, scene.bottom),
            ],
            words,
            bits: [vec![0; STRETCHES * words], vec![0; STRETCHES * words]],
            taken: Vec::with_capacity(bounds.len()),
        };
        for (line, bounds) in bounds.iter().enumerate() {
            let taken = near.span(bounds);
            near.taken.push(taken);
            near.flip(line, taken);
        }
        near
    }

    /// The stretch that a place along an axis stands in. A later place never stands in an
    /// earlier stretch.
    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "the cast saturates, so it keeps the order of the places"
    )]
    fn at(&self, axis: usize, place: f64) -> usize {
        (((place - self.low[axis]) * self.scale[axis]) as usize).min(STRETCHES - 1)
    }

    /// The first and the last stretch of a box on each axis, with the margin past its far sides.
    fn span(&self, at: &Edges) -> [(usize, usize); 2] {
        [
            (self.at(0, at.left), self.at(0, at.right + MARGIN)),
            (self.at(1, at.top), self.at(1, at.bottom + MARGIN)),
        ]
    }

    /// Put a line in its stretches, or take it out.
    fn flip(&mut self, line: usize, taken: [(usize, usize); 2]) {
        let words = self.words;
        for (bits, (first, last)) in self.bits.iter_mut().zip(taken) {
            for stretch in first..=last {
                bits[stretch * words + line / 64] ^= 1 << (line % 64);
            }
        }
    }

    /// Move a line to the stretches of a new box round its ends.
    pub(super) fn set(&mut self, line: usize, bounds: &Edges) {
        self.flip(line, self.taken[line]);
        let taken = self.span(bounds);
        self.taken[line] = taken;
        self.flip(line, taken);
    }

    /// Set in a row the lines that may stand near a box: those that share a stretch with it on
    /// both axes.
    pub(super) fn add(&self, at: &Edges, row: &mut [u64]) {
        let words = self.words;
        let [(left, right), (top, bottom)] = self.span(at);
        for (word, row) in row.iter_mut().enumerate() {
            let lines = |bits: &[u64], first: usize, last: usize| {
                (first..=last).fold(0, |lines, stretch| lines | bits[stretch * words + word])
            };
            *row |= lines(&self.bits[0], left, right) & lines(&self.bits[1], top, bottom);
        }
    }
}
