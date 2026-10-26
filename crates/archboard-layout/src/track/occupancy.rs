//! What each band holds (TASK-349): the stretches its items, its settled lanes
//! and its walls take, whether a run of lanes may stand on a column, and the
//! search for the nearest column that passes.

use std::rc::Rc;

use crate::ecma::{abs, js_max, js_min, or, sorted_by};
use crate::track::chains::{LANE, LaneRun, REGION_CLEARANCE, StationId, Track};
use crate::track::clear::ClearOf;
use crate::track::scene::{ItemId, Map, Placement, Set, Spot, WallStretches};
use crate::track::walls::KeepsFrames;

/// How many quarter lanes either way a lane looks for a free column.
const SEARCH_STEPS: usize = 64;
/// How far a lane keeps from a container wall it passes beside: half a lane.
const WALL_CLEARANCE: f64 = LANE / 2.0;

/// The stretch a group region's wall keeps a lane off: a lane and a half
/// either side, or, where a card stands nearer, only up to the lane that card keeps.
fn beside_region(wall: f64, items: &[(f64, f64)]) -> (f64, f64) {
    let (mut low, mut high) = (wall - REGION_CLEARANCE, wall + REGION_CLEARANCE);
    for &(start, end) in items {
        if end > low && end <= wall - WALL_CLEARANCE {
            low = end;
        }
        if start < high && start >= wall + WALL_CLEARANCE {
            high = start;
        }
    }
    (low, high)
}

/// The stretch a frame's wall keeps a lane off: half a lane inside, and a
/// region's clearance outside.
fn outside_frame(wall: f64, walls: (f64, f64), items: &[(f64, f64)]) -> (f64, f64) {
    let (low, high) = beside_region(wall, items);
    if wall == walls.0 {
        (low, wall + WALL_CLEARANCE)
    } else {
        (wall - WALL_CLEARANCE, high)
    }
}

/// The stretch a wall keeps a lane off, outside it only up to the middle of
/// the gutter it shares with a facing wall of another container, where that
/// middle is a lane or more from both: two containers side by side leave a
/// line their gutter, which each wall's whole clearance would close.
fn shared_gutter(
    (low, high): (f64, f64),
    wall: f64,
    side: usize,
    facing: impl Iterator<Item = f64>,
) -> (f64, f64) {
    facing.fold((low, high), |(low, high), other| {
        let middle = f64::midpoint(wall, other);
        if side == 0 && other < wall {
            (js_max(low, js_min(wall - LANE, middle)), high)
        } else if side == 1 && other > wall {
            (low, js_min(high, js_max(wall + LANE, middle)))
        } else {
            (low, high)
        }
    })
}

/// The stretch each wall on a band keeps a lane off, given what the band
/// holds: worked out once for each band and what it holds, as a scene is
/// routed many times over with most of its bands as they were.
fn wall_stretches(scene: &Placement, band: usize, held: &[(f64, f64)]) -> WallStretches {
    let key = (
        band,
        held.iter()
            .flat_map(|&(low, high)| [low.to_bits(), high.to_bits()])
            .collect::<Vec<u64>>(),
    );
    if let Some(known) = scene.wall_stretches.borrow().get(&key) {
        return Rc::clone(known);
    }
    let walled = scene.walled(band);
    let mut walls = Map::default();
    for (id, &pair) in walled.iter() {
        let number = {
            let mut numbers = scene.wall_numbers.borrow_mut();
            let next = numbers.len();
            *numbers.entry(id.clone()).or_insert(next)
        };
        for (side, wall) in [pair.0, pair.1].into_iter().enumerate() {
            let stretch = if scene.frames.contains_key(id) {
                outside_frame(wall, pair, held)
            } else {
                beside_region(wall, held)
            };
            let facing = walled
                .values()
                .map(|&(left, right)| if side == 0 { right } else { left });
            walls.insert((number, side), shared_gutter(stretch, wall, side, facing));
        }
    }
    let walls = Rc::new(walls);
    scene
        .wall_stretches
        .borrow_mut()
        .insert(key, Rc::clone(&walls));
    walls
}

