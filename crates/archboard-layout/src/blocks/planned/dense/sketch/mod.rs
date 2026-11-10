//! What a reader pays for a dense placement, weighed before anything is routed.
//!
//! Each line is sketched as the shortest orthogonal way between the facing sides of its two
//! boxes: straight where the boxes share a band, else with one bend. A placement pays the length
//! of every sketch, each bend, the way round every card or frame that a sketch runs through,
//! each crossing, and how far the members of each group stand from their middle. Two lines cross
//! where the straight chords between the middles of their boxes cross: on a grid, sketches run
//! on top of one another where routes take parallel lanes, and chords do not. Page shape costs
//! nothing here: dead space costs the longer lines it makes.

use crate::geometry::{Point, Rect};

use super::ring::Ringed;

pub(super) use chord::{Chord, Past};
pub(super) use even::{Even, STRETCHES};
pub(super) use way::InTheWay;

/// One crossing costs as much as this much line, as the ranking of routed drawings weighs it.
pub(super) const CROSSING: f64 = 300.0;
/// One bend costs as much as this much line, as a route's cost weighs it.
const BEND: f64 = 120.0;
/// A line that runs up, against the reading direction, costs this much line more.
const AGAINST: f64 = 150.0;
/// Each member of a group pays its way to the group's middle at this share of a line's cost.
const GROUP: f64 = 3.0;
/// How wide a band two boxes must share for a straight line between them.
const SHARED: f64 = 40.0;
/// Room that keeps a touch apart from a crossing.
const TOUCH: f64 = 0.5;

/// A line's sketch: two points when straight, three with its bend.
#[derive(Clone, Copy, Debug)]
pub(super) struct Sketch {
    points: [Point; 3],
    bent: bool,
    /// The box round the sketch, which rules most pairs out of crossing at once.
    span: Rect,
}

impl Sketch {
    fn new(points: [Point; 3], bent: bool) -> Sketch {
        let used = if bent { &points[..] } else { &points[..2] };
        let low = |of: fn(&Point) -> f64| used.iter().map(of).fold(f64::INFINITY, f64::min);
        let high = |of: fn(&Point) -> f64| used.iter().map(of).fold(f64::NEG_INFINITY, f64::max);
        let (x, y) = (low(|p| p.x), low(|p| p.y));
        Sketch {
            points,
            bent,
            span: Rect {
                x,
                y,
                width: high(|p| p.x) - x,
                height: high(|p| p.y) - y,
            },
        }
    }

    fn straight(from: Point, to: Point) -> Sketch {
        Sketch::new([from, to, to], false)
    }

    fn segments(&self) -> impl Iterator<Item = (Point, Point)> + '_ {
        let count = if self.bent { 2 } else { 1 };
        (0..count).map(|at| (self.points[at], self.points[at + 1]))
    }

    fn length(&self) -> f64 {
        self.segments()
            .map(|(a, b)| (a.x - b.x).abs() + (a.y - b.y).abs())
            .sum()
    }

    /// What a line costs by the sketch: its length, its bend, what it adds to go round what
    /// stands in its way, and what the line adds where it climbs against the reading.
    fn cost(&self, round: f64, against: f64) -> f64 {
        self.length() + if self.bent { BEND } else { 0.0 } + round + against
    }

    /// What the sketch adds to go round a box it runs through: out to the nearer side and
    /// back, with a bend each way.
    pub(super) fn round(&self, solid: Rect) -> f64 {
        if !meets(self.span, solid) {
            return 0.0;
        }
        self.segments()
            .map(|(a, b)| {
                let (along, low, high, at, near, far) = if a.x == b.x {
                    (
                        a.x,
                        a.y.min(b.y),
                        a.y.max(b.y),
                        solid.y,
                        solid.x,
                        solid.width,
                    )
                } else {
                    (
                        a.y,
                        a.x.min(b.x),
                        a.x.max(b.x),
                        solid.x,
                        solid.y,
                        solid.height,
                    )
                };
                let reach = if a.x == b.x {
                    solid.height
                } else {
                    solid.width
                };
                let through = along > near + TOUCH
                    && along < near + far - TOUCH
                    && low < at + reach - TOUCH
                    && high > at + TOUCH;
                if through {
                    2.0 * (along - near).min(near + far - along) + 2.0 * BEND
                } else {
                    0.0
                }
            })
            .sum()
    }
}

