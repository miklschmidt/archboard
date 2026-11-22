//! What each band holds (TASK-349): the stretches its items and its settled
//! lanes take, whether a run of lanes may stand on a column, and the
//! search for the nearest column that passes.

use std::rc::Rc;

use crate::ecma::{abs, or, sorted_by};
use crate::lanes::chains::{LANE, LaneRun, REGION_CLEARANCE, StationId, Track};
use crate::lanes::clear::ClearOf;
use crate::lanes::scene::{ItemId, Map, Placement, Set};

/// How many quarter lanes either way a lane looks for a free column.
const SEARCH_STEPS: usize = 64;

/// Which horizontal intervals of each band are taken by items and settled lanes.
pub(crate) struct Occupancy {
    pub taken: Vec<Vec<(f64, f64)>>,
    /// Whether an x is clear of what a run's bands hold for its lanes, by those bands, until a lane is taken.
    alongs: Map<Vec<usize>, Rc<ClearOf>>,
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
        Occupancy {
            taken,
            alongs: Map::default(),
        }
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
    pub(crate) fn fitting(&mut self, track: &Track<'_>, run: &LaneRun) -> Rc<ClearOf> {
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
                .flat_map(|&band| self.taken[band].iter().copied())
                .collect();
            Rc::new(ClearOf::new(stretches))
        };
        self.alongs.insert(bands, Rc::clone(&clear));
        clear
    }

    /// Take a lane's column on its band.
    pub(crate) fn take(&mut self, track: &Track<'_>, lane: StationId) {
        let x = track.x(lane);
        let band = track.station(lane).band;
        let span = (x - LANE, x + LANE);
        self.taken[band].push(span);
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
        }
        for lane in lanes {
            self.take(track, lane);
        }
    }
}

/// The nearest x to one that passes a test, searched outward a quarter lane at
/// a time and at every known obstacle edge; on a tie the step comes first.
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
    for &x in edges {
        candidates.push((x, candidates.len()));
    }
    let ordered = sorted_by(&candidates, |one, other| {
        or(
            abs(one.0 - from) - abs(other.0 - from),
            one.1 as f64 - other.1 as f64,
        )
    });
    ordered.into_iter().map(|(x, _)| x).find(|&x| passes(x))
}