/// Which horizontal intervals of each band are taken by items and settled lanes.
pub(crate) struct Occupancy {
    pub taken: Vec<Vec<(f64, f64)>>,
    /// What each band holds but the stretches its walls keep a lane off.
    pub held: Vec<Vec<(f64, f64)>>,
    /// The stretch each wall keeps a lane off, on each band, by the wall.
    pub walls: Vec<WallStretches>,
    /// Whether an x is clear of what a run's bands hold for its lanes, by those bands, until a lane is taken.
    alongs: Map<Vec<usize>, Rc<ClearOf>>,
}

/// [`Occupancy::fitting`]: the test of a column for a run.
pub(crate) struct Fitting {
    clear: Rc<ClearOf>,
    frames: KeepsFrames,
}

impl Fitting {
    /// Whether a column is free on every band and keeps the frames.
    pub(crate) fn passes(&self, x: f64) -> bool {
        self.clear.passes(x) && self.frames.passes(x)
    }
}

impl Occupancy {
    /// Start with every item's box, widened by a lane either side, but for the
    /// items `without`, as the label boxes of a line being placed.
    pub(crate) fn new(scene: &Placement, without: &Set<ItemId>) -> Occupancy {
        let mut taken: Vec<Vec<(f64, f64)>> = scene.bands.iter().map(|_| Vec::new()).collect();
        for &item in scene.cards.values().chain(scene.labels.values()) {
            if without.contains(&item) {
                continue;
            }
            let one = scene.item(item);
            let clearance = if scene.region_blocks.contains(&item) {
                REGION_CLEARANCE
            } else {
                LANE
            };
            taken[one.band].push((one.bx.x - clearance, one.bx.x + one.bx.width + clearance));
        }
        // A title row or caption takes only the room its words are painted in.
        for heading in scene.headings() {
            taken[heading.band].push((heading.left - LANE, heading.end + LANE));
        }
        let held = taken.clone();
        let walls: Vec<WallStretches> = (0..scene.bands.len())
            .map(|band| wall_stretches(scene, band, &held[band]))
            .collect();
        for (band, one) in walls.iter().enumerate() {
            taken[band].extend(one.values().copied());
        }
        Occupancy {
            taken,
            held,
            walls,
            alongs: Map::default(),
        }
    }

    /// What a band holds for a lane of a line that passes some bands: each
    /// wall kept off only as far as it is on the band beside the line where a
    /// card stands nearest it.
    pub(crate) fn along(&self, band: usize, bands: &[usize]) -> Vec<(f64, f64)> {
        let walls = self.walls[band].iter().map(|(wall, &(low, high))| {
            bands.iter().fold((low, high), |narrowest, &other| {
                match self.walls[other].get(wall) {
                    None => narrowest,
                    Some(&stretch) => (
                        js_max(narrowest.0, stretch.0),
                        js_min(narrowest.1, stretch.1),
                    ),
                }
            })
        });
        self.held[band].iter().copied().chain(walls).collect()
    }

    /// Every edge of what some lanes' bands hold.
    pub(crate) fn edges(&self, track: &Track<'_>, lanes: &[StationId]) -> Vec<f64> {
        lanes
            .iter()
            .flat_map(|&lane| {
                self.taken[track.station(lane).band]
                    .iter()
                    .flat_map(|&(low, high)| [low, high])
            })
            .collect()
    }

    /// Whether a whole run may move to one column.
    pub(crate) fn fits(&mut self, track: &Track<'_>, run: &LaneRun, x: f64) -> bool {
        self.fitting(track, run).passes(x)
    }

