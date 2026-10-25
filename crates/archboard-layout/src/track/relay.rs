//! Lines laid round the outside of a drawing, laid again through it (visual polish).
//!
//! Graphviz orders each rank to cross the fewest lines and counts no length,
//! so a long line, and the label box on it, can drift to the outermost slot
//! of every rank it passes; its lanes then keep that side, and the line laps
//! the drawing. Once the lanes are straightened, each chain whose middle
//! strays well outside both its ends' reach looks for the cheapest free route
//! over the same bands. A route costs its sideways travel and a crossing's
//! worth for each line it crosses, or each trunk; the chain takes the new
//! route only when that saves more than a few lanes. A chain kept where it
//! stood is tried again once the others have moved.

use std::rc::Rc;

use crate::constants::{CONTAINER_INSET, LABEL_CARD_CLEARANCE, LABEL_LABEL_CLEARANCE};
use crate::ecma::{js_max, js_min, sort_by, sorted_by, unique};
use crate::track::chains::{ByBand, ChainId, Kind, LANE, Occupancy, StationId, Track};
use crate::track::labels::extent_of;
use crate::track::readings::{Relaid, by_band, on_band};
use crate::track::scene::{Item, ItemId, Map, Placement, Set};
use crate::track::sweep::{
    CROSSING, EDGE, Span, backtrack, block, descend, from_reach, spanned, warp,
};

/// How far outside its ends' reach a station stands before its chain laps.
const STRAY: f64 = 2.0 * LANE;
/// How much cheaper a new route must be than the old one before the chain takes it.
const SAVING: f64 = 8.0 * LANE;
/// How much of a lap round the drawing a line's cost counts: a quarter of its length.
const BEYOND_SHARE: f64 = 4.0;
/// How many times the chains not yet relaid are tried again.
const PASSES: usize = 3;
/// The spacing of the columns a route may take, besides the edges of what stands on its bands.
const STEP: f64 = LANE / 2.0;

/// What the other lines do in one channel, read onto the columns.
struct Traffic {
    /// Each column's x plus a crossing's worth for every other line's upright left of it.
    warped: Vec<f64>,
    /// How many other lines run across the channel over each column.
    across: Vec<f64>,
}

/// How far an x stands outside a span; zero inside.
fn outside(x: f64, span: Span) -> f64 {
    js_max(js_max(0.0, span.0 - x), x - span.1)
}

/// What a chain costs where it stands, by each count, and how many lines it crosses there.
struct Standing {
    costs: [f64; 2],
    crossings: f64,
}

/// What one chain's route search keeps across the readings of its stations.
struct Search {
    chain: ChainId,
    occupancy: Occupancy,
    xs: Vec<f64>,
    traffic: Map<usize, Traffic>,
    masks: Map<StationId, Vec<bool>>,
    standing: Standing,
}

/// What a chain's crossings are counted by: line by line, or trunk by trunk.
#[derive(Clone, Copy)]
enum Count {
    Lines,
    Trunks,
}

/// What the chains a line crosses at one card are grouped by.
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum Crossed {
    Card(ItemId),
    Chain(usize),
}

/// The route search over one scene's columns.
struct Relay {
    columns: Vec<f64>,
    /// How far the scene's items reach, left and right: a route runs no further out.
    extent: Span,
    /// Every chain's stations, by band.
    bands: Vec<ByBand>,
    chains: Vec<ChainId>,
    /// What each chain must share with another to share a trunk, by its place;
    /// a chain whose stations were read again no longer has one, as the
    /// TypeScript engine kept it by the map it read them into first.
    kinds: Vec<Option<Rc<str>>>,
}

