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

use super::graph::{Answer, Block};

/// The words of a loop's line into the steps it repeats.
pub(super) const REPEAT: &str = "repeat";
/// The words of a loop's line out once it is done.
pub(super) const DONE: &str = "done";

/// The room between two blocks of a run, which the line between them crosses.
const STEP_GAP: f64 = 24.0;
/// The least room between two answers side by side, and between a loop's
/// steps and its lines beside them.
const ANSWER_GAP: f64 = 32.0;
/// The room between two columns of a run; the line to the next column rises
/// in its middle.
const COLUMN_GAP: f64 = 48.0;
/// How far a line runs straight before and after a bend that turns it once:
/// a bend and as long a straight again.
const RUN: f64 = 2.0 * BEND_RADIUS;
/// The room above an answer's words, below the diamond.
const WORDS_ABOVE: f64 = 12.0;
/// The room below an answer's words, above the step the answer reaches.
const WORDS_BELOW: f64 = 16.0;
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

/// One answer of a decision laid out: its words, and its blocks if it has any.
struct Lane<'a> {
    words: &'a MeasuredLabel,
    blocks: Option<Laid>,
}

impl Lane<'_> {
    /// How far the answer reaches left of the line it runs down on.
    fn left(&self) -> f64 {
        let blocks = self.blocks.as_ref().map_or(0.0, |laid| laid.entry.x);
        blocks.max(self.words.width / 2.0)
    }

    /// How far the answer reaches right of the line it runs down on.
    fn right(&self) -> f64 {
        let blocks = self
            .blocks
            .as_ref()
            .map_or(0.0, |laid| laid.width - laid.entry.x);
        blocks.max(self.words.width / 2.0)
    }
}

/// Which answers of a decision leave its foot: all but the first and the last
/// when there are two or more, which leave its side points.
fn from_foot(count: usize) -> std::ops::Range<usize> {
    if count >= 2 { 1..count - 1 } else { 0..count }
}

