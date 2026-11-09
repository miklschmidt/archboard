//! The cards outside a reading's frames, its doors, stood in a ring round the whole the frames
//! make, each where its lines cost least.
//!
//! A door can stand anywhere along the four walls of that whole, at one gap from it. Either the
//! top and bottom walls reach past the corners, so a crowded wall spills along the page, or the
//! side walls do, so a column of doors runs past the frames' top and foot. The doors keep the
//! order round the ring of the places where each would stand alone, which keeps their lines from
//! crossing one another. For that order, a dynamic program over places along the ring finds the
//! place of every door that costs least in all, doors apart. The cost of a place is what the
//! door's lines cost the scene (`super::sketch`): their sketches, the bends, the way round what
//! they run through, and their crossings with the lines that no door ends. The box that the
//! doors and the whole fill costs its area as dead space, so a door that reaches past a corner
//! pays for the room it adds, not for a whole band. A page that does not read where it lands is
//! refused while one that reads holds the doors.

use crate::geometry::{Point, Rect};

use line_up::cheapest;

use super::{
    super::reading::DEAD_SPACE,
    sketch::{CROSSING, Chord, InTheWay, Line, Scene},
};

/// Room between a frame's wall and the doors round it, before routing.
pub(super) const RING_GAP: f64 = 112.0;
/// Room between two doors side by side along a wall.
const STEP: f64 = 40.0;
/// How finely places along the ring are tried.
const PITCH: f64 = 12.0;
/// Where the page can stand round the frames' whole, as shares of the room it has to spare.
const WINDOWS: [f64; 3] = [0.0, 0.5, 1.0];

/// Room round a label plate, from a line beside it.
const PLATE_CLEAR: f64 = 12.0;

/// A door as the ring stands it: its size, and the room that its lines' labels take side by
/// side where its lines leave it level, beside the frames.
#[derive(Clone, Copy, Debug)]
struct Door {
    size: Point,
    plates: f64,
}

impl Door {
    /// How much of a wall the door takes: a side wall also gives its lines' labels room.
    fn span(&self, wall: usize) -> f64 {
        if wall.is_multiple_of(2) {
            self.size.x
        } else {
            self.size.y.max(self.plates)
        }
    }
}

/// A whole count of slots: the floor or the ceiling of a length over the pitch.
#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "the floor or ceiling of a finite length that is not negative, over the pitch"
)]
fn slot_count(slots: f64) -> usize {
    slots as usize
}

/// One wall of the ring, clockwise from the top.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Wall {
    Top,
    Right,
    Bottom,
    Left,
}

const WALLS: [Wall; 4] = [Wall::Top, Wall::Right, Wall::Bottom, Wall::Left];

/// The ring round the frames' whole: where each wall starts along it and how long it is. Either
/// the top and bottom walls reach past the whole's corners, or the side walls do, so that no two
/// walls share a corner.
struct Ring {
    whole: Rect,
    gap: f64,
    /// How far the top and bottom walls reach past the whole's corners, and the side walls.
    reach: Point,
    /// Each wall's first slot and its slot count, in the order of `WALLS`.
    walls: [(usize, usize); 4],
}

impl Ring {
    fn new(whole: Rect, gap: f64, reach: Point) -> Ring {
        let slots = |length: f64| slot_count((length / PITCH).floor()) + 1;
        let level = slots(whole.width + 2.0 * reach.x);
        let upright = slots(whole.height + 2.0 * reach.y);
        let mut walls = [(0, 0); 4];
        let mut start = 0;
        for (at, wall) in WALLS.into_iter().enumerate() {
            let count = if matches!(wall, Wall::Top | Wall::Bottom) {
                level
            } else {
                upright
            };
            walls[at] = (start, count);
            start += count;
        }
        Ring {
            whole,
            gap,
            reach,
            walls,
        }
    }

    fn slots(&self) -> usize {
        self.walls[3].0 + self.walls[3].1
    }

    /// The wall a slot stands on, and how far along it.
    fn locate(&self, slot: usize) -> (usize, f64) {
        let wall = (0..4)
            .rev()
            .find(|&wall| slot >= self.walls[wall].0)
            .unwrap_or(0);
        (wall, (slot - self.walls[wall].0) as f64 * PITCH)
    }

