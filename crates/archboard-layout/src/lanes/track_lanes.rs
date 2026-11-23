//! How a channel's tracks take lanes (TASK-349): the rows `tracks.rs` stacks, each a lane, two
//! where a row holds a detour, and a lane each side for each lane its widest cable reaches. Two
//! lines that read as one keep a hand-off apart. A Lanes drawing gives each unit its own lanes, so
//! a hand-off pushes no unit it does not concern, and lines of two colours never read as one.

use crate::lanes::chains::{LANE, Router};
use crate::lanes::channels::{HAND_OFF, NetId};
use crate::lanes::tracks::{Unit, overlap, stack_units};

/// How many lanes a unit stands below a trunk above it: two where the trunk's branches drop
/// through its run, or its own branches rise through the trunk's, so the hop where they cross
/// stands clear of the trunk's join; none else.
fn knot_room((above, upper): &(Unit, Vec<NetId>), (below, lower): &(Unit, Vec<NetId>)) -> usize {
    let through = |pins: &[f64], run: &Unit| pins.iter().any(|&x| x > run.low && x < run.high);
    let drops = upper.len() > 1 && through(&above.bottoms, below);
    let rises = lower.len() > 1 && through(&below.tops, above);
    if drops || rises { 2 } else { 0 }
}

impl Router<'_> {
    /// Assign the tracks of one channel, and answer how many lanes they take. The rows of
    /// tracks pack a lane apart, two where a row holds a detour, which turns on the track
    /// under its own. Two lines that read as one, the first turning off a column where the
    /// second turns onto it, keep a hand-off apart, so the gap between their turns parts them.
    pub(crate) fn assign_tracks(&mut self, nets: &[NetId]) -> usize {
        let units = self.units_of(nets);
        let plain: Vec<Unit> = units.iter().map(|(unit, _)| unit.clone()).collect();
        let tracks = stack_units(&plain);
        if self.bus {
            return self.pack_units(&units, &tracks);
        }
        let wide = self.wide_of(&units, &tracks);
        let lanes = self.lanes_of(&units, &tracks, &wide);
        for &(unit, row) in &tracks {
            for &net in &units[unit].1 {
                self.net_mut(net).track = lanes[row] + wide[row];
            }
        }
        lanes.last().copied().unwrap_or(0)
    }

    /// In a Lanes drawing, give each unit its own lanes, in the order the units took tracks:
    /// the first lane below every earlier unit it overlaps, and a hand-off below every earlier
    /// unit it reads as one with. A unit no hand-off pushes keeps the lanes above it, so the
    /// channel holds no lane a run does not use. Answers how many lanes the channel takes.
    fn pack_units(&mut self, units: &[(Unit, Vec<NetId>)], tracks: &[(usize, usize)]) -> usize {
        let takes = |unit: usize| {
            let detour = (units[unit].1.iter()).any(|&net| self.net(net).detour_x().is_some());
            if detour { 2 } else { 1 }
        };
        let spans: Vec<usize> = (0..units.len())
            .map(|unit| takes(unit) + 2 * self.cable_reach(&units[unit].1))
            .collect();
        let mut first: Vec<Option<usize>> = vec![None; units.len()];
        for &(unit, _) in tracks {
            let lane = (tracks.iter())
                .filter_map(|&(other, _)| first[other].map(|at| (other, at)))
                .map(|(other, at)| {
                    let below = if overlap(&units[unit].0, &units[other].0) {
                        at + spans[other].max(knot_room(&units[other], &units[unit]))
                    } else {
                        0
                    };
                    let parted = if self.reads_as_one(&units[unit].1, &units[other].1) {
                        at + HAND_OFF
                    } else {
                        0
                    };
                    below.max(parted)
                })
                .max()
                .unwrap_or(0);
            first[unit] = Some(lane);
        }
        let mut height = 0;
        for &(unit, _) in tracks {
            let lane = first[unit].expect("a lane");
            for &net in &units[unit].1 {
                self.net_mut(net).track = lane + self.cable_reach(&units[unit].1);
            }
            height = height.max(lane + spans[unit]);
        }
        height
    }

    /// How many lanes the widest cable among some nets reaches to either side of its track.
    fn cable_reach(&self, nets: &[NetId]) -> usize {
        nets.iter()
            .map(|&net| {
                let strands = self.net(net).kind.split(';').count();
                let half = (strands - 1) as f64 * crate::constants::STRAND / 2.0;
                #[expect(
                    clippy::cast_possible_truncation,
                    clippy::cast_sign_loss,
                    reason = "a whole count of lanes, never negative"
                )]
                let lanes = (half / LANE).ceil() as usize;
                lanes
            })
            .max()
            .unwrap_or(0)
    }

    /// How many lanes each row's widest cable reaches to either side of its track: a cable's
    /// strands stand half a lane apart about its route, so a row keeps a lane each side for
    /// each lane of its half-width.
    fn wide_of(&self, units: &[(Unit, Vec<NetId>)], tracks: &[(usize, usize)]) -> Vec<usize> {
        let rows = tracks.iter().map(|&(_, row)| row + 1).max().unwrap_or(0);
        let mut wide = vec![0; rows];
        for &(unit, row) in tracks {
            for &net in &units[unit].1 {
                let strands = self.net(net).kind.split(';').count();
                let half = (strands - 1) as f64 * crate::constants::STRAND / 2.0;
                #[expect(
                    clippy::cast_possible_truncation,
                    clippy::cast_sign_loss,
                    reason = "a whole count of lanes, never negative"
                )]
                let lanes = (half / LANE).ceil() as usize;
                wide[row] = wide[row].max(lanes);
            }
        }
        wide
    }

    /// The lane each row of tracks starts on, and last how many lanes the rows take: a row as
    /// many as its line needs, and a lane each side for each lane its widest cable reaches.
    fn lanes_of(
        &self,
        units: &[(Unit, Vec<NetId>)],
        tracks: &[(usize, usize)],
        wide: &[usize],
    ) -> Vec<usize> {
        let rows = tracks.iter().map(|&(_, row)| row + 1).max().unwrap_or(0);
        let mut takes = vec![1; rows];
        for &(unit, row) in tracks {
            if units[unit]
                .1
                .iter()
                .any(|&net| self.net(net).detour_x().is_some())
            {
                takes[row] = 2;
            }
        }
        let mut lanes: Vec<usize> = vec![0];
        for row in 0..rows {
            let handed = (tracks.iter())
                .filter(|&&(_, at)| at == row)
                .flat_map(|&(unit, _)| tracks.iter().map(move |&(other, at)| (unit, other, at)))
                .filter(|&(unit, other, at)| {
                    at < row && self.handed(&units[unit].1, &units[other].1)
                })
                .map(|(.., at)| lanes[at] + HAND_OFF);
            lanes[row] = handed.fold(lanes[row], usize::max);
            lanes.push(lanes[row] + takes[row] + 2 * wide[row]);
        }
        lanes
    }

    /// Whether two units read as one line where they hand off, in a Lanes drawing: lines of two
    /// kinds are drawn in two colours and never do.
    fn reads_as_one(&self, one: &[NetId], other: &[NetId]) -> bool {
        let colour = |nets: &[NetId]| -> Vec<String> {
            let kinds = nets.iter().map(|&net| {
                self.net(net)
                    .kind
                    .split('|')
                    .next()
                    .unwrap_or_default()
                    .to_owned()
            });
            kinds.collect()
        };
        let (mine, theirs) = (colour(one), colour(other));
        let shared = mine.iter().any(|kind| theirs.contains(kind));
        shared && self.handed(one, other)
    }

    /// Whether a net of one unit and a net of another read as one line.
    fn handed(&self, one: &[NetId], other: &[NetId]) -> bool {
        (one.iter()).any(|&a| (other.iter()).any(|&b| self.collinear(a, b) || self.collinear(b, a)))
    }
}