/// Whether two boxes share any area, edges apart.
fn meets(a: Rect, b: Rect) -> bool {
    a.x < b.x + b.width + TOUCH
        && b.x < a.x + a.width + TOUCH
        && a.y < b.y + b.height + TOUCH
        && b.y < a.y + a.height + TOUCH
}

fn centre(at: Rect) -> Point {
    Point {
        x: at.x + at.width / 2.0,
        y: at.y + at.height / 2.0,
    }
}

/// Where a line between two spans along one axis leaves the first and meets the second: their
/// facing ends, or their middles where they overlap.
fn facing(a: f64, a_size: f64, b: f64, b_size: f64) -> (f64, f64) {
    if a + a_size <= b {
        (a + a_size, b)
    } else if b + b_size <= a {
        (a, b + b_size)
    } else {
        (a + a_size / 2.0, b + b_size / 2.0)
    }
}

/// The straight way between two boxes that share a band at least `SHARED` wide across it.
fn straight_between(a: Rect, b: Rect) -> Option<Sketch> {
    let shared = |low: f64, high: f64| (high - low >= SHARED).then(|| f64::midpoint(low, high));
    if let Some(x) = shared(a.x.max(b.x), (a.x + a.width).min(b.x + b.width)) {
        let (from, to) = facing(a.y, a.height, b.y, b.height);
        return Some(Sketch::straight(Point { x, y: from }, Point { x, y: to }));
    }
    let y = shared(a.y.max(b.y), (a.y + a.height).min(b.y + b.height))?;
    let (from, to) = facing(a.x, a.width, b.x, b.width);
    Some(Sketch::straight(Point { x: from, y }, Point { x: to, y }))
}

/// The two ways with one bend from one box to another: down first, then across first.
fn bent(a: Rect, b: Rect) -> [Sketch; 2] {
    let (one, two) = (centre(a), centre(b));
    let down = two.y > one.y;
    let right = two.x > one.x;
    let upright = Sketch::new(
        [
            Point {
                x: one.x,
                y: if down { a.y + a.height } else { a.y },
            },
            Point { x: one.x, y: two.y },
            Point {
                x: if right { b.x } else { b.x + b.width },
                y: two.y,
            },
        ],
        true,
    );
    let level = Sketch::new(
        [
            Point {
                x: if right { a.x + a.width } else { a.x },
                y: one.y,
            },
            Point { x: two.x, y: one.y },
            Point {
                x: two.x,
                y: if down { b.y } else { b.y + b.height },
            },
        ],
        true,
    );
    [upright, level]
}

/// The two shortest ways from one box to another: one when they share a band.
fn ways(a: Rect, b: Rect) -> [Option<Sketch>; 2] {
    straight_between(a, b).map_or_else(|| bent(a, b).map(Some), |straight| [Some(straight), None])
}

/// What each of a line's ways adds to go round some boxes, summed in the boxes' order. A box
/// clear of the box round both ways adds nothing to either.
fn rounds(ways: &[Option<Sketch>; 2], boxes: impl Iterator<Item = Rect>) -> [f64; 2] {
    let spans = ways.iter().flatten().map(|way| way.span);
    let (mut low, mut high) = (
        Point {
            x: f64::INFINITY,
            y: f64::INFINITY,
        },
        Point {
            x: f64::NEG_INFINITY,
            y: f64::NEG_INFINITY,
        },
    );
    for span in spans {
        low = Point {
            x: low.x.min(span.x),
            y: low.y.min(span.y),
        };
        high = Point {
            x: high.x.max(span.x + span.width),
            y: high.y.max(span.y + span.height),
        };
    }
    let mut added = [0.0; 2];
    for at in boxes {
        let near = low.x < at.x + at.width + TOUCH
            && at.x < high.x + TOUCH
            && low.y < at.y + at.height + TOUCH
            && at.y < high.y + TOUCH;
        if near {
            for (sum, way) in added.iter_mut().zip(ways) {
                if let Some(way) = way {
                    *sum += way.round(at);
                }
            }
        }
    }
    added
}

/// One line of a scene, by the boxes it joins, from its source to its target.
#[derive(Clone, Copy, Debug)]
pub(super) struct Line {
    pub from: usize,
    pub to: usize,
    /// How tall the line's label plate stands, where it has one.
    pub plate: f64,
}

