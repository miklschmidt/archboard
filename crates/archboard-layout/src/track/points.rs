//! Lines out of a flowchart's decision leave it from its points (ADR 0053,
//! TASK-491). Each line out of a card marked so (`FROM_POINTS`) asks Graphviz
//! to stand it under a corner of the card's box. Here, before anything else
//! is routed, each line down out of the card is held to one point of the
//! card's bottom edge: the line Graphviz stood furthest left near the left
//! edge of the box, the one furthest right near its right edge, and any other
//! at the middle. Of two answers, one Graphviz stood past the middle, on the
//! far side from its point, leaves from the middle instead. A line down into
//! such a card is held to the middle of its top.

use crate::ecma::{number_of, or, sign, sorted_by};
use crate::graph::{FROM_POINTS, POINTS_INSET};
use crate::track::chains::{ChainId, Kind, Track};
use crate::track::route::SceneLine;
use crate::track::scene::{Item, ItemId, Map};

/// A line held to a point of its card, with its place in the board.
#[derive(Clone, Copy, Debug)]
struct Held {
    chain: ChainId,
    order: f64,
    /// How far in from the box's edges a line from a side point runs down.
    inset: f64,
}

/// The most lines out of one card whose every order is tried.
const MOST_ORDERED: usize = 4;

/// Where one of a card's lines down leaves it, in from the left edge of its box.
fn point_at(width: f64, held: &Held, index: usize, count: usize) -> f64 {
    if count > 1 && index == 0 {
        return held.inset;
    }
    if count > 1 && index == count - 1 {
        return width - held.inset;
    }
    width / 2.0
}

/// Every order of some items, the given order first.
fn orders_of<T: Copy>(items: &[T]) -> Vec<Vec<T>> {
    if items.len() <= 1 {
        return vec![items.to_vec()];
    }
    let mut orders = Vec::new();
    for (index, &item) in items.iter().enumerate() {
        let mut rest = items.to_vec();
        rest.remove(index);
        for order in orders_of(&rest) {
            let mut one = vec![item];
            one.extend(order);
            orders.push(one);
        }
    }
    orders
}

/// How many times two lines trade sides on the bands both pass.
fn flips_of(one: &Map<usize, f64>, other: &Map<usize, f64>) -> f64 {
    let (mut side, mut flips) = (0.0, 0.0);
    let bands = sorted_by(&one.keys().copied().collect::<Vec<_>>(), |a, b| {
        *a as f64 - *b as f64
    });
    for band in bands {
        let now = other
            .get(&band)
            .map_or(0.0, |&there| sign(one[&band] - there));
        if now == 0.0 {
            continue;
        }
        if side != 0.0 && now != side {
            flips += 1.0;
        }
        side = now;
    }
    flips
}

