//! A relationship as a chain of stations (TASK-349): one per band it touches,
//! from its upper end to its lower end: its two cards, its label box and the
//! lanes it passes on the bands between.
//!
//! Stations, chains, nets and trunks are kept by place in one [`Track`], since
//! the router asks of each whether it is the same one as another.

use crate::ecma::{js_max, js_min};
use crate::geometry::{Point, polyline_x};
use crate::placed::PlacedEdge;
use crate::track::channels::{Net, NetId, Trunk};
use crate::track::occupancy::Occupancy;
use crate::track::scene::{ItemId, Placement, Set, Spot, centre_x};

/// Distance between neighbouring lanes and tracks.
pub(crate) const LANE: f64 = 16.0;
/// How far a line keeps from a card's corner, as ports do.
pub(crate) const FACE_MARGIN: f64 = 20.0;
/// How far a lane keeps from a group region's wall where it has the room: a lane and a half.
pub(crate) const REGION_CLEARANCE: f64 = 1.5 * LANE;

/// What a station is.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Kind {
    Card,
    Label,
    Lane,
}

/// A station, by its place in the track.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub(crate) struct StationId(pub usize);

/// A chain, by its place in the track.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub(crate) struct ChainId(pub usize);

/// Where a chain touches a band.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Station {
    pub kind: Kind,
    pub band: usize,
    /// The card or label box; absent for a lane.
    pub item: Option<ItemId>,
    /// The lane's x; a lane moves when its run is straightened.
    x: f64,
    /// Whether its x is its label box's centre, read from the box and written to it.
    live: bool,
    /// Where the line must meet its card, in from the card's left edge.
    pub at: Option<f64>,
}

impl Station {
    /// A station of its own x.
    pub(crate) fn new(kind: Kind, band: usize, item: Option<ItemId>, x: f64) -> Station {
        Station {
            kind,
            band,
            item,
            x,
            live: false,
            at: None,
        }
    }
}

/// A relationship's stations, and whether it runs upward from source to target.
#[derive(Clone, Debug)]
pub(crate) struct Chain {
    pub stations: Vec<StationId>,
    pub upward: bool,
}

/// One run of lanes in a chain, with the stations either side of it.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct LaneRun {
    pub lanes: Vec<StationId>,
    pub before: StationId,
    pub after: StationId,
}

/// A chain's stations, by band. A chain has a station on every band from its
/// upper end's to its lower end's, so they stand in one list from its first
/// band; where two stations share a band, the later one is kept.
#[derive(Clone, Debug, Default)]
pub(crate) struct ByBand {
    first: usize,
    stations: Vec<Option<StationId>>,
}

impl ByBand {
    /// The station on a band, if the chain has one there.
    pub(crate) fn get(&self, band: &usize) -> Option<&StationId> {
        self.stations.get(band.checked_sub(self.first)?)?.as_ref()
    }

    /// Every station, top to bottom.
    pub(crate) fn values(&self) -> impl Iterator<Item = &StationId> {
        self.stations.iter().flatten()
    }
}

impl std::ops::Index<&usize> for ByBand {
    type Output = StationId;

    fn index(&self, band: &usize) -> &StationId {
        self.get(band).expect("a station on the band")
    }
}

impl FromIterator<(usize, StationId)> for ByBand {
    fn from_iter<I: IntoIterator<Item = (usize, StationId)>>(iter: I) -> ByBand {
        let pairs: Vec<(usize, StationId)> = iter.into_iter().collect();
        let Some(first) = pairs.iter().map(|&(band, _)| band).min() else {
            return ByBand::default();
        };
        let last = pairs.iter().map(|&(band, _)| band).max().unwrap_or(first);
        let mut stations = vec![None; last - first + 1];
        for (band, station) in pairs {
            stations[band - first] = Some(station);
        }
        ByBand { first, stations }
    }
}

/// What the lines one chain crosses in a channel count, given the chains
/// crossed and the two stations either side of the channel.
pub(crate) type Counted<'c> = dyn FnMut(&Track<'_>, &[usize], StationId, StationId) -> f64 + 'c;

