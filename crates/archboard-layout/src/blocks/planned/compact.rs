//! Close the space that nothing in a routed drawing uses. Every card, wall, word plate and run
//! of a line moves on its own, in whole units, and keeps its order against whatever shares its
//! slab of the page. So a route keeps its bends and crossings, and a gap shrinks to what runs in
//! it at that height, whatever another row needs there.

use crate::{
    blocks::assembly::Placed,
    constants::{APPROACH_STRAIGHT, BEND_RADIUS, CONTAINER_INSET},
    geometry::{Point, Rect},
    track::chains::LANE,
};

use super::shape::Shape;

/// The least room between two cards.
const CARD_GAP: f64 = 2.0 * LANE;
/// The room a line needs off a card it ends on: its arrow and the bend behind it.
const APPROACH: f64 = APPROACH_STRAIGHT + BEND_RADIUS + 1.0;
/// Cards that stood on one station stay on one while parting would bring them less than this.
const STAY_ALIGNED: f64 = 40.0;
/// How near a card's corner a straight line to a neighbour can slide along its wall.
const SLIDE_MARGIN: f64 = 24.0;
/// Two pieces nearer than this touch, as a line's end touches its wall.
const TOUCH: f64 = 0.1;
/// How many passes over both axes a drawing takes. A later pass finds what the other axis freed.
const PASSES: usize = 2;
/// How many times the lines that a squeeze stretched take their length back.
const SHORTEN_PASSES: usize = 3;

/// An axis of the page.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Axis {
    X,
    Y,
}

impl Axis {
    fn along(self, at: Point) -> f64 {
        match self {
            Axis::X => at.x,
            Axis::Y => at.y,
        }
    }

    fn across(self, at: Point) -> f64 {
        match self {
            Axis::X => at.y,
            Axis::Y => at.x,
        }
    }

    /// A box's low and high ends on this axis.
    fn span(self, at: Rect) -> (f64, f64) {
        match self {
            Axis::X => (at.x, at.x + at.width),
            Axis::Y => (at.y, at.y + at.height),
        }
    }

    fn other(self) -> Axis {
        match self {
            Axis::X => Axis::Y,
            Axis::Y => Axis::X,
        }
    }

    fn slide(self, at: &mut Rect, by: f64) {
        match self {
            Axis::X => at.x += by,
            Axis::Y => at.y += by,
        }
    }

    /// Move a box's two ends, each by its own amount.
    fn stretch(self, at: &mut Rect, near: f64, far: f64) {
        self.slide(at, near);
        match self {
            Axis::X => at.width += far - near,
            Axis::Y => at.height += far - near,
        }
    }

    fn nudge(self, at: &mut Point, by: f64) {
        match self {
            Axis::X => at.x += by,
            Axis::Y => at.y += by,
        }
    }

