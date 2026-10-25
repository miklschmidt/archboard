//! Straightening lanes (TASK-349): each run of lanes Graphviz left drifting
//! from band to band stands on as few columns as hold it, so a long
//! relationship descends in one line instead of jogging at every channel.

use crate::ecma::{min_of, sort_by, sorted_by};
use crate::track::chains::{ByBand, ChainId, Kind, LaneRun, Occupancy, StationId, Track, nearest};
use crate::track::readings::by_band;
use crate::track::scene::Set;

/// [`Track::crossings_for`]: how many other chains a line would cross, for
/// any x its own stations stand at.
pub(crate) struct CrossingsFor {
    own: Vec<StationId>,
    others: Vec<Vec<(f64, f64)>>,
}

impl CrossingsFor {
    /// The count, for where the line's stations stand.
    pub(crate) fn count(&self, track: &Track<'_>, xs: &[f64]) -> f64 {
        let mut count = 0.0;
        for index in 0..self.own.len().saturating_sub(1) {
            let (above, below) = (xs[index], xs[index + 1]);
            let top = track.meets_at(self.own[index], below, Some(above));
            let bottom = track.meets_at(self.own[index + 1], above, Some(below));
            count += self.others[index]
                .iter()
                .filter(|&&(one, two)| (top - one) * (bottom - two) < 0.0)
                .count() as f64;
        }
        count
    }
}

