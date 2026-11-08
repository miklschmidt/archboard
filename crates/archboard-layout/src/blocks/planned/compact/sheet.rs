//! What moves on one axis of a drawing: each card, wall, word plate and run of a line is a
//! piece with a mover, and a shift for each mover moves the drawing.

use super::super::{
    geometry::length,
    junctions::{common_prefix, common_suffix},
};
use crate::{
    blocks::assembly::Placed,
    geometry::{Axis, Point, Rect},
};

impl Axis {
    fn slide(self, at: &mut Rect, by: f64) {
        *self.pick(&mut at.x, &mut at.y) += by;
    }

    /// Move a box's two ends, each by its own amount.
    fn stretch(self, at: &mut Rect, near: f64, far: f64) {
        self.slide(at, near);
        *self.pick(&mut at.width, &mut at.height) += far - near;
    }

    fn nudge(self, at: &mut Point, by: f64) {
        *self.pick(&mut at.x, &mut at.y) += by;
    }

    pub(super) fn extent(self, drawing: &mut Placed) -> &mut f64 {
        self.pick(&mut drawing.width, &mut drawing.height)
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Kind {
    /// A card that a grid places.
    Card,
    /// A card outside every grid, which its lines place.
    Door,
    Line,
    Words,
    /// A frame's wall at the low end of this axis.
    Near,
    /// A frame's wall at the high end of this axis.
    Far,
    Tab,
}

/// Something that holds room on one axis, and the slab across that axis where it holds it.
#[derive(Clone)]
pub(super) struct Piece {
    /// What moves it.
    pub(super) mover: usize,
    pub(super) kind: Kind,
    pub(super) low: f64,
    pub(super) high: f64,
    pub(super) from: f64,
    pub(super) to: f64,
    /// For a run where lines join or part beside a card they share, those cards' movers.
    pub(super) joins: Vec<usize>,
}

/// A stretch of one line that stands still on this axis: the place of its points in the line.
struct Run {
    at: f64,
    from: f64,
    to: f64,
    line: usize,
    points: std::ops::Range<usize>,
}

fn line_runs(line: usize, points: &[Point], axis: Axis) -> Vec<Run> {
    let mut end = 0;
    points
        .chunk_by(|a, b| axis.of(*a) == axis.of(*b))
        .map(|run| {
            let across = run.iter().map(|&point| axis.across().of(point));
            let first = end;
            end += run.len();
            Run {
                at: axis.of(run[0]),
                from: across.clone().fold(f64::INFINITY, f64::min),
                to: across.fold(f64::NEG_INFINITY, f64::max),
                line,
                points: first..end,
            }
        })
        .collect()
}

/// Every run of a drawing's lines, from the start of the axis.
fn runs_of(drawing: &Placed, axis: Axis) -> Vec<Run> {
    let mut runs: Vec<Run> = (drawing.edges.iter().enumerate())
        .flat_map(|(line, route)| line_runs(line, &route.points, axis))
        .collect();
    runs.sort_by(|a, b| a.at.total_cmp(&b.at).then(a.from.total_cmp(&b.from)));
    runs
}

/// The card a line joins or leaves another line beside, at its start or at its end: the line
/// runs its stretch at that end along the other line's, and both meet that card at one point.
/// At the start, one of the two also draws an arrowhead there, as a line in `two_way` does.
/// Where they join or part must stay as far from the card as the guard asks of a junction there.
fn joined_card(drawing: &Placed, line: usize, start: bool, two_way: &[&str]) -> Option<usize> {
    let points = &drawing.edges[line].points;
    let (end, approach, shared): (_, _, fn(&[Point], &[Point]) -> f64) = match points.as_slice()
    {
        [end, turn, ..] if start => (*end, length(&[*end, *turn]), common_prefix),
        [.., turn, end] if !start => (*end, length(&[*turn, *end]), common_suffix),
        _ => return None,
    };
    let total = length(points);
    let arrow = |id: &str| !start || two_way.contains(&id);
    let along = |other: &[Point]| {
        let shared = shared(points, other);
        (shared - approach).abs() < 1e-6 && shared < total - 1e-6 && shared < length(other) - 1e-6
    };
    let joins = (drawing.edges.iter().enumerate()).any(|(other, route)| {
        other != line
            && along(&route.points)
            && (arrow(&drawing.edges[line].id) || arrow(&route.id))
    });
    // A line ends on its card's wall, or a hair off it.
    let holds = |card: &Rect| {
        let (x, y) = (card.x - 1.0, card.y - 1.0);
        (x..=x + card.width + 2.0).contains(&end.x) && (y..=y + card.height + 2.0).contains(&end.y)
    };
    joins
        .then(|| drawing.cards.iter().position(|card| holds(&card.bx)))
        .flatten()
}

/// What moves each part of a drawing on one axis, and the pieces they hold.
#[derive(Default)]
pub(super) struct Sheet {
    pub(super) pieces: Vec<Piece>,
    pub(super) movers: usize,
    /// The near and far wall of each frame and each region, and the near wall of each title.
    frames: Vec<(usize, usize)>,
    regions: Vec<(usize, usize)>,
    titles: Vec<usize>,
    /// The mover of every point of every line.
    lines: Vec<Vec<usize>>,
    /// The mover of each label, in the order of the lines that have one.
    words: Vec<usize>,
}

impl Sheet {
    fn mover(&mut self) -> usize {
        self.movers += 1;
        self.movers - 1
    }

    /// A piece that stands along this axis as one box does, across it as another.
    fn add(&mut self, axis: Axis, mover: usize, kind: Kind, along: Rect, across: Rect) {
        self.hold(mover, kind, axis.span(along), axis.across().span(across));
    }

    fn hold(&mut self, mover: usize, kind: Kind, (low, high): (f64, f64), (from, to): (f64, f64)) {
        self.pieces.push(Piece {
            mover,
            kind,
            low,
            high,
            from,
            to,
            joins: Vec::new(),
        });
    }

    fn walls(&mut self, axis: Axis, at: Rect) -> (usize, usize) {
        let (near, far) = (self.mover(), self.mover());
        let (low, high) = axis.span(at);
        for (mover, kind, value) in [(near, Kind::Near, low), (far, Kind::Far, high)] {
            let mut wall = at;
            axis.slide(&mut wall, value - low);
            axis.stretch(&mut wall, 0.0, low - high);
            self.add(axis, mover, kind, wall, at);
        }
        (near, far)
    }

    /// A mover and a piece for a run that shares no ink with a run before it.
    fn run(&mut self, run: &Run) -> usize {
        let mover = self.mover();
        self.hold(mover, Kind::Line, (run.at, run.at), (run.from, run.to));
        self.pieces.len() - 1
    }

    /// One mover for each run of the drawing's lines. Runs that share ink share a mover.
    fn runs(&mut self, drawing: &Placed, axis: Axis, two_way: &[&str]) {
        let joined: Vec<[Option<usize>; 2]> = (0..drawing.edges.len())
            .map(|line| [true, false].map(|start| joined_card(drawing, line, start, two_way)))
            .collect();
        let mut last: Option<usize> = None;
        for run in runs_of(drawing, axis) {
            let shared = last.filter(|&at| {
                let piece = &self.pieces[at];
                piece.low == run.at && run.from <= piece.to
            });
            let piece = shared.unwrap_or_else(|| self.run(&run));
            self.pieces[piece].to = self.pieces[piece].to.max(run.to);
            // The run that turns off the first stretch or onto the last, where a line that
            // shares that stretch parts from or joins the other.
            let ends = [
                run.points.start == 1,
                run.points.end + 1 == drawing.edges[run.line].points.len(),
            ];
            for (at_end, card) in ends.into_iter().zip(joined[run.line]) {
                let joins = &mut self.pieces[piece].joins;
                if let Some(card) = card.filter(|card| at_end && !joins.contains(card)) {
                    joins.push(card);
                }
            }
            self.lines[run.line][run.points].fill(self.pieces[piece].mover);
            last = Some(piece);
        }
    }

    /// Every card holds the mover of its place in the drawing's cards, so `cards` comes first.
    fn cards(&mut self, drawing: &Placed, axis: Axis) {
        for card in &drawing.cards {
            let mover = self.mover();
            let kind = if card.depth == 0 {
                Kind::Door
            } else {
                Kind::Card
            };
            self.add(axis, mover, kind, card.bx, card.bx);
        }
    }

    fn frames(&mut self, drawing: &Placed, axis: Axis) {
        for frame in &drawing.frames {
            let walls = self.walls(axis, frame.bx);
            self.frames.push(walls);
        }
        for region in &drawing.regions {
            let walls = self.walls(axis, region.bx);
            self.regions.push(walls);
            self.add(axis, walls.0, Kind::Tab, region.caption, region.caption);
        }
    }

    /// A title moves with the near wall of its frame, and it holds the frame's whole width.
    fn titles(&mut self, drawing: &Placed, axis: Axis) {
        for title in &drawing.titles {
            let frame = (drawing.frames.iter())
                .position(|frame| title.stands_in(frame.bx))
                .expect("a title stands in a frame");
            let (near, _) = self.frames[frame];
            let across = if axis == Axis::Y {
                drawing.frames[frame].bx
            } else {
                title.bx
            };
            self.add(axis, near, Kind::Tab, title.bx, across);
            self.titles.push(near);
        }
    }

    fn lines(&mut self, drawing: &Placed, axis: Axis, two_way: &[&str]) {
        for line in &drawing.edges {
            if let Some(label) = line.label {
                let mover = self.mover();
                self.add(axis, mover, Kind::Words, label, label);
                self.words.push(mover);
            }
            self.lines.push(vec![0; line.points.len()]);
        }
        self.runs(drawing, axis, two_way);
    }

    pub(super) fn of(drawing: &Placed, axis: Axis, two_way: &[&str]) -> Sheet {
        let mut sheet = Sheet::default();
        sheet.cards(drawing, axis);
        sheet.frames(drawing, axis);
        sheet.titles(drawing, axis);
        sheet.lines(drawing, axis, two_way);
        sheet
    }

    /// The pairs of movers that one straight run of a line joins, across this axis.
    pub(super) fn joined(&self) -> impl Iterator<Item = (usize, usize)> + '_ {
        (self.lines.iter()).flat_map(|points| points.windows(2).map(|pair| (pair[0], pair[1])))
    }

    /// Where the far end of the drawing stands once each mover took its shift.
    pub(super) fn end(&self, shifts: &[f64]) -> f64 {
        self.pieces
            .iter()
            .map(|piece| piece.high + shifts[piece.mover])
            .fold(f64::NEG_INFINITY, f64::max)
    }

    pub(super) fn apply_boxes(&self, drawing: &mut Placed, axis: Axis, shifts: &[f64]) {
        for (card, &shift) in drawing.cards.iter_mut().zip(shifts) {
            axis.slide(&mut card.bx, shift);
        }
        for (frame, &(near, far)) in drawing.frames.iter_mut().zip(&self.frames) {
            axis.stretch(&mut frame.bx, shifts[near], shifts[far]);
        }
        for (region, &(near, far)) in drawing.regions.iter_mut().zip(&self.regions) {
            axis.stretch(&mut region.bx, shifts[near], shifts[far]);
            axis.slide(&mut region.caption, shifts[near]);
        }
        for (title, &near) in drawing.titles.iter_mut().zip(&self.titles) {
            axis.slide(&mut title.bx, shifts[near]);
            axis.slide(&mut title.band, shifts[near]);
        }
    }

    pub(super) fn apply_lines(&self, drawing: &mut Placed, axis: Axis, shifts: &[f64]) {
        for (line, points) in drawing.edges.iter_mut().zip(&self.lines) {
            for (point, &mover) in line.points.iter_mut().zip(points) {
                axis.nudge(point, shifts[mover]);
            }
        }
        let labels = drawing
            .edges
            .iter_mut()
            .filter_map(|line| line.label.as_mut());
        for (label, &mover) in labels.zip(&self.words) {
            axis.slide(label, shifts[mover]);
        }
    }
}
