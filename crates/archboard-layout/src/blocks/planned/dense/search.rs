//! Where the parts of a reading's frames stand. The grid's own short search answers first. A
//! wider search then moves the parts between cells (`super::anneal`) for a few rounds, each
//! cooler than the last, and the doors stand round the frames again after each round
//! (`super::ring`). The cheapest placement after any round wins.

use std::collections::BTreeMap;

use rustc_hash::FxHashMap;

use crate::{
    constants::CONTAINER_INSET,
    geometry::{Point, Rect},
};

use super::{
    Block, CELL_GAP, Reading,
    anneal::{Lattice, Part, Search},
    grid::Grid,
    readable, ring,
    sketch::{Line, Scene},
    together,
};

/// How many moves one round of the search makes for each part.
const MOVES: usize = 300;
/// How warm each round of the search starts, as a share of its first heat. A later round starts
/// cooler, from where the round before it ended and the doors then stood.
const ROUNDS: [f64; 3] = [1.0, 0.3, 0.1];

/// A reading's scene, and the box of each of its doors in it.
pub(super) struct Staged {
    pub scene: Scene,
    pub doors: Vec<usize>,
}

/// A scene while it is built: the box that ends lines at each card, the block that holds each
/// part, and each frame's outline and the foot of its tab, with its block.
#[derive(Default)]
struct Stage<'r> {
    scene: Scene,
    ends: FxHashMap<&'r str, usize>,
    held: FxHashMap<&'r str, usize>,
    feet: FxHashMap<&'r str, (usize, usize, usize)>,
}

impl<'r> Stage<'r> {
    fn push(&mut self, at: Rect, solid: bool, within: Option<usize>) -> usize {
        self.scene.boxes.push(at);
        self.scene.solid.push(solid);
        self.scene.within.push(within);
        self.scene.boxes.len() - 1
    }

    /// A frame's outline ends the lines from outside it, the foot of its tab those from inside.
    fn frame(&mut self, (index, block): (usize, &'r Block<'_>), at: Rect) {
        let frame = self.scene.frames.len();
        self.scene.frames.push(at);
        let tab = Rect {
            width: block.tab.x,
            height: block.tab.y,
            ..at
        };
        let outline = self.push(at, false, Some(frame));
        self.push(tab, true, Some(frame));
        let foot = Rect {
            y: tab.y + tab.height,
            height: 0.0,
            ..tab
        };
        let foot = self.push(foot, false, Some(frame));
        self.feet.insert(&block.frame.id, (outline, foot, index));
    }

    /// The box that ends a line at one card, from the card at its other end.
    fn end(&self, id: &str, other: &str) -> Option<usize> {
        let Some(&(outline, foot, frame)) = self.feet.get(id) else {
            return self.ends.get(id).copied();
        };
        Some(if self.held.get(other) == Some(&frame) {
            foot
        } else {
            outline
        })
    }

    /// Every line of a graph between two boxes of the scene.
    fn lines(&mut self, graph: &crate::graph::Node) {
        for edge in graph.edges.iter().flatten() {
            let (source, target) = (edge.source(), edge.target());
            if let (Some(from), Some(to)) = (self.end(source, target), self.end(target, source))
                && from != to
            {
                let plate = edge.label().and_then(|label| label.height).unwrap_or(0.0);
                self.scene.lines.push(Line { from, to, plate });
            }
        }
    }
}

