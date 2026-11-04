//! How a run of blocks stands in columns: how many blocks each column
//! holds, and each column stacked on its axis, with a jump from the foot of
//! one column to the top of the next.

use archboard_scene::geometry::Point;
use archboard_scene::request::JumpEnd;

use super::{
    BALANCING, COLUMN_GAP, JUMP_IN, JUMP_OUT, Laid, Run, STEP_GAP, at, carried, finished, gap,
    lowest, most, rect,
};
use crate::flowchart::graph::Block;

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

/// How many blocks of a run stand in each column: as few columns as the
/// column height allows, each as short as that many columns can be.
pub(super) fn columns(blocks: &[Block], laid: &[Laid], column: f64) -> Vec<usize> {
    let greedy = fill(blocks, laid, column);
    if greedy.len() < 2 {
        return greedy;
    }
    // The least height that still holds the run in as many columns.
    let mut low = most(laid.iter().map(|block| block.height));
    let mut high = column;
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

/// A run of blocks as it is stacked: what it holds so far, the lines out of
/// its last block, and where its next column starts.
pub(super) struct Stack {
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
    /// A run with nothing stacked yet, that breaks a number of times.
    pub(super) fn new(breaks: usize) -> Stack {
        Stack {
            chain: Laid {
                breaks,
                ..Laid::default()
            },
            open: Vec::new(),
            joins: Vec::new(),
            last: String::new(),
            jumps_on: false,
            left: 0.0,
            axis: 0.0,
        }
    }

    /// One column of blocks on one axis, every line into each of them drawn.
    /// A column after the first starts at the jump from the foot of the one
    /// before.
    pub(super) fn column(&mut self, column: Vec<Laid>, first: bool) {
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
    pub(super) fn finish(mut self) -> Laid {
        if self.jumps_on {
            self.jump(at(self.axis, self.chain.height + STEP_GAP));
        }
        self.open.append(&mut self.joins);
        self.chain.ends = self.open;
        self.chain
    }
}
