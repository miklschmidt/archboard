//! A flowchart laid out from the structure of its flow (ADR 0073), with no
//! solve: a flow is a run of blocks, and each block is a box, a decision or a
//! loop, so where every box stands and where every line runs follows from the
//! blocks alone.
//!
//! A run of blocks stacks on one axis, so a run of steps reads as one straight
//! line, and steps that follow each other stack close with no line between
//! them. A decision stands its answers side by side below its diamond: the
//! first leaves the diamond's left point, the last its right point, and any
//! other its foot, but the taller of two answers runs straight on down out of
//! the foot. Each answer keeps its own spacing, and its loose ends drop below
//! the longest answer and join on the diamond's axis. A guard, a decision whose
//! one answer is far longer, carries the run on below its diamond and stands
//! its short answer beside the run, down to a jump. A loop stands the blocks it
//! repeats below its hexagon and runs the line back up on their left and the
//! line out on their right; a long body jumps back to the hexagon instead, and
//! the run jumps on from beside the hexagon when it is done.
//!
//! A run taller than the column height it is given breaks into columns side by
//! side, between two of its blocks and never next to a terminal or in front of
//! a decision, each column as short as that many columns can be. The foot of
//! one column ends at a jump that the next column starts at. Each block is laid
//! out in its own frame of reference, the top left corner of its box at the
//! origin, and moved into place by the block that holds it.

use std::collections::HashMap;

use archboard_scene::drawing::MeasuredLabel;
use archboard_scene::geometry::{BEND_RADIUS, Point, Rect};
use archboard_scene::request::JumpEnd;

use super::graph::Block;

/// The words of a loop's line into the steps it repeats.
pub(super) const REPEAT: &str = "repeat";
/// The words of a loop's line out once it is done.
pub(super) const DONE: &str = "done";

/// The room between two blocks of a run, which the line between them crosses.
const STEP_GAP: f64 = 24.0;
/// The room between two steps that follow each other, which stack with no
/// line between them.
const STACK_GAP: f64 = 4.0;
/// The room between two columns of a run.
const COLUMN_GAP: f64 = 48.0;
/// How far a line runs straight before and after a bend that turns it once:
/// a bend and as long a straight again.
const RUN: f64 = 2.0 * BEND_RADIUS;
/// How wide and tall a jump in is: a disc.
const JUMP_IN: f64 = 30.0;
/// How wide a jump out is across its line, and how long along it, its point
/// included.
const JUMP_OUT: (f64, f64) = (30.0, 36.0);
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
    /// Whether it ends on another line, which it joins with no arrowhead,
    /// rather than in a node.
    pub joins: bool,
}

impl Run {
    /// A loose end out of a node, along points.
    fn out_of(from: &str, words: Option<(MeasuredLabel, Rect)>, points: Vec<Point>) -> Run {
        Run {
            from: from.to_owned(),
            to: String::new(),
            words,
            points,
            joins: false,
        }
    }
}

/// One end of a jump as it is laid out.
#[derive(Clone, Debug)]
pub(super) struct Marker {
    /// The marker's own id.
    pub id: String,
    /// The jump it is an end of: the id of the jump's in.
    pub jump: String,
    /// Which end it is.
    pub end: JumpEnd,
    /// Where it stands.
    pub bounds: Rect,
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
    /// Every end of a jump the block holds.
    pub markers: Vec<Marker>,
    /// Every line that starts and ends in the block.
    pub runs: Vec<Run>,
    /// The lines out of the block, where they stand, for the block that holds
    /// it to carry on to whatever comes next.
    pub ends: Vec<Run>,
    /// The lines that end on the run's line, to enter whatever comes next.
    pub joins: Vec<Run>,
    /// How many times a run of blocks in it broke into another column.
    pub breaks: usize,
    /// Whether it is a step, which stacks on a step before it.
    pub stacks: bool,
    /// Whether the run's line runs straight on through it, entering nothing.
    pub passes: bool,
    /// Whether its line out ends beside it, for the run to jump on from below it.
    pub jumps_on: bool,
}

