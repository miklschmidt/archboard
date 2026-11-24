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
//! pays for the room it adds, not for a whole band. That box also pays for the pane it leaves
//! blank where it lands (`super::super::reading`), so a strip loses to a box of the pane's shape.
//! A page that does not read where it lands is refused while one that reads holds the doors.

use rustc_hash::FxHashMap;

use crate::geometry::{Point, Rect};

use line_up::{Scratch, cheapest};
use pages::{cheapest_page, pages};

use super::sketch::{CROSSING, Chord, InTheWay, Line, Past, Scene};

/// Room between a frame's wall and the doors round it, before routing.
pub(super) const RING_GAP: f64 = 112.0;
/// Room between two doors side by side along a wall.
const STEP: f64 = 40.0;
/// How finely places along the ring are tried.
const PITCH: f64 = 12.0;

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

    /// How many slots a door takes on each wall, with the step to the next door.
    fn takes(door: Door) -> [usize; 4] {
        [0, 1, 2, 3].map(|wall| slot_count(((door.span(wall) + STEP) / PITCH).ceil()))
    }
}

/// Precomputed scene queries for one door, reused across every ring of one `stand_open` pass.
struct DoorScene {
    door: usize,
    lines: Vec<usize>,
    alone: bool,
    in_the_way: Vec<InTheWay>,
    past: Vec<Past>,
}

fn door_scenes(scene: &Scene, (doors, open, fixed): Standing<'_>) -> Vec<DoorScene> {
    doors
        .iter()
        .map(|&door| {
            let lines = own_lines(scene, door, open);
            let alone = (lines.iter()).all(|&line| {
                let ends = scene.lines[line];
                !doors.contains(&ends.from) || !doors.contains(&ends.to)
            });
            // Only the door moves, so what stands in each line's way stays, and so do the fixed
            // chords that the line can cross.
            let in_the_way = lines.iter().map(|&line| scene.in_the_way(line)).collect();
            let past = (lines.iter())
                .map(|&line| scene.past(line, door, fixed))
                .collect();
            DoorScene {
                door,
                lines,
                alone,
                in_the_way,
                past,
            }
        })
        .collect()
}

/// What one door costs at each of its boxes along the ring, `f64::INFINITY` where it does not fit.
/// A door whose lines end on no other door costs what its box alone sets, so a box that another
/// ring gave it before costs what it cost then (`known`).
fn prices(
    scene: &mut Scene,
    door_scene: &DoorScene,
    boxes: &[Option<Rect>],
    known: &mut FxHashMap<[u64; 2], f64>,
    out: &mut Vec<f64>,
) {
    let door = door_scene.door;
    // The doors priced after this one see this door where it stood before.
    let stood = scene.boxes[door];
    out.extend(boxes.iter().map(|&at| {
        let Some(at) = at else {
            return f64::INFINITY;
        };
        scene.boxes[door] = at;
        let bits = [at.x, at.y].map(f64::to_bits);
        if door_scene.alone
            && let Some(&cost) = known.get(&bits)
        {
            return cost;
        }
        let cost = (door_scene.lines.iter())
            .zip(&door_scene.in_the_way)
            .zip(&door_scene.past)
            .map(|((&line, way), past)| {
                let crossings = scene.chord(line).crossings(past);
                scene.cost_among(line, way) + CROSSING * crossings as f64
            })
            .sum();
        if door_scene.alone {
            known.insert(bits, cost);
        }
        cost
    }));
    scene.boxes[door] = stood;
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
    // Where the doors stand and what they cost follow from the rest of the scene alone, so a
    // scene whose other boxes did not move keeps what the ring knew of it.
    let mut ringed = std::mem::take(&mut scene.ringed);
    let bits = standing(scene, doors);
    if ringed.scene != bits {
        ringed = Ringed {
            scene: bits,
            known: vec![Known::default(); doors.len()],
            stood: None,
        };
    }
    let around = [
        whole.x,
        whole.y,
        whole.width,
        whole.height,
        gap,
        page.x,
        page.y,
    ];
    let around = around.map(f64::to_bits);
    if let Some((before, places)) = &ringed.stood
        && *before == around
    {
        for (&door, &at) in doors.iter().zip(places) {
            scene.boxes[door] = at;
        }
    } else {
        stand_open(scene, (doors, doors), (whole, gap, page), &mut ringed.known);
        let between = |line: &Line| doors.contains(&line.from) && doors.contains(&line.to);
        if scene.lines.iter().any(between) {
            stand_open(scene, (doors, &[]), (whole, gap, page), &mut ringed.known);
        }
        ringed.stood = Some((
            around,
            doors.iter().map(|&door| scene.boxes[door]).collect(),
        ));
    }
    scene.ringed = ringed;
}

/// What the ring knows of one scene: the bits of the scene but where the doors stand, what each
/// door cost at each box it took, and where it last stood the doors, with the bits of the whole,
/// the gap and the page it stood them for.
#[derive(Clone, Debug, Default)]
pub(super) struct Ringed {
    scene: Vec<u64>,
    known: Vec<Known>,
    stood: Option<([u64; 7], Vec<Rect>)>,
}