    /// A door's box at a slot, if the door fits on that slot's wall from there. On a side wall
    /// the box stands in the middle of the room it takes.
    fn place(&self, slot: usize, door: Door) -> Option<Rect> {
        let (wall, along) = self.locate(slot);
        let room = (self.walls[wall].1 - 1) as f64 * PITCH;
        let span = door.span(wall);
        if along + span > room + 1e-9 {
            return None;
        }
        let (w, size) = (self.whole, door.size);
        let middle = (span - size.y) / 2.0;
        let (x, y) = match WALLS[wall] {
            Wall::Top => (w.x - self.reach.x + along, w.y - self.gap - size.y),
            Wall::Right => (
                w.x + w.width + self.gap,
                w.y - self.reach.y + along + middle,
            ),
            Wall::Bottom => (
                w.x + w.width + self.reach.x - along - size.x,
                w.y + w.height + self.gap,
            ),
            Wall::Left => (
                w.x - self.gap - size.x,
                w.y + w.height + self.reach.y - along - span + middle,
            ),
        };
        Some(Rect {
            x,
            y,
            width: size.x,
            height: size.y,
        })
    }

    /// The first slot that a door after one at this slot can take: past its room on the same
    /// wall, or the next wall's first slot, which stands clear of it round the corner.
    fn after(&self, slot: usize, door: Door) -> usize {
        let (wall, _) = self.locate(slot);
        let past = slot + slot_count(((door.span(wall) + STEP) / PITCH).ceil());
        let (start, count) = self.walls[wall];
        past.min(start + count)
    }
}

/// What one door costs at each of its boxes along the ring, `None` where it does not fit.
fn prices(
    scene: &mut Scene,
    (door, boxes): (usize, &[Option<Rect>]),
    doors: &[usize],
    fixed: &[Chord],
) -> Vec<Option<f64>> {
    let lines = own_lines(scene, door, doors);
    // Only the door moves, so what stands in each line's way stays.
    let in_the_way: Vec<InTheWay> = lines.iter().map(|&line| scene.in_the_way(line)).collect();
    (boxes.iter())
        .map(|&at| {
            scene.boxes[door] = at?;
            Some(
                (lines.iter().zip(&in_the_way))
                    .map(|(&line, way)| {
                        let chord = scene.chord(line);
                        let crossings = fixed.iter().filter(|other| chord.crosses(other)).count();
                        scene.sketch_among(line, way).1 + CROSSING * crossings as f64
                    })
                    .sum(),
            )
        })
        .collect()
}

/// The lines of a door whose other end is no door: each door's place is still open.
fn own_lines(scene: &Scene, door: usize, doors: &[usize]) -> Vec<usize> {
    (0..scene.lines.len())
        .filter(|&line| {
            let ends = scene.lines[line];
            let other = if ends.from == door {
                ends.to
            } else {
                ends.from
            };
            (ends.from == door || ends.to == door) && !doors.contains(&other)
        })
        .collect()
}

/// Stand every door of a scene round the whole its frames make, at one gap from it, within a
/// page that reads where one holds the doors (`pages`). A line between two doors weighs nothing
/// while both are still open, and pulls each door toward where the other stood once every door
/// has a place.
pub(super) fn stand(scene: &mut Scene, doors: &[usize], whole: Rect, gap: f64, page: Point) {
    if doors.is_empty() {
        return;
    }
    stand_open(scene, (doors, doors), whole, gap, page);
    let between = |line: &Line| doors.contains(&line.from) && doors.contains(&line.to);
    if scene.lines.iter().any(between) {
        stand_open(scene, (doors, &[]), whole, gap, page);
    }
}

