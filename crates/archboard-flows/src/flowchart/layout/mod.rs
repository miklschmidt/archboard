//! A flowchart laid out from the structure of its flow (ADR 0073), with no
//! solve: a flow is a run of blocks, and each block is a box, a decision or a
//! loop, so where every box stands and where every line runs follows from the
//! blocks alone.
//!
//! A run of blocks stacks on one axis, so a run of steps reads as one straight
//! line. A decision stands its answers side by side below its diamond: the
//! first leaves the diamond's left point, the last its right point, and any
//! other its foot. Each answer keeps its own spacing, and its loose ends drop
//! below the longest answer and join on the diamond's axis, so a short answer
//! ends at the top and its line runs on to the join. A loop stands the blocks
//! it repeats below its hexagon, runs the line back up on their left and the
//! line out on their right.
//!
//! A run taller than the column height it is given breaks into columns side by
//! side, between two of its blocks and never next to a terminal, each column
//! as short as that many columns can be. The line from the foot of one column
//! rises in the gap beside it and enters the next column from above. Each
//! block is laid out in its own frame of reference, the top left corner of its
//! box at the origin, and moved into place by the block that holds it.

use std::collections::HashMap;

use archboard_scene::drawing::MeasuredLabel;
use archboard_scene::geometry::{BEND_RADIUS, Point, Rect};

use super::graph::Block;

/// The words of a loop's line into the steps it repeats.
pub(super) const REPEAT: &str = "repeat";
/// The words of a loop's line out once it is done.
pub(super) const DONE: &str = "done";

/// The room between two blocks of a run, which the line between them crosses.
const STEP_GAP: f64 = 24.0;
/// The room between two columns of a run; the line to the next column rises
/// in its middle.
const COLUMN_GAP: f64 = 48.0;
/// How far a line runs straight before and after a bend that turns it once:
/// a bend and as long a straight again.
const RUN: f64 = 2.0 * BEND_RADIUS;
/// How far above the columns of a broken run the line to the next column runs:
/// a bend down from it and the straight run an arrowhead needs.
const RISE: f64 = 4.0 * BEND_RADIUS;
/// How many halvings settle the least column height that holds a run in as
/// many columns.
const BALANCING: u32 = 24;

/// One line as it is laid out: the node it leaves, the node it enters once
/// that is known, its words, and the corners it turns at.
#[derive(Clone, Debug)]
pub(super) struct Run {
    /// The node the line leaves.
    pub from: String,
    /// The node the line enters; empty while it is a loose end.
    pub to: String,
    /// Its words and where they stand on it.
    pub words: Option<(MeasuredLabel, Rect)>,
    /// Where it starts, every corner it turns at, and where it ends.
    pub points: Vec<Point>,
}

/// A block laid out in its own frame of reference: the top left corner of its
/// box at the origin.
#[derive(Clone, Debug)]
pub(super) struct Laid {
    /// How wide the block is.
    pub width: f64,
    /// How tall the block is.
    pub height: f64,
    /// Where a line into the block ends.
    pub entry: Point,
    /// The node a line into the block enters.
    pub head: String,
    /// Every box and shape the block holds, by node.
    pub boxes: Vec<(String, Rect)>,
    /// Every line that starts and ends in the block.
    pub runs: Vec<Run>,
    /// The lines out of the block, each run to its foot, for the block that
    /// holds it to carry on to whatever comes next.
    pub ends: Vec<Run>,
    /// How many times a run of blocks in it broke into another column.
    pub breaks: usize,
}

impl Laid {
    /// A shape on its block's axis at the origin, its top at the top: a
    /// decision's diamond or a loop's hexagon, with nothing below it yet.
    fn shape(id: &str, width: f64, height: f64) -> Laid {
        Laid {
            width: 0.0,
            height: 0.0,
            entry: at(0.0, 0.0),
            head: id.to_owned(),
            boxes: vec![(
                id.to_owned(),
                Rect {
                    x: -width / 2.0,
                    y: 0.0,
                    width,
                    height,
                },
            )],
            runs: Vec::new(),
            ends: Vec::new(),
            breaks: 0,
        }
    }

    /// The block moved by an offset.
    pub(super) fn moved(mut self, by: Point) -> Laid {
        let shift = |point: &mut Point| {
            point.x += by.x;
            point.y += by.y;
        };
        let shift_box = |bounds: &mut Rect| {
            bounds.x += by.x;
            bounds.y += by.y;
        };
        shift(&mut self.entry);
        self.boxes
            .iter_mut()
            .for_each(|(_, bounds)| shift_box(bounds));
        for run in self.runs.iter_mut().chain(&mut self.ends) {
            run.points.iter_mut().for_each(shift);
            run.words
                .iter_mut()
                .for_each(|(_, bounds)| shift_box(bounds));
        }
        self
    }