impl Track<'_> {
    /// Whether a chain laps: a station between its ends stands more than a
    /// couple of lanes outside where either end reaches.
    fn strays(&self, chain: ChainId) -> bool {
        let stations = &self.chain(chain).stations;
        let (upper, lower) = (
            self.reach_of(stations[0]),
            self.reach_of(*stations.last().expect("a station")),
        );
        let span = (js_min(upper.0, lower.0), js_max(upper.1, lower.1));
        stations[1..stations.len() - 1]
            .iter()
            .any(|&station| outside(self.x(station), span) > STRAY)
    }

    /// The frames a chain's two ends stand inside.
    fn end_frames(&self, chain: ChainId) -> Set<String> {
        let stations = &self.chain(chain).stations;
        let mut frames = Set::default();
        for end in [stations[0], *stations.last().expect("a station")] {
            let (band, x) = (self.station(end).band, self.x(end));
            for (id, (low, high)) in self.scene.frame_walls(band) {
                if x > low && x < high {
                    frames.insert(id);
                }
            }
        }
        frames
    }

    /// Where a station may not stand for the frames it stood in.
    fn frames_off(&self, station: StationId, open: &Set<String>) -> Vec<Span> {
        let x = self.x(station);
        let mut spans = Vec::new();
        for (id, (low, high)) in self.scene.frame_walls(self.station(station).band) {
            if x > low && x < high {
                spans.push((f64::NEG_INFINITY, low + EDGE));
                spans.push((high - EDGE, f64::INFINITY));
            } else if !open.contains(&id) {
                spans.push((low, high));
            }
        }
        spans
    }

    /// Relay every chain that laps the drawing onto a short free route through
    /// it, longest first, each keeping clear of every other line's lanes as
    /// they stand; its label box moves with it. `kinds` is every chain, and
    /// what it must share with another to share a trunk.
    pub(crate) fn relay_laps(&mut self, kinds: &[(ChainId, Rc<str>)], movable: &[ChainId]) {
        let straying: Vec<ChainId> = movable
            .iter()
            .copied()
            .filter(|&chain| self.strays(chain))
            .collect();
        let mut left = sorted_by(&straying, |&one, &other| {
            self.chain(other).stations.len() as f64 - self.chain(one).stations.len() as f64
        });
        if left.is_empty() {
            return;
        }
        let mut relay = Relay::new(self, kinds);
        for _ in 0..PASSES {
            if left.is_empty() {
                break;
            }
            let before = left.len();
            left.retain(|&chain| !relay.relay(self, chain));
            if left.len() == before {
                break;
            }
        }
    }
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

/// Where a label box's centre may not stand on a band for what stands beside
/// it there and for the walls of the containers on it.
fn walls_off(scene: &Placement, band: usize, half: f64, spans: &mut Vec<Span>) {
    if let Some(besides) = scene.besides.get(&band) {
        spans.extend(
            besides
                .iter()
                .map(|&(low, high)| (low - LANE - half, high + LANE + half)),
        );
    }
    for &(low, high) in scene.walled(band).values() {
        for wall in [low, high] {
            spans.push((wall - CONTAINER_INSET - half, wall + CONTAINER_INSET + half));
        }
    }
}