    /// [`Occupancy::fits`], read once for a search that tries column after column and takes no lane meanwhile.
    pub(crate) fn fitting(&mut self, track: &Track<'_>, run: &LaneRun) -> Fitting {
        let bands: Vec<usize> = run
            .lanes
            .iter()
            .map(|&lane| track.station(lane).band)
            .collect();
        let clear = if let Some(clear) = self.alongs.get(&bands) {
            Rc::clone(clear)
        } else {
            let stretches = bands
                .iter()
                .flat_map(|&band| self.along(band, &bands))
                .collect();
            Rc::new(ClearOf::new(stretches))
        };
        self.alongs.insert(bands, Rc::clone(&clear));
        let lanes: Vec<Spot> = run.lanes.iter().map(|&lane| track.spot(lane)).collect();
        let frames =
            track
                .scene
                .keeps_frames(&lanes, track.spot(run.before), track.spot(run.after));
        Fitting { clear, frames }
    }

    /// Take a lane's column on its band.
    pub(crate) fn take(&mut self, track: &Track<'_>, lane: StationId) {
        let x = track.x(lane);
        let band = track.station(lane).band;
        let span = (x - LANE, x + LANE);
        self.taken[band].push(span);
        self.held[band].push(span);
        self.alongs.clear();
    }

    /// Take many lanes' columns, in turn, making room on each band once.
    pub(crate) fn take_all(
        &mut self,
        track: &Track<'_>,
        lanes: impl IntoIterator<Item = StationId>,
    ) {
        let lanes: Vec<StationId> = lanes.into_iter().collect();
        let mut more = vec![0; self.taken.len()];
        for &lane in &lanes {
            more[track.station(lane).band] += 1;
        }
        for (band, &count) in more.iter().enumerate() {
            self.taken[band].reserve(count);
            self.held[band].reserve(count);
        }
        for lane in lanes {
            self.take(track, lane);
        }
    }
}

/// The nearest x to one that passes a test, searched outward a quarter lane at
/// a time and at some exact edges within the same reach; on a tie the step comes first.
pub(crate) fn nearest(
    from: f64,
    mut passes: impl FnMut(f64) -> bool,
    edges: &[f64],
) -> Option<f64> {
    let mut candidates: Vec<(f64, usize)> =
        Vec::with_capacity(2 * (SEARCH_STEPS + 1) + edges.len());
    for step in 0..=SEARCH_STEPS {
        let by = (step as f64 * LANE) / 4.0;
        candidates.push((from - by, candidates.len()));
        candidates.push((from + by, candidates.len()));
    }
    let reach = (SEARCH_STEPS as f64 * LANE) / 4.0;
    for &x in edges {
        if abs(x - from) <= reach {
            candidates.push((x, candidates.len()));
        }
    }
    let ordered = sorted_by(&candidates, |one, other| {
        or(
            abs(one.0 - from) - abs(other.0 - from),
            one.1 as f64 - other.1 as f64,
        )
    });
    ordered.into_iter().map(|(x, _)| x).find(|&x| passes(x))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Whether an x stands clear of the stretches two facing walls keep a lane off.
    fn clear_between(left: f64, right: f64, x: f64) -> bool {
        let one = shared_gutter(
            (left - WALL_CLEARANCE, left + REGION_CLEARANCE),
            left,
            1,
            [right].into_iter(),
        );
        let other = shared_gutter(
            (right - REGION_CLEARANCE, right + WALL_CLEARANCE),
            right,
            0,
            [left].into_iter(),
        );
        [one, other]
            .iter()
            .all(|&(low, high)| x <= low || x >= high)
    }

    #[test]
    fn two_containers_side_by_side_leave_a_line_the_middle_of_their_gutter() {
        assert!(clear_between(100.0, 140.0, 120.0));
    }

    #[test]
    fn a_gutter_without_a_lane_either_side_of_its_middle_stays_closed() {
        assert!(!(100..=120).any(|x| clear_between(100.0, 120.0, f64::from(x))));
    }
}