impl Track<'_> {
    /// Straighten every run of lanes onto one column where that column is free
    /// on every band the run passes and keeps the frames; a run no one column
    /// is free for takes as few columns as hold it, from the top down.
    pub(crate) fn straighten_lanes(&mut self, chains: &[ChainId]) {
        let mut occupancy = Occupancy::new(self.scene, &Set::default());
        let mut runs = self.lane_runs(chains);
        sort_by(&mut runs, |one, other| {
            other.lanes.len() as f64 - one.lanes.len() as f64
        });
        let bands: Vec<ByBand> = chains
            .iter()
            .map(|&chain| by_band(self, &self.chain(chain).stations))
            .collect();
        for run in runs {
            let xs = self.columns_of(&run, &mut occupancy, &bands);
            for (index, &lane) in run.lanes.iter().enumerate() {
                self.set_x(lane, xs[index]);
                occupancy.take(self, lane);
            }
        }
    }

    /// Where each lane of a run stands: all on one column where one holds
    /// them, else on as few columns as hold them from the top down, unless
    /// that crosses more lines than each lane standing alone on the free x nearest it.
    fn columns_of(
        &mut self,
        run: &LaneRun,
        occupancy: &mut Occupancy,
        bands: &[ByBand],
    ) -> Vec<f64> {
        if let Some(whole) = self.column_of(run, occupancy, bands) {
            return run.lanes.iter().map(|_| whole).collect();
        }
        let alone: Vec<f64> = run
            .lanes
            .iter()
            .enumerate()
            .map(|(index, &lane)| {
                let one = LaneRun {
                    lanes: vec![lane],
                    before: if index == 0 {
                        run.before
                    } else {
                        run.lanes[index - 1]
                    },
                    after: run.lanes.get(index + 1).copied().unwrap_or(run.after),
                };
                let fits = occupancy.fitting(self, &one);
                let edges = occupancy.edges(self, &[lane]);
                nearest(self.x(lane), |x| fits.passes(x), &edges).unwrap_or_else(|| self.x(lane))
            })
            .collect();
        let mut pieces: Vec<f64> = Vec::new();
        let mut before = run.before;
        while pieces.len() < run.lanes.len() {
            let start = pieces.len();
            let (end, x) = self.longest_piece(run, start, before, occupancy, bands);
            // A piece placed is where the next one leaves from.
            for &lane in &run.lanes[start..end] {
                self.set_x(lane, x.unwrap_or(alone[start]));
                before = lane;
                pieces.push(self.x(lane));
            }
        }
        let own: Vec<StationId> = std::iter::once(run.before)
            .chain(run.lanes.iter().copied())
            .chain([run.after])
            .collect();
        let around = |xs: &[f64]| -> Vec<f64> {
            std::iter::once(self.x(run.before))
                .chain(xs.iter().copied())
                .chain([self.x(run.after)])
                .collect()
        };
        let split = self.crossings_of(&own, &around(&pieces), bands, None);
        let apart = self.crossings_of(&own, &around(&alone), bands, None);
        if split <= apart { pieces } else { alone }
    }

    /// The longest stretch of a run's lanes from one of them down that one
    /// column holds, and that column; a lane no column holds is a stretch of its own.
    fn longest_piece(
        &self,
        run: &LaneRun,
        start: usize,
        before: StationId,
        occupancy: &mut Occupancy,
        bands: &[ByBand],
    ) -> (usize, Option<f64>) {
        let mut found = (start + 1, None);
        for end in start + 1..=run.lanes.len() {
            let piece = LaneRun {
                lanes: run.lanes[start..end].to_vec(),
                before,
                after: run.lanes.get(end).copied().unwrap_or(run.after),
            };
            let Some(x) = self.column_of(&piece, occupancy, bands) else {
                break;
            };
            found = (end, Some(x));
        }
        found
    }

    /// Where a run from a block's port runs straight on into a card whose only line it is.
    fn straight_from_port(&self, run: &LaneRun, bands: &[ByBand], near: f64) -> Vec<f64> {
        let (before, after) = (self.station(run.before), self.station(run.after));
        if before.kind != Kind::Card || !self.one_point(before.item) || after.kind != Kind::Card {
            return Vec::new();
        }
        let lines = bands
            .iter()
            .filter(|chain| {
                chain
                    .values()
                    .any(|&station| self.station(station).item == after.item)
            })
            .count();
        if lines == 1 {
            self.meeting(run.before, run.after, near)
                .into_iter()
                .collect()
        } else {
            Vec::new()
        }
    }

    /// The column a run of lanes takes, or nothing when no column is free on every band.
    pub(crate) fn column_of(
        &self,
        run: &LaneRun,
        occupancy: &mut Occupancy,
        bands: &[ByBand],
    ) -> Option<f64> {
        let straight = self.straight_on(run.before, run.after);
        let xs = sorted_by(
            &run.lanes
                .iter()
                .map(|&lane| self.x(lane))
                .collect::<Vec<_>>(),
            |one, other| one - other,
        );
        let median = xs[xs.len() / 2];
        let (columns, near) = if straight.is_empty() {
            let mut columns = self.straight_from_port(run, bands, median);
            columns.extend([self.x(run.after), self.x(run.before), median]);
            columns.extend(xs.iter().copied());
            (columns, median)
        } else {
            let near = straight[0];
            (straight, near)
        };
        let fits = occupancy.fitting(self, run);
        let edges = occupancy.edges(self, &run.lanes);
        let found = nearest(near, |x| fits.passes(x), &edges);
        let free: Vec<f64> = columns
            .into_iter()
            .filter(|&x| fits.passes(x))
            .chain(found)
            .collect();
        let own: Vec<StationId> = std::iter::once(run.before)
            .chain(run.lanes.iter().copied())
            .chain([run.after])
            .collect();
        let crossings = self.crossings_for(&own, bands);
        let counts: Vec<f64> = free
            .iter()
            .map(|&x| {
                let xs: Vec<f64> = std::iter::once(self.x(run.before))
                    .chain(run.lanes.iter().map(|_| x))
                    .chain([self.x(run.after)])
                    .collect();
                crossings.count(self, &xs)
            })
            .collect();
        let fewest = min_of(&counts);
        let crosses_more = self.scene.inline && fewest > self.standing_crossings(run, bands);
        if crosses_more {
            return None;
        }
        counts
            .iter()
            .position(|&count| count == fewest)
            .map(|at| free[at])
    }

    /// How many other chains a line would cross between one band and the
    /// next, as `crossings_of` counts them, for any x its own stations stand at.
    pub(crate) fn crossings_for(&self, own: &[StationId], bands: &[ByBand]) -> CrossingsFor {
        let others = (0..own.len().saturating_sub(1))
            .map(|index| {
                let (upper, lower) = (own[index], own[index + 1]);
                let (upper_band, lower_band) = (self.station(upper).band, self.station(lower).band);
                bands
                    .iter()
                    .filter_map(|other| {
                        let (&one, &two) = (other.get(&upper_band)?, other.get(&lower_band)?);
                        if self.meets(one, upper) || self.meets(two, lower) {
                            return None;
                        }
                        Some((
                            self.meets_at(one, self.x(two), None),
                            self.meets_at(two, self.x(one), None),
                        ))
                    })
                    .collect()
            })
            .collect();
        CrossingsFor {
            own: own.to_vec(),
            others,
        }
    }

    /// How many other chains a run crosses where its lanes stand.
    fn standing_crossings(&self, run: &LaneRun, bands: &[ByBand]) -> f64 {
        let own: Vec<StationId> = std::iter::once(run.before)
            .chain(run.lanes.iter().copied())
            .chain([run.after])
            .collect();
        let xs: Vec<f64> = own.iter().map(|&station| self.x(station)).collect();
        self.crossings_of(&own, &xs, bands, None)
    }
}
