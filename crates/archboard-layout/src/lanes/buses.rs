//! Buses between two cards, in a Lanes drawing. The lines that run between the same two cards
//! the same way travel as one bus: through every band between their cards they stand straight
//! over where they land on the lower card, a lane apart as its face stands them, where the bands
//! have room; else each stands a lane from the line before it, beside the first of them. A line
//! of the bus no longer crosses the page alone on a route of its own.

use crate::lanes::chains::{ChainId, Kind, LANE, Router, StationId};
use crate::lanes::scene::{ItemId, Map, Set};

/// The buses of a block, each by the cards it runs between and whether it runs upward.
pub(crate) type Buses = Set<(ItemId, ItemId, bool)>;

impl Router<'_> {
    /// The cards a chain runs between, and which way, when every station between them is a lane.
    fn bus_key(&self, chain: ChainId) -> Option<(ItemId, ItemId, bool)> {
        let one = self.chain(chain);
        let (first, last) = (*one.stations.first()?, *one.stations.last()?);
        let middle = &one.stations[1..one.stations.len() - 1];
        let lanes = !middle.is_empty()
            && middle
                .iter()
                .all(|&station| self.station(station).kind == Kind::Lane);
        let ends = (self.station(first).item?, self.station(last).item?);
        lanes.then_some((ends.0, ends.1, one.upward))
    }

    /// Whether lanes on a band at some x stand clear of its items and of every other lane on it.
    fn bus_room(&self, band: usize, xs: &[f64], own: &Set<StationId>) -> bool {
        let items = (self.scene.cards.values().chain(self.scene.labels.values()))
            .map(|&item| *self.scene.item(item))
            .filter(|item| item.band == band);
        let boxed = items.into_iter().any(|item| {
            xs.iter()
                .any(|&x| x > item.bx.x - LANE / 2.0 && x < item.bx.x + item.bx.width + LANE / 2.0)
        });
        let crowded = (0..self.stations.len()).map(StationId).any(|station| {
            let one = self.station(station);
            one.kind == Kind::Lane
                && one.band == band
                && !own.contains(&station)
                && xs.iter().any(|&x| (x - self.x(station)).abs() < LANE)
        });
        !boxed && !crowded
    }

    /// The middle lanes of each of a bus's lines, when every line has as many.
    fn lanes_of_bus(&self, members: &[ChainId]) -> Option<Vec<Vec<StationId>>> {
        let lanes: Vec<Vec<StationId>> = members
            .iter()
            .map(|&chain| {
                let stations = &self.chain(chain).stations;
                stations[1..stations.len() - 1].to_vec()
            })
            .collect();
        lanes
            .iter()
            .all(|one| one.len() == lanes[0].len())
            .then_some(lanes)
    }

    /// Stand each line's lanes straight over where it lands, when every band has room for it.
    fn stand_straight(&mut self, lanes: &[Vec<StationId>], straight: &[f64]) -> bool {
        let own: Set<StationId> = lanes.iter().flatten().copied().collect();
        let mut bands = lanes[0].iter().map(|&lane| self.station(lane).band);
        if !bands.all(|band| self.bus_room(band, straight, &own)) {
            return false;
        }
        for (one, &x) in lanes.iter().zip(straight) {
            for &lane in one {
                self.set_x(lane, x);
            }
        }
        true
    }

    /// Stand a bus's lanes on one band a lane apart beside the first line's, on the side the
    /// others came from, unless they stand together there already or the band has no room.
    fn stand_beside(&mut self, lanes: &[Vec<StationId>], at: usize) {
        let own: Set<StationId> = lanes.iter().flatten().copied().collect();
        let xs: Vec<f64> = lanes.iter().map(|one| self.x(one[at])).collect();
        let span = xs.iter().copied().fold(f64::NEG_INFINITY, f64::max)
            - xs.iter().copied().fold(f64::INFINITY, f64::min);
        if span <= LANE * lanes.len() as f64 {
            return;
        }
        let base = xs[0];
        let toward = if xs[1..].iter().map(|x| x - base).sum::<f64>() < 0.0 {
            -1.0
        } else {
            1.0
        };
        let wanted: Vec<f64> = (0..lanes.len())
            .map(|index| base + toward * index as f64 * LANE)
            .collect();
        if self.bus_room(self.station(lanes[0][at]).band, &wanted, &own) {
            for (one, &x) in lanes.iter().zip(&wanted) {
                self.set_x(one[at], x);
            }
        }
    }

    /// Stand the lines of each bus `chosen` names straight over where they land on the lower card
    /// through every band between their cards, or else beside the first of them. `landing` is the
    /// x each chain ends at on its lower card. Answers every bus found.
    pub(crate) fn gather_buses(
        &mut self,
        chains: &[ChainId],
        landing: &Map<ChainId, f64>,
        chosen: &Buses,
    ) -> Buses {
        let mut buses: Map<(ItemId, ItemId, bool), Vec<ChainId>> = Map::default();
        for &chain in chains {
            if let Some(key) = self.bus_key(chain) {
                buses.entry(key).or_default().push(chain);
            }
        }
        for (_, members) in buses.iter().filter(|(key, _)| chosen.contains(*key)) {
            let Some(lanes) = self.lanes_of_bus(members) else {
                continue;
            };
            let straight: Vec<f64> = members.iter().map(|chain| landing[chain]).collect();
            if !self.stand_straight(&lanes, &straight) {
                for at in 0..lanes[0].len() {
                    self.stand_beside(&lanes, at);
                }
            }
        }
        (buses.iter())
            .filter(|(_, members)| members.len() > 1)
            .map(|(&key, _)| key)
            .collect()
    }
}