    fn extent(self, drawing: &mut Placed) -> &mut f64 {
        match self {
            Axis::X => &mut drawing.width,
            Axis::Y => &mut drawing.height,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
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
#[derive(Clone, Copy)]
struct Piece {
    /// What moves it.
    mover: usize,
    kind: Kind,
    low: f64,
    high: f64,
    from: f64,
    to: f64,
}

/// One rule between two movers: the second's shift is at least the first's plus this much.
struct Rule {
    first: usize,
    second: usize,
    least: f64,
}

/// Sets of movers that travel together.
struct Bodies(Vec<usize>);

impl Bodies {
    fn of(&mut self, mut at: usize) -> usize {
        while self.0[at] != at {
            self.0[at] = self.0[self.0[at]];
            at = self.0[at];
        }
        at
    }

    fn join(&mut self, a: usize, b: usize) {
        let (a, b) = (self.of(a), self.of(b));
        self.0[a.max(b)] = a.min(b);
    }
}

/// A stretch of one line that stands still on this axis: the place of its points in the line.
struct Run {
    at: f64,
    from: f64,
    to: f64,
    line: usize,
    first: usize,
    points: usize,
}

fn line_runs(line: usize, points: &[Point], axis: Axis) -> Vec<Run> {
    let mut first = 0;
    points
        .chunk_by(|a, b| axis.along(*a) == axis.along(*b))
        .map(|run| {
            let across = run.iter().map(|&point| axis.across(point));
            let here = Run {
                at: axis.along(run[0]),
                from: across.clone().fold(f64::INFINITY, f64::min),
                to: across.fold(f64::NEG_INFINITY, f64::max),
                line,
                first,
                points: run.len(),
            };
            first += run.len();
            here
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

/// What moves each part of a drawing on one axis, and the pieces they hold.
#[derive(Default)]
struct Sheet {
    pieces: Vec<Piece>,
    movers: usize,
    cards: Vec<usize>,
    /// The near and far wall of each frame, of each region and of each title.
    frames: Vec<(usize, usize)>,
    regions: Vec<(usize, usize)>,
    titles: Vec<(usize, usize)>,
    /// The mover of every point of every line.
    lines: Vec<Vec<usize>>,
    words: Vec<usize>,
}

impl Sheet {
    fn mover(&mut self) -> usize {
        self.movers += 1;
        self.movers - 1
    }

    /// A piece that stands along this axis as one box does, across it as another.
    fn add(&mut self, axis: Axis, mover: usize, kind: Kind, along: Rect, across: Rect) {
        let (low, high) = axis.span(along);
        let (from, to) = axis.other().span(across);
        self.pieces.push(Piece {
            mover,
            kind,
            low,
            high,
            from,
            to,
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
        self.pieces.push(Piece {
            mover,
            kind: Kind::Line,
            low: run.at,
            high: run.at,
            from: run.from,
            to: run.to,
        });
        self.pieces.len() - 1
    }

    /// One mover for each run of the drawing's lines. Runs that share ink share a mover.
    fn runs(&mut self, drawing: &Placed, axis: Axis) {
        let mut last: Option<usize> = None;
        for run in runs_of(drawing, axis) {
            let shared = last.filter(|&at| {
                let piece = &self.pieces[at];
                piece.low == run.at && run.from <= piece.to
            });
            let piece = shared.unwrap_or_else(|| self.run(&run));
            self.pieces[piece].to = self.pieces[piece].to.max(run.to);
            let points = run.first..run.first + run.points;
            self.lines[run.line][points].fill(self.pieces[piece].mover);
            last = Some(piece);
        }
    }

    fn cards(&mut self, drawing: &Placed, axis: Axis) {
        for card in &drawing.cards {
            let mover = self.mover();
            let kind = if card.depth == 0 {
                Kind::Door
            } else {
                Kind::Card
            };
            self.add(axis, mover, kind, card.bx, card.bx);
            self.cards.push(mover);
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

    /// A title moves with the walls of its frame, and it holds the frame's whole width.
    fn titles(&mut self, drawing: &Placed, axis: Axis) {
        for title in &drawing.titles {
            let holder = (drawing.frames.iter())
                .position(|frame| frame.bx.x == title.band.x && frame.bx.y == title.band.y);
            let walls = match holder {
                Some(frame) => self.frames[frame],
                None => (self.mover(), self.mover()),
            };
            let held = holder.map_or(title.band, |frame| drawing.frames[frame].bx);
            let across = if axis == Axis::Y { held } else { title.bx };
            self.add(axis, walls.0, Kind::Tab, title.bx, across);
            self.titles.push(walls);
        }
    }

    fn lines(&mut self, drawing: &Placed, axis: Axis) {
        for line in &drawing.edges {
            let mover = self.mover();
            if let Some(label) = line.label {
                self.add(axis, mover, Kind::Words, label, label);
            }
            self.words.push(mover);
            self.lines.push(vec![0; line.points.len()]);
        }
        self.runs(drawing, axis);
    }

    fn of(drawing: &Placed, axis: Axis) -> Sheet {
        let mut sheet = Sheet::default();
        sheet.cards(drawing, axis);
        sheet.frames(drawing, axis);
        sheet.titles(drawing, axis);
        sheet.lines(drawing, axis);
        sheet
    }

    /// The pairs of movers that one straight run of a line joins, across this axis.
    fn joined(&self) -> impl Iterator<Item = (usize, usize)> + '_ {
        self.lines.iter().flat_map(|points| {
            points
                .windows(2)
                .filter(|pair| pair[0] != pair[1])
                .map(|pair| (pair[0], pair[1]))
        })
    }

    /// Where the far end of the drawing stands once each mover took its shift.
    fn end(&self, shifts: &[f64]) -> f64 {
        self.pieces
            .iter()
            .map(|piece| piece.high + shifts[piece.mover])
            .fold(f64::NEG_INFINITY, f64::max)
    }

    fn apply_boxes(&self, drawing: &mut Placed, axis: Axis, shifts: &[f64]) {
        for (card, &mover) in drawing.cards.iter_mut().zip(&self.cards) {
            axis.slide(&mut card.bx, shifts[mover]);
        }
        for (frame, &(near, far)) in drawing.frames.iter_mut().zip(&self.frames) {
            axis.stretch(&mut frame.bx, shifts[near], shifts[far]);
        }
        for (region, &(near, far)) in drawing.regions.iter_mut().zip(&self.regions) {
            axis.stretch(&mut region.bx, shifts[near], shifts[far]);
            axis.slide(&mut region.caption, shifts[near]);
        }
        for (title, &(near, far)) in drawing.titles.iter_mut().zip(&self.titles) {
            axis.slide(&mut title.bx, shifts[near]);
            let far = if axis == Axis::X { far } else { near };
            axis.stretch(&mut title.band, shifts[near], shifts[far]);
        }
    }

    fn apply_lines(&self, drawing: &mut Placed, axis: Axis, shifts: &[f64]) {
        for ((line, points), &words) in drawing.edges.iter_mut().zip(&self.lines).zip(&self.words) {
            for (point, &mover) in line.points.iter_mut().zip(points) {
                axis.nudge(point, shifts[mover]);
            }
            if let Some(label) = &mut line.label {
                axis.slide(label, shifts[words]);
            }
        }
    }
}

/// How much room the pair must keep at least, the first at the low end.
fn room(first: Kind, second: Kind, clear: f64) -> f64 {
    use Kind::{Card, Door, Far, Line, Near, Tab};
    match (first, second) {
        (Near | Tab, Card | Door) | (Card | Door, Far) => CONTAINER_INSET,
        (Card | Door | Far, Card | Door | Near) | (Far, Far) => CARD_GAP,
        (Card | Door, Line) | (Line, Card | Door) => (2.0 * clear).max(APPROACH),
        _ => 2.0 * clear,
    }
}

/// Whether a run ends on a top or bottom wall of a card, as this axis sees it.
fn ends_on(run: &Piece, card: &Piece, reach: f64) -> bool {
    run.kind == Kind::Line
        && matches!(card.kind, Kind::Card | Kind::Door)
        && run.low > card.low + TOUCH
        && run.low < card.high - TOUCH
        && card.from - reach < run.to
        && run.from - reach < card.to
}

/// A run that ends on a card holds that card's whole slab, so that the runs on its opposite
/// walls stay a lane apart.
fn reach_through(pieces: &mut [Piece], reach: f64) {
    let cards: Vec<Piece> = pieces
        .iter()
        .copied()
        .filter(|piece| matches!(piece.kind, Kind::Card | Kind::Door))
        .collect();
    for run in pieces.iter_mut() {
        for card in &cards {
            if ends_on(run, card, reach) {
                run.from = run.from.min(card.from);
                run.to = run.to.max(card.to);
            }
        }
    }
}

/// The rules between a drawing's pieces, and which movers travel together.
struct Found {
    rules: Vec<Rule>,
    bodies: Bodies,
    /// Whether a run already moves with a card.
    held: Vec<bool>,
    clear: f64,
}

impl Found {
    fn push(&mut self, first: &Piece, second: &Piece, least: f64) {
        self.rules.push(Rule {
            first: first.mover,
            second: second.mover,
            least,
        });
    }

    /// The second keeps its order past the first, with its room or the room it has.
    fn keep(&mut self, first: &Piece, second: &Piece) {
        let gap = second.low - first.high;
        let least = room(first.kind, second.kind, self.clear).min(gap) - gap;
        self.push(first, second, least);
    }

    /// A run stays on a card's wall, clear of its corners.
    fn slide(&mut self, card: &Piece, run: &Piece) {
        let (near, far) = (run.low - card.low, card.high - run.low);
        let margin = SLIDE_MARGIN.min(near).min(far);
        self.push(card, run, margin - near);
        self.push(run, card, margin - far);
    }

    /// Two pieces of one slab keep their order. A run moves with the first card it ends on,
    /// and it slides on the wall of the second. What overlaps or touches travels together.
    fn pair(&mut self, one: &Piece, two: &Piece) {
        if two.low - one.high > TOUCH {
            self.keep(one, two);
        } else if one.low - two.high > TOUCH {
            self.keep(two, one);
        } else if ends_on(two, one, 2.0 * self.clear) && self.held[two.mover] {
            self.slide(one, two);
        } else {
            self.held[two.mover] = true;
            self.bodies.join(one.mover, two.mover);
        }
    }
}

/// The rules that keep the order of a drawing's pieces, and which movers travel together.
fn rules_of(pieces: &[Piece], movers: usize, clear: f64) -> (Vec<Rule>, Bodies) {
    let reach = 2.0 * clear;
    let apart = |one: &Piece, two: &Piece| one.from - reach >= two.to || two.from - reach >= one.to;
    let mut found = Found {
        rules: Vec::new(),
        bodies: Bodies((0..movers).collect()),
        held: vec![false; movers],
        clear,
    };
    for (at, one) in pieces.iter().enumerate() {
        for two in &pieces[at + 1..] {
            if one.mover != two.mover && !apart(one, two) {
                found.pair(one, two);
            }
        }
    }
    let Found {
        mut rules,
        mut bodies,
        ..
    } = found;
    for rule in &mut rules {
        rule.first = bodies.of(rule.first);
        rule.second = bodies.of(rule.second);
    }
    rules.retain(|rule| rule.first != rule.second);
    (rules, bodies)
}

/// The least whole shift of every body that keeps every rule, from some lower bounds.
fn solve(rules: &[Rule], shifts: &mut [f64]) {
    let mut moved = true;
    while moved {
        moved = false;
        for rule in rules {
            let least = (shifts[rule.first] + rule.least).ceil();
            if least > shifts[rule.second] {
                shifts[rule.second] = least;
                moved = true;
            }
        }
    }
}

/// The cards that stand on one station of an axis, as places in the drawing's cards.
fn stations(drawing: &Placed, axis: Axis) -> Vec<Vec<usize>> {
    let mut at: Vec<(f64, usize)> = (drawing.cards.iter().enumerate())
        .map(|(card, placed)| (axis.span(placed.bx).0, card))
        .collect();
    at.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));
    at.chunk_by(|a, b| a.0 == b.0)
        .map(|station| station.iter().map(|&(_, card)| card).collect())
        .collect()
}

/// Bring the cards of each station back together while parting them gains little. The
/// stations come from low to high, so a card that moves carries the stations beyond it.
fn keep_aligned(
    sheet: &Sheet,
    stations: &[Vec<usize>],
    rules: &[Rule],
    bodies: &mut Bodies,
    shifts: &mut [f64],
) {
    for station in stations {
        let mut standing: Vec<(f64, usize)> = station
            .iter()
            .map(|&card| {
                let body = bodies.of(sheet.pieces[card].mover);
                (sheet.pieces[card].low + shifts[body], body)
            })
            .collect();
        standing.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));
        for near in standing.chunk_by(|a, b| b.0 - a.0 <= STAY_ALIGNED) {
            let to = near.last().map_or(0.0, |card| card.0);
            for &(at, body) in near {
                shifts[body] += to - at;
            }
        }
        solve(rules, shifts);
    }
}

/// A line that the squeeze stretched takes it back: a door or a bend that stands short of
/// more of its runs than it stands past moves on, as far as what stands beyond it allows.
fn shorten(sheet: &Sheet, rules: &[Rule], bodies: &mut Bodies, shifts: &mut [f64]) {
    let mut place = vec![0.0; sheet.movers];
    let mut placed = vec![false; sheet.movers];
    for piece in &sheet.pieces {
        place[piece.mover] = piece.low;
        let body = bodies.of(piece.mover);
        placed[body] |= !matches!(piece.kind, Kind::Door | Kind::Line | Kind::Words);
    }
    let runs: Vec<(usize, usize, usize, usize)> = sheet
        .joined()
        .map(|(a, b)| (bodies.of(a), a, bodies.of(b), b))
        .filter(|run| run.0 != run.2)
        .collect();
    let mut order: Vec<usize> = (0..sheet.movers)
        .filter(|&mover| !placed[mover] && bodies.of(mover) == mover)
        .collect();
    let at = |body: usize, shifts: &[f64]| place[body] + shifts[body];
    order.sort_by(|&a, &b| at(b, shifts).total_cmp(&at(a, shifts)).then(a.cmp(&b)));
    for _ in 0..SHORTEN_PASSES {
        for &body in &order {
            let ends: Vec<f64> = (runs.iter())
                .filter_map(|&(a, near, b, far)| {
                    if a == body {
                        Some(place[far] + shifts[b] - (place[near] + shifts[a]))
                    } else if b == body {
                        Some(place[near] + shifts[a] - (place[far] + shifts[b]))
                    } else {
                        None
                    }
                })
                .collect();
            let beyond = || ends.iter().copied().filter(|&end| end > 0.0);
            if beyond().count() <= ends.iter().filter(|&&end| end < 0.0).count() {
                continue;
            }
            let free = (rules.iter())
                .filter(|rule| rule.first == body)
                .map(|rule| shifts[rule.second] - rule.least - shifts[body])
                .fold(-shifts[body], f64::min);
            shifts[body] += beyond().fold(free, f64::min).max(0.0).floor();
        }
    }
}

/// Move everything on one axis as near the start of the page as its rules allow.
fn squeeze(drawing: &mut Placed, axis: Axis, stations: &[Vec<usize>], clear: f64) -> bool {
    let margin = 2.0 * clear;
    let mut sheet = Sheet::of(drawing, axis);
    reach_through(&mut sheet.pieces, margin);
    let (rules, mut bodies) = rules_of(&sheet.pieces, sheet.movers, clear);
    let start = sheet.pieces.iter().map(|piece| piece.low);
    let start = start.fold(margin, f64::min);
    let mut shifts = vec![f64::NEG_INFINITY; sheet.movers];
    for piece in &sheet.pieces {
        let body = bodies.of(piece.mover);
        shifts[body] = shifts[body].max((start - piece.low).ceil());
    }
    solve(&rules, &mut shifts);
    keep_aligned(&sheet, stations, &rules, &mut bodies, &mut shifts);
    shorten(&sheet, &rules, &mut bodies, &mut shifts);
    let shifts: Vec<f64> = (0..sheet.movers)
        .map(|mover| shifts[bodies.of(mover)])
        .collect();
    let extent = *axis.extent(drawing);
    let room = (extent - sheet.end(&vec![0.0; sheet.movers])).min(margin);
    *axis.extent(drawing) = (sheet.end(&shifts) + room).ceil();
    sheet.apply_boxes(drawing, axis, &shifts);
    sheet.apply_lines(drawing, axis, &shifts);
    shifts.iter().any(|&shift| shift != 0.0) || *axis.extent(drawing) != extent
}

/// A routed drawing with the space that nothing uses taken out, if any was. Every run keeps
/// a clearance of `clear` on each side. The caller must place the labels again and apply the
/// complete geometry guard.
pub(super) fn drawing(shape: &Shape, clear: f64) -> Option<Placed> {
    let mut drawing = (*shape.drawing).clone();
    drawing.edges.clone_from(&shape.routes);
    let columns = stations(&drawing, Axis::X);
    let rows = stations(&drawing, Axis::Y);
    let mut moved = false;
    for _ in 0..PASSES {
        moved |= squeeze(&mut drawing, Axis::X, &columns, clear);
        moved |= squeeze(&mut drawing, Axis::Y, &rows, clear);
    }
    moved.then_some(drawing)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocks::assembly::{PlacedCard, PlacedLine};

    const CARD: Point = Point { x: 200.0, y: 100.0 };

    fn card(id: &str, x: f64, y: f64) -> PlacedCard {
        PlacedCard {
            id: id.into(),
            bx: Rect {
                x,
                y,
                width: CARD.x,
                height: CARD.y,
            },
            depth: 1,
            header: None,
        }
    }

    /// A run that climbs the gap of the first row and leaves it above and below.
    fn lane(id: &str, x: f64) -> PlacedLine {
        let (start, end) = (Point { x, y: 0.0 }, Point { x, y: 150.0 });
        PlacedLine {
            id: id.into(),
            points: vec![start, end],
            label: None,
        }
    }

    #[test]
    fn a_busy_row_leaves_the_gap_of_a_quiet_row_alone() {
        let left = 100.0;
        let right = left + CARD.x + 200.0;
        let cards = vec![
            card("a", left, 20.0),
            card("b", right, 20.0),
            card("c", left, 300.0),
            card("d", right, 300.0),
        ];
        let lanes = (0..3).map(|lane_at| {
            let at = f64::from(lane_at);
            lane(&format!("lane{lane_at}"), left + CARD.x + 60.0 + at * 40.0)
        });
        let shape = Shape::new(Placed {
            width: 1000.0,
            height: 600.0,
            cards,
            frames: Vec::new(),
            regions: Vec::new(),
            edges: lanes.collect(),
            titles: Vec::new(),
            routed: None,
        });
        let drawn = drawing(&shape, 8.0).expect("a gap to close");
        let gap = |one: usize, two: usize| {
            let (first, second) = (drawn.cards[one].bx, drawn.cards[two].bx);
            second.x - first.x - first.width
        };
        assert_eq!(gap(2, 3), CARD_GAP);
        assert!(gap(0, 1) >= 3.0 * 2.0 * 8.0);
    }
}
