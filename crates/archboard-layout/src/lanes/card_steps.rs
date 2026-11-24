//! Card steps closed (visual polish): a card a line enters on top and another leaves at the
//! bottom a few points over, a step too short for the two bends between them. The line out, and
//! the straight stretch below it, moves onto the line in's column, or the line in onto the line
//! out's; and a move through a card laid out as the region round it takes the lines that run
//! straight on through it.

use std::rc::Rc;

use rustc_hash::FxHashSet;

use crate::ecma::{abs, to_fixed};
use crate::lanes::chains::{ChainId, Kind, Router};
use crate::lanes::channels::{End, NetId};
use crate::lanes::jogs::{Kept, MoveCache, Place, Reach, STRAIGHT, step, too_short};

/// A two-decimal fixed-point key bijective with `to_fixed(value, 2)`, avoiding float formatting
/// outside exact half-centi tie boundaries.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
enum FixedKey {
    Centis(i64, bool),
    Other(String),
}

impl FixedKey {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "bounded to |value| < 1e14, so centis fit comfortably in i64"
    )]
    fn of(value: f64) -> Self {
        if !value.is_finite() || value.abs() >= 1e14 {
            return Self::Other(to_fixed(value, 2));
        }
        let negative = value < 0.0;
        let mag = value.abs();
        let scaled = mag * 100.0;
        let floor = scaled.floor();
        let frac = scaled - floor;
        if (frac - 0.5).abs() > 1e-6 {
            let rounded = if frac > 0.5 { floor + 1.0 } else { floor };
            return Self::Centis(rounded as i64, negative);
        }
        let formatted = to_fixed(mag, 2);
        let centis: i64 = formatted
            .bytes()
            .filter(|&b| b != b'.')
            .fold(0_i64, |acc, b| acc * 10 + i64::from(b - b'0'));
        Self::Centis(centis, negative)
    }
}

/// Identifies one card step by outgoing line, channel, and incoming port offset on the card.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub(super) struct CardStepKey {
    edge: Rc<str>,
    channel: usize,
    offset: FixedKey,
}

