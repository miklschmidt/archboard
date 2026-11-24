//! Auxiliary geometry, move deltas, and reusable scratch buffers for simulated annealing.

use crate::geometry::Rect;

use super::super::sketch::{Chord, Line, Scene, Sketch};
use super::{Lattice, MARGIN};

/// What a move changes, before it stands or is undone.
#[derive(Default)]
pub(super) struct Change {
    /// Each line that ends on a moved part, and once they are sketched, each one's new sketch,
    /// chord and cost.
    pub(super) lines: Vec<usize>,
    pub(super) fresh: Vec<(Sketch, Chord, f64)>,
    /// What every other line adds or saves to go round the moved parts.
    pub(super) rounds: Vec<(usize, f64)>,
    /// How many crossings the move makes, and how many it ends.
    pub(super) crossings: (usize, usize),
    pub(super) groups: Vec<(usize, f64)>,
}

/// Reusable scratch buffers for annealing moves, avoiding per-step heap allocations.
#[derive(Default)]
pub(super) struct AnnealScratch {
    pub(super) proposed: Vec<(usize, usize)>,
    pub(super) shift_targets: Vec<usize>,
    pub(super) shift_left: Vec<usize>,
    pub(super) old: Vec<(usize, usize, Rect)>,
    pub(super) change: Change,
    pub(super) parts: Vec<Edges>,
    pub(super) near: Vec<u64>,
    pub(super) group_ids: Vec<usize>,
    pub(super) xs: Vec<f64>,
    pub(super) ys: Vec<f64>,
    pub(super) costs: Vec<f64>,
}

/// The lines that end on each box of a scene.
pub(super) fn touching(scene: &Scene) -> Vec<Vec<usize>> {
    let mut touching = vec![Vec::new(); scene.boxes.len()];
    for (line, ends) in scene.lines.iter().enumerate() {
        touching[ends.from].push(line);
        if ends.to != ends.from {
            touching[ends.to].push(line);
        }
    }
    touching
}

/// The groups that each box of a scene is in.
pub(super) fn grouped(scene: &Scene) -> Vec<Vec<usize>> {
    let mut grouped = vec![Vec::new(); scene.boxes.len()];
    for (group, members) in scene.groups.iter().enumerate() {
        for &member in members {
            grouped[member].push(group);
        }
    }
    grouped
}

/// The box round every box of a scene and every cell of its grids, where the search moves
/// parts.
pub(super) fn extent(scene: &Scene, lattices: &[Lattice]) -> Edges {
    let cells = lattices.iter().map(|lattice| Edges {
        left: lattice.origin.x,
        top: lattice.origin.y,
        right: lattice.origin.x + lattice.columns as f64 * lattice.pitch.x,
        bottom: lattice.origin.y + lattice.rows as f64 * lattice.pitch.y,
    });
    (scene.boxes.iter().map(|&at| Edges::of(at)))
        .chain(cells)
        .reduce(Edges::round)
        .unwrap_or(Edges {
            left: 0.0,
            top: 0.0,
            right: 0.0,
            bottom: 0.0,
        })
}

/// A box by its edges.
#[derive(Clone, Copy, Debug)]
pub(super) struct Edges {
    pub(super) left: f64,
    pub(super) top: f64,
    pub(super) right: f64,
    pub(super) bottom: f64,
}

impl Edges {
    pub(super) fn of(at: Rect) -> Edges {
        Edges {
            left: at.x,
            top: at.y,
            right: at.x + at.width,
            bottom: at.y + at.height,
        }
    }

    /// The box round a line's two ends, which its sketch stays within.
    pub(super) fn line(scene: &Scene, line: usize) -> Edges {
        let Line { from, to, .. } = scene.lines[line];
        Edges::of(scene.boxes[from]).round(Edges::of(scene.boxes[to]))
    }

    /// The box round two boxes.
    pub(super) fn round(self, other: Edges) -> Edges {
        Edges {
            left: self.left.min(other.left),
            top: self.top.min(other.top),
            right: self.right.max(other.right),
            bottom: self.bottom.max(other.bottom),
        }
    }

    /// Whether two boxes may share any area: false only where they stand more than a margin
    /// apart.
    pub(super) fn near(&self, other: &Edges) -> bool {
        self.left < other.right + MARGIN
            && other.left < self.right + MARGIN
            && self.top < other.bottom + MARGIN
            && other.top < self.bottom + MARGIN
    }
}
