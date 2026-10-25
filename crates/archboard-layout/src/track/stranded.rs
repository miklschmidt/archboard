//! Lanes left off their ends' columns (visual polish). Lanes are straightened
//! before the labels slide and the ports are placed, so a run of lanes whose
//! column a label box stood on keeps a column neither of its ends reaches,
//! and turns twice more to reach them. Once the labels have slid, each such
//! run moves onto the column of one of its ends where that is free and
//! crosses no more lines; once the ports are placed, a run standing less than
//! a lane off its port moves onto the port's column, and each run to or from
//! a container onto its straight column where a label stood in its way
//! before sliding.

use crate::ecma::{abs, js_max, js_min};
use crate::track::chains::{ByBand, ChainId, Kind, LANE, LaneRun, Occupancy, StationId, Track};
use crate::track::channels::{End, NetId};
use crate::track::readings::by_band;
use crate::track::scene::{Map, Set, centre_x};

/// How a run is moved, by [`Track::each_run`].
#[derive(Clone, Copy)]
enum Move {
    Unstrand,
    CloseSteps,
}

impl Track<'_> {
    /// Where a station meets a line at an x straight: a label at its centre,
    /// or a card anywhere on its face.
    fn meets_straight(&self, station: StationId, x: f64) -> bool {
        let one = self.station(station);
        if one.kind == Kind::Label {
            return abs(centre_x(self.scene.item(one.item.expect("a label"))) - x) < 0.5;
        }
        let (low, high) = self.reach_of(station);
        x >= low - 0.5 && x <= high + 0.5
    }

    /// The column where a station meets a line nearest an x.
    fn meeting_column(&self, station: StationId, near: f64) -> f64 {
        let one = self.station(station);
        if one.kind == Kind::Label {
            return centre_x(self.scene.item(one.item.expect("a label")));
        }
        let (low, high) = self.reach_of(station);
        js_min(high, js_max(low, near))
    }

    /// Once the labels have slid, move each run of lanes that stands on no one
    /// column, or on one neither of its ends reaches straight, onto the column
    /// of the station it leads into or the one it leaves. Answers whether any run moved.
    pub fn unstrand_lanes(&mut self, chains: &[ChainId]) -> bool {
        self.each_run(chains, Move::Unstrand)
    }

    /// Close the steps inside every run of lanes again once the labels have
    /// settled onto the lanes toward their cards' ports.
    pub fn close_lane_steps(&mut self, chains: &[ChainId]) -> bool {
        self.each_run(chains, Move::CloseSteps)
    }

    /// Try to move every run of lanes, each with what its bands hold without it.
    fn each_run(&mut self, chains: &[ChainId], how: Move) -> bool {
        let runs = self.lane_runs(chains);
        let bands: Vec<ByBand> = chains
            .iter()
            .map(|&chain| by_band(self, &self.chain(chain).stations))
            .collect();
        let mut moved = false;
        for (index, run) in runs.iter().enumerate() {
            let mut free = self.free_without(&runs, index);
            let one = match how {
                Move::Unstrand => {
                    self.unstrand_run(run, &mut free, &bands)
                        || self.close_steps(run, &mut free, &bands)
                }
                Move::CloseSteps => self.close_steps(run, &mut free, &bands),
            };
            moved |= one;
        }
        moved
    }

    /// The column of the station a run leads into or the one it leaves, the
    /// first that is free and crosses no more lines than where it stands.
    fn end_column(
        &self,
        run: &LaneRun,
        x: f64,
        free: &mut Occupancy,
        bands: &[ByBand],
    ) -> Option<f64> {
        let crossed = self.inversions(run, x, bands);
        let columns = [
            self.meeting_column(run.after, x),
            self.meeting_column(run.before, x),
        ];
        columns
            .into_iter()
            .find(|&one| free.fits(self, run, one) && self.inversions(run, one, bands) <= crossed)
    }

    /// Move a run that stands on no one column, or on one neither of its ends
    /// reaches straight, onto an end's column.
    fn unstrand_run(&mut self, run: &LaneRun, free: &mut Occupancy, bands: &[ByBand]) -> bool {
        let x = self.x(run.lanes[0]);
        let straight = run.lanes.iter().all(|&lane| self.x(lane) == x);
        if straight && (self.meets_straight(run.before, x) || self.meets_straight(run.after, x)) {
            return false;
        }
        let Some(column) = self.end_column(run, x, free, bands) else {
            return false;
        };
        for &lane in &run.lanes {
            self.set_x(lane, column);
        }
        true
    }

    /// Close the steps inside a run that stays on several columns, the lowest piece first.
    fn close_steps(&mut self, run: &LaneRun, free: &mut Occupancy, bands: &[ByBand]) -> bool {
        let mut pieces = self.pieces_of(run);
        pieces.reverse();
        let mut moved = false;
        for piece in pieces {
            let x = self.x(piece.lanes[0]);
            if self.meets_straight(piece.before, x) || self.meets_straight(piece.after, x) {
                continue;
            }
            let Some(column) = self.end_column(&piece, x, free, bands) else {
                continue;
            };
            for &lane in &piece.lanes {
                self.set_x(lane, column);
            }
            moved = true;
        }
        moved
    }

    /// Move each run of lanes that stands closer than a lane to the card port
    /// it leaves or enters onto that port's column, where the column is free.
    pub fn pull_to_ports(&mut self, chains: &[ChainId], ports: &Map<StationId, f64>) -> bool {
        let runs = self.lane_runs(chains);
        let mut moved = false;
        for index in 0..runs.len() {
            moved |= self.pull_run(&runs, index, ports);
        }
        moved
    }

    /// Move one run of lanes onto the column of a card port less than a lane from it.
    fn pull_run(&mut self, runs: &[LaneRun], index: usize, ports: &Map<StationId, f64>) -> bool {
        let run = &runs[index];
        let Some(x) = self.port_beside(run, ports) else {
            return false;
        };
        if !self.free_without(runs, index).fits(self, run, x) {
            return false;
        }
        for &lane in &run.lanes {
            self.set_x(lane, x);
        }
        true
    }

    /// The port a run of lanes stands closer than a lane to, if any.
    fn port_beside(&self, run: &LaneRun, ports: &Map<StationId, f64>) -> Option<f64> {
        let x = ports
            .get(&run.lanes[0])
            .or_else(|| ports.get(run.lanes.last().expect("a lane")))
            .copied();
        let off = x.map_or(0.0, |x| abs(x - self.x(run.lanes[0])));
        if (0.5..LANE).contains(&off) { x } else { None }
    }

    /// Once the labels have slid, try every run of lanes to or from a
    /// container on its straight column again.
    pub fn straighten_into_containers(&mut self, chains: &[ChainId]) -> bool {
        let runs = self.lane_runs(chains);
        let straight: Vec<usize> = (0..runs.len())
            .filter(|&index| {
                !self
                    .straight_on(runs[index].before, runs[index].after)
                    .is_empty()
            })
            .collect();
        let mut occupancy = Occupancy::new(self.scene, &Set::default());
        for (index, run) in runs.iter().enumerate() {
            if !straight.contains(&index) {
                for &lane in &run.lanes {
                    occupancy.take(self, lane);
                }
            }
        }
        let mut moved = false;
        for index in straight {
            moved |= self.straighten(&runs[index], &mut occupancy);
        }
        moved
    }

    /// Move one run to or from a container onto its straight column, when that is free.
    fn straighten(&mut self, run: &LaneRun, occupancy: &mut Occupancy) -> bool {
        let columns = self.straight_on(run.before, run.after);
        let x = columns
            .into_iter()
            .find(|&column| occupancy.fits(self, run, column));
        let moved = x.is_some_and(|x| run.lanes.iter().any(|&lane| self.x(lane) != x));
        if let Some(x) = x
            && moved
        {
            for &lane in &run.lanes {
                self.set_x(lane, x);
            }
        }
        for &lane in &run.lanes {
            occupancy.take(self, lane);
        }
        moved
    }

    /// Slide each of a block's own ports onto the column of the lane its line
    /// runs on beside it, where the port may stand there.
    pub fn ports_onto_lanes(&mut self, nets: &[NetId]) {
        for &net in nets {
            for end in [End::Top, End::Bottom] {
                let far = self.net(net).at(end.other());
                let item = self.station(self.net(net).at(end)).item;
                if item.is_some_and(|item| self.scene.slides.contains_key(&item))
                    && self.station(far).kind == Kind::Lane
                {
                    let x = self.x(far);
                    self.slide_port(nets, net, end, x);
                }
            }
        }
    }
}