/// Every box that a placement stands, and the lines and groups that weigh it.
#[derive(Clone, Debug, Default)]
pub(super) struct Scene {
    /// Every box a line ends on or goes round.
    pub boxes: Vec<Rect>,
    /// Whether no line runs through the box: a card or a tab. The foot of a frame's tab only
    /// ends lines.
    pub solid: Vec<bool>,
    /// The frame each box belongs to: a part, and the frame's tab and its foot.
    pub within: Vec<Option<usize>>,
    /// Each frame's outline, which only the lines of what it holds run into.
    pub frames: Vec<Rect>,
    pub lines: Vec<Line>,
    /// The boxes of each group's members.
    pub groups: Vec<Vec<usize>>,
    /// What the door ring knows of this scene (`super::ring`).
    pub ringed: Ringed,
}

impl Scene {
    /// The cheapest sketch of a line where its boxes stand, and what the line costs: its length,
    /// its bend, its way round what it runs through, and its climb against the reading.
    pub(super) fn sketch(&self, line: usize) -> (Sketch, f64) {
        let solid = (self.boxes.iter().enumerate())
            .filter(|&(at, _)| self.blocks(line, at))
            .map(|(_, &at)| at);
        let frames = (self.frames.iter().enumerate())
            .filter(|&(frame, _)| self.foreign(line, frame))
            .map(|(_, &at)| at);
        self.sketch_past(line, solid, frames)
    }

    /// The cheapest sketch of a line past some solid boxes and foreign frames, each in the
    /// scene's order, and what the line costs.
    fn sketch_past(
        &self,
        line: usize,
        solid: impl Iterator<Item = Rect>,
        frames: impl Iterator<Item = Rect>,
    ) -> (Sketch, f64) {
        let ways = self.ways(line);
        let (solid, frames) = (rounds(&ways, solid), rounds(&ways, frames));
        self.cheapest(line, ways, (solid, frames))
    }

    /// The shortest ways of a line where its boxes stand.
    fn ways(&self, line: usize) -> [Option<Sketch>; 2] {
        let Line { from, to, .. } = self.lines[line];
        ways(self.boxes[from], self.boxes[to])
    }

    /// The cheapest of a line's ways, and what the line costs, for what each way adds to go
    /// round the solid boxes and the foreign frames in its way. The first of two that cost the
    /// same wins.
    fn cheapest(
        &self,
        line: usize,
        ways: [Option<Sketch>; 2],
        rounds: ([f64; 2], [f64; 2]),
    ) -> (Sketch, f64) {
        let costs = self.costs(line, &ways, rounds);
        (ways.into_iter().zip(costs))
            .filter_map(|(sketch, cost)| Some((sketch?, cost?)))
            .min_by(|one, two| one.1.total_cmp(&two.1))
            .expect("a line has a way")
    }

    /// What a line costs at least where its boxes stand: what its cheapest way costs with
    /// nothing in its way. A way round a box only adds to a way's cost.
    pub(super) fn bare(&self, line: usize) -> f64 {
        let ways = self.ways(line);
        (self.costs(line, &ways, ([0.0; 2], [0.0; 2])).into_iter())
            .flatten()
            .min_by(f64::total_cmp)
            .expect("a line has a way")
    }

    /// What a line costs by each of its ways: the way's length, its bend, its way round the
    /// solid boxes and the foreign frames in its way, and the line's climb against the reading.
    fn costs(
        &self,
        line: usize,
        ways: &[Option<Sketch>; 2],
        (solid, frames): ([f64; 2], [f64; 2]),
    ) -> [Option<f64>; 2] {
        let against = self.against(line);
        [0, 1].map(|at| Some(ways[at].as_ref()?.cost(solid[at] + frames[at], against)))
    }

    /// What a line adds where it climbs against the reading.
    fn against(&self, line: usize) -> f64 {
        let Line { from, to, .. } = self.lines[line];
        if centre(self.boxes[to]).y < centre(self.boxes[from]).y - SHARED {
            AGAINST
        } else {
            0.0
        }
    }

    /// The chord of a line where its boxes stand.
    pub(super) fn chord(&self, line: usize) -> Chord {
        let Line { from, to, .. } = self.lines[line];
        Chord::new(self.boxes[from], self.boxes[to])
    }

    /// Whether a box stands in a line's way: a solid box that it does not end on.
    pub(super) fn blocks(&self, line: usize, at: usize) -> bool {
        let Line { from, to, .. } = self.lines[line];
        self.solid[at] && at != from && at != to
    }

    /// Whether a frame is foreign to a line: neither of its ends belongs to the frame.
    fn foreign(&self, line: usize, frame: usize) -> bool {
        let Line { from, to, .. } = self.lines[line];
        self.within[from] != Some(frame) && self.within[to] != Some(frame)
    }