impl Relay {
    /// Lay the columns out across the scene.
    fn new(track: &Track<'_>, kinds: &[(ChainId, Rc<str>)]) -> Relay {
        let chains: Vec<ChainId> = kinds.iter().map(|(chain, _)| *chain).collect();
        let extent = extent_of(track.scene);
        let (left, right) = extent;
        #[expect(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "the whole number of steps across the scene, whose right edge is never left of its left"
        )]
        let count = ((right - left) / STEP).floor() as usize + 1;
        let columns = (0..count).map(|index| left + index as f64 * STEP).collect();
        let bands = chains
            .iter()
            .map(|&chain| by_band(track, &track.chain(chain).stations))
            .collect();
        Relay {
            columns,
            extent,
            bands,
            chains,
            kinds: kinds
                .iter()
                .map(|(_, kind)| Some(Rc::clone(kind)))
                .collect(),
        }
    }

    /// Read a chain's stations into its place in the bands again.
    fn reread(&mut self, track: &Track<'_>, index: usize, stations: &[StationId]) {
        self.bands[index] = by_band(track, stations);
        self.kinds[index] = None;
    }

    /// How many trunks the chains a line crosses in one channel make.
    fn trunks_among(
        &self,
        track: &Track<'_>,
        crossed: &[usize],
        upper: StationId,
        lower: StationId,
    ) -> f64 {
        let (upper_band, lower_band) = (track.station(upper).band, track.station(lower).band);
        let mut kinds: Map<Crossed, Set<Option<Rc<str>>>> = Map::default();
        for &other in crossed {
            let (one, two) = (
                self.bands[other][&upper_band],
                self.bands[other][&lower_band],
            );
            let (one, two) = (track.station(one), track.station(two));
            let card = if one.kind == Kind::Card {
                Crossed::Card(one.item.expect("a card"))
            } else if two.kind == Kind::Card {
                Crossed::Card(two.item.expect("a card"))
            } else {
                Crossed::Chain(other)
            };
            kinds
                .entry(card)
                .or_default()
                .insert(self.kinds[other].clone());
        }
        kinds.values().fold(0.0, |sum, one| sum + one.len() as f64)
    }

    /// How many lines a chain's stations at some x cross, counted one way.
    fn crossings(
        &self,
        track: &Track<'_>,
        stations: &[StationId],
        xs: &[f64],
        count: Count,
    ) -> f64 {
        match count {
            Count::Lines => track.crossings_of(stations, xs, &self.bands, None),
            Count::Trunks => {
                let mut counted = |track: &Track<'_>, crossed: &[usize], upper, lower| {
                    self.trunks_among(track, crossed, upper, lower)
                };
                track.crossings_of(stations, xs, &self.bands, Some(&mut counted))
            }
        }
    }

    /// Relay one chain onto its cheapest free route when that saves enough.
    /// Answers whether it moved.
    fn relay(&mut self, track: &mut Track<'_>, chain: ChainId) -> bool {
        let index = self
            .chains
            .iter()
            .position(|&one| one == chain)
            .expect("a relayed chain");
        let stations = track.chain(chain).stations.clone();
        let old: Vec<f64> = stations.iter().map(|&station| track.x(station)).collect();
        let standing = Standing {
            costs: [
                self.cost(track, &stations, &old, Count::Lines),
                self.cost(track, &stations, &old, Count::Trunks),
            ],
            crossings: track.crossings_of(&stations, &old, &self.bands, None),
        };
        let occupancy = self.occupancy_without(track, chain);
        // Every reading passes the same bands with the same x, so it has the
        // same columns and the same traffic; only a moved station's mask is new.
        let xs = self.columns_for(track, &stations, &occupancy);
        let traffic = self.traffic_of(track, &stations, &xs);
        let mut search = Search {
            chain,
            occupancy,
            xs,
            traffic,
            masks: Map::default(),
            standing,
        };
        let readings = track.readings_of(chain);
        let mut relaid: Vec<Relaid> = Vec::new();
        for (at, reading) in readings.iter().enumerate() {
            self.reread(track, index, reading);
            relaid.extend(self.relaid(track, &mut search, reading, at > 0));
        }
        let mut best: Option<&Relaid> = None;
        for one in &relaid {
            if best.is_none_or(|best| one.cost < best.cost) {
                best = Some(one);
            }
        }
        let read = best.map_or(stations, |best| best.stations.clone());
        self.reread(track, index, &read);
        let Some(best) = best else {
            return false;
        };
        track.take(chain, best);
        true
    }

    /// The cheapest free route for one reading of a chain's stations, when it
    /// saves enough over where the chain stands.
    fn relaid(
        &self,
        track: &Track<'_>,
        search: &mut Search,
        stations: &[StationId],
        moved: bool,
    ) -> Option<Relaid> {
        let masks: Vec<Vec<bool>> = stations[1..stations.len() - 1]
            .iter()
            .map(|&station| self.mask_of(track, search, station))
            .collect();
        let chosen = Self::cheapest(track, stations, &search.xs, &masks, &search.traffic)?;
        let mut route = vec![track.x(stations[0])];
        route.extend(chosen);
        route.push(track.x(*stations.last().expect("a station")));
        let costs = [
            self.cost(track, stations, &route, Count::Lines),
            self.cost(track, stations, &route, Count::Trunks),
        ];
        // A label box moved to another band crosses no more lines than its line does.
        if moved
            && track.crossings_of(stations, &route, &self.bands, None) > search.standing.crossings
        {
            return None;
        }
        let saves = (0..2).any(|at| costs[at] <= search.standing.costs[at] - SAVING);
        saves.then(|| Relaid {
            stations: stations.to_vec(),
            route,
            cost: costs[0],
        })
    }

    /// Which columns a station may stand on, found once per search.
    fn mask_of(&self, track: &Track<'_>, search: &mut Search, station: StationId) -> Vec<bool> {
        if let Some(known) = search.masks.get(&station) {
            return known.clone();
        }
        let mask = self.free_at(track, search.chain, station, &search.xs, &search.occupancy);
        search.masks.insert(station, mask.clone());
        mask
    }

    /// What each band holds besides one chain: every item but its label box,
    /// and every other chain's lanes.
    fn occupancy_without(&self, track: &Track<'_>, chain: ChainId) -> Occupancy {
        let own: Set<ItemId> = track
            .chain(chain)
            .stations
            .iter()
            .filter(|&&station| track.station(station).kind == Kind::Label)
            .map(|&station| track.station(station).item.expect("a label"))
            .collect();
        let mut occupancy = Occupancy::new(track.scene, &own);
        for &other in &self.chains {
            if other != chain {
                for &station in &track.chain(other).stations {
                    if track.station(station).kind == Kind::Lane {
                        occupancy.take(track, station);
                    }
                }
            }
        }
        occupancy
    }

    /// The columns a chain's route may take, ascending.
    fn columns_for(
        &self,
        track: &Track<'_>,
        stations: &[StationId],
        occupancy: &Occupancy,
    ) -> Vec<f64> {
        let mut all = self.columns.clone();
        all.extend(occupancy.edges(track, &stations[1..stations.len() - 1]));
        all.extend(stations.iter().map(|&station| track.x(station)));
        let (a, b) = track.reach_of(stations[0]);
        let (c, d) = track.reach_of(*stations.last().expect("a station"));
        all.extend([a, b, c, d]);
        let mut xs = unique(&all);
        sort_by(&mut xs, |one, other| one - other);
        xs
    }

    /// Which columns a station may stand on.
    fn free_at(
        &self,
        track: &Track<'_>,
        chain: ChainId,
        station: StationId,
        xs: &[f64],
        occupancy: &Occupancy,
    ) -> Vec<bool> {
        let mut free = vec![true; xs.len()];
        for span in self.kept_off(track, chain, station, occupancy) {
            block(&mut free, xs, span);
        }
        free
    }

    /// Where a station may not stand.
    fn kept_off(
        &self,
        track: &Track<'_>,
        chain: ChainId,
        station: StationId,
        occupancy: &Occupancy,
    ) -> Vec<Span> {
        let one = track.station(station);
        let half = one
            .item
            .map_or(0.0, |item| track.scene.item(item).bx.width / 2.0);
        let (left, right) = self.extent;
        let mut spans = track.frames_off(station, &track.end_frames(chain));
        spans.push((f64::NEG_INFINITY, left + half));
        spans.push((right - half, f64::INFINITY));
        match one.item {
            None => spans.extend(occupancy.taken[one.band].iter().copied()),
            Some(item) => spans.extend(self.label_walls(track, chain, item, one.band)),
        }
        spans
    }

    /// Where a label box's centre may not stand on its band for the lanes of
    /// the other chains there.
    fn lanes_off(
        &self,
        track: &Track<'_>,
        chain: ChainId,
        band: usize,
        half: f64,
        spans: &mut Vec<Span>,
    ) {
        for &other in self.chains.iter().filter(|&&other| other != chain) {
            for &station in &track.chain(other).stations {
                let one = track.station(station);
                if one.kind == Kind::Lane && one.band == band {
                    let x = track.x(station);
                    spans.push((x - LANE - half, x + LANE + half));
                }
            }
        }
    }

    /// Where a label box's centre may not stand on its band.
    fn label_walls(
        &self,
        track: &Track<'_>,
        chain: ChainId,
        label: ItemId,
        band: usize,
    ) -> Vec<Span> {
        let scene = &*track.scene;
        let item = *scene.item(label);
        let half = item.bx.width / 2.0;
        let placed = if band == item.band {
            item
        } else {
            on_band(scene, &item, band)
        };
        let solid: Vec<Item> = scene
            .cards
            .values()
            .chain(scene.titles.values())
            .map(|&one| *scene.item(one))
            .chain(scene.captions_for(&placed))
            .collect();
        let others = scene
            .labels
            .values()
            .filter(|&&one| one != label)
            .map(|&one| *scene.item(one));
        let gapped = solid
            .into_iter()
            .map(|one| (one, LABEL_CARD_CLEARANCE))
            .chain(others.map(|one| (one, LABEL_LABEL_CLEARANCE)))
            .filter(|(one, _)| one.band == band)
            .map(|(one, gap)| (one.bx.x - gap - half, one.bx.x + one.bx.width + gap + half));
        let mut spans: Vec<Span> = gapped.collect();
        self.lanes_off(track, chain, band, half, &mut spans);
        walls_off(scene, band, half, &mut spans);
        let stations = &track.chain(chain).stations;
        let (from, to) = (
            track.spot(stations[0]),
            track.spot(*stations.last().expect("a station")),
        );
        spans.extend(scene.regions_off(from, to, &item, band));
        spans
    }

    /// What a chain's line costs with its stations at some x: its sideways
    /// travel, a share of the length it runs down beyond the drawing, and a
    /// crossing's worth for each line, or trunk, it crosses.
    fn cost(&self, track: &Track<'_>, stations: &[StationId], xs: &[f64], count: Count) -> f64 {
        let mut travel = 0.0;
        for index in 0..stations.len() - 1 {
            let (top, bottom) = (xs[index], xs[index + 1]);
            travel += (track.meets_at(stations[index], bottom, Some(top))
                - track.meets_at(stations[index + 1], top, Some(bottom)))
            .abs();
        }
        let far = self.beyond(track, stations, xs);
        let lap = js_min(far / BEYOND_SHARE, CROSSING + SAVING);
        travel + lap + CROSSING * self.crossings(track, stations, xs, count)
    }

    /// How far a chain's line runs down beyond everything the drawing holds,
    /// where the drawing's edge is the page's.
    fn beyond(&self, track: &Track<'_>, stations: &[StationId], xs: &[f64]) -> f64 {
        let scene = &*track.scene;
        if !scene.edges_page {
            return 0.0;
        }
        let mut sum = 0.0;
        for (index, &station) in stations[1..stations.len() - 1].iter().enumerate() {
            if outside(xs[index + 1], self.extent) <= 0.0 {
                continue;
            }
            let band = track.station(station).band;
            let (above, below) = (scene.bands[band - 1], scene.bands[band + 1]);
            sum += (below.top + below.bottom - above.top - above.bottom) / 2.0;
        }
        sum
    }

    /// What the other lines do in each channel a chain passes, by the band above each channel.
    fn traffic_of(
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
    fn cheapest(
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
