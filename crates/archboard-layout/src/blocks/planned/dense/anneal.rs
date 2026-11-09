//! Which cell of its frame's grid each part takes: simulated annealing over the cells, from a
//! fixed seed, on what the scene costs (`super::sketch`). A move takes one part to another cell,
//! trading places with the part there, or shifts a whole group by one cell. Cells can stay empty.
//! A move that costs more stands by chance, less often as the search cools, so the search
//! leaves the first valley it finds. The search keeps the cheapest placement it met, which is
//! never dearer than where it started.

use crate::geometry::{Point, Rect};

use super::{
    crossing::Crossings,
    sketch::{CROSSING, Chord, Scene, Sketch, Weighed},
};

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

/// What a move changes, before it stands or is undone.
struct Change {
    /// Each line that ends on a moved part, with its new sketch, chord and cost.
    lines: Vec<Fresh>,
    /// What every other line adds or saves to go round the moved parts.
    rounds: Vec<(usize, f64)>,
    /// How many crossings the move makes, and how many it ends.
    crossings: (usize, usize),
    groups: Vec<(usize, f64)>,
}

/// A moved line: its new sketch, chord and cost.
type Fresh = (usize, Sketch, Chord, f64);

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
    /// Which lines cross which.
    crossing: Crossings,
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
        Search {
            total: weighed.total(),
            crossing: Crossings::new(&scene),
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

    /// A random move: each moved part and the cell it goes to.
    fn propose(&mut self) -> Vec<(usize, usize)> {
        if !self.scene.groups.is_empty() && self.random() % 100 < GROUP_MOVES {
            let group = self.below(self.scene.groups.len());
            let step = self.below(4);
            if let Some(moves) = self.shift(group, step) {
                return moves;
            }
        }
        let part = self.below(self.parts.len());
        let lattice = self.parts[part].lattice;
        let cell = self.below(self.lattices[lattice].cells());
        let from = self.cells[part];
        if cell == from {
            return Vec::new();
        }
        let mut moves = vec![(part, cell)];
        if let Some(other) = self.occupant[lattice][cell] {
            moves.push((other, from));
        }
        moves
    }

    /// Shift every member of a group one cell, if they share a grid and all stay on it. The
    /// parts in their way take the cells they leave.
    fn shift(&self, group: usize, step: usize) -> Option<Vec<(usize, usize)>> {
        let members = &self.scene.groups[group];
        let lattice = self.parts[*members.first()?].lattice;
        let grid = self.lattices[lattice];
        let mut moves = Vec::new();
        for &member in members {
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
            if column >= grid.columns || row >= grid.rows {
                return None;
            }
            moves.push((member, row * grid.columns + column));
        }
        let targets: Vec<usize> = moves.iter().map(|&(_, cell)| cell).collect();
        let left: Vec<usize> = (members.iter())
            .map(|&member| self.cells[member])
            .filter(|cell| !targets.contains(cell))
            .collect();
        let displaced = (targets.iter())
            .filter_map(|&cell| self.occupant[lattice][cell])
            .filter(|other| !members.contains(other));
        moves.extend(displaced.zip(left));
        Some(moves)
    }

    /// Make a move: each part to its cell. Returns each moved part's old cell and box.
    fn make(&mut self, moves: &[(usize, usize)]) -> Vec<(usize, usize, Rect)> {
        let old: Vec<(usize, usize, Rect)> = (moves.iter())
            .map(|&(part, _)| (part, self.cells[part], self.scene.boxes[part]))
            .collect();
        for &(part, _, _) in &old {
            let lattice = self.parts[part].lattice;
            self.occupant[lattice][self.cells[part]] = None;
        }
        for &(part, cell) in moves {
            let Part { lattice, size, .. } = self.parts[part];
            self.cells[part] = cell;
            self.occupant[lattice][cell] = Some(part);
            self.scene.boxes[part] = self.lattices[lattice].place(cell, size);
        }
        old
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

    /// Stamp the lines that end on the moved parts, and list them.
    fn stamp_moved(&mut self, old: &[(usize, usize, Rect)]) -> Vec<usize> {
        self.stamps += 1;
        let mut lines = Vec::new();
        for &(part, _, _) in old {
            for &line in &self.touching[part] {
                if self.stamp[line] != self.stamps {
                    self.stamp[line] = self.stamps;
                    lines.push(line);
                }
            }
        }
        lines
    }

    /// Whether the move under weighing moved a line.
    fn moved(&self, line: usize) -> bool {
        self.stamp[line] == self.stamps
    }

    /// What each line that stayed adds or saves to go round the moved parts.
    fn rounds(&self, old: &[(usize, usize, Rect)]) -> Vec<(usize, f64)> {
        (0..self.scene.lines.len())
            .filter(|&line| !self.moved(line))
            .filter_map(|line| {
                let sketch = &self.weighed.sketches[line];
                let added: f64 = (old.iter())
                    .filter(|&&(part, _, _)| self.scene.blocks(line, part))
                    .map(|&(part, _, was)| sketch.round(self.scene.boxes[part]) - sketch.round(was))
                    .sum();
                (added != 0.0).then_some((line, added))
            })
            .collect()
    }

    /// The groups of the moved parts, and how far apart each group stands now.
    fn regroup(&self, old: &[(usize, usize, Rect)]) -> Vec<(usize, f64)> {
        let mut groups: Vec<usize> = (old.iter())
            .flat_map(|&(part, _, _)| self.grouped[part].iter().copied())
            .collect();
        groups.sort_unstable();
        groups.dedup();
        (groups.into_iter())
            .map(|group| (group, self.scene.spread(group)))
            .collect()
    }

    /// What a made move changes, and what it adds to the total.
    fn change(&mut self, old: &[(usize, usize, Rect)]) -> (f64, Change) {
        let fresh: Vec<Fresh> = (self.stamp_moved(old).into_iter())
            .map(|line| {
                let (sketch, cost) = self.scene.sketch(line);
                (line, sketch, self.scene.chord(line), cost)
            })
            .collect();
        let rounds = self.rounds(old);
        let lines = fresh.iter().map(|&(line, ..)| line);
        let (made, ended) = self.crossing.weigh(&self.scene, lines);
        let groups = self.regroup(old);
        let weighed = &self.weighed;
        let delta = fresh
            .iter()
            .map(|&(line, _, _, cost)| cost - weighed.own[line])
            .sum::<f64>()
            + rounds.iter().map(|&(_, added)| added).sum::<f64>()
            + CROSSING * (made as f64 - ended as f64)
            + (groups.iter())
                .map(|&(group, spread)| spread - weighed.spread[group])
                .sum::<f64>();
        let change = Change {
            lines: fresh,
            rounds,
            crossings: (made, ended),
            groups,
        };
        (delta, change)
    }

    fn keep(&mut self, delta: f64, change: Change) {
        self.crossing.keep();
        let weighed = &mut self.weighed;
        for (line, sketch, chord, cost) in change.lines {
            weighed.sketches[line] = sketch;
            weighed.chords[line] = chord;
            weighed.own[line] = cost;
        }
        for (line, added) in change.rounds {
            weighed.own[line] += added;
        }
        let (made, ended) = change.crossings;
        weighed.crossings = weighed.crossings + made - ended;
        for (group, spread) in change.groups {
            weighed.spread[group] = spread;
        }
        self.total += delta;
    }

    /// The mean rise of random moves, which the search starts as hot as.
    fn heat(&mut self) -> f64 {
        let mut rises = Vec::new();
        for _ in 0..SAMPLES {
            let moves = self.propose();
            if moves.is_empty() {
                continue;
            }
            let old = self.make(&moves);
            let (delta, _) = self.change(&old);
            self.undo(&old);
            if delta > 0.0 {
                rises.push(delta);
            }
        }
        rises.iter().sum::<f64>() / rises.len().max(1) as f64
    }

    /// Anneal for some moves, from a share of the first heat, and end on the cheapest
    /// placement met.
    pub(super) fn anneal(&mut self, moves: usize, warmth: f64) {
        if self.parts.len() < 2 {
            return;
        }
        let start = self.heat() * warmth;
        let mut best = (self.total, self.cells.clone());
        for step in 0..moves {
            let heat = start * COOLING.powf(step as f64 / moves as f64);
            let proposed = self.propose();
            if proposed.is_empty() {
                continue;
            }
            let old = self.make(&proposed);
            let (delta, change) = self.change(&old);
            if delta <= 0.0 || (heat > 0.0 && self.chance() < (-delta / heat).exp()) {
                self.keep(delta, change);
                if self.total < best.0 - 1e-6 {
                    best = (self.total, self.cells.clone());
                }
            } else {
                self.undo(&old);
            }
        }
        let moves: Vec<(usize, usize)> = best.1.iter().copied().enumerate().collect();
        self.make(&moves);
        self.reweigh();
    }
}
