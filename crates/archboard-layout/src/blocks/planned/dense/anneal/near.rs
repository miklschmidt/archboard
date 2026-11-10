//! Which lines may stand near a box while the search moves parts. Each axis of the scene is cut
//! into even stretches, each with the bits of the lines whose box round their ends, with the
//! margin of `Edges::near`, reaches into it. A line near a box shares a stretch with it on both
//! axes, so only those lines need the exact test.

use super::{
    super::sketch::{Even, STRETCHES},
    Edges, MARGIN,
};

pub(super) struct Near {
    /// Each axis, cut into even stretches.
    axes: [Even; 2],
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
        let words = bounds.len().div_ceil(64);
        let mut near = Near {
            axes: [
                Even::new(scene.left, scene.right),
                Even::new(scene.top, scene.bottom),
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

    /// The first and the last stretch of a box on each axis, with the margin past its far sides.
    fn span(&self, at: &Edges) -> [(usize, usize); 2] {
        let [across, down] = &self.axes;
        [
            (across.at(at.left), across.at(at.right + MARGIN)),
            (down.at(at.top), down.at(at.bottom + MARGIN)),
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
