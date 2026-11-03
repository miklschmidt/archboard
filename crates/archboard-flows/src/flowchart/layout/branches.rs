//! The blocks that branch a run: a decision, whose answers stand side by side
//! below its diamond, and a loop, whose line back up runs beside the steps it
//! repeats.

use archboard_scene::drawing::MeasuredLabel;
use archboard_scene::geometry::Point;

use super::{DONE, Laid, Layout, REPEAT, RUN, Run, at, carried, finished, most, words_at};
use crate::flowchart::graph::{Answer, Block};

/// The least room between two answers side by side, and between a loop's
/// steps and its lines beside them.
const ANSWER_GAP: f64 = 32.0;
/// The room above an answer's words, below the diamond.
const WORDS_ABOVE: f64 = 12.0;
/// The room below an answer's words, above the step the answer reaches.
const WORDS_BELOW: f64 = 16.0;

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
    /// A decision's diamond and its answers side by side below it, each run
    /// down from its point of the diamond. Every answer's loose ends drop
    /// below the longest answer and join on the diamond's axis.
    pub(super) fn decision(&self, id: &str, answers: &[Answer]) -> Laid {
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
    pub(super) fn repeat(&self, id: &str, body: &[Block]) -> Laid {
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
