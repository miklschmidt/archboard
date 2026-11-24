//! Which cell of its frame's grid each part takes: simulated annealing over the cells, from a
//! fixed seed, on what the scene costs (`super::sketch`). A move takes one part to another cell,
//! trading places with the part there, or shifts a whole group by one cell. Cells can stay empty.
//! A move that costs more stands by chance, less often as the search cools, so the search
//! leaves the first valley it finds. The search keeps the cheapest placement it met, which is
//! never dearer than where it started.

use std::cmp::Ordering;

use crate::geometry::{Point, Rect};

use super::{
    crossing::Crossings,
    sketch::{CROSSING, Chord, Line, Scene, Sketch, Weighed},
};

use near::Near;

mod near;

/// A frame's grid of cells, as the search sees it: every cell one pitch from the next.
#[derive(Clone, Copy, Debug)]
pub(super) struct Lattice {
    /// Where the first cell's top left corner stands in the scene.
    pub origin: Point,
    pub pitch: Point,
    pub columns: usize,
    pub rows: usize,
}

impl Lattice {
    fn cells(&self) -> usize {
        self.columns * self.rows
    }

    /// A part's box in a cell.
    pub(super) fn place(&self, cell: usize, size: Point) -> Rect {
        Rect {
            x: self.origin.x + (cell % self.columns) as f64 * self.pitch.x,
            y: self.origin.y + (cell / self.columns) as f64 * self.pitch.y,
            width: size.x,
            height: size.y,
        }
    }
}

/// A part that the search moves: its box in the scene and the grid it stands on.
#[derive(Clone, Copy, Debug)]
pub(super) struct Part {
    pub at: usize,
    pub lattice: usize,
    pub size: Point,
}

/// How often a move shifts a whole group, out of a hundred.
const GROUP_MOVES: u64 = 20;
/// How far the search cools, from its first heat to its last.
const COOLING: f64 = 1e-3;
/// How many moves sample the first heat.
const SAMPLES: usize = 40;
/// Room past a line's ends that the quick test of its way round a box keeps: more than the room
/// of the exact test (`Sketch::round`) and any rounding of it.
const MARGIN: f64 = 1.0;
/// How much less than its cheapest way with nothing in its way a line's least cost says: more
/// than any rounding of what a way round a box adds.
const SLACK: f64 = 1e-3;

/// What a move changes, before it stands or is undone.
#[derive(Default)]
struct Change {
    /// Each line that ends on a moved part, and once they are sketched, each one's new sketch,
    /// chord and cost.
    lines: Vec<usize>,
    fresh: Vec<(Sketch, Chord, f64)>,
    /// What every other line adds or saves to go round the moved parts.
    rounds: Vec<(usize, f64)>,
    /// How many crossings the move makes, and how many it ends.
    crossings: (usize, usize),
    groups: Vec<(usize, f64)>,
}

/// Reusable scratch buffers for annealing moves, avoiding per-step heap allocations.
#[derive(Default)]
struct AnnealScratch {
    proposed: Vec<(usize, usize)>,
    shift_targets: Vec<usize>,
    shift_left: Vec<usize>,
    old: Vec<(usize, usize, Rect)>,
    change: Change,
    parts: Vec<Edges>,
    near: Vec<u64>,
    group_ids: Vec<usize>,
    xs: Vec<f64>,
    ys: Vec<f64>,
    costs: Vec<f64>,
}