impl Router<'_> {
    /// For every card item index, the `bottom_x` of nets that enter it from above.
    fn card_entries_by_item(&self, nets: &[NetId]) -> Vec<Vec<f64>> {
        let mut into: Vec<Vec<f64>> = vec![Vec::new(); self.scene.items.len()];
        for &net in nets {
            let one = self.net(net);
            if one.wall.is_some() {
                continue;
            }
            let bottom = self.station(one.bottom);
            if bottom.kind == Kind::Card
                && let Some(item) = bottom.item
            {
                into[item.0].push(one.bottom_x);
            }
        }
        into
    }

    /// Visit every card step key produced by one outgoing net on a card.
    fn visit_net_card_steps(
        &self,
        net: NetId,
        into: &[Vec<f64>],
        visit: &mut impl FnMut(CardStepKey) -> bool,
    ) -> bool {
        let one = self.net(net);
        let top = self.station(one.top);
        let Some(item) = top
            .item
            .filter(|_| one.wall.is_none() && top.kind == Kind::Card)
        else {
            return true;
        };
        let card = self.scene.item(item).bx.x;
        for &bottom_x in &into[item.0] {
            if too_short(bottom_x, one.top_x) {
                let key = CardStepKey {
                    edge: Rc::clone(&one.edge),
                    channel: one.channel,
                    offset: FixedKey::of(bottom_x - card),
                };
                if !visit(key) {
                    return false;
                }
            }
        }
        true
    }

    /// Visit every card step key among `nets`, stopping early if `visit` returns `false`.
    fn visit_card_step_keys(
        &self,
        nets: &[NetId],
        mut visit: impl FnMut(CardStepKey) -> bool,
    ) -> bool {
        let into = self.card_entries_by_item(nets);
        nets.iter()
            .all(|&net| self.visit_net_card_steps(net, &into, &mut visit))
    }

    /// A key for every card step among some nets, to tell a new one from an old one: where the
    /// line in stands on its card, so a card that slides with both its lines keeps its steps.
    #[cfg(test)]
    pub(super) fn card_step_keys(&self, nets: &[NetId]) -> Vec<CardStepKey> {
        let mut keys = Vec::new();
        self.visit_card_step_keys(nets, |key| {
            keys.push(key);
            true
        });
        keys
    }

    /// Populate `keys` with the card step keys currently present among `nets`, reusing its buffer.
    pub(super) fn fill_card_step_set(&self, nets: &[NetId], keys: &mut FxHashSet<CardStepKey>) {
        keys.clear();
        self.visit_card_step_keys(nets, |key| {
            keys.insert(key);
            true
        });
    }

    /// Whether every card step currently present among `nets` was already in `before`.
    pub(super) fn card_steps_subset(
        &self,
        nets: &[NetId],
        before: &FxHashSet<CardStepKey>,
    ) -> bool {
        self.visit_card_step_keys(nets, |key| before.contains(&key))
    }

    /// The lines that run straight on through a card laid out as the region
    /// round it from where a stretch ends on it: each line that leaves its
    /// other face at the same x, and the straight stretch beyond.
    pub(super) fn through_card(&self, routes: &[Vec<NetId>], last: Reach) -> Vec<Reach> {
        let station = self.station(last.station);
        if station.kind != Kind::Card
            || self
                .scene
                .item(station.item.expect("a card"))
                .inset
                .is_none()
        {
            return Vec::new();
        }
        let beyond = last.end.other();
        let x = self.net(last.net).x_at(last.end);
        let mut through = Vec::new();
        for (route, nets) in routes.iter().enumerate() {
            for (index, &other) in nets.iter().enumerate() {
                let one = self.net(other);
                if self.station(one.at(beyond)).item == station.item
                    && one.wall.is_none()
                    && abs(one.x_at(beyond) - x) <= STRAIGHT
                {
                    through.extend(self.card_side(routes, Place { route, index }, beyond));
                }
            }
        }
        through
    }

    /// Every card a line enters on top and another leaves at the bottom, their
    /// two ends a step too short to turn apart.
    pub(super) fn card_steps(&self, routes: &[Vec<NetId>]) -> Vec<(Place, Place)> {
        let places: Vec<(Place, NetId)> = routes
            .iter()
            .enumerate()
            .flat_map(|(route, nets)| {
                nets.iter()
                    .enumerate()
                    .map(move |(index, &net)| (Place { route, index }, net))
            })
            .filter(|&(_, net)| self.net(net).wall.is_none())
            .collect();
        let into: Vec<&(Place, NetId)> = places
            .iter()
            .filter(|(_, net)| self.station(self.net(*net).bottom).kind == Kind::Card)
            .collect();
        let out_of: Vec<&(Place, NetId)> = places
            .iter()
            .filter(|(_, net)| self.station(self.net(*net).top).kind == Kind::Card)
            .collect();
        let mut steps = Vec::new();
        for &&(one, one_net) in &into {
            for &&(other, other_net) in &out_of {
                let (a, b) = (self.net(one_net), self.net(other_net));
                if self.station(b.top).item == self.station(a.bottom).item
                    && too_short(b.top_x, a.bottom_x)
                {
                    steps.push((one, other));
                }
            }
        }
        steps
    }

    /// The end of a net at a card, and the straight stretch beyond it when the
    /// net runs straight from the card.
    fn card_side(&self, routes: &[Vec<NetId>], place: Place, end: End) -> Vec<Reach> {
        let net = routes[place.route][place.index];
        let mut side = vec![Reach {
            station: self.net(net).at(end),
            net,
            end,
        }];
        if step(self, net) <= STRAIGHT {
            side.extend(self.stretch_beyond(&routes[place.route], place.index, end.other()));
        }
        side
    }

    /// Close one card step: move the line out of the card, and the straight
    /// stretch below it, onto the line in's column; else the line in onto the line out's.
    pub(super) fn close_card_step(
        &mut self,
        chains: &[ChainId],
        routes: &[Vec<NetId>],
        nets: &[NetId],
        (into, out_of): (Place, Place),
        kept: Kept<'_>,
        (cache, kept_before): (&mut MoveCache, &mut Option<f64>),
    ) -> bool {
        let (in_net, out_net) = (
            routes[into.route][into.index],
            routes[out_of.route][out_of.index],
        );
        if !too_short(self.net(in_net).bottom_x, self.net(out_net).top_x) {
            return false;
        }
        let (out, inward) = (
            self.card_side(routes, out_of, End::Top),
            self.card_side(routes, into, End::Bottom),
        );
        let x = self.net(in_net).bottom_x;
        if self.move_kept(chains, nets, &out, x, kept, (cache, kept_before)) {
            return true;
        }
        let x = self.net(out_net).top_x;
        self.move_kept(chains, nets, &inward, x, kept, (cache, kept_before))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::Rect;
    use crate::lanes::chains::{Station, StationId};
    use crate::lanes::channels::Net;
    use crate::lanes::scene::{Item, Placement};

    /// A net between two stations at two x.
    fn net(
        edge: &str,
        (top, top_x): (StationId, f64),
        (bottom, bottom_x): (StationId, f64),
    ) -> Net {
        Net {
            edge: edge.into(),
            order: 0.0,
            channel: 0,
            kind: "call".into(),
            top,
            bottom,
            top_x,
            bottom_x,
            track: 0,
            trunk: None,
            wall: None,
        }
    }

    #[test]
    fn a_card_that_slides_with_both_its_lines_keeps_its_step() {
        let mut scene = Placement::default();
        let card = scene.add(Item::new(
            Rect {
                x: 0.0,
                y: 100.0,
                width: 100.0,
                height: 40.0,
            },
            1,
        ));
        let mut track = Router::new(&mut scene);
        let above = track.add(Station::new(Kind::Lane, 0, None, 50.0));
        let on = track.add(Station::new(Kind::Card, 1, Some(card), 50.0));
        let below = track.add(Station::new(Kind::Lane, 2, None, 55.0));
        // The line in enters the card's top at 50; the line out leaves its bottom at 55.
        track.nets.push(net("in", (above, 50.0), (on, 50.0)));
        track.nets.push(net("out", (on, 55.0), (below, 55.0)));
        let nets = [NetId(0), NetId(1)];
        let before = track.card_step_keys(&nets);
        assert_eq!(before.len(), 1, "the card holds one step");
        track.scene.item_mut(card).bx.x += 10.0;
        track.net_mut(NetId(0)).bottom_x += 10.0;
        track.net_mut(NetId(1)).top_x += 10.0;
        assert_eq!(track.card_step_keys(&nets), before);
    }
}
