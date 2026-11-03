//! The blocks that branch a run: a decision, whose answers stand side by side
//! below its diamond; a guard, whose short answer stands beside the run and
//! jumps to the landing where its long answer ends; and a loop, whose line
//! back up runs beside the steps it repeats, or jumps back from the end of a
//! long body.

use archboard_scene::drawing::MeasuredLabel;
use archboard_scene::geometry::Point;
use archboard_scene::request::JumpEnd;

use super::{
    DONE, JUMP_IN, JUMP_OUT, Laid, Layout, REPEAT, RUN, Run, STEP_GAP, at, beside, carried,
    finished, lowest, most, rect, words_at,
};
use crate::flowchart::graph::{Answer, Block};

/// The least room between two answers side by side, and between a loop's
/// steps and its lines beside them.
const ANSWER_GAP: f64 = 32.0;
/// The room above an answer's words, below the diamond.
const WORDS_ABOVE: f64 = 12.0;
/// The room below an answer's words, above the step the answer reaches.
const WORDS_BELOW: f64 = 16.0;
/// How far below the longest answer the answers of a decision join, so that
/// each line's bend into the join reads on its own.
const JOIN_ROOM: f64 = 3.0 * RUN;

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

/// The answer of two that runs straight on down out of the diamond's foot:
/// the taller, when one is taller.
fn straight(lanes: &[Lane<'_>]) -> Option<usize> {
    let tall = |lane: &Lane<'_>| lane.blocks.as_ref().map_or(0.0, |laid| laid.height);
    match lanes {
        [first, second] if tall(first) > tall(second) => Some(0),
        [first, second] if tall(second) > tall(first) => Some(1),
        _ => None,
    }
}

/// Where two answers run down when one runs straight on: that one on the
/// diamond's axis, the other out of its own side point, beyond the straight
/// answer's reach.
fn straight_axes(lanes: &[Lane<'_>], half: f64, main: usize) -> Vec<f64> {
    let mut axes = vec![0.0; 2];
    if main == 1 {
        axes[0] = (-half - RUN).min(-lanes[1].left() - ANSWER_GAP - lanes[0].right());
    } else {
        axes[1] = (half + RUN).max(lanes[0].right() + ANSWER_GAP + lanes[1].left());
    }
    axes
}

/// A landing: its jump in beside the run's line, and a line from it that
/// joins that line, which runs straight on through.
pub(super) fn land(id: &str) -> Laid {
    let edge = -ANSWER_GAP;
    let middle = JUMP_IN / 2.0;
    let mut laid = Laid {
        head: id.to_owned(),
        passes: true,
        joins: vec![Run {
            joins: true,
            ..Run::out_of(id, None, vec![at(edge, middle), at(0.0, middle)])
        }],
        ..Laid::default()
    };
    let disc = rect(at(edge - JUMP_IN, 0.0), (JUMP_IN, JUMP_IN));
    laid.mark(id, id, JumpEnd::In, disc);
    laid.spanning(edge - JUMP_IN, 0.0, JUMP_IN)
}

impl Layout<'_> {
    /// A guard: its diamond on the run's axis, its long answer's line straight
    /// down out of the foot, and its short answer out of its side point and
    /// down beside the blocks after it, clear of them, to a jump to where the
    /// long answer lands.
    pub(super) fn guard<'a>(
        &self,
        id: &str,
        side: &Answer,
        main: &str,
        first: bool,
        lands: &str,
        after: impl Iterator<Item = &'a Laid>,
    ) -> Laid {
        let (width, height) = self.size(id);
        let half = width / 2.0;
        let side_words = self.words(&side.label);
        let main_words = self.words(main);
        let row = height + WORDS_ABOVE;
        let row_height = side_words.height.max(main_words.height);
        let words_middle = row + row_height / 2.0;
        let lane_top = row + row_height + WORDS_BELOW;
        let mut laid = Laid::shape(id, width, height);
        laid.ends.push(Run::out_of(
            id,
            Some(words_at(main_words, at(0.0, words_middle))),
            vec![at(0.0, height), at(0.0, lane_top)],
        ));
        let lane = Lane {
            words: side_words,
            blocks: (!side.blocks.is_empty()).then(|| self.chain(&side.blocks)),
        };
        // How far the short answer hangs below the guard's foot: its blocks,
        // and the jump out below the end of their last column.
        let depth = lane.blocks.as_ref().map_or(JUMP_OUT.1, |blocks| {
            let end = lowest(&blocks.ends).map_or(blocks.height, |end| end.y);
            blocks.height.max(end + STEP_GAP + JUMP_OUT.1)
        });
        let (toward, away) = if first {
            (lane.right(), lane.left())
        } else {
            (lane.left(), lane.right())
        };
        let (toward, away) = (toward.max(JUMP_OUT.0 / 2.0), away.max(JUMP_OUT.0 / 2.0));
        let clear = beside(after, first, depth).max(main_words.width / 2.0);
        let sign = if first { -1.0 } else { 1.0 };
        let axis = sign * (half + RUN).max(clear + ANSWER_GAP + toward);
        let run = Run::out_of(
            id,
            Some(words_at(side_words, at(axis, words_middle))),
            vec![at(sign * half, height / 2.0), at(axis, height / 2.0)],
        );
        // The jump out stands below the end of the answer's blocks, which is
        // in their last column when they break into columns.
        let (enters, into) = match lane.blocks {
            Some(blocks) => {
                let offset = at(axis - blocks.entry.x, lane_top);
                let blocks = blocks.moved(offset);
                laid.runs
                    .extend(finished(vec![run], blocks.entry, &blocks.head));
                let ends = laid.hold(blocks);
                let end = lowest(&ends).unwrap_or_else(|| at(axis, lane_top));
                (at(end.x, end.y + STEP_GAP), ends)
            }
            None => (at(axis, lane_top), vec![run]),
        };
        let out = format!("{id}~jump");
        let tag = rect(at(enters.x - JUMP_OUT.0 / 2.0, enters.y), JUMP_OUT);
        laid.mark(&out, lands, JumpEnd::OutDown, tag);
        laid.runs.extend(finished(into, enters, &out));
        let (least, most) = if first {
            (axis - away, half)
        } else {
            (-half, axis + away)
        };
        laid.spanning(least, most, lane_top)
    }

    /// A loop whose body is long: the line labelled "repeat" runs down into
    /// the blocks it repeats, the end of the last jumps back to a jump in
    /// beside the hexagon's left point, and the line labelled "done" leaves
    /// the right point and ends beside it, for the run to jump on from.
    pub(super) fn repeat_by_jumps(&self, id: &str, body: &[Block], back: &str) -> Laid {
        let (width, height) = self.size(id);
        let half = width / 2.0;
        let middle = height / 2.0;
        let done = self.words(DONE);
        let again = self.words(REPEAT);
        let row = height + WORDS_ABOVE;
        let row_height = again.height.max(done.height);
        let lane_top = row + row_height + WORDS_BELOW;
        let mut laid = Laid::shape(id, width, height);
        let repeat = Run::out_of(
            id,
            Some(words_at(again, at(0.0, row + row_height / 2.0))),
            vec![at(0.0, height)],
        );
        let blocks = self.chain(body);
        let left = -blocks.entry.x;
        let least = (-half).min(-again.width / 2.0).min(left);
        let most = half.max(left + blocks.width);
        let blocks = blocks.moved(at(left, lane_top));
        let body_foot = lane_top + blocks.height;
        laid.runs
            .extend(finished(vec![repeat], blocks.entry, &blocks.head));
        let ends = laid.hold(blocks);
        // The jump back stands below the end of the body, which is in its
        // last column when it breaks into columns.
        let end = lowest(&ends).unwrap_or_else(|| at(0.0, body_foot));
        let enters = at(end.x, end.y + STEP_GAP);
        let out = format!("{id}~back");
        let tag = rect(at(enters.x - JUMP_OUT.0 / 2.0, enters.y), JUMP_OUT);
        laid.mark(&out, back, JumpEnd::OutDown, tag);
        laid.runs.extend(finished(ends, enters, &out));
        let disc_left = -half - RUN - JUMP_IN;
        let disc = rect(at(disc_left, middle - JUMP_IN / 2.0), (JUMP_IN, JUMP_IN));
        laid.mark(back, back, JumpEnd::In, disc);
        laid.runs.push(Run {
            to: id.to_owned(),
            ..Run::out_of(back, None, vec![at(-half - RUN, middle), at(-half, middle)])
        });
        // The line labelled "done" runs straight out of the right point, so
        // that the jump it ends at stands beside the hexagon, clear of the body.
        let side = half + 2.0 * RUN + done.width;
        laid.ends.push(Run::out_of(
            id,
            Some(words_at(done, at(half + RUN + done.width / 2.0, middle))),
            vec![at(half, middle), at(side, middle)],
        ));
        laid.jumps_on = true;
        laid.spanning(
            least.min(disc_left),
            most.max(side + JUMP_OUT.1),
            body_foot.max(tag.y + tag.height),
        )
    }

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
        let main = straight(&lanes);
        let axes = main.map_or_else(
            || answer_axes(&lanes, width / 2.0),
            |main| straight_axes(&lanes, width / 2.0, main),
        );
        let fans = main.is_none() && from_foot(count).len() > 1;
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
            let points = if main == Some(index) {
                vec![at(0.0, height)]
            } else {
                answer_start(index, count, size, axis)
            };
            let words = Some(words_at(lane.words, at(axis, words_middle)));
            let mut run = Run::out_of(id, words, points);
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
        let join = bottom + JOIN_ROOM;
        carried(&mut ends, |end| vec![at(end.x, join), at(0.0, join)]);
        laid.ends = ends;
        laid.spanning(least, most, join + RUN)
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
        let mut ends = vec![Run::out_of(
            id,
            Some(words_at(again, at(0.0, words_middle))),
            vec![at(0.0, height)],
        )];
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
        laid.ends.push(Run::out_of(
            id,
            Some(words_at(done, at(side, words_middle))),
            vec![
                at(half, middle),
                at(side, middle),
                at(side, foot),
                at(0.0, foot),
            ],
        ));
        laid.spanning(back, most.max(side + done.width / 2.0), foot)
    }
}