    /// Whether two lines can cross: lines that share a box meet there instead.
    pub(super) fn apart(&self, one: usize, two: usize) -> bool {
        let (a, b) = (self.lines[one], self.lines[two]);
        a.from != b.from && a.from != b.to && a.to != b.from && a.to != b.to
    }

    /// How far a group's members stand from the group's middle, as line costs it.
    pub(super) fn spread(&self, group: usize) -> f64 {
        let members = &self.groups[group];
        let mut xs: Vec<f64> = members.iter().map(|&at| centre(self.boxes[at]).x).collect();
        let mut ys: Vec<f64> = members.iter().map(|&at| centre(self.boxes[at]).y).collect();
        GROUP * (scatter(&mut xs) + scatter(&mut ys))
    }

    /// What every line, crossing and group of the scene costs, line by line.
    pub(super) fn weigh(&self) -> Weighed {
        let (sketches, own): (Vec<Sketch>, Vec<f64>) =
            (0..self.lines.len()).map(|line| self.sketch(line)).unzip();
        let chords: Vec<Chord> = (0..self.lines.len()).map(|line| self.chord(line)).collect();
        let mut crossings = 0;
        for one in 0..chords.len() {
            for two in one + 1..chords.len() {
                crossings += usize::from(self.apart(one, two) && chords[one].crosses(&chords[two]));
            }
        }
        let spread = (0..self.groups.len())
            .map(|group| self.spread(group))
            .collect();
        Weighed {
            sketches,
            chords,
            own,
            crossings,
            spread,
        }
    }
}

/// The sum of distances from the middle value, which no other point beats.
fn scatter(values: &mut [f64]) -> f64 {
    values.sort_by(f64::total_cmp);
    let middle = values.get(values.len() / 2).copied().unwrap_or(0.0);
    values.iter().map(|value| (value - middle).abs()).sum()
}

/// A scene weighed: each line's sketch, chord and own cost, the crossings, and each group's spread.
#[derive(Clone, Debug)]
pub(super) struct Weighed {
    pub sketches: Vec<Sketch>,
    pub chords: Vec<Chord>,
    pub own: Vec<f64>,
    pub crossings: usize,
    pub spread: Vec<f64>,
}

impl Weighed {
    /// What the scene costs in all.
    pub(super) fn total(&self) -> f64 {
        self.own.iter().sum::<f64>()
            + CROSSING * self.crossings as f64
            + self.spread.iter().sum::<f64>()
    }
}

mod chord;
mod even;
mod way;

#[cfg(test)]
mod tests {
    use super::*;

    fn card(x: f64, y: f64) -> Rect {
        Rect {
            x,
            y,
            width: 200.0,
            height: 80.0,
        }
    }

    fn line(from: usize, to: usize) -> Line {
        Line {
            from,
            to,
            plate: 0.0,
        }
    }

    fn scene(boxes: Vec<Rect>, lines: Vec<Line>) -> Scene {
        Scene {
            solid: vec![true; boxes.len()],
            within: vec![None; boxes.len()],
            boxes,
            frames: Vec::new(),
            lines,
            ..Scene::default()
        }
    }

    /// A line past a card that stands between its ends pays the way round that card.
    #[test]
    fn a_line_through_a_card_pays_the_way_round_it() {
        let open = scene(
            vec![card(0.0, 0.0), card(0.0, 400.0), card(600.0, 200.0)],
            vec![line(0, 1)],
        );
        let shut = scene(
            vec![card(0.0, 0.0), card(0.0, 400.0), card(0.0, 200.0)],
            vec![line(0, 1)],
        );
        let (_, clear) = open.sketch(0);
        let (_, blocked) = shut.sketch(0);
        assert_eq!(clear, 320.0);
        assert_eq!(blocked, 320.0 + 200.0 + 2.0 * BEND);
    }

    /// Two lines that swap sides between two rows cross once; lines that share a card do not.
    #[test]
    fn lines_that_swap_sides_cross_and_lines_that_share_a_card_meet() {
        let boxes = vec![
            card(0.0, 0.0),
            card(600.0, 0.0),
            card(0.0, 600.0),
            card(600.0, 600.0),
        ];
        let crossed = scene(boxes.clone(), vec![line(0, 3), line(1, 2)]);
        assert_eq!(crossed.weigh().crossings, 1);
        let shared = scene(boxes, vec![line(0, 3), line(0, 2)]);
        assert_eq!(shared.weigh().crossings, 0);
    }
}