    /// Take in a block laid out inside this one, its loose ends left for the caller.
    fn hold(&mut self, inner: Laid) -> Vec<Run> {
        self.boxes.extend(inner.boxes);
        self.runs.extend(inner.runs);
        self.breaks += inner.breaks;
        inner.ends
    }

    /// The block finished at its extent, from its leftmost reach to its
    /// rightmost and down to a foot, moved so its left edge is at the origin.
    fn spanning(mut self, least: f64, most: f64, foot: f64) -> Laid {
        self.width = most - least;
        self.height = foot;
        self.moved(at(-least, 0.0))
    }
}

/// A point.
fn at(x: f64, y: f64) -> Point {
    Point { x, y }
}

/// Where a loose end stands now.
fn last(run: &Run) -> Point {
    run.points.last().copied().unwrap_or_else(|| at(0.0, 0.0))
}

/// Every loose end carried on into a node at a point: lines finished.
fn finished(ends: Vec<Run>, point: Point, head: &str) -> impl Iterator<Item = Run> {
    ends.into_iter().map(move |mut run| {
        run.points.push(point);
        head.clone_into(&mut run.to);
        run
    })
}

/// Every loose end carried on along points.
fn carried(ends: &mut [Run], points: impl Fn(Point) -> Vec<Point>) {
    for run in ends {
        let more = points(last(run));
        run.points.extend(more);
    }
}

/// The words of a line centred on a point.
fn words_at(words: &MeasuredLabel, centre: Point) -> (MeasuredLabel, Rect) {
    let bounds = Rect {
        x: centre.x - words.width / 2.0,
        y: centre.y - words.height / 2.0,
        width: words.width,
        height: words.height,
    };
    (words.clone(), bounds)
}

/// The largest of some numbers, or none.
fn most(values: impl Iterator<Item = f64>) -> f64 {
    values.fold(0.0, f64::max)
}

/// Carry a loose end from the foot of one column to the top of the next: down
/// from the block it leaves, or on along the join it runs on, to the gap
/// between the columns, up the gap, and over to the next column's axis. The
/// lowest it runs.
fn to_next_column(run: &mut Run, gap: f64, axis: f64) -> f64 {
    let foot = last(run);
    let sideways = run
        .points
        .len()
        .checked_sub(2)
        .and_then(|index| run.points.get(index))
        .is_some_and(|before| (before.y - foot.y).abs() < f64::EPSILON);
    let below = if sideways {
        // It came along a join to the axis: it runs on along the join instead.
        run.points.pop();
        foot.y
    } else {
        run.points.push(at(foot.x, foot.y + RUN));
        foot.y + RUN
    };
    run.points
        .extend([at(gap, below), at(gap, BEND_RADIUS), at(axis, BEND_RADIUS)]);
    below
}

/// How many blocks of a run stand in each column when each column takes as
/// many as fit under a height, at least one, and never a terminal alone.
fn fill(blocks: &[Block], laid: &[Laid], column: f64) -> Vec<usize> {
    let terminal = |index: usize| matches!(blocks.get(index), Some(Block::Terminal(_)));
    let mut columns = vec![0];
    let mut height = 0.0;
    for (index, block) in laid.iter().enumerate() {
        let held = columns.last().copied().unwrap_or(0);
        let grown = height + STEP_GAP + block.height;
        let breaks = held > 0
            && grown > column
            && !(held == 1 && terminal(index - 1))
            && !(index == laid.len() - 1 && terminal(index));
        if breaks {
            columns.push(0);
        }
        height = if breaks || held == 0 {
            block.height
        } else {
            grown
        };
        if let Some(count) = columns.last_mut() {
            *count += 1;
        }
    }
    columns
}

/// A run of blocks as it is stacked: what it holds so far, the lines out of
/// its last block, and where its next column starts.
struct Stack {
    chain: Laid,
    open: Vec<Run>,
    /// Where the next column's left edge stands.
    left: f64,
    /// Where each column's first block stands.
    top: f64,
}

impl Stack {
    /// One column of blocks on one axis, every line into each of them drawn.
    fn column(&mut self, column: Vec<Laid>, first: bool) {
        let axis = self.left + most(column.iter().map(|block| block.entry.x));
        let right = axis + most(column.iter().map(|block| block.width - block.entry.x));
        if !first {
            // The line from the foot of the column before rises in the gap
            // beside it and enters this column from above.
            let gap = self.left - COLUMN_GAP / 2.0;
            for run in &mut self.open {
                let below = to_next_column(run, gap, axis);
                self.chain.height = self.chain.height.max(below);
            }
        }
        let mut y = self.top;
        for block in column {
            let offset = at(axis - block.entry.x, y);
            y += block.height;
            self.place(block.moved(offset));
            self.chain.height = self.chain.height.max(y);
            y += STEP_GAP;
        }
        self.chain.width = right;
        self.left = right + COLUMN_GAP;
    }