impl Reading<'_> {
    /// The scene of a placement, from its parts in the order of the blocks' items and each
    /// block's frame. Its first boxes are the parts, then each frame's outline, tab and the foot
    /// of its tab, then the doors, which stand nowhere yet.
    pub(super) fn scene(&self, parts: &[Rect], frames: &[Rect]) -> Staged {
        let mut stage = Stage::default();
        let mut groups: BTreeMap<&str, Vec<usize>> = BTreeMap::new();
        let items = (self.blocks.iter().enumerate())
            .flat_map(|(index, block)| block.items.iter().map(move |item| (index, block, item)));
        for ((index, block, item), &part) in items.zip(parts) {
            let at = stage.push(part, true, block.framed.then_some(index));
            stage.ends.insert(&item.node.id, at);
            stage.held.insert(&item.node.id, index);
            for group in &item.groups {
                groups.entry(group).or_default().push(at);
            }
        }
        let framed =
            (self.blocks.iter().enumerate().zip(frames)).filter(|((_, block), _)| block.framed);
        for (block, &at) in framed {
            stage.frame(block, at);
        }
        let mut doors = Vec::new();
        for door in &self.doors {
            let at = Rect {
                x: 0.0,
                y: 0.0,
                width: door.w(),
                height: door.h(),
            };
            let at = stage.push(at, true, None);
            stage.ends.insert(&door.id, at);
            doors.push(at);
        }
        stage.lines(self.graph);
        let mut scene = stage.scene;
        scene.groups = groups
            .into_values()
            .filter(|members| members.len() > 1)
            .collect();
        Staged { scene, doors }
    }

    /// Where each frame's parts stand on a grid of some columns, its frames in a row or a stack:
    /// the cheapest placement that a search of at most some moves a round meets, and what it
    /// costs. The search starts from some grids, or else from the grid's own answer.
    pub(super) fn search(
        &self,
        (columns, stacked): (usize, bool),
        room: f64,
        moves: usize,
        from: Option<&[Grid]>,
    ) -> (f64, Vec<Grid>) {
        let starts: Vec<Grid> = from.map_or_else(
            || {
                (self.blocks.iter())
                    .map(|block| block.settled(columns))
                    .collect()
            },
            <[Grid]>::to_vec,
        );
        let pitches: Vec<Point> = self.blocks.iter().map(|block| block.pitch(room)).collect();
        let sizes: Vec<Point> = (self.blocks.iter().zip(&starts).zip(&pitches))
            .map(|((block, grid), &pitch)| block.extent(grid, pitch, room))
            .collect();
        let (places, whole) = together(&sizes, stacked, room);
        let lattices: Vec<Lattice> = (self.blocks.iter().zip(&starts))
            .zip(pitches.iter().zip(&places))
            .map(|((block, grid), (&pitch, at))| Lattice {
                origin: Point {
                    x: at.x + CONTAINER_INSET,
                    y: at.y + block.first_row,
                },
                pitch,
                columns: grid.columns,
                rows: grid.rows,
            })
            .collect();
        let parts: Vec<Part> = (self.blocks.iter().enumerate())
            .flat_map(|(lattice, block)| block.items.iter().map(move |item| (lattice, item.node)))
            .enumerate()
            .map(|(at, (lattice, node))| Part {
                at,
                lattice,
                size: Point {
                    x: node.w(),
                    y: node.h(),
                },
            })
            .collect();
        let frames: Vec<Rect> = (places.iter().zip(&sizes))
            .map(|(at, size)| Rect {
                x: at.x,
                y: at.y,
                width: size.x,
                height: size.y,
            })
            .collect();
        let nowhere = Rect {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
        };
        let Staged { scene, doors } = self.scene(&vec![nowhere; parts.len()], &frames);
        let cells = starts
            .iter()
            .flat_map(|grid| grid.cells.iter().copied())
            .collect();
        let bounds = Rect {
            x: 0.0,
            y: 0.0,
            width: whole.x,
            height: whole.y,
        };
        let gap = ring::RING_GAP + room;
        let mut search = Search::new(scene, &parts, &lattices, cells);
        ring::stand(&mut search.scene, &doors, bounds, gap, readable());
        search.reweigh();
        let mut best = (search.total(), search.cells.clone());
        let rounds = if doors.is_empty() {
            &ROUNDS[..1]
        } else {
            &ROUNDS[..]
        };
        // A search that goes on from an earlier one starts as cool as that one's second round.
        let cooled = if from.is_some() { ROUNDS[1] } else { 1.0 };
        for &warmth in rounds {
            search.anneal(moves.min(MOVES * parts.len()), warmth * cooled);
            ring::stand(&mut search.scene, &doors, bounds, gap, readable());
            search.reweigh();
            if search.total() < best.0 {
                best = (search.total(), search.cells.clone());
            }
        }
        let mut cells = best.1.into_iter();
        let grids = (starts.into_iter())
            .map(|grid| {
                let count = grid.cells.len();
                Grid {
                    cells: cells.by_ref().take(count).collect(),
                    ..grid
                }
            })
            .collect();
        (best.0, grids)
    }
}

impl Block<'_> {
    /// One cell to the next in the search: the largest part and the room between cells.
    fn pitch(&self, room: f64) -> Point {
        let largest = |of: fn(&crate::graph::Node) -> f64| {
            self.items
                .iter()
                .map(|item| of(item.node))
                .fold(0.0, f64::max)
        };
        Point {
            x: largest(crate::graph::Node::w) + CELL_GAP + room,
            y: largest(crate::graph::Node::h) + CELL_GAP + room,
        }
    }

    /// The frame's size round a grid of cells one pitch apart.
    fn extent(&self, grid: &Grid, pitch: Point, room: f64) -> Point {
        let gap = CELL_GAP + room;
        Point {
            x: f64::max(
                2.0 * CONTAINER_INSET + grid.columns as f64 * pitch.x - gap,
                self.tab.x,
            ),
            y: self.first_row + grid.rows as f64 * pitch.y - gap + CONTAINER_INSET,
        }
    }
}
