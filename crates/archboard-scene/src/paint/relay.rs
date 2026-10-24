//! How a board's traffic keeps time (ADR 0027). A line carries a steady train
//! of pulses; lines that keep the same time hand their pulses on through the
//! card between them, held for the shorter way round its edge. Everything is a
//! function of the board, so one board draws the same bytes every time.

use std::collections::HashMap;

use crate::drawing::Traffic;
use crate::geometry::{Point, Rect};
use crate::js;
use crate::paint::design::CARD_RADIUS;

/// The least distance between two pulses on a line.
const MIN_SPACING: f64 = 36.0;
/// How many times faster a pulse flies than the speed its author gave.
pub const PULSE_PACE: f64 = 2.0;
const SLOWEST: f64 = 8.0;
const FASTEST: f64 = 600.0;

/// One line that carries traffic, as the rhythm is worked out.
#[derive(Clone, Debug)]
pub struct Lane {
    pub id: String,
    pub from: String,
    pub to: String,
    pub traffic: Traffic,
    pub start: Point,
    pub end: Point,
    pub length: f64,
    /// How long the part the pulses ride is: none, when it is too short to ride.
    pub ride: f64,
}

/// How one line's pulses move.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rhythm {
    pub speed: f64,
    pub spacing: f64,
    pub phase: f64,
}

/// Whether the pulses that sink into a card carry on out of a line there.
fn hands_on(arriving: &Lane, leaving: &Lane) -> bool {
    arriving.id != leaving.id
        && arriving.to == leaving.from
        && arriving.traffic.speed == leaving.traffic.speed
        && arriving.traffic.volume == leaving.traffic.volume
}

/// A deterministic number from 0 to 1: FNV-1a over the seed's UTF-16 code
/// units, one round of mulberry32 to read it.
fn seeded(seed: &str) -> f64 {
    let mut state: u32 = 0x811c_9dc5;
    for code in seed.encode_utf16() {
        state = (state ^ u32::from(code)).wrapping_mul(0x0100_0193);
    }
    let state = state.wrapping_add(0x6d2b_79f5);
    let mut mixed = (state ^ (state >> 15)).wrapping_mul(1 | state);
    mixed = mixed.wrapping_add((mixed ^ (mixed >> 7)).wrapping_mul(61 | mixed)) ^ mixed;
    f64::from(mixed ^ (mixed >> 14)) / 4_294_967_296.0
}

/// A number held to the range `[0, period)`.
pub fn within(value: f64, period: f64) -> f64 {
    ((value % period) + period) % period
}

/// The lanes that keep each other's time, each group in the order its lanes were given.
fn chains(lanes: &[Lane]) -> Vec<Vec<&Lane>> {
    let mut head: Vec<usize> = (0..lanes.len()).collect();
    fn find(head: &mut [usize], index: usize) -> usize {
        let mut root = index;
        while head[root] != root {
            root = head[root];
        }
        head[index] = root;
        root
    }
    for (from, arriving) in lanes.iter().enumerate() {
        for (to, leaving) in lanes.iter().enumerate() {
            if hands_on(arriving, leaving) {
                let a = find(&mut head, from);
                let b = find(&mut head, to);
                head[a] = b;
            }
        }
    }
    let mut order: Vec<usize> = Vec::new();
    let mut groups: HashMap<usize, Vec<&Lane>> = HashMap::new();
    for (index, lane) in lanes.iter().enumerate() {
        let root = find(&mut head, index);
        if !groups.contains_key(&root) {
            order.push(root);
        }
        groups.entry(root).or_default().push(lane);
    }
    order.into_iter().filter_map(|root| groups.remove(&root)).collect()
}

/// The distance between two pulses on every line of a chain.
fn spacing_of(chain: &[&Lane]) -> f64 {
    let Traffic { speed, volume } = chain[0].traffic;
    let shortest = js::min(chain.iter().filter(|lane| lane.ride > 0.0).map(|lane| lane.ride));
    js::js_max(MIN_SPACING, js::js_min(speed / volume, shortest))
}

