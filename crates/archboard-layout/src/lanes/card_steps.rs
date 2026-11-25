//! Card steps closed (visual polish): a card a line enters on top and another leaves at the
//! bottom a few points over, a step too short for the two bends between them. The line out, and
//! the straight stretch below it, moves onto the line in's column, or the line in onto the line
//! out's; and a move through a card laid out as the region round it takes the lines that run
//! straight on through it.

use crate::ecma::{abs, to_fixed};
use crate::lanes::chains::{ChainId, Kind, Router};
use crate::lanes::channels::{End, NetId};
use crate::lanes::jogs::{Kept, Place, Reach, STRAIGHT, step, too_short};
use crate::lanes::scene::Map;

impl Router<'_> {
    /// The nets among some that end on a card below, by that card, in order.
    fn cards_below(&self, nets: &[NetId]) -> Map<Option<usize>, Vec<NetId>> {
        let mut into: Map<Option<usize>, Vec<NetId>> = Map::default();
        for &net in nets {
            let one = self.net(net);
            let bottom = self.station(one.bottom);
            if one.wall.is_none() && bottom.kind == Kind::Card {
                into.entry(bottom.item.map(|item| item.0))
                    .or_default()
                    .push(net);
            }
        }
        into
    }

    /// A key for every card step among some nets, to tell a new one from an old one: where the
    /// line in stands on its card, so a card that slides with both its lines keeps its steps.
    pub(super) fn card_step_keys(&self, nets: &[NetId]) -> Vec<String> {
        let into = self.cards_below(nets);
        let mut keys = Vec::new();
        for &net in nets {
            let one = self.net(net);
            let top = self.station(one.top);
            if one.wall.is_some() || top.kind != Kind::Card {
                continue;
            }
            for &other in into
                .get(&top.item.map(|item| item.0))
                .map_or(&[][..], Vec::as_slice)
            {
                let bottom_x = self.net(other).bottom_x;
                if too_short(bottom_x, one.top_x) {
                    let card = top.item.map_or(0.0, |item| self.scene.item(item).bx.x);
                    keys.push(format!(
                        "{}|{}|{}",
                        one.edge,
                        one.channel,
                        to_fixed(bottom_x - card, 2)
                    ));
                }
            }
        }
        keys
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
        into: Place,
        out_of: Place,
        kept: Kept<'_>,
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
        if self.move_kept(chains, nets, &out, x, kept) {
            return true;
        }
        let x = self.net(out_net).top_x;
        self.move_kept(chains, nets, &inward, x, kept)
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
