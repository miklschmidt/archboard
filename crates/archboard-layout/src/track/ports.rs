//! The ports of a card's faces (TASK-349): the port each trunk or lone net asks
//! for over the other end of its line, the ports a face spreads and fans, and
//! the x each net takes at both of its ends.

use crate::ecma::{abs, js_max, max, min, or, sorted_by};
use crate::geometry::Rect;
use crate::track::chains::{Kind, Track};
use crate::track::channels::{End, NetId, TrunkId, port_reach, spread_along};
use crate::track::scene::{ItemId, Map, Set, card_face};

/// One port a face must give: a trunk's, or a lone net's end.
#[derive(Clone, Debug)]
struct PortRequest {
    nets: Vec<NetId>,
    side: End,
    wanted: f64,
    order: f64,
}

/// Where ports that want to stand beyond one end of a face ask to stand instead.
fn fanned(face: &Rect, wanted: &[f64]) -> Vec<f64> {
    let (low, high) = port_reach(face);
    let middle = face.x + face.width / 2.0;
    let within: Vec<f64> = wanted
        .iter()
        .copied()
        .filter(|&x| x >= low && x <= high)
        .collect();
    let mut asked = wanted.to_vec();
    let above: Vec<usize> = (0..wanted.len())
        .filter(|&index| wanted[index] > high)
        .collect();
    spread_over(
        &mut asked,
        &above,
        max(std::iter::once(middle).chain(within.iter().copied())),
        high,
    );
    let mut below: Vec<usize> = (0..wanted.len())
        .filter(|&index| wanted[index] < low)
        .collect();
    below.reverse();
    spread_over(
        &mut asked,
        &below,
        min(std::iter::once(middle).chain(within.iter().copied())),
        low,
    );
    asked
}

/// Spread two or more ports evenly over a stretch of a face, the last at its
/// end and none at its start; a lone port is left where it asked.
fn spread_over(asked: &mut [f64], ports: &[usize], start: f64, end: f64) {
    if ports.len() < 2 {
        return;
    }
    let count = ports.len() as f64;
    for (at, &index) in ports.iter().enumerate() {
        asked[index] = end - ((end - start) * (count - 1.0 - at as f64)) / count;
    }
}

impl Track<'_> {
    /// Every port request, by the card it is made on.
    fn port_requests(&self, nets: &[NetId]) -> Map<ItemId, Vec<PortRequest>> {
        let mut faces: Map<ItemId, Vec<PortRequest>> = Map::default();
        let mut asked_top: Set<TrunkId> = Set::default();
        let mut asked_bottom: Set<TrunkId> = Set::default();
        for &net in nets {
            for side in [End::Top, End::Bottom] {
                let asked = if side == End::Top {
                    &mut asked_top
                } else {
                    &mut asked_bottom
                };
                let Some(request) = self.request_of(net, side, asked) else {
                    continue;
                };
                let item = self.station(self.net(net).at(side)).item.expect("a card");
                faces.entry(item).or_default().push(request);
            }
        }
        faces
    }

    /// The port one end of a net asks for: its trunk's, the first time the trunk is met, or its own.
    fn request_of(&self, net: NetId, side: End, asked: &mut Set<TrunkId>) -> Option<PortRequest> {
        if self.station(self.net(net).at(side)).kind != Kind::Card {
            return None;
        }
        let Some(shared) = self.shared_at(net, side) else {
            return Some(self.request_for(&[net], side));
        };
        if !asked.insert(shared) {
            return None;
        }
        let members = self.trunks[shared.0].nets.clone();
        Some(self.request_for(&members, side))
    }

    /// One port for some nets on one face, wanted over the other end nearest
    /// the middle of them all.
    fn request_for(&self, members: &[NetId], side: End) -> PortRequest {
        let ends: Vec<f64> = sorted_by(members, |&one, &other| {
            self.net(one).order - self.net(other).order
        })
        .into_iter()
        .map(|member| self.net(member).x_at(side.other()))
        .collect();
        let middle = ends.iter().fold(0.0, |sum, x| sum + x) / ends.len() as f64;
        // Of two ends as near the middle, the one the board lists first.
        let wanted = ends[1..].iter().fold(ends[0], |one, &other| {
            if abs(other - middle) < abs(one - middle) - 0.01 {
                other
            } else {
                one
            }
        });
        PortRequest {
            nets: members.to_vec(),
            side,
            wanted,
            order: min(members.iter().map(|&net| self.net(net).order)),
        }
    }

    /// Give the ports on one face of a card.
    fn place_ports(&mut self, item: ItemId, requests: &[&PortRequest]) {
        let bx = self.scene.item(item).bx;
        let held: Vec<usize> = (0..requests.len())
            .filter(|&index| {
                let request = requests[index];
                self.station(self.net(request.nets[0]).at(request.side))
                    .at
                    .is_some()
            })
            .collect();
        for &index in &held {
            let request = requests[index];
            for &net in &request.nets {
                let at = self
                    .station(self.net(net).at(request.side))
                    .at
                    .expect("a held point");
                self.net_mut(net).set_x_at(request.side, bx.x + at);
            }
        }
        let rest: Vec<&PortRequest> = (0..requests.len())
            .filter(|index| !held.contains(index))
            .map(|index| requests[index])
            .collect();
        let ordered = sorted_by(&rest, |one, other| {
            or(one.wanted - other.wanted, one.order - other.order)
        });
        let wanted: Vec<f64> = ordered.iter().map(|request| request.wanted).collect();
        let face = card_face(self.scene.item(item));
        let fan = ordered
            .first()
            .is_some_and(|request| request.side == End::Bottom);
        let (low, high) = self.face_reach(item, &face, fan);
        let ports = spread_along(
            (low.min(high), high),
            &if fan { fanned(&face, &wanted) } else { wanted },
        );
        for (index, request) in ordered.iter().enumerate() {
            for &net in &request.nets {
                self.net_mut(net).set_x_at(request.side, ports[index]);
            }
        }
    }

    /// Keep incoming ports clear of a lone region's caption.
    fn face_reach(&self, item: ItemId, face: &Rect, fan: bool) -> (f64, f64) {
        let (low, high) = port_reach(face);
        let low = if fan {
            js_max(
                low,
                self.scene.item(item).bx.x + self.scene.item(item).top_inset,
            )
        } else {
            low
        };
        (low, high)
    }

    /// Give every net its x at both ends: cards spread their ports, labels and
    /// lanes keep their x. Twice, so a port can follow the other end's port.
    pub(crate) fn assign_ports(&mut self, nets: &[NetId]) {
        for _ in 0..2 {
            for (item, requests) in self.port_requests(nets) {
                let tops: Vec<&PortRequest> = requests
                    .iter()
                    .filter(|request| request.side == End::Top)
                    .collect();
                self.place_ports(item, &tops);
                let bottoms: Vec<&PortRequest> = requests
                    .iter()
                    .filter(|request| request.side == End::Bottom)
                    .collect();
                self.place_ports(item, &bottoms);
            }
        }
    }
}
