//! The order a board's lines are drawn in, as its connections give it.
//!
//! A spark leaves each card that nothing feeds and runs along its lines. Where a
//! spark reaches a card, the card's own lines start, so a board builds along the
//! way its parts talk. A ring has no start, so a spark enters it at its top left
//! card.
//!
//! The more lines run at once, the slower each one goes. Most of a board's lines
//! stand near a source, and at one pace they would all flash on at the start,
//! with a few long ways left to finish alone. A small board does not stretch to
//! fill the time of a large one: it lands early.

use std::collections::HashMap;

use archboard_scene::geometry::{Point, Rect};
use archboard_scene::scene::{Group, Scene};

use super::found::{Form, Found};
use super::line::{end_of, start_of};

/// How far past a box the end of a line can stand and still belong to it.
const BOX_ROOM: f64 = 16.0;

/// How far a spark runs in a whole drawing at the least, as a share of the board's
/// diagonal. A board with shorter ways than this lands early.
const LEAST_RUN: f64 = 1.0;

/// How far through its line's drawing a label arrives.
const LABEL_AT: f64 = 0.55;

/// How long a label takes to arrive, as a share of the move.
const LABEL_SPAN: f64 = 0.24;

/// When something is drawn, as shares of a move.
pub(super) type Span = (f64, f64);

/// When each line of a move is drawn, by its subject.
pub(super) type Spans<'a> = HashMap<&'a str, Span>;

/// One line that a spark runs along.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Run {
    start: Point,
    end: Point,
    length: f64,
}

/// The box that holds a point: the smallest one, so a card goes before the frame
/// round it.
pub(super) fn holder(boxes: &[Rect], point: Point) -> Option<usize> {
    let holds = |frame: &&Rect| {
        point.x >= frame.x - BOX_ROOM
            && point.x <= frame.x + frame.width + BOX_ROOM
            && point.y >= frame.y - BOX_ROOM
            && point.y <= frame.y + frame.height + BOX_ROOM
    };
    boxes
        .iter()
        .enumerate()
        .filter(|(_, frame)| holds(frame))
        .min_by(|(_, a), (_, b)| (a.width * a.height).total_cmp(&(b.width * b.height)))
        .map(|(at, _)| at)
}

/// How far a spark has come to reach each box, for the boxes it has reached.
struct Reach<'a> {
    /// Each run, with the boxes it leaves and lands in.
    links: Vec<(Option<usize>, Option<usize>, f64)>,
    boxes: &'a [Rect],
    reached: Vec<Option<f64>>,
}

impl Reach<'_> {
    /// Let the spark run on from every box it has reached, until nothing is nearer.
    fn spread(&mut self) {
        let mut moved = true;
        while moved {
            moved = false;
            for &(from, to, length) in &self.links {
                let (Some(from), Some(to)) = (from, to) else {
                    continue;
                };
                let Some(start) = self.reached[from] else {
                    continue;
                };
                let arrives = start + length;
                if self.reached[to].is_none_or(|known| arrives < known) {
                    self.reached[to] = Some(arrives);
                    moved = true;
                }
            }
        }
    }

    /// Start a spark at every box that nothing feeds.
    fn start_at_sources(&mut self) {
        let fed: Vec<bool> = (0..self.boxes.len())
            .map(|at| self.links.iter().any(|link| link.1 == Some(at)))
            .collect();
        for &(from, to, length) in &self.links {
            if let Some(from) = from.filter(|&from| !fed[from]) {
                self.reached[from] = Some(0.0);
            }
            if from.is_none()
                && let Some(to) = to
                && self.reached[to].is_none_or(|known| length < known)
            {
                self.reached[to] = Some(length);
            }
        }
        self.spread();
    }

    /// The top left box that a line leaves and no spark has reached: a way into
    /// a ring.
    fn way_in(&self) -> Option<usize> {
        self.links
            .iter()
            .filter_map(|link| link.0)
            .filter(|&from| self.reached[from].is_none())
            .min_by(|&a, &b| {
                let corner = |at: usize| self.boxes[at].x + self.boxes[at].y;
                corner(a).total_cmp(&corner(b))
            })
    }

    /// When a line is drawn, in how far the spark has come.
    fn span_of(&self, link: (Option<usize>, Option<usize>, f64)) -> Span {
        let begin = link.0.and_then(|from| self.reached[from]).unwrap_or(0.0);
        (begin, begin + link.2)
    }
}

/// When each run is drawn, as shares of the whole drawing.
fn run_order(runs: &[Run], boxes: &[Rect], least: f64) -> Vec<Span> {
    let links = runs
        .iter()
        .map(|run| (holder(boxes, run.start), holder(boxes, run.end), run.length))
        .collect();
    let mut reach = Reach {
        links,
        boxes,
        reached: vec![None; boxes.len()],
    };
    reach.start_at_sources();
    while let Some(ring) = reach.way_in() {
        reach.reached[ring] = Some(0.0);
        reach.spread();
    }
    let spans: Vec<Span> = reach
        .links
        .iter()
        .map(|&link| reach.span_of(link))
        .collect();
    let last = spans.iter().map(|span| span.1).fold(0.0, f64::max);
    let share = if last > 0.0 {
        last / last.max(least)
    } else {
        1.0
    };
    paced(&spans)
        .into_iter()
        .map(|(begin, end)| (begin * share, end * share))
        .collect()
}

