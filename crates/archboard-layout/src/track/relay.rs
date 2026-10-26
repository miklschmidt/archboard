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

use crate::ecma::{js_max, js_min, sorted_by, sorted_unique};
use crate::track::chains::{ByBand, ChainId, Kind, LANE, StationId, Track};
use crate::track::labels::extent_of;
use crate::track::occupancy::Occupancy;
use crate::track::readings::{Relaid, by_band};
use crate::track::scene::{ItemId, Map, Set};
use crate::track::sweep::{CROSSING, Span};
use crate::track::traffic::Traffic;

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

/// What the chains a line crosses at one card are grouped by.
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum Crossed {
    Card(ItemId),
    Chain(usize),
}

/// The route search over one scene's columns.
pub(super) struct Relay {
    columns: Vec<f64>,
    /// How far the scene's items reach, left and right: a route runs no further out.
    pub(super) extent: Span,
    /// Every chain's stations, by band.
    pub(super) bands: Vec<ByBand>,
    pub(super) chains: Vec<ChainId>,
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

    /// How many lines a chain's stations at some x cross.
    fn lines_crossed(&self, track: &Track<'_>, stations: &[StationId], xs: &[f64]) -> f64 {
        track.crossings_of(stations, xs, &self.bands, None)
    }

    /// How many trunks the lines a chain's stations at some x cross make.
    fn trunks_crossed(&self, track: &Track<'_>, stations: &[StationId], xs: &[f64]) -> f64 {
        let mut counted = |track: &Track<'_>, crossed: &[usize], upper, lower| {
            self.trunks_among(track, crossed, upper, lower)
        };
        track.crossings_of(stations, xs, &self.bands, Some(&mut counted))
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
        let crossings = self.lines_crossed(track, &stations, &old);
        let standing = Standing {
            costs: self.costs(track, &stations, &old, crossings),
            crossings,
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
        let middle = &stations[1..stations.len() - 1];
        for &station in middle {
            self.find_mask(track, search, station);
        }
        let masks: Vec<&[bool]> = middle
            .iter()
            .map(|station| search.masks[station].as_slice())
            .collect();
        let chosen = Self::cheapest(track, stations, &search.xs, &masks, &search.traffic)?;
        let mut route = vec![track.x(stations[0])];
        route.extend(chosen);
        route.push(track.x(*stations.last().expect("a station")));
        let crossings = self.lines_crossed(track, stations, &route);
        // A label box moved to another band crosses no more lines than its line does.
        if moved && crossings > search.standing.crossings {
            return None;
        }
        let costs = self.costs(track, stations, &route, crossings);
        let saves = (0..2).any(|at| costs[at] <= search.standing.costs[at] - SAVING);
        saves.then(|| Relaid {
            stations: stations.to_vec(),
            route,
            cost: costs[0],
        })
    }

    /// Find which columns a station may stand on, once per search.
    fn find_mask(&self, track: &Track<'_>, search: &mut Search, station: StationId) {
        if !search.masks.contains_key(&station) {
            let mask = self.free_at(track, search.chain, station, &search.xs, &search.occupancy);
            search.masks.insert(station, mask);
        }
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
        sorted_unique(&all)
    }

    /// What a chain's line costs with its stations at some x, where it
    /// crosses `crossings` lines: its sideways travel, a share of the length
    /// it runs down beyond the drawing, and a crossing's worth for each line
    /// it crosses, and for each trunk.
    fn costs(
        &self,
        track: &Track<'_>,
        stations: &[StationId],
        xs: &[f64],
        crossings: f64,
    ) -> [f64; 2] {
        let mut travel = 0.0;
        for index in 0..stations.len() - 1 {
            let (top, bottom) = (xs[index], xs[index + 1]);
            travel += (track.meets_at(stations[index], bottom, Some(top))
                - track.meets_at(stations[index + 1], top, Some(bottom)))
            .abs();
        }
        let far = self.beyond(track, stations, xs);
        let lap = js_min(far / BEYOND_SHARE, CROSSING + SAVING);
        let run = travel + lap;
        [
            run + CROSSING * crossings,
            run + CROSSING * self.trunks_crossed(track, stations, xs),
        ]
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
}