impl Track<'_> {
    /// Whether a line held to a side point would run back under its card.
    fn doubles_back(&self, item: &Item, held: &Held, at: f64) -> bool {
        let middle = item.bx.width / 2.0;
        (self.first_stop(held.chain) - item.bx.x - middle) * (at - middle) < 0.0
    }

    /// A line's chain, when it is one to hold: it leaves its card from the
    /// card's points, and runs down from it to a lower band.
    fn held_chain(&self, line: &SceneLine<'_>, chains: &Map<String, ChainId>) -> Option<ChainId> {
        line.placed.option(FROM_POINTS)?;
        let &chain = chains.get(&line.id)?;
        let one = self.chain(chain);
        if one.upward {
            return None;
        }
        let (source, next) = (self.station(one.stations[0]), self.station(one.stations[1]));
        (next.band > source.band).then_some(chain)
    }

    /// Where a line first stops below its card: the x of its label box or of
    /// the card it reaches, whichever comes first.
    fn first_stop(&self, chain: ChainId) -> f64 {
        let stations = &self.chain(chain).stations;
        let stop = stations[1..]
            .iter()
            .copied()
            .find(|&station| self.station(station).kind != Kind::Lane)
            .unwrap_or(stations[1]);
        self.x(stop)
    }

    /// The lines to hold, by the card they leave.
    fn held_by_card(
        &self,
        lines: &[&SceneLine<'_>],
        chains: &Map<String, ChainId>,
    ) -> Map<ItemId, Vec<Held>> {
        let mut leaving: Map<ItemId, Vec<Held>> = Map::default();
        for line in lines {
            let Some(chain) = self.held_chain(line, chains) else {
                continue;
            };
            let source = self
                .station(self.chain(chain).stations[0])
                .item
                .expect("a card");
            let inset = number_of(line.placed.option(POINTS_INSET).unwrap_or("0"));
            leaving.entry(source).or_default().push(Held {
                chain,
                order: line.order,
                inset,
            });
        }
        leaving
    }

    /// Where a card holds its lines down out of it, left to right.
    fn held_ats(&self, item: &Item, sorted: &[Held]) -> Vec<f64> {
        let width = item.bx.width;
        let ats: Vec<f64> = sorted
            .iter()
            .enumerate()
            .map(|(index, held)| point_at(width, held, index, sorted.len()))
            .collect();
        let back: Vec<bool> = ats
            .iter()
            .enumerate()
            .map(|(index, &at)| self.doubles_back(item, &sorted[index], at))
            .collect();
        if sorted.len() != 2 || back.iter().filter(|&&one| one).count() != 1 {
            return ats;
        }
        ats.iter()
            .zip(&back)
            .map(|(&at, &back)| if back { width / 2.0 } else { at })
            .collect()
    }

    /// Where a line stands on each band it passes a lane or card on, from its point down.
    fn stands_of(&self, held: &Held, x: f64) -> Map<usize, f64> {
        let stations = &self.chain(held.chain).stations;
        let mut stands: Map<usize, f64> = Map::default();
        stands.insert(self.station(stations[0]).band, x);
        for &station in &stations[1..] {
            let one = self.station(station);
            if one.kind != Kind::Label {
                stands.insert(one.band, self.x(station));
            }
        }
        stands
    }

    /// How many times a card's lines cross below it, held to its points in an order.
    fn crossings_below(&self, item: &Item, order: &[Held]) -> f64 {
        let stands: Vec<Map<usize, f64>> = order
            .iter()
            .enumerate()
            .map(|(index, held)| {
                self.stands_of(
                    held,
                    item.bx.x + point_at(item.bx.width, held, index, order.len()),
                )
            })
            .collect();
        let mut sum = 0.0;
        for (index, one) in stands.iter().enumerate() {
            let mut more = 0.0;
            for other in &stands[index + 1..] {
                more += flips_of(one, other);
            }
            sum += more;
        }
        sum
    }

    /// A card's lines left to right: by where each first stops below the card,
    /// unless another order crosses fewer of them.
    fn order_of(&self, item: &Item, out: &[Held]) -> Vec<Held> {
        let sorted = sorted_by(out, |one, other| {
            or(
                self.first_stop(one.chain) - self.first_stop(other.chain),
                one.order - other.order,
            )
        });
        if sorted.len() > MOST_ORDERED {
            return sorted;
        }
        let orders = orders_of(&sorted);
        let mut best = orders[0].clone();
        for order in &orders[1..] {
            if self.crossings_below(item, order) < self.crossings_below(item, &best) {
                best = order.clone();
            }
        }
        best
    }

    /// Hold each line down out of a card that leaves from its points to its
    /// point, and each line down into such a card to the middle of its top.
    pub(crate) fn hold_to_points(
        &mut self,
        lines: &[&SceneLine<'_>],
        chains: &Map<String, ChainId>,
    ) {
        let leaving = self.held_by_card(lines, chains);
        for (&item, out) in &leaving {
            let card = *self.scene.item(item);
            let sorted = self.order_of(&card, out);
            let ats = self.held_ats(&card, &sorted);
            for (index, held) in sorted.iter().enumerate() {
                let station = self.chain(held.chain).stations[0];
                self.station_mut(station).at = Some(ats[index]);
                self.set_x(station, card.bx.x + ats[index]);
            }
        }
        for &chain in chains.values() {
            let one = self.chain(chain);
            let (first, station) = (one.stations[0], *one.stations.last().expect("a station"));
            let item = self.station(station).item.expect("a card");
            if one.upward
                || self.station(station).band == self.station(first).band
                || !leaving.contains_key(&item)
            {
                continue;
            }
            let bx = self.scene.item(item).bx;
            self.station_mut(station).at = Some(bx.width / 2.0);
            self.set_x(station, bx.x + bx.width / 2.0);
        }
    }
}