/// Some spans of a drawing, timed by how many lines run at each moment: a moment
/// takes longer the more lines it draws, by the square root of their number. In
/// full proportion, the lone line at the end whips across the board. The order
/// stays the same, so a line still starts as the line that feeds it lands.
fn paced(spans: &[Span]) -> Vec<Span> {
    let mut stops: Vec<(f64, f64)> = spans
        .iter()
        .flat_map(|&(begin, end)| [(begin, 1.0), (end, -1.0)])
        .collect();
    stops.sort_by(|a, b| a.0.total_cmp(&b.0));
    let (mut time, mut running, mut at) = (0.0, 0.0_f64, 0.0);
    let mut timed = Vec::with_capacity(stops.len());
    for (stop, change) in stops {
        time += running.sqrt() * (stop - at);
        timed.push((stop, time));
        running += change;
        at = stop;
    }
    let time_of = |stop: f64| {
        let after = timed.partition_point(|&(known, _)| known < stop);
        timed
            .get(after)
            .map_or(1.0, |&(_, then)| if time > 0.0 { then / time } else { 1.0 })
    };
    spans
        .iter()
        .map(|&(begin, end)| (time_of(begin), time_of(end)))
        .collect()
}

/// A line as a spark runs along it, when it says where it runs.
fn run_of(group: &Group) -> Option<Run> {
    let (end, length) = end_of(group)?;
    Some(Run {
        start: start_of(group)?,
        end,
        length,
    })
}

/// When some of a scene's lines are drawn, as shares of a move, by their places
/// among the groups.
pub(super) fn line_spans(
    groups: &[Found<'_>],
    lines: &[usize],
    scene: &Scene,
    (first, last): Span,
) -> Vec<(usize, Span)> {
    let boxes: Vec<Rect> = groups
        .iter()
        .filter(|group| group.form() == Form::Card && !group.is_label())
        .filter_map(|group| group.frame)
        .collect();
    let drawn: Vec<(usize, Run)> = lines
        .iter()
        .filter_map(|&at| Some((at, run_of(groups[at].group)?)))
        .collect();
    let runs: Vec<Run> = drawn.iter().map(|&(_, run)| run).collect();
    let least = scene.width.hypot(scene.height) * LEAST_RUN;
    let window = last - first;
    drawn
        .iter()
        .zip(run_order(&runs, &boxes, least))
        .map(|(&(at, _), (begin, end))| (at, (first + begin * window, first + end * window)))
        .collect()
}

/// The end of the last of some spans, and at least the end of the move's other
/// parts.
pub(super) fn length_of(spans: impl Iterator<Item = Span>) -> f64 {
    spans.map(|span| span.1).fold(1.0, f64::max)
}

/// When the words of a line arrive: as the spark reaches them.
pub(super) fn label_span((begin, end): Span) -> Span {
    let start = begin + (end - begin) * LABEL_AT;
    (start, start + LABEL_SPAN)
}

#[cfg(test)]
mod tests {
    use super::{Run, run_order};
    use archboard_scene::geometry::{Point, Rect};

    const fn at(x: f64, y: f64) -> Point {
        Point { x, y }
    }

    const fn square(x: f64, y: f64) -> Rect {
        Rect {
            x,
            y,
            width: 10.0,
            height: 10.0,
        }
    }

    /// A run from the middle of one square to the middle of another.
    fn between(from: Rect, to: Rect, length: f64) -> Run {
        Run {
            start: at(from.x + 5.0, from.y + 5.0),
            end: at(to.x + 5.0, to.y + 5.0),
            length,
        }
    }

    const FIRST: Rect = square(0.0, 0.0);
    const SECOND: Rect = square(100.0, 0.0);
    const THIRD: Rect = square(200.0, 0.0);

    #[test]
    fn a_card_sends_its_lines_on_when_the_spark_reaches_it() {
        let runs = [between(SECOND, THIRD, 100.0), between(FIRST, SECOND, 100.0)];
        let spans = run_order(&runs, &[FIRST, SECOND, THIRD], 0.0);
        assert_eq!(spans, [(0.5, 1.0), (0.0, 0.5)]);
    }

    #[test]
    fn lines_that_run_together_go_slower_but_a_lone_line_does_not_whip() {
        let runs = [
            between(FIRST, SECOND, 100.0),
            between(FIRST, SECOND, 100.0),
            between(FIRST, SECOND, 100.0),
            between(SECOND, THIRD, 100.0),
        ];
        let spans = run_order(&runs, &[FIRST, SECOND, THIRD], 0.0);
        let together = spans[0].1;
        assert!(together > 0.5, "three lines take longer than one");
        assert!(together < 0.75, "but not three times as long");
        assert_eq!(spans[3], (together, 1.0));
    }

    #[test]
    fn a_ring_takes_the_spark_in_at_its_top_left() {
        let runs = [between(SECOND, FIRST, 100.0), between(FIRST, SECOND, 100.0)];
        let spans = run_order(&runs, &[SECOND, FIRST], 0.0);
        assert_eq!(spans, [(0.5, 1.0), (0.0, 0.5)]);
    }

    #[test]
    fn a_line_from_outside_the_board_feeds_the_card_it_reaches() {
        let outside = square(-100.0, 0.0);
        let runs = [
            between(FIRST, SECOND, 100.0),
            between(outside, FIRST, 100.0),
        ];
        let spans = run_order(&runs, &[FIRST, SECOND], 0.0);
        assert_eq!(spans, [(0.5, 1.0), (0.0, 0.5)]);
    }

    #[test]
    fn a_small_board_keeps_the_pace_and_lands_early() {
        let spans = run_order(&[between(FIRST, SECOND, 100.0)], &[FIRST, SECOND], 400.0);
        assert_eq!(spans, [(0.0, 0.25)]);
    }
}