/// The pages that the doors can stand within round a whole, those that read both ways first. On
/// each side of the whole a page holds nothing or the band of one row of doors. A page that
/// reads where it lands, at a few places round the whole, also lets a row reach past the whole's
/// corners. A page taller than one that reads still holds its doors within the width that reads.
fn pages(whole: Rect, page: Point, band: Point) -> [Vec<Rect>; 2] {
    let mut pages = Vec::new();
    for (before, after) in [(0.0, 0.0), (band.x, 0.0), (0.0, band.x), (band.x, band.x)] {
        for (above, below) in [(0.0, 0.0), (band.y, 0.0), (0.0, band.y), (band.y, band.y)] {
            pages.push(Rect {
                x: whole.x - before,
                y: whole.y - above,
                width: whole.width + before + after,
                height: whole.height + above + below,
            });
        }
    }
    let slack = Point {
        x: (page.x - whole.width).max(0.0),
        y: (page.y - whole.height).max(0.0),
    };
    for across in WINDOWS.map(|share| share * slack.x) {
        for down in WINDOWS.map(|share| share * slack.y) {
            pages.push(Rect {
                x: whole.x - across,
                y: whole.y - down,
                width: whole.width + slack.x,
                height: whole.height + slack.y,
            });
        }
    }
    let reads = |size: f64, most: f64, whole: f64| size <= most.max(whole) + 1e-6;
    pages.retain(|one| reads(one.width, page.x, whole.width));
    let both = (pages.iter())
        .copied()
        .filter(|one| reads(one.height, page.y, whole.height))
        .collect();
    let across = (pages.iter())
        .map(|&one| Rect {
            y: f64::NEG_INFINITY,
            height: f64::INFINITY,
            ..one
        })
        .collect();
    [both, across]
}

/// The box round a whole and some doors.
fn bounds(whole: Rect, doors: impl Iterator<Item = Rect>) -> Rect {
    let (mut low, mut high) = (
        Point {
            x: whole.x,
            y: whole.y,
        },
        Point {
            x: whole.x + whole.width,
            y: whole.y + whole.height,
        },
    );
    for at in doors {
        low = Point {
            x: low.x.min(at.x),
            y: low.y.min(at.y),
        };
        high = Point {
            x: high.x.max(at.x + at.width),
            y: high.y.max(at.y + at.height),
        };
    }
    Rect {
        x: low.x,
        y: low.y,
        width: high.x - low.x,
        height: high.y - low.y,
    }
}

/// Whether a box stands within another.
fn within(at: Rect, one: &Rect) -> bool {
    at.x >= one.x - 1e-6
        && at.y >= one.y - 1e-6
        && at.x + at.width <= one.x + one.width + 1e-6
        && at.y + at.height <= one.y + one.height + 1e-6
}

/// The cheapest places of doors on any of some rings within any of some pages, with the box
/// that they and the whole fill weighed as dead space: the ring's index, the doors' order and
/// their places.
fn cheapest_page(
    rings: &[Priced],
    pages: &[Rect],
    sizes: &[Door],
    whole: Rect,
) -> Option<(usize, Vec<usize>, Vec<usize>)> {
    let mut best: Option<(f64, usize, Vec<usize>, Vec<usize>)> = None;
    for (at, one) in rings.iter().enumerate() {
        // A page that allows the same places as one before it stands the doors alike, at the
        // same cost, and an earlier page wins a tie.
        let mut met: Vec<Vec<bool>> = Vec::new();
        for holds in pages {
            let allowed: Vec<bool> = (one.boxes.iter().flatten())
                .map(|box_| box_.is_some_and(|box_| within(box_, holds)))
                .collect();
            if met.contains(&allowed) {
                continue;
            }
            let costs: Vec<Vec<Option<f64>>> = (one.costs.iter())
                .zip(allowed.chunks(one.ring.slots()))
                .map(|(costs, allowed)| {
                    (costs.iter().zip(allowed))
                        .map(|(&cost, &allowed)| cost.filter(|_| allowed))
                        .collect()
                })
                .collect();
            met.push(allowed);
            let Some((total, order, places)) = cheapest(&one.ring, sizes, &costs) else {
                continue;
            };
            let stood =
                (order.iter().zip(&places)).filter_map(|(&door, &slot)| one.boxes[door][slot]);
            let filled = bounds(whole, stood);
            let total = total + filled.width * filled.height / DEAD_SPACE;
            if best
                .as_ref()
                .is_none_or(|best| total.total_cmp(&best.0).is_lt())
            {
                best = Some((total, at, order, places));
            }
        }
    }
    best.map(|(_, at, order, places)| (at, order, places))
}

/// A ring with each door's box at each of its places, where it fits, and its price there.
struct Priced {
    ring: Ring,
    boxes: Vec<Vec<Option<Rect>>>,
    costs: Vec<Vec<Option<f64>>>,
}