/// The lines that end on each box of a scene.
fn touching(scene: &Scene) -> Vec<Vec<usize>> {
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
fn grouped(scene: &Scene) -> Vec<Vec<usize>> {
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
fn extent(scene: &Scene, lattices: &[Lattice]) -> Edges {
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
struct Edges {
    left: f64,
    top: f64,
    right: f64,
    bottom: f64,
}

impl Edges {
    fn of(at: Rect) -> Edges {
        Edges {
            left: at.x,
            top: at.y,
            right: at.x + at.width,
            bottom: at.y + at.height,
        }
    }

    /// The box round a line's two ends, which its sketch stays within.
    fn line(scene: &Scene, line: usize) -> Edges {
        let Line { from, to, .. } = scene.lines[line];
        Edges::of(scene.boxes[from]).round(Edges::of(scene.boxes[to]))
    }

    /// The box round two boxes.
    fn round(self, other: Edges) -> Edges {
        Edges {
            left: self.left.min(other.left),
            top: self.top.min(other.top),
            right: self.right.max(other.right),
            bottom: self.bottom.max(other.bottom),
        }
    }

    /// Whether two boxes may share any area: false only where they stand more than a margin
    /// apart.
    fn near(&self, other: &Edges) -> bool {
        self.left < other.right + MARGIN
            && other.left < self.right + MARGIN
            && self.top < other.bottom + MARGIN
            && other.top < self.bottom + MARGIN
    }
}

/// A placement under search.
pub(super) struct Search<'p> {
    pub scene: Scene,
    parts: &'p [Part],
    lattices: &'p [Lattice],
    pub cells: Vec<usize>,
    /// The part in each cell of each lattice.
    occupant: Vec<Vec<Option<usize>>>,
    weighed: Weighed,
    total: f64,
    /// Which lines cross which, and the box round each line's two ends, by where it stands.
    crossing: Crossings,
    bounds: Vec<Edges>,
    near: Near,
    /// The lines that end on each box, and the groups each box is in.
    touching: Vec<Vec<usize>>,
    grouped: Vec<Vec<usize>>,
    /// Which lines a move touches, by the move's stamp.
    stamp: Vec<u32>,
    stamps: u32,
    seed: u64,
}

impl<'p> Search<'p> {
    pub(super) fn new(
        mut scene: Scene,
        parts: &'p [Part],
        lattices: &'p [Lattice],
        cells: Vec<usize>,
    ) -> Search<'p> {
        let mut occupant: Vec<Vec<Option<usize>>> = lattices
            .iter()
            .map(|lattice| vec![None; lattice.cells()])
            .collect();
        for (part, &cell) in parts.iter().zip(&cells) {
            occupant[part.lattice][cell] = Some(part.at);
            scene.boxes[part.at] = lattices[part.lattice].place(cell, part.size);
        }
        let weighed = scene.weigh();
        // Parts are the scene's first boxes, so a box's part is its index.
        debug_assert!(parts.iter().enumerate().all(|(at, part)| part.at == at));
        let bounds: Vec<Edges> = (0..scene.lines.len())
            .map(|line| Edges::line(&scene, line))
            .collect();
        Search {
            total: weighed.total(),
            crossing: Crossings::new(&scene),
            near: Near::new(&bounds, extent(&scene, lattices)),
            bounds,
            touching: touching(&scene),
            grouped: grouped(&scene),
            stamp: vec![0; scene.lines.len()],
            stamps: 0,
            seed: 0x05EE_D0FD_3A5E,
            weighed,
            scene,
            parts,
            lattices,
            cells,
            occupant,
        }
    }

    /// What the placement costs in all.
    pub(super) fn total(&self) -> f64 {
        self.total
    }

    /// Weigh the whole scene again, once something else moved its boxes.
    pub(super) fn reweigh(&mut self) {
        self.weighed = self.scene.weigh();
        self.total = self.weighed.total();
        self.crossing = Crossings::new(&self.scene);
        self.bounds = (0..self.scene.lines.len())
            .map(|line| Edges::line(&self.scene, line))
            .collect();
        self.near = Near::new(&self.bounds, extent(&self.scene, self.lattices));
    }

    fn random(&mut self) -> u64 {
        // SplitMix64: a fixed seed gives the same search on every run.
        self.seed = self.seed.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.seed;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    fn below(&mut self, count: usize) -> usize {
        let count = u64::try_from(count).expect("a count fits 64 bits");
        usize::try_from(self.random() % count).expect("a remainder below a count")
    }

    fn chance(&mut self) -> f64 {
        (self.random() >> 11) as f64 / (1_u64 << 53) as f64
    }

    /// A random move: each moved part and the cell it goes to, written into `scratch.proposed`.
    fn propose(&mut self, scratch: &mut AnnealScratch) {
        scratch.proposed.clear();
        if !self.scene.groups.is_empty() && self.random() % 100 < GROUP_MOVES {
            let group = self.below(self.scene.groups.len());
            let step = self.below(4);
            if self.shift(group, step, scratch) {
                return;
            }
        }
        let part = self.below(self.parts.len());
        let lattice = self.parts[part].lattice;
        let cell = self.below(self.lattices[lattice].cells());
        let from = self.cells[part];
        if cell == from {
            return;
        }
        scratch.proposed.push((part, cell));
        if let Some(other) = self.occupant[lattice][cell] {
            scratch.proposed.push((other, from));
        }
    }

    /// Shift every member of a group one cell, if they share a grid and all stay on it. The
    /// parts in their way take the cells they leave.
    fn shift(&self, group: usize, step: usize, scratch: &mut AnnealScratch) -> bool {
        let members = &self.scene.groups[group];
        let Some(&first) = members.first() else {
            return false;
        };
        let lattice = self.parts[first].lattice;
        let grid = self.lattices[lattice];
        scratch.proposed.clear();
        for &member in members {
            let Some(next) = self.shifted_cell(member, lattice, grid, step) else {
                scratch.proposed.clear();
                return false;
            };
            scratch.proposed.push((member, next));
        }
        scratch.shift_targets.clear();
        scratch
            .shift_targets
            .extend(scratch.proposed.iter().map(|&(_, cell)| cell));
        scratch.shift_left.clear();
        scratch.shift_left.extend(
            (members.iter())
                .map(|&member| self.cells[member])
                .filter(|cell| !scratch.shift_targets.contains(cell)),
        );
        let displaced = (scratch.shift_targets.iter())
            .filter_map(|&cell| self.occupant[lattice][cell])
            .filter(|other| !members.contains(other));
        scratch
            .proposed
            .extend(displaced.zip(scratch.shift_left.iter().copied()));
        true
    }

    fn shifted_cell(
        &self,
        member: usize,
        lattice: usize,
        grid: Lattice,
        step: usize,
    ) -> Option<usize> {
        if self.parts[member].lattice != lattice {
            return None;
        }
        let cell = self.cells[member];
        let (column, row) = (cell % grid.columns, cell / grid.columns);
        let (column, row) = match step {
            0 => (column.checked_sub(1)?, row),
            1 => (column + 1, row),
            2 => (column, row.checked_sub(1)?),
            _ => (column, row + 1),
        };
        (column < grid.columns && row < grid.rows).then_some(row * grid.columns + column)
    }

    /// Make a move: each part to its cell, recording each moved part's old cell and box in `old`.
    fn make_into(&mut self, moves: &[(usize, usize)], old: &mut Vec<(usize, usize, Rect)>) {
        old.clear();
        old.extend(
            (moves.iter()).map(|&(part, _)| (part, self.cells[part], self.scene.boxes[part])),
        );
        for &(part, _, _) in old.iter() {
            let lattice = self.parts[part].lattice;
            self.occupant[lattice][self.cells[part]] = None;
        }
        for &(part, cell) in moves {
            let Part { lattice, size, .. } = self.parts[part];
            self.cells[part] = cell;
            self.occupant[lattice][cell] = Some(part);
            self.scene.boxes[part] = self.lattices[lattice].place(cell, size);
        }
    }

    fn undo(&mut self, old: &[(usize, usize, Rect)]) {
        for &(part, _, _) in old {
            self.occupant[self.parts[part].lattice][self.cells[part]] = None;
        }
        for &(part, cell, at) in old {
            self.cells[part] = cell;
            self.occupant[self.parts[part].lattice][cell] = Some(part);
            self.scene.boxes[part] = at;
        }
    }

    /// Stamp the lines that end on the moved parts, and list them into `lines`.
    fn stamp_moved(&mut self, old: &[(usize, usize, Rect)], lines: &mut Vec<usize>) {
        self.stamps += 1;
        lines.clear();
        for &(part, _, _) in old {
            for &line in &self.touching[part] {
                if self.stamp[line] != self.stamps {
                    self.stamp[line] = self.stamps;
                    lines.push(line);
                }
            }
        }
    }

    /// Whether the move under weighing moved a line.
    fn moved(&self, line: usize) -> bool {
        self.stamp[line] == self.stamps
    }

    /// What each line that stayed adds or saves to go round the moved parts, in the lines' order.
    ///
    /// A line runs round a moved part only where the box round its ends comes near the part,
    /// where the part stood or stands now.
    fn rounds(&self, scratch: &mut AnnealScratch) {
        scratch.change.rounds.clear();
        scratch.parts.clear();
        for &(part, _, was) in &scratch.old {
            scratch.parts.push(Edges::of(was));
            scratch.parts.push(Edges::of(self.scene.boxes[part]));
        }
        let Some(all) = scratch.parts.iter().copied().reduce(Edges::round) else {
            return;
        };
        let words = self.bounds.len().div_ceil(64);
        scratch.near.clear();
        scratch.near.resize(words, 0);
        for part in &scratch.parts {
            self.near.add(part, &mut scratch.near);
        }
        for word in 0..words {
            self.collect_round_word(word, scratch.near[word], &all, scratch);
        }
    }

    fn collect_round_word(
        &self,
        word: usize,
        mut near: u64,
        all: &Edges,
        scratch: &mut AnnealScratch,
    ) {
        while near != 0 {
            let line = word * 64 + near.trailing_zeros() as usize;
            near &= near - 1;
            if self.line_near_moved(line, all, &scratch.parts) {
                let added = self.round_delta(line, &scratch.old);
                if added != 0.0 {
                    scratch.change.rounds.push((line, added));
                }
            }
        }
    }

    fn line_near_moved(&self, line: usize, all: &Edges, parts: &[Edges]) -> bool {
        let bounds = &self.bounds[line];
        bounds.near(all) && !self.moved(line) && parts.iter().any(|at| bounds.near(at))
    }

    fn round_delta(&self, line: usize, old: &[(usize, usize, Rect)]) -> f64 {
        let sketch = &self.weighed.sketches[line];
        (old.iter())
            .filter(|&&(part, _, _)| self.scene.blocks(line, part))
            .map(|&(part, _, was)| sketch.round(self.scene.boxes[part]) - sketch.round(was))
            .sum()
    }

    /// The groups of the moved parts, and how far apart each group stands now.
    fn regroup(&self, scratch: &mut AnnealScratch) {
        scratch.group_ids.clear();
        for &(part, _, _) in &scratch.old {
            scratch.group_ids.extend_from_slice(&self.grouped[part]);
        }
        scratch.group_ids.sort_unstable();
        scratch.group_ids.dedup();
        scratch.change.groups.clear();
        for &group in &scratch.group_ids {
            let spread = self
                .scene
                .spread_with(group, &mut scratch.xs, &mut scratch.ys);
            scratch.change.groups.push((group, spread));
        }
    }

    /// What a made move changes, all but the new sketches of the lines it moved and the
    /// crossings they make now.
    fn change(&mut self, scratch: &mut AnnealScratch) {
        self.stamp_moved(&scratch.old, &mut scratch.change.lines);
        self.rounds(scratch);
        let ended = self
            .crossing
            .begin(&self.scene, scratch.change.lines.iter().copied());
        self.regroup(scratch);
        scratch.change.fresh.clear();
        scratch.change.crossings = (0, ended);
    }

    /// Sum of `cost - weighed.own[line]` across moved lines in order.
    fn lines_delta(&self, lines: &[usize], costs: &[f64]) -> f64 {
        (lines.iter().zip(costs))
            .map(|(&line, &cost)| cost - self.weighed.own[line])
            .sum()
    }

    /// What a line costs at least where its boxes stand: its cheapest way with nothing in its
    /// way, less a margin.
    fn least(&self, line: usize) -> f64 {
        self.scene.bare(line) - SLACK
    }

    /// Count the crossings of the lines a made move moved, then sketch them, one line at a time,
    /// and tell what the move adds to the total and the draw made for it, if any.
    ///
    /// A move that costs more stands when a draw falls below how much its rise weighs at the
    /// heat. Until a line is counted it makes no crossing, and until it is sketched it costs its
    /// cheapest way with nothing in its way, which is no more than it does. Where even that least
    /// rise weighs too much for the draw, the move loses it before the rest is weighed: `None`.
    /// The margin holds against any rounding of the weight. The draw is the one the search makes
    /// for that move anyway, so no walk of the search changes.
    fn weigh(&mut self, scratch: &mut AnnealScratch, heat: f64) -> Option<(f64, Option<f64>)> {
        let change = &mut scratch.change;
        let costs = &mut scratch.costs;
        costs.clear();
        costs.extend(change.lines.iter().map(|&line| self.least(line)));
        change.fresh.clear();
        let rounds_sum: f64 = change.rounds.iter().map(|&(_, added)| added).sum();
        let groups_sum: f64 = (change.groups.iter())
            .map(|&(group, spread)| spread - self.weighed.spread[group])
            .sum();
        let mut lines_sum = self.lines_delta(&change.lines, costs);
        let lines = change.lines.len();
        let mut drawn = None;
        // Counting first ends more moves early than sketching first.
        for step in 0..=2 * lines {
            let (made, ended) = change.crossings;
            let rise =
                lines_sum + rounds_sum + CROSSING * (made as f64 - ended as f64) + groups_sum;
            if rise > 0.0 && heat > 0.0 {
                let chance = *drawn.get_or_insert_with(|| self.chance());
                if chance > (-rise / heat).exp() * (1.0 + 1e-9) + 1e-12 {
                    return None;
                }
            }
            match step.cmp(&lines) {
                Ordering::Less => change.crossings.0 += self.crossing.count(step),
                Ordering::Equal => change.crossings.0 += self.crossing.pairs(),
                Ordering::Greater => {
                    let idx = change.fresh.len();
                    let line = change.lines[idx];
                    let (sketch, cost) = self.scene.sketch(line);
                    costs[idx] = cost;
                    change.fresh.push((sketch, self.scene.chord(line), cost));
                    lines_sum = self.lines_delta(&change.lines, costs);
                }
            }
        }
        let (made, ended) = change.crossings;
        let delta = lines_sum + rounds_sum + CROSSING * (made as f64 - ended as f64) + groups_sum;
        Some((delta, drawn))
    }

    fn keep(&mut self, delta: f64, change: &Change) {
        self.crossing.keep();
        let weighed = &mut self.weighed;
        for (&line, &(sketch, chord, cost)) in change.lines.iter().zip(&change.fresh) {
            self.bounds[line] = Edges::line(&self.scene, line);
            self.near.set(line, &self.bounds[line]);
            weighed.sketches[line] = sketch;
            weighed.chords[line] = chord;
            weighed.own[line] = cost;
        }
        for &(line, added) in &change.rounds {
            weighed.own[line] += added;
        }
        let (made, ended) = change.crossings;
        weighed.crossings = weighed.crossings + made - ended;
        for &(group, spread) in &change.groups {
            weighed.spread[group] = spread;
        }
        self.total += delta;
    }

    /// The mean rise of random moves, which the search starts as hot as.
    fn heat(&mut self, scratch: &mut AnnealScratch) -> f64 {
        let mut sum = 0.0;
        let mut count = 0usize;
        for _ in 0..SAMPLES {
            self.propose(scratch);
            if scratch.proposed.is_empty() {
                continue;
            }
            self.make_into(&scratch.proposed, &mut scratch.old);
            self.change(scratch);
            let weighed = self.weigh(scratch, 0.0);
            self.undo(&scratch.old);
            let delta = weighed.map_or(0.0, |(delta, _)| delta);
            if delta > 0.0 {
                sum += delta;
                count += 1;
            }
        }
        sum / count.max(1) as f64
    }

    /// Anneal for some moves, from a share of the first heat, and end on the cheapest
    /// placement met.
    pub(super) fn anneal(&mut self, moves: usize, warmth: f64) {
        if self.parts.len() < 2 {
            return;
        }
        let mut scratch = AnnealScratch::default();
        let start = self.heat(&mut scratch) * warmth;
        let mut best_total = self.total;
        let mut best_cells = self.cells.clone();
        for step in 0..moves {
            let heat = start * COOLING.powf(step as f64 / moves as f64);
            self.propose(&mut scratch);
            if scratch.proposed.is_empty() {
                continue;
            }
            self.make_into(&scratch.proposed, &mut scratch.old);
            self.change(&mut scratch);
            let Some((delta, drawn)) = self.weigh(&mut scratch, heat) else {
                self.undo(&scratch.old);
                continue;
            };
            if delta <= 0.0
                || (heat > 0.0 && drawn.unwrap_or_else(|| self.chance()) < (-delta / heat).exp())
            {
                self.keep(delta, &scratch.change);
                if self.total < best_total - 1e-6 {
                    best_total = self.total;
                    best_cells.copy_from_slice(&self.cells);
                }
            } else {
                self.undo(&scratch.old);
            }
        }
        scratch.proposed.clear();
        scratch
            .proposed
            .extend(best_cells.iter().copied().enumerate());
        self.make_into(&scratch.proposed, &mut scratch.old);
        self.reweigh();
    }
}