/// The bits of the scene but where the doors stand.
fn standing(scene: &Scene, doors: &[usize]) -> Vec<u64> {
    let counts = [scene.boxes.len(), scene.frames.len(), scene.lines.len()];
    let mut bits: Vec<u64> = (counts.iter().chain(doors))
        .map(|&count| count as u64)
        .collect();
    for (at, one) in scene.boxes.iter().enumerate() {
        if !doors.contains(&at) {
            bits.extend([one.x, one.y].map(f64::to_bits));
        }
        bits.extend([one.width, one.height].map(f64::to_bits));
    }
    let frames = scene.frames.iter();
    bits.extend(frames.flat_map(|one| [one.x, one.y, one.width, one.height].map(f64::to_bits)));
    bits.extend(scene.solid.iter().map(|&solid| u64::from(solid)));
    bits.extend((scene.within.iter()).map(|within| within.map_or(u64::MAX, |at| at as u64)));
    let lines = scene.lines.iter();
    bits.extend(lines.flat_map(|line| [line.from as u64, line.to as u64, line.plate.to_bits()]));
    bits
}

/// A ring with each door's box at each of its places, where it fits, how many slots fit per wall,
/// and its flat price table (`doors * slots`, `f64::INFINITY` where it does not fit).
struct Priced {
    ring: Ring,
    boxes: Vec<Vec<Option<Rect>>>,
    fits: Vec<[usize; 4]>,
    costs: Vec<f64>,
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
    (door_scenes, sizes): (&[DoorScene], &[Door]),
    known: &mut [Known],
) -> Priced {
    let boxes: Vec<Vec<Option<Rect>>> = (sizes.iter())
        .map(|&stood| {
            (0..ring.slots())
                .map(|slot| ring.place(slot, stood))
                .collect()
        })
        .collect();
    let fits: Vec<[usize; 4]> = (boxes.iter())
        .map(|door_boxes| {
            [0, 1, 2, 3].map(|wall| {
                let (start, count) = ring.walls[wall];
                door_boxes[start..start + count].partition_point(Option::is_some)
            })
        })
        .collect();
    let mut costs = Vec::with_capacity(sizes.len() * ring.slots());
    for ((door_scene, door_boxes), known) in door_scenes.iter().zip(&boxes).zip(known) {
        prices(scene, door_scene, door_boxes, known, &mut costs);
    }
    Priced {
        ring,
        boxes,
        fits,
        costs,
    }
}

/// What a door cost at each box it took on the rings of one stand, by the bits of the box's
/// corner.
type Known = FxHashMap<[u64; 2], f64>;

/// Stand every door once, where the lines from a door to the doors still open weigh nothing.
/// The doors stand on whichever ring and within whichever page costs least, with the box they
/// and the whole fill weighed as dead space.
fn stand_open(
    scene: &mut Scene,
    (doors, open): (&[usize], &[usize]),
    (whole, gap, page): (Rect, f64, Point),
    known: &mut [Known],
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
    let takes: Vec<[usize; 4]> = sizes.iter().map(|&door| Ring::takes(door)).collect();
    let largest = |of: fn(&Door) -> f64| sizes.iter().map(of).fold(0.0, f64::max);
    let widest = largest(|door| door.size.x);
    let band = Point {
        x: widest + gap,
        y: largest(|door| door.size.y) + gap,
    };
    let standing = (doors, open, fixed.as_slice());
    let scenes = door_scenes(scene, standing);
    let level = (page.x - whole.width).max(widest + STEP);
    let upright = (page.y - whole.height).max(0.0);
    let rings = [
        priced(
            scene,
            Ring::new(whole, gap, Point { x: level, y: 0.0 }),
            (&scenes, &sizes),
            known,
        ),
        priced(
            scene,
            Ring::new(whole, gap, Point { x: 0.0, y: upright }),
            (&scenes, &sizes),
            known,
        ),
    ];
    let mut scratch = Scratch::default();
    let found = pages(whole, page, band)
        .into_iter()
        .find_map(|pages| cheapest_page(&rings, &pages, &takes, whole, &mut scratch));
    let (ring, order, places) = match found {
        Some((at, order, places)) => {
            let ring = rings
                .into_iter()
                .nth(at)
                .expect("the ring the doors stand on");
            (ring, order, places)
        }
        // No page that reads across holds the doors: the ring widens until they fit.
        None => widened(
            scene,
            (&scenes, &sizes, &takes),
            (whole, gap, level + widest + STEP),
            known,
            &mut scratch,
        ),
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
    (scenes, sizes, takes): (&[DoorScene], &[Door], &[[usize; 4]]),
    (whole, gap, from): (Rect, f64, f64),
    known: &mut [Known],
    scratch: &mut Scratch,
) -> (Priced, Vec<usize>, Vec<usize>) {
    let widest = sizes.iter().map(|door| door.size.x).fold(0.0, f64::max);
    let mut reach = from;
    loop {
        let ring = priced(
            scene,
            Ring::new(whole, gap, Point { x: reach, y: 0.0 }),
            (scenes, sizes),
            known,
        );
        let ranges: Vec<[(usize, usize); 4]> = ring
            .fits
            .iter()
            .map(|fits| fits.map(|fit| (0, fit)))
            .collect();
        if let Some((_, order, places)) = cheapest(&ring.ring, takes, &ring.costs, &ranges, scratch)
        {
            return (ring, order, places);
        }
        reach += widest + STEP;
    }
}

mod line_up;
mod pages;
#[cfg(test)]
mod tests;