/// Each door as the ring stands it.
fn door_sizes(scene: &Scene, doors: &[usize]) -> Vec<Door> {
    (doors.iter())
        .map(|&door| Door {
            size: Point {
                x: scene.boxes[door].width,
                y: scene.boxes[door].height,
            },
            plates: (own_lines(scene, door, &[]).iter())
                .map(|&line| scene.lines[line].plate + 2.0 * PLATE_CLEAR)
                .sum(),
        })
        .collect()
}

/// The doors that stand, the doors still open, and the chords of the lines that no door ends.
type Standing<'s> = (&'s [usize], &'s [usize], &'s [Chord]);

/// A ring with what each door costs at each of its places.
fn priced(
    scene: &mut Scene,
    ring: Ring,
    (doors, open, fixed): Standing<'_>,
    sizes: &[Door],
) -> Priced {
    let boxes: Vec<Vec<Option<Rect>>> = (sizes.iter())
        .map(|&stood| {
            (0..ring.slots())
                .map(|slot| ring.place(slot, stood))
                .collect()
        })
        .collect();
    let costs = (doors.iter().zip(&boxes))
        .map(|(&door, boxes)| prices(scene, (door, boxes), open, fixed))
        .collect();
    Priced { ring, boxes, costs }
}

/// Stand every door once, where the lines from a door to the doors still open weigh nothing.
/// The doors stand on whichever ring and within whichever page costs least, with the box they
/// and the whole fill weighed as dead space.
fn stand_open(
    scene: &mut Scene,
    (doors, open): (&[usize], &[usize]),
    whole: Rect,
    gap: f64,
    page: Point,
) {
    let is_door = |at: usize| doors.contains(&at);
    let fixed: Vec<Chord> = (0..scene.lines.len())
        .filter(|&line| !is_door(scene.lines[line].from) && !is_door(scene.lines[line].to))
        .map(|line| scene.chord(line))
        .collect();
    // While doors move, none stands in another's way.
    let solid: Vec<bool> = doors.iter().map(|&door| scene.solid[door]).collect();
    for &door in doors {
        scene.solid[door] = false;
    }
    let sizes = door_sizes(scene, doors);
    let largest = |of: fn(&Door) -> f64| sizes.iter().map(of).fold(0.0, f64::max);
    let widest = largest(|door| door.size.x);
    let band = Point {
        x: widest + gap,
        y: largest(|door| door.size.y) + gap,
    };
    let standing = (doors, open, fixed.as_slice());
    let level = (page.x - whole.width).max(widest + STEP);
    let upright = (page.y - whole.height).max(0.0);
    let rings = [
        priced(
            scene,
            Ring::new(whole, gap, Point { x: level, y: 0.0 }),
            standing,
            &sizes,
        ),
        priced(
            scene,
            Ring::new(whole, gap, Point { x: 0.0, y: upright }),
            standing,
            &sizes,
        ),
    ];
    let found = pages(whole, page, band)
        .into_iter()
        .find_map(|pages| cheapest_page(&rings, &pages, &sizes, whole));
    let (ring, order, places) = match found {
        Some((at, order, places)) => {
            let ring = rings
                .into_iter()
                .nth(at)
                .expect("the ring the doors stand on");
            (ring, order, places)
        }
        // No page that reads across holds the doors: the ring widens until they fit.
        None => widened(scene, standing, &sizes, (whole, gap, level + widest + STEP)),
    };
    for (&door, &slot) in order.iter().zip(&places) {
        if let Some(at) = ring.boxes[door][slot] {
            scene.boxes[doors[door]] = at;
        }
    }
    for (&door, was) in doors.iter().zip(solid) {
        scene.solid[door] = was;
    }
}

/// A ring whose top and bottom walls reach further past the whole's corners, step by step from
/// some reach, until it holds every door, and their order and places on it.
fn widened(
    scene: &mut Scene,
    standing: Standing<'_>,
    sizes: &[Door],
    (whole, gap, from): (Rect, f64, f64),
) -> (Priced, Vec<usize>, Vec<usize>) {
    let widest = sizes.iter().map(|door| door.size.x).fold(0.0, f64::max);
    let mut reach = from;
    loop {
        let ring = priced(
            scene,
            Ring::new(whole, gap, Point { x: reach, y: 0.0 }),
            standing,
            sizes,
        );
        if let Some((_, order, places)) = cheapest(&ring.ring, sizes, &ring.costs) {
            return (ring, order, places);
        }
        reach += widest + STEP;
    }
}

mod line_up;
#[cfg(test)]
mod tests;
