//! The cheapest route over the other lines' traffic (visual polish): what they
//! do in each channel a chain passes, read onto the route's columns, and the
//! least costly way down through the columns a chain's stations may take.

use crate::ecma::{js_max, js_min, sort_by};
use crate::track::chains::{StationId, Track};
use crate::track::relay::Relay;
use crate::track::scene::Map;
use crate::track::sweep::{CROSSING, Span, backtrack, descend, from_reach, spanned, warp};

/// What the other lines do in one channel, read onto the columns.
pub(super) struct Traffic {
    /// Each column's x plus a crossing's worth for every other line's upright left of it.
    warped: Vec<f64>,
    /// How many other lines run across the channel over each column.
    across: Vec<f64>,
}

/// Each column's cost once a station stands there: half the crossings of the
/// traffic above and below it, and no way through a column its mask shuts.
fn cross_at(cost: &mut [f64], mask: &[bool], (above, below): (&[f64], &[f64])) {
    for j in 0..cost.len() {
        cost[j] = if mask[j] {
            cost[j] + (CROSSING * (above[j] + below[j])) / 2.0
        } else {
            f64::INFINITY
        };
    }
}

/// Add each column's cost to its total, and answer the column whose total is
/// the least, the first of those that tie.
fn cheapest_end(totals: &mut [f64], cost: &[f64]) -> usize {
    let mut end = 0;
    for j in 0..totals.len() {
        totals[j] += cost[j];
        if totals[j] < totals[end] {
            end = j;
        }
    }
    end
}

impl Relay {
    /// What the other lines do in each channel a chain passes, by the band above each channel.
    pub(super) fn traffic_of(
        &self,
        track: &Track<'_>,
        stations: &[StationId],
        xs: &[f64],
    ) -> Map<usize, Traffic> {
        let mut traffic = Map::default();
        for index in 0..stations.len() - 1 {
            let below = stations[index + 1];
            traffic.insert(
                track.station(below).band - 1,
                self.traffic_in(track, stations[index], below, xs),
            );
        }
        traffic
    }

    /// What the other lines do in the channel between two of a chain's stations.
    fn traffic_in(
        &self,
        track: &Track<'_>,
        upper: StationId,
        lower: StationId,
        xs: &[f64],
    ) -> Traffic {
        let (upper_band, lower_band) = (track.station(upper).band, track.station(lower).band);
        let nets: Vec<Span> = self
            .bands
            .iter()
            .filter_map(|other| {
                let (&one, &two) = (other.get(&upper_band)?, other.get(&lower_band)?);
                if track.meets(one, upper) || track.meets(two, lower) {
                    return None;
                }
                Some((
                    track.meets_at(one, track.x(two), None),
                    track.meets_at(two, track.x(one), None),
                ))
            })
            .collect();
        let mut ends: Vec<f64> = nets.iter().flat_map(|&(one, two)| [one, two]).collect();
        sort_by(&mut ends, |one, other| one - other);
        let runs: Vec<Span> = nets
            .iter()
            .map(|&(one, two)| (js_min(one, two), js_max(one, two)))
            .collect();
        Traffic {
            warped: warp(xs, &ends),
            across: spanned(xs, &runs),
        }
    }

    /// The cheapest free route over a chain's middle stations, by estimate:
    /// each middle station's x, or nothing when no route is free.
    pub(super) fn cheapest(
        track: &Track<'_>,
        stations: &[StationId],
        xs: &[f64],
        masks: &[Vec<bool>],
        traffic: &Map<usize, Traffic>,
    ) -> Option<Vec<f64>> {
        let (upper, lower) = (stations[0], *stations.last().expect("a station"));
        let mut cost = from_reach(
            xs,
            &traffic[&track.station(upper).band].warped,
            track.reach_of(upper),
        );
        let mut steps: Vec<Vec<usize>> = Vec::new();
        for (index, &station) in stations[1..stations.len() - 1].iter().enumerate() {
            let band = track.station(station).band;
            if index > 0 {
                let step = descend(&cost, &traffic[&(band - 1)].warped, xs);
                steps.push(step.came);
                cost = step.cost;
            }
            let crossed = (
                traffic[&(band - 1)].across.as_slice(),
                traffic[&band].across.as_slice(),
            );
            cross_at(&mut cost, &masks[index], crossed);
        }
        let mut totals = from_reach(
            xs,
            &traffic[&(track.station(lower).band - 1)].warped,
            track.reach_of(lower),
        );
        let end = cheapest_end(&mut totals, &cost);
        totals[end]
            .is_finite()
            .then(|| backtrack(&steps, end).into_iter().map(|j| xs[j]).collect())
    }
}