    /// One block in its place, the lines out of the block before carried into it.
    fn place(&mut self, block: Laid) {
        if self.chain.head.is_empty() {
            self.chain.entry = block.entry;
            self.chain.head.clone_from(&block.head);
        }
        let open = std::mem::take(&mut self.open);
        self.chain
            .runs
            .extend(finished(open, block.entry, &block.head));
        self.open = self.chain.hold(block);
    }

    /// The run, its loose ends carried down to its foot.
    fn finish(mut self) -> Laid {
        let foot = self.chain.height;
        carried(&mut self.open, |end| {
            if end.y < foot {
                vec![at(end.x, foot)]
            } else {
                Vec::new()
            }
        });
        self.chain.ends = self.open;
        self.chain
    }
}

/// What a flowchart is laid out from: each node's size, each line's words
/// measured, and the tallest a column of a run may stand.
#[derive(Debug)]
pub(super) struct Layout<'a> {
    /// Each node's width and height.
    pub sizes: &'a HashMap<String, (f64, f64)>,
    /// Each line's words, measured, by what they say.
    pub words: &'a HashMap<String, MeasuredLabel>,
    /// How tall a column of a run may stand before the run breaks.
    pub column: f64,
}

impl Layout<'_> {
    /// A node's width and height.
    fn size(&self, id: &str) -> (f64, f64) {
        self.sizes.get(id).copied().unwrap_or((0.0, 0.0))
    }

    /// The words a line says, measured.
    fn words(&self, text: &str) -> &MeasuredLabel {
        &self.words[text]
    }

    /// One block laid out.
    fn block(&self, block: &Block) -> Laid {
        match block {
            Block::Step(id) | Block::Terminal(id) => self.step(id),
            Block::Decision { id, answers } => self.decision(id, answers),
            Block::Loop { id, body } => self.repeat(id, body),
        }
    }

    /// A box: a line enters the middle of its top and leaves the middle of its foot.
    fn step(&self, id: &str) -> Laid {
        let (width, height) = self.size(id);
        let middle = width / 2.0;
        Laid {
            width,
            height,
            entry: at(middle, 0.0),
            head: id.to_owned(),
            boxes: vec![(
                id.to_owned(),
                Rect {
                    x: 0.0,
                    y: 0.0,
                    width,
                    height,
                },
            )],
            runs: Vec::new(),
            ends: vec![Run {
                from: id.to_owned(),
                to: String::new(),
                words: None,
                points: vec![at(middle, height)],
            }],
            breaks: 0,
        }
    }

    /// How many blocks of a run stand in each column: as few columns as the
    /// column height allows, each as short as that many columns can be.
    fn columns(&self, blocks: &[Block], laid: &[Laid]) -> Vec<usize> {
        let greedy = fill(blocks, laid, self.column);
        if greedy.len() < 2 {
            return greedy;
        }
        // The least height that still holds the run in as many columns.
        let mut low = most(laid.iter().map(|block| block.height));
        let mut high = self.column;
        for _ in 0..BALANCING {
            let middle = f64::midpoint(low, high);
            if fill(blocks, laid, middle).len() <= greedy.len() {
                high = middle;
            } else {
                low = middle;
            }
        }
        fill(blocks, laid, high)
    }

    /// A run of blocks stacked on one axis in each column, its columns side by
    /// side, every line between two of its blocks drawn. Its loose ends are
    /// those of its last block, run to its foot.
    pub(super) fn chain(&self, blocks: &[Block]) -> Laid {
        let laid: Vec<Laid> = blocks.iter().map(|block| self.block(block)).collect();
        let columns = self.columns(blocks, &laid);
        let breaks = columns.len() - 1;
        let mut stack = Stack {
            chain: Laid {
                width: 0.0,
                height: 0.0,
                entry: at(0.0, 0.0),
                head: String::new(),
                boxes: Vec::new(),
                runs: Vec::new(),
                ends: Vec::new(),
                breaks,
            },
            open: Vec::new(),
            left: 0.0,
            top: if breaks > 0 { RISE } else { 0.0 },
        };
        let mut laid = laid.into_iter();
        for (number, count) in columns.into_iter().enumerate() {
            stack.column(laid.by_ref().take(count).collect(), number == 0);
        }
        stack.finish()
    }
}

mod branches;

#[cfg(test)]
mod tests;