/// Where each answer of a decision runs down, from the diamond's axis: those
/// out of its foot side by side and centred under it, the first and last
/// beyond them and beyond the diamond's side points by a bend.
fn answer_axes(lanes: &[Lane<'_>], half: f64) -> Vec<f64> {
    let count = lanes.len();
    let foot = from_foot(count);
    let mut axes = vec![0.0; count];
    let mut x = 0.0;
    for index in foot.clone() {
        x += lanes[index].left();
        axes[index] = x;
        x += lanes[index].right() + ANSWER_GAP;
    }
    let centre = if foot.is_empty() {
        0.0
    } else {
        f64::midpoint(axes[foot.start], axes[foot.end - 1])
    };
    foot.clone().for_each(|index| axes[index] -= centre);
    if count < 2 {
        return axes;
    }
    let (inner_left, inner_right) = if foot.is_empty() {
        (-ANSWER_GAP / 2.0, ANSWER_GAP / 2.0)
    } else {
        let (first, last) = (foot.start, foot.end - 1);
        (
            axes[first] - lanes[first].left() - ANSWER_GAP,
            axes[last] + lanes[last].right() + ANSWER_GAP,
        )
    };
    axes[0] = (-half - RUN).min(inner_left - lanes[0].right());
    axes[count - 1] = (half + RUN).max(inner_right + lanes[count - 1].left());
    axes
}

/// Where an answer leaves a diamond and runs to the line it runs down on: a
/// side point and straight out of it, or the foot, down a bend and across
/// when answers fan out of it.
fn answer_start(index: usize, count: usize, size: (f64, f64), axis: f64) -> Vec<Point> {
    let (width, height) = size;
    let half = width / 2.0;
    let side = |x: f64| vec![at(x, height / 2.0), at(axis, height / 2.0)];
    match index {
        0 if count >= 2 => side(-half),
        last if count >= 2 && last == count - 1 => side(half),
        _ => vec![
            at(0.0, height),
            at(0.0, height + RUN),
            at(axis, height + RUN),
        ],
    }
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

    /// A decision's diamond and its answers side by side below it, each run
    /// down from its point of the diamond. Every answer's loose ends drop
    /// below the longest answer and join on the diamond's axis.
    fn decision(&self, id: &str, answers: &[Answer]) -> Laid {
        let size = self.size(id);
        let (width, height) = size;
        let lanes: Vec<Lane<'_>> = answers
            .iter()
            .map(|answer| Lane {
                words: self.words(&answer.label),
                blocks: (!answer.blocks.is_empty()).then(|| self.chain(&answer.blocks)),
            })
            .collect();
        let count = lanes.len();
        let axes = answer_axes(&lanes, width / 2.0);
        let fans = from_foot(count).len() > 1;
        let row = height + WORDS_ABOVE + if fans { RUN } else { 0.0 };
        let row_height = most(lanes.iter().map(|lane| lane.words.height));
        let words_middle = row + row_height / 2.0;
        let lane_top = row + row_height + WORDS_BELOW;
        let mut laid = Laid::shape(id, width, height);
        let mut ends = Vec::new();
        let (mut least, mut most, mut bottom) = (-width / 2.0, width / 2.0, row + row_height);
        for (index, (lane, axis)) in lanes.into_iter().zip(axes).enumerate() {
            least = least.min(axis - lane.left());
            most = most.max(axis + lane.right());
            let mut run = Run {
                from: id.to_owned(),
                to: String::new(),
                words: Some(words_at(lane.words, at(axis, words_middle))),
                points: answer_start(index, count, size, axis),
            };
            let Some(blocks) = lane.blocks else {
                run.points.push(at(axis, row + row_height));
                ends.push(run);
                continue;
            };
            let offset = at(axis - blocks.entry.x, lane_top);
            let blocks = blocks.moved(offset);
            bottom = bottom.max(lane_top + blocks.height);
            laid.runs
                .extend(finished(vec![run], blocks.entry, &blocks.head));
            ends.extend(laid.hold(blocks));
        }
        let join = bottom + RUN;
        carried(&mut ends, |end| vec![at(end.x, join), at(0.0, join)]);
        laid.ends = ends;
        laid.spanning(least, most, join)
    }

    /// A loop's hexagon and the blocks it repeats below it: the line labelled
    /// "repeat" runs down into them, the line from their last runs back up on
    /// their left into the hexagon's left point, and the line labelled "done"
    /// leaves the right point and runs down on their right.
    fn repeat(&self, id: &str, body: &[Block]) -> Laid {
        let (width, height) = self.size(id);
        let half = width / 2.0;
        let middle = height / 2.0;
        let done = self.words(DONE);
        let again = self.words(REPEAT);
        let row = height + WORDS_ABOVE;
        let row_height = again.height.max(done.height);
        let words_middle = row + row_height / 2.0;
        let mut laid = Laid::shape(id, width, height);
        let mut most = half;
        let mut ends = vec![Run {
            from: id.to_owned(),
            to: String::new(),
            words: Some(words_at(again, at(0.0, words_middle))),
            points: vec![at(0.0, height)],
        }];
        let mut below = row + row_height;
        let mut least = (-half).min(-again.width / 2.0);
        if !body.is_empty() {
            let blocks = self.chain(body);
            let left = -blocks.entry.x;
            least = least.min(left);
            most = most.max(left + blocks.width);
            let blocks = blocks.moved(at(left, below + WORDS_BELOW));
            below += WORDS_BELOW + blocks.height;
            laid.runs.extend(finished(ends, blocks.entry, &blocks.head));
            ends = laid.hold(blocks);
        }
        // The line back up, from the last of the steps, or from the hexagon
        // when it repeats nothing.
        let (back, below) = (least - ANSWER_GAP / 2.0, below + RUN);
        carried(&mut ends, |end| {
            vec![at(end.x, below), at(back, below), at(back, middle)]
        });
        laid.runs.extend(finished(ends, at(-half, middle), id));
        let side = (most + ANSWER_GAP / 2.0).max(half + RUN);
        let foot = below + RUN;
        laid.ends.push(Run {
            from: id.to_owned(),
            to: String::new(),
            words: Some(words_at(done, at(side, words_middle))),
            points: vec![
                at(half, middle),
                at(side, middle),
                at(side, foot),
                at(0.0, foot),
            ],
        });
        laid.spanning(back, most.max(side + done.width / 2.0), foot)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::content::Flow;
    use crate::flowchart::graph::{flowchart_of, tests as graph};
    use archboard_scene::measure;

    /// Every node of a flowchart as a box of one size, and every line's words measured.
    fn measures(blocks: &[Block]) -> (HashMap<String, (f64, f64)>, HashMap<String, MeasuredLabel>) {
        fn walk(
            blocks: &[Block],
            sizes: &mut HashMap<String, (f64, f64)>,
            words: &mut Vec<String>,
        ) {
            for block in blocks {
                match block {
                    Block::Step(id) | Block::Terminal(id) => {
                        sizes.insert(id.clone(), (200.0, 60.0));
                    }
                    Block::Decision { id, answers } => {
                        sizes.insert(id.clone(), (160.0, 80.0));
                        for answer in answers {
                            words.push(answer.label.clone());
                            walk(&answer.blocks, sizes, words);
                        }
                    }
                    Block::Loop { id, body } => {
                        sizes.insert(id.clone(), (160.0, 40.0));
                        words.extend([REPEAT.to_owned(), DONE.to_owned()]);
                        walk(body, sizes, words);
                    }
                }
            }
        }
        let (mut sizes, mut words) = (HashMap::new(), Vec::new());
        walk(blocks, &mut sizes, &mut words);
        let words = words
            .into_iter()
            .map(|text| {
                let measured = measure::measure_label(&text);
                (text, measured)
            })
            .collect();
        (sizes, words)
    }

    /// A flow's blocks laid out in columns no taller than a height.
    fn laid(flows: &[Flow], column: f64) -> Laid {
        let graph = flowchart_of(flows, &graph::parts());
        let blocks = &graph.charts[0].blocks;
        let (sizes, words) = measures(blocks);
        let layout = Layout {
            sizes: &sizes,
            words: &words,
            column,
        };
        layout.chain(blocks)
    }

    /// A flow of nothing but messages.
    fn messages(count: usize) -> Vec<Flow> {
        let steps: Vec<String> = (0..count)
            .map(|index| {
                format!(r#"{{"id":"m{index}","from":"a","to":"b","label":"step {index}"}}"#)
            })
            .collect();
        serde_json::from_str(&format!(
            r#"[{{"id":"f","name":"Long","participants":["a","b"],"steps":[{}]}}]"#,
            steps.join(",")
        ))
        .unwrap()
    }

    /// Where each box's middle and top stand, by node.
    fn middles(laid: &Laid) -> HashMap<&str, (f64, f64)> {
        laid.boxes
            .iter()
            .map(|(id, bounds)| (id.as_str(), (bounds.x + bounds.width / 2.0, bounds.y)))
            .collect()
    }

    #[test]
    fn every_step_leads_to_the_next_and_every_answer_and_loop_line_says_its_words() {
        let laid = laid(&graph::flow(), f64::INFINITY);
        let mut lines: Vec<(&str, &str, Option<&str>)> = laid
            .runs
            .iter()
            .map(|run| {
                let words = run
                    .words
                    .as_ref()
                    .map(|(words, _)| words.runs[0].text.as_str());
                (run.from.as_str(), run.to.as_str(), words)
            })
            .collect();
        lines.sort_unstable();
        assert_eq!(
            lines,
            [
                ("d", "l", Some("no")),
                ("d", "s", Some("yes")),
                ("f~start", "m", None),
                ("l", "f~end", Some("done")),
                ("l", "r", Some("repeat")),
                ("m", "d", None),
                ("r", "l", None),
                ("s", "l", None),
            ]
        );
    }

    #[test]
    fn a_run_that_fits_its_column_height_stands_in_one_column() {
        let laid = laid(&messages(12), f64::INFINITY);
        let xs: Vec<f64> = middles(&laid).values().map(|(x, _)| *x).collect();
        assert_eq!(laid.breaks, 0);
        assert!(xs.iter().all(|x| (x - xs[0]).abs() < 0.01), "one axis");
    }

    /// The boxes of each column, left to right: the boxes whose middles stand on one axis.
    fn columns_of(laid: &Laid) -> Vec<Vec<&str>> {
        let mut columns: Vec<(f64, Vec<&str>)> = Vec::new();
        for (id, bounds) in &laid.boxes {
            let x = bounds.x + bounds.width / 2.0;
            match columns.iter_mut().find(|(at, _)| (at - x).abs() < 0.01) {
                Some((_, ids)) => ids.push(id),
                None => columns.push((x, vec![id])),
            }
        }
        columns.into_iter().map(|(_, ids)| ids).collect()
    }

    #[test]
    fn a_taller_run_breaks_into_even_columns_and_keeps_its_terminals_company() {
        let laid = laid(&messages(12), 500.0);
        let columns = columns_of(&laid);
        let sizes: Vec<usize> = columns.iter().map(Vec::len).collect();
        assert!(laid.breaks > 0 && sizes.len() == laid.breaks + 1);
        let (fewest, most) = (sizes.iter().min().unwrap(), sizes.iter().max().unwrap());
        assert!(most - fewest <= 1, "columns {sizes:?} are even");
        assert!(
            laid.height <= 500.0 + RISE,
            "no column is taller than the height"
        );
        let alone = |ids: &Vec<&str>| ids.len() == 1 && ids[0].contains('~');
        assert!(!columns.iter().any(alone), "a terminal stands with a step");
        // Each column but the first is entered from above, by the line from the foot of the one before.
        let over_the_top = |run: &&Run| run.points.iter().any(|point| point.y < RISE / 2.0);
        assert_eq!(laid.runs.iter().filter(over_the_top).count(), laid.breaks);
    }

    #[test]
    fn a_short_answer_stands_at_the_top_and_its_line_runs_on_to_the_join() {
        let flows: Vec<Flow> = serde_json::from_str(
            r#"[{"id":"f","name":"Branch","participants":["a","b"],"steps":[
                {"id":"d","kind":"decision","question":"long or short?","alternatives":[
                    {"label":"short","steps":[{"id":"s1","from":"a","to":"b","label":"one"}]},
                    {"label":"long","steps":[
                        {"id":"l1","from":"a","to":"b","label":"one"},
                        {"id":"l2","from":"a","to":"b","label":"two"},
                        {"id":"l3","from":"a","to":"b","label":"three"}]}]},
                {"id":"after","from":"b","to":"a","label":"after"}]}]"#,
        )
        .unwrap();
        let laid = laid(&flows, f64::INFINITY);
        let at = middles(&laid);
        assert_eq!(at["s1"].1, at["l1"].1, "both answers start on one row");
        let short = laid.runs.iter().find(|run| run.from == "s1").unwrap();
        let long = laid.runs.iter().find(|run| run.from == "l3").unwrap();
        assert_eq!((short.to.as_str(), long.to.as_str()), ("after", "after"));
        // The short answer's line drops past the long answer before it joins.
        let lowest = |run: &Run| run.points.iter().map(|point| point.y).fold(0.0, f64::max);
        assert!(at["l3"].1 < lowest(short));
    }
}