impl Default for Laid {
    fn default() -> Self {
        Laid {
            width: 0.0,
            height: 0.0,
            entry: at(0.0, 0.0),
            head: String::new(),
            boxes: Vec::new(),
            markers: Vec::new(),
            runs: Vec::new(),
            ends: Vec::new(),
            joins: Vec::new(),
            breaks: 0,
            stacks: false,
            passes: false,
            jumps_on: false,
        }
    }
}

impl Laid {
    /// A shape on its block's axis at the origin, its top at the top: a
    /// decision's diamond or a loop's hexagon, with nothing below it yet.
    fn shape(id: &str, width: f64, height: f64) -> Laid {
        Laid {
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
            ..Laid::default()
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
            .map(|(_, bounds)| bounds)
            .chain(self.markers.iter_mut().map(|marker| &mut marker.bounds))
            .for_each(shift_box);
        for run in self
            .runs
            .iter_mut()
            .chain(&mut self.ends)
            .chain(&mut self.joins)
        {
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
        self.markers.extend(inner.markers);
        self.runs.extend(inner.runs);
        self.breaks += inner.breaks;
        inner.ends
    }

    /// One end of a jump in the block.
    fn mark(&mut self, id: &str, jump: &str, end: JumpEnd, bounds: Rect) {
        self.markers.push(Marker {
            id: id.to_owned(),
            jump: jump.to_owned(),
            end,
            bounds,
        });
    }

    /// How far down the block reaches: its foot, or lower where a guard's
    /// short answer hangs beside the blocks after it. Every block's entry is
    /// at its top.
    fn bottom(&self) -> f64 {
        self.boxes
            .iter()
            .map(|(_, bounds)| bounds)
            .chain(self.markers.iter().map(|marker| &marker.bounds))
            .map(|bounds| bounds.y + bounds.height)
            .fold(self.entry.y + self.height, f64::max)
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

/// A box of a size, its top left corner at a point.
fn rect(corner: Point, (width, height): (f64, f64)) -> Rect {
    Rect {
        x: corner.x,
        y: corner.y,
        width,
        height,
    }
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

/// Where the lowest of some loose ends stands.
fn lowest(ends: &[Run]) -> Option<Point> {
    ends.iter()
        .map(last)
        .max_by(|one, other| one.y.total_cmp(&other.y))
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

/// The room between two blocks one under the other, by whether each stacks:
/// close between two steps, a line's room otherwise.
fn gap(above: bool, below: bool) -> f64 {
    if above && below { STACK_GAP } else { STEP_GAP }
}

/// How many blocks of a run stand in each column when each column takes as
/// many as fit under a height, at least one. A column never holds a terminal
/// alone, and never breaks in front of a decision, which stays at the foot of
/// the steps that lead to it, or of a landing, which stays with the blocks it
/// follows.
fn fill(blocks: &[Block], laid: &[Laid], column: f64) -> Vec<usize> {
    let mut columns = vec![0];
    let mut height = 0.0;
    for (index, block) in laid.iter().enumerate() {
        let held = columns.last().copied().unwrap_or(0);
        let grown = if held == 0 {
            block.height
        } else {
            height + gap(laid[index - 1].stacks, block.stacks) + block.height
        };
        let breaks = grown > column && may_break(blocks, index, held);
        if breaks {
            columns.push(0);
        }
        // A column after a break starts at the jump in from the one before.
        height = if breaks {
            JUMP_IN + STEP_GAP + block.height
        } else {
            grown
        };
        if let Some(count) = columns.last_mut() {
            *count += 1;
        }
    }
    columns
}

/// Whether a run may break into a new column in front of one of its blocks,
/// with a count of blocks in the column so far.
fn may_break(blocks: &[Block], index: usize, held: usize) -> bool {
    let terminal = |index: usize| matches!(blocks.get(index), Some(Block::Terminal(_)));
    let alone =
        (held == 1 && terminal(index - 1)) || (index == blocks.len() - 1 && terminal(index));
    let follows = matches!(
        blocks[index],
        Block::Decision { .. } | Block::Guard { .. } | Block::Land(_)
    );
    held > 0 && !alone && !follows
}

/// How far the blocks after a guard reach out from the run's axis on one side,
/// as far down below the guard as its short answer hangs beside them.
fn beside<'a>(after: impl Iterator<Item = &'a Laid>, left: bool, depth: f64) -> f64 {
    let mut reach = 0.0;
    let mut top = STEP_GAP;
    let mut above: Option<&Laid> = None;
    for block in after {
        if let Some(above) = above {
            top += above.height + gap(above.stacks, block.stacks);
        }
        if top >= depth {
            break;
        }
        let out = if left {
            block.entry.x
        } else {
            block.width - block.entry.x
        };
        reach = f64::max(reach, out);
        above = Some(block);
    }
    reach
}

/// A run of blocks as it is stacked: what it holds so far, the lines out of
/// its last block, and where its next column starts.
struct Stack {
    chain: Laid,
    /// The lines out of the last block placed.
    open: Vec<Run>,
    /// The lines that end on the run's line, to enter the next block placed.
    joins: Vec<Run>,
    /// The node of the last block placed, which names a jump after it.
    last: String,
    /// Whether the last block placed jumps on.
    jumps_on: bool,
    /// Where the next column's left edge stands.
    left: f64,
    /// The last column's axis.
    axis: f64,
}

impl Stack {
    /// One column of blocks on one axis, every line into each of them drawn.
    /// A column after the first starts at the jump from the foot of the one
    /// before.
    fn column(&mut self, column: Vec<Laid>, first: bool) {
        let axis = self.left + most(column.iter().map(|block| block.entry.x));
        let right = axis + most(column.iter().map(|block| block.width - block.entry.x));
        self.axis = axis;
        let mut y = 0.0;
        let mut above: Option<(bool, f64)> = None;
        for (index, block) in column.into_iter().enumerate() {
            if let Some((stacks, foot)) = above {
                y = foot + gap(stacks, block.stacks);
                if stacks && block.stacks {
                    // A step on a step before it: no line between them.
                    self.open.clear();
                }
            }
            if (index == 0 && !first) || self.jumps_on {
                y += self.jump(at(axis, y));
            }
            let offset = at(axis - block.entry.x, y);
            let block = block.moved(offset);
            above = Some((block.stacks, y + block.height));
            self.chain.height = self.chain.height.max(block.bottom());
            self.jumps_on = block.jumps_on;
            self.place(block);
        }
        self.chain.width = right;
        self.left = right + COLUMN_GAP;
    }

    /// The lines out of the last block end at a jump out, and the run goes on
    /// from the jump's in at a point: how far the in and the room below it
    /// reach down from that point. A line out that ends beside its block ends
    /// at a tag that points on across; any other at a tag below its end.
    fn jump(&mut self, resume: Point) -> f64 {
        let (out, into) = (format!("{}~out", self.last), format!("{}~in", self.last));
        let foot = lowest(&self.open).unwrap_or_else(|| at(self.axis, self.chain.height));
        let (end, bounds, enters) = if self.jumps_on {
            let (across, along) = JUMP_OUT;
            let bounds = rect(at(foot.x, foot.y - across / 2.0), (along, across));
            (JumpEnd::OutRight, bounds, foot)
        } else {
            let top = at(foot.x, foot.y + STEP_GAP);
            let bounds = rect(at(top.x - JUMP_OUT.0 / 2.0, top.y), JUMP_OUT);
            (JumpEnd::OutDown, bounds, top)
        };
        self.chain.mark(&out, &into, end, bounds);
        let open = std::mem::take(&mut self.open);
        self.chain.runs.extend(finished(open, enters, &out));
        for mut run in self.joins.drain(..) {
            out.clone_into(&mut run.to);
            self.chain.runs.push(run);
        }
        let disc = rect(at(resume.x - JUMP_IN / 2.0, resume.y), (JUMP_IN, JUMP_IN));
        self.chain.mark(&into, &into, JumpEnd::In, disc);
        self.chain.height = self
            .chain
            .height
            .max(bounds.y + bounds.height)
            .max(disc.y + disc.height);
        self.open.push(Run::out_of(
            &into,
            None,
            vec![at(resume.x, resume.y + JUMP_IN)],
        ));
        self.jumps_on = false;
        JUMP_IN + STEP_GAP
    }

    /// One block in its place, the lines out of the block before carried into it.
    fn place(&mut self, mut block: Laid) {
        self.last.clone_from(&block.head);
        if block.passes {
            let foot = block.entry.y + block.height;
            carried(&mut self.open, |end| vec![at(end.x, foot)]);
            self.joins.append(&mut block.joins);
            self.chain.hold(block);
            return;
        }
        for mut run in self.joins.drain(..) {
            block.head.clone_into(&mut run.to);
            self.chain.runs.push(run);
        }
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

    /// The run, its loose ends those of its last block. A run whose last
    /// block jumps on goes on from the jump's in at its foot.
    fn finish(mut self) -> Laid {
        if self.jumps_on {
            self.jump(at(self.axis, self.chain.height + STEP_GAP));
        }
        self.open.append(&mut self.joins);
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

    /// One block laid out, with the blocks after it in its run, laid out
    /// already, which a guard's short answer stands beside. A step stands as
    /// wide as a width.
    fn block<'a>(&self, block: &Block, width: f64, after: impl Iterator<Item = &'a Laid>) -> Laid {
        match block {
            Block::Step(id) => Laid {
                stacks: true,
                ..self.step(id, width)
            },
            Block::Terminal(id) => self.step(id, self.size(id).0),
            Block::Decision { id, answers } => self.decision(id, answers),
            Block::Loop { id, body, back } => match back {
                Some(back) => self.repeat_by_jumps(id, body, back),
                None => self.repeat(id, body),
            },
            Block::Guard {
                id,
                side,
                main,
                first,
                lands,
            } => self.guard(id, side, main, *first, lands, after),
            Block::Land(id) => branches::land(id),
        }
    }

    /// A box: a line enters the middle of its top and leaves the middle of its foot.
    fn step(&self, id: &str, width: f64) -> Laid {
        let height = self.size(id).1;
        let middle = width / 2.0;
        Laid {
            width,
            height,
            entry: at(middle, 0.0),
            head: id.to_owned(),
            boxes: vec![(id.to_owned(), rect(at(0.0, 0.0), (width, height)))],
            ends: vec![Run::out_of(id, None, vec![at(middle, height)])],
            ..Laid::default()
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
    /// those of its last block. Steps that follow each other stand as wide as
    /// the widest of them.
    pub(super) fn chain(&self, blocks: &[Block]) -> Laid {
        let width = |block: &Block| match block {
            Block::Step(id) => self.size(id).0,
            _ => 0.0,
        };
        let widths: Vec<f64> = blocks
            .chunk_by(|one, other| matches!((one, other), (Block::Step(_), Block::Step(_))))
            .flat_map(|stack| std::iter::repeat_n(most(stack.iter().map(width)), stack.len()))
            .collect();
        // Last to first, so that a guard knows the blocks after it.
        let mut laid: Vec<Laid> = Vec::with_capacity(blocks.len());
        for (block, width) in blocks.iter().zip(widths).rev() {
            let block = self.block(block, width, laid.iter().rev());
            laid.push(block);
        }
        laid.reverse();
        let columns = self.columns(blocks, &laid);
        let mut stack = Stack {
            chain: Laid {
                breaks: columns.len() - 1,
                ..Laid::default()
            },
            open: Vec::new(),
            joins: Vec::new(),
            last: String::new(),
            jumps_on: false,
            left: 0.0,
            axis: 0.0,
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