/// The scene a router works on, and every station, chain, net and trunk it made.
pub(crate) struct Track<'s> {
    pub scene: &'s mut Placement,
    pub stations: Vec<Station>,
    pub chains: Vec<Chain>,
    pub nets: Vec<Net>,
    pub trunks: Vec<Trunk>,
}

impl<'s> Track<'s> {
    /// A router of a scene, with nothing made yet.
    pub(crate) fn new(scene: &'s mut Placement) -> Track<'s> {
        Track {
            scene,
            stations: Vec::new(),
            chains: Vec::new(),
            nets: Vec::new(),
            trunks: Vec::new(),
        }
    }

    /// A station.
    pub(crate) fn station(&self, id: StationId) -> &Station {
        &self.stations[id.0]
    }

    /// A station, to change.
    pub(crate) fn station_mut(&mut self, id: StationId) -> &mut Station {
        &mut self.stations[id.0]
    }

    /// Keep a new station.
    pub(crate) fn add(&mut self, station: Station) -> StationId {
        self.stations.push(station);
        StationId(self.stations.len() - 1)
    }

    /// A chain.
    pub(crate) fn chain(&self, id: ChainId) -> &Chain {
        &self.chains[id.0]
    }

    /// A net.
    pub(crate) fn net(&self, id: NetId) -> &Net {
        &self.nets[id.0]
    }

    /// A net, to change.
    pub(crate) fn net_mut(&mut self, id: NetId) -> &mut Net {
        &mut self.nets[id.0]
    }

    /// A station's x: a label's is the centre of its box.
    pub(crate) fn x(&self, id: StationId) -> f64 {
        let station = &self.stations[id.0];
        if station.live {
            centre_x(self.scene.item(station.item.expect("a label's box")))
        } else {
            station.x
        }
    }

    /// Stand a station at an x: a label's box stands centred on it.
    pub(crate) fn set_x(&mut self, id: StationId, x: f64) {
        let station = self.stations[id.0];
        if station.live {
            let item = self.scene.item_mut(station.item.expect("a label's box"));
            item.bx.x = x - item.bx.width / 2.0;
        } else {
            self.stations[id.0].x = x;
        }
    }

    /// Where a station stands.
    pub(crate) fn spot(&self, id: StationId) -> Spot {
        Spot {
            band: self.station(id).band,
            x: self.x(id),
        }
    }

    /// A label's station, its x the centre of its box.
    pub(crate) fn label_station(&mut self, item: ItemId, band: usize) -> StationId {
        self.add(Station {
            kind: Kind::Label,
            band,
            item: Some(item),
            x: 0.0,
            live: true,
            at: None,
        })
    }

    /// The station a chain has on one band between its ends: its label box, or a lane.
    fn station_on(
        &mut self,
        band: usize,
        label: Option<ItemId>,
        polyline: &[Point],
        upper: ItemId,
        lower: ItemId,
    ) -> StationId {
        if let Some(label) = label
            && self.scene.item(label).band == band
        {
            return self.label_station(label, band);
        }
        let (top, bottom) = (self.scene.bands[band].top, self.scene.bands[band].bottom);
        let (upper, lower) = (*self.scene.item(upper), *self.scene.item(lower));
        let share = (band as f64 - upper.band as f64) / (lower.band as f64 - upper.band as f64);
        let x = polyline_x(polyline, f64::midpoint(top, bottom))
            .unwrap_or_else(|| centre_x(&upper) + (centre_x(&lower) - centre_x(&upper)) * share);
        self.add(Station::new(Kind::Lane, band, None, x))
    }

    /// The stations of one relationship, from its upper end to its lower end.
    pub(crate) fn chain_of(&mut self, edge: &PlacedEdge) -> ChainId {
        let source = self.scene.endpoint(&edge.source);
        let target = self.scene.endpoint(&edge.target);
        let upward = self.scene.item(target).band < self.scene.item(source).band;
        let (upper, lower) = if upward {
            (target, source)
        } else {
            (source, target)
        };
        let label = self.scene.labels.get(&edge.id).copied();
        let (upper_item, lower_item) = (*self.scene.item(upper), *self.scene.item(lower));
        let mut stations = vec![self.add(Station::new(
            Kind::Card,
            upper_item.band,
            Some(upper),
            centre_x(&upper_item),
        ))];
        for band in upper_item.band + 1..lower_item.band {
            let station = self.station_on(band, label, &edge.polyline, upper, lower);
            stations.push(station);
        }
        stations.push(self.add(Station::new(
            Kind::Card,
            lower_item.band,
            Some(lower),
            centre_x(&lower_item),
        )));
        self.chains.push(Chain { stations, upward });
        ChainId(self.chains.len() - 1)
    }

    /// Every run of consecutive lanes in some chains.
    pub(crate) fn lane_runs(&self, chains: &[ChainId]) -> Vec<LaneRun> {
        let mut runs = Vec::new();
        for &chain in chains {
            let stations = &self.chain(chain).stations;
            let mut start: Option<usize> = None;
            for (index, &station) in stations.iter().enumerate() {
                let lane = self.station(station).kind == Kind::Lane;
                if lane && start.is_none() {
                    start = Some(index);
                }
                if !lane && let Some(first) = start {
                    runs.push(LaneRun {
                        lanes: stations[first..index].to_vec(),
                        before: stations[first - 1],
                        after: station,
                    });
                    start = None;
                }
            }
        }
        runs
    }

    /// Where a line meets a station: a lane's or label's x, or the point of a
    /// card's face nearest the other end. `at` is where a lane or label stands
    /// instead of its own x, when it is the one being placed.
    pub(crate) fn meets_at(&self, station: StationId, toward: f64, at: Option<f64>) -> f64 {
        if self.station(station).kind != Kind::Card {
            return at.unwrap_or_else(|| self.x(station));
        }
        let (low, high) = self.reach_of(station);
        js_min(high, js_max(low, toward))
    }

    /// Whether two chains meet at one station: the same one, or the same card.
    pub(crate) fn meets(&self, one: StationId, other: StationId) -> bool {
        one == other || {
            let item = self.station(one).item;
            item.is_some() && item == self.station(other).item
        }
    }

    /// How many other chains a line would cross between each band and the
    /// next, its lanes and label standing at some x: those whose order against
    /// it swaps across a channel. `counted` is what the chains crossed in one
    /// channel count, given their places in `bands`: one each, unless told.
    pub(crate) fn crossings_of(
        &self,
        own: &[StationId],
        xs: &[f64],
        bands: &[ByBand],
        mut counted: Option<&mut Counted<'_>>,
    ) -> f64 {
        let mut count = 0.0;
        for index in 0..own.len().saturating_sub(1) {
            let (upper, lower) = (own[index], own[index + 1]);
            let (above, below) = (xs[index], xs[index + 1]);
            let (top, bottom) = (
                self.meets_at(upper, below, Some(above)),
                self.meets_at(lower, above, Some(below)),
            );
            let (upper_band, lower_band) = (self.station(upper).band, self.station(lower).band);
            let crossed: Vec<usize> = (0..bands.len())
                .filter(|&at| {
                    let other = &bands[at];
                    let (Some(&one), Some(&two)) = (other.get(&upper_band), other.get(&lower_band))
                    else {
                        return false;
                    };
                    if self.meets(one, upper) || self.meets(two, lower) {
                        return false;
                    }
                    (top - self.meets_at(one, self.x(two), None))
                        * (bottom - self.meets_at(two, self.x(one), None))
                        < 0.0
                })
                .collect();
            count += match counted.as_mut() {
                Some(counted) => counted(self, &crossed, upper, lower),
                None => crossed.len() as f64,
            };
        }
        count
    }

    /// How many other chains a run on one column would cross between one band and the next.
    pub(crate) fn inversions(&self, run: &LaneRun, x: f64, bands: &[ByBand]) -> f64 {
        let own: Vec<StationId> = std::iter::once(run.before)
            .chain(run.lanes.iter().copied())
            .chain(std::iter::once(run.after))
            .collect();
        let xs: Vec<f64> = std::iter::once(self.x(run.before))
            .chain(run.lanes.iter().map(|_| x))
            .chain(std::iter::once(self.x(run.after)))
            .collect();
        self.crossings_of(&own, &xs, bands, None)
    }

    /// What each band holds with every run but one in place.
    pub(crate) fn free_without(&self, runs: &[LaneRun], left: usize) -> Occupancy {
        let mut occupancy = Occupancy::new(self.scene, &Set::default());
        let lanes = runs
            .iter()
            .enumerate()
            .filter(|&(index, _)| index != left)
            .flat_map(|(_, run)| run.lanes.iter().copied());
        occupancy.take_all(self, lanes);
        occupancy
    }

    /// Move the run of lanes a lane belongs to onto a column, when that column
    /// is free on every band the run passes, or only the piece of it the lane
    /// stands in. Answers whether it moved.
    pub(crate) fn move_run(
        &mut self,
        chains: &[ChainId],
        lane: StationId,
        x: f64,
        piece: bool,
    ) -> bool {
        let runs = self.lane_runs(chains);
        let Some(at) = runs.iter().position(|run| run.lanes.contains(&lane)) else {
            return false;
        };
        let moving = if piece {
            self.pieces_of(&runs[at])
                .into_iter()
                .find(|one| one.lanes.contains(&lane))
                .expect("the lane's piece")
        } else {
            runs[at].clone()
        };
        let mut free = self.free_without(&runs, at);
        if !free.fits(self, &moving, x) {
            return false;
        }
        for &each in &moving.lanes {
            self.set_x(each, x);
        }
        true
    }

    /// A run's lanes in pieces, each the lanes that stand on one column, with
    /// the stations either side of it, top to bottom.
    pub(crate) fn pieces_of(&self, run: &LaneRun) -> Vec<LaneRun> {
        let mut pieces = Vec::new();
        let mut start = 0;
        for (index, &lane) in run.lanes.iter().enumerate() {
            let next = run.lanes.get(index + 1).copied();
            if let Some(next) = next
                && self.x(next) == self.x(lane)
            {
                continue;
            }
            let before = if start == 0 {
                run.before
            } else {
                run.lanes[start - 1]
            };
            pieces.push(LaneRun {
                lanes: run.lanes[start..=index].to_vec(),
                before,
                after: next.unwrap_or(run.after),
            });
            start = index + 1;
        }
        pieces
    }

    /// The run of lanes a lane belongs to.
    pub(crate) fn run_of(&self, chains: &[ChainId], lane: StationId) -> Option<LaneRun> {
        self.lane_runs(chains)
            .into_iter()
            .find(|run| run.lanes.contains(&lane))
    }

    /// The x a line can pass a station at straight: anywhere along a card's or
    /// title row's face clear of its corners, anywhere across a label box, or
    /// a lane's own x. A line held to one point of its card passes there alone.
    pub(crate) fn reach_of(&self, id: StationId) -> (f64, f64) {
        let station = self.station(id);
        let Some(item) = station.item else {
            let x = self.x(id);
            return (x, x);
        };
        let bx = self.scene.item(item).bx;
        if let Some(at) = station.at {
            return (bx.x + at, bx.x + at);
        }
        let margin = js_min(
            if station.kind == Kind::Label {
                LANE
            } else {
                FACE_MARGIN
            },
            bx.width / 2.0,
        );
        (bx.x + margin, bx.x + bx.width - margin)
    }

    /// Where a run of lanes lets its line pass straight from the station above
    /// it into the one below: the point both can reach nearest the lanes, if any.
    pub(crate) fn meeting(&self, before: StationId, after: StationId, near: f64) -> Option<f64> {
        let (a, b) = self.reach_of(before);
        let (c, d) = self.reach_of(after);
        let low = js_max(a, c);
        let high = js_min(b, d);
        (low <= high).then(|| js_min(high, js_max(low, near)))
    }

    /// Where a run of lanes to or from a container runs straight on: the
    /// columns to try, best first; none for a run between two cards.
    pub(crate) fn straight_on(&self, before: StationId, after: StationId) -> Vec<f64> {
        let titled = |id: StationId| {
            self.station(id)
                .item
                .is_some_and(|item| self.scene.titles.values().any(|&title| title == item))
        };
        if titled(after) {
            let x = self.x(before);
            return self
                .meeting(before, after, x)
                .into_iter()
                .chain(std::iter::once(x))
                .collect();
        }
        if titled(before) {
            let x = self.x(after);
            return self
                .meeting(before, after, x)
                .into_iter()
                .chain(std::iter::once(x))
                .collect();
        }
        Vec::new()
    }
}