/// Where the pulses of every lane of a chain are at time zero.
fn phases_of(
    chain: &[&Lane],
    spacing: f64,
    across: &dyn Fn(&str, Point, Point) -> f64,
) -> HashMap<String, f64> {
    let mut phases: HashMap<String, f64> = HashMap::new();
    let mut queue: std::collections::VecDeque<&Lane> = std::collections::VecDeque::new();
    let unfed: Vec<&Lane> =
        chain.iter().copied().filter(|lane| !chain.iter().any(|other| hands_on(other, lane))).collect();
    let starts = if unfed.is_empty() { vec![chain[0]] } else { unfed };
    for start in starts.iter().chain(chain.iter()) {
        if phases.contains_key(&start.id) {
            continue;
        }
        phases.insert(start.id.clone(), seeded(&start.from) * spacing);
        queue.push_back(start);
        while let Some(lane) = queue.pop_front() {
            for next in chain {
                if phases.contains_key(&next.id) || !hands_on(lane, next) {
                    continue;
                }
                let arrived = within(phases[&lane.id] - lane.length, spacing);
                phases.insert(next.id.clone(), within(arrived - across(&lane.to, lane.end, next.start), spacing));
                queue.push_back(next);
            }
        }
    }
    phases
}

/// How every lane's pulses move, by id.
pub fn relay_rhythms(lanes: &[Lane], across: &dyn Fn(&str, Point, Point) -> f64) -> HashMap<String, Rhythm> {
    let mut rhythms = HashMap::new();
    for chain in chains(lanes) {
        let speed = js::js_min(js::js_max(chain[0].traffic.speed * PULSE_PACE, SLOWEST), FASTEST);
        let spacing = spacing_of(&chain);
        let phases = phases_of(&chain, spacing, across);
        for lane in &chain {
            rhythms.insert(lane.id.clone(), Rhythm { speed, spacing, phase: phases[&lane.id] });
        }
    }
    rhythms
}

/// How many straight pieces walk a quarter turn of a corner.
const CORNER_PIECES: usize = 3;

/// A card's edge, walked clockwise from where its top edge begins.
struct Ring {
    points: Vec<Point>,
    along: Vec<f64>,
    length: f64,
}

/// The points of a quarter turn of a corner, after the one it starts at.
fn corner(centre: Point, radius: f64, from: f64) -> Vec<Point> {
    (0..CORNER_PIECES)
        .map(|step| {
            let angle = ((from + (step as f64 + 1.0) / CORNER_PIECES as f64) * std::f64::consts::PI) / 2.0;
            Point { x: centre.x + radius * libm::cos(angle), y: centre.y + radius * libm::sin(angle) }
        })
        .collect()
}

/// A card's edge as a ring of points.
fn ring_of(rect: Rect) -> Ring {
    let r = js::min([CARD_RADIUS, rect.width / 2.0, rect.height / 2.0]);
    let Rect { x, y, width, height } = rect;
    let mut points = vec![Point { x: x + r, y }, Point { x: x + width - r, y }];
    points.extend(corner(Point { x: x + width - r, y: y + r }, r, -1.0));
    points.push(Point { x: x + width, y: y + height - r });
    points.extend(corner(Point { x: x + width - r, y: y + height - r }, r, 0.0));
    points.push(Point { x: x + r, y: y + height });
    points.extend(corner(Point { x: x + r, y: y + height - r }, r, 1.0));
    points.push(Point { x, y: y + r });
    points.extend(corner(Point { x: x + r, y: y + r }, r, 2.0));
    points.pop();
    let mut along = vec![0.0];
    for (index, point) in points.iter().enumerate() {
        let next = points[(index + 1) % points.len()];
        along.push(along[index] + js::hypot(next.x - point.x, next.y - point.y));
    }
    let length = along.pop().unwrap_or(0.0);
    Ring { points, along, length }
}

/// How far along the ring the place nearest a point is.
fn locate(ring: &Ring, point: Point) -> f64 {
    let mut best_gap = f64::INFINITY;
    let mut best_at = 0.0;
    for (index, from) in ring.points.iter().enumerate() {
        let to = ring.points[(index + 1) % ring.points.len()];
        let dx = to.x - from.x;
        let dy = to.y - from.y;
        let size = dx * dx + dy * dy;
        let t = if size == 0.0 {
            0.0
        } else {
            js::js_min(js::js_max(((point.x - from.x) * dx + (point.y - from.y) * dy) / size, 0.0), 1.0)
        };
        let gap = js::hypot(from.x + dx * t - point.x, from.y + dy * t - point.y);
        if gap < best_gap {
            best_gap = gap;
            best_at = ring.along[index] + t * size.sqrt();
        }
    }
    best_at
}

/// How far the shorter way round the edge of a card is from one place to another.
pub fn rim_length(rect: Rect, from: Point, to: Point) -> f64 {
    let ring = ring_of(rect);
    let forward = (((locate(&ring, to) - locate(&ring, from)) % ring.length) + ring.length) % ring.length;
    js::js_min(forward, ring.length - forward)
}
