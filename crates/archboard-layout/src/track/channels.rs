//! Ports, trunks and tracks (TASK-349). A net is one relationship's run between
//! two stations on neighbouring bands: it leaves the upper station straight
//! down, crosses the channel on a track, and enters the lower station straight
//! down.
//!
//! Relationships of one kind (and one comparison standing) that leave one card
//! face into the same channel share a port and a trunk: one line off the card,
//! one track, and a branch down to each end. Likewise those that enter one
//! card face; when they also share the card they end on, the trunk is one line
//! from face to face. Cards spread their ports along a face, each as close to
//! the other end as spacing allows, but for a line held to one point of its
//! card, which stands there and shares a trunk only with lines held to the
//! same point; each channel's units get tracks as `tracks.rs` stacks them.

use std::rc::Rc;

use crate::ecma::{abs, js_max, js_min, max, min, number_key, or, sorted_by, unique};
use crate::geometry::Rect;
use crate::track::chains::{Kind, LANE, StationId, Track};
use crate::track::scene::{ItemId, Map, Set, card_face};
use crate::track::tracks::{Unit, stack_units};

/// How far a port keeps from a card's corner.
const PORT_MARGIN: f64 = 20.0;

/// An end of a net: its upper station's bottom face, or its lower station's top face.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub(crate) enum End {
    Top,
    Bottom,
}

impl End {
    /// The other end.
    pub(crate) fn other(self) -> End {
        match self {
            End::Top => End::Bottom,
            End::Bottom => End::Top,
        }
    }
}

/// A net, by its place in the track.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub(crate) struct NetId(pub usize);

/// A trunk, by its place in the track.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub(crate) struct TrunkId(pub usize);

/// Relationships that share a port and a track at one card face.
#[derive(Clone, Debug)]
pub(crate) struct Trunk {
    /// Which end they share.
    pub side: End,
    pub nets: Vec<NetId>,
    /// Whether they share the other end's card too, and so run as one line from face to face.
    pub whole: bool,
}

/// One relationship's run between two stations on neighbouring bands.
#[derive(Clone, Debug)]
pub(crate) struct Net {
    pub edge: Rc<str>,
    pub order: f64,
    pub channel: usize,
    /// What must match for two nets to share a trunk: kind and standing.
    pub kind: Rc<str>,
    pub top: StationId,
    pub bottom: StationId,
    /// Where it leaves the upper station and enters the lower one.
    pub top_x: f64,
    pub bottom_x: f64,
    pub track: usize,
    pub trunk: Option<TrunkId>,
    /// Which end is its block's wall, reached on its track with no line above or below it.
    pub wall: Option<End>,
}

impl Net {
    /// The station at one end.
    pub(crate) fn at(&self, end: End) -> StationId {
        match end {
            End::Top => self.top,
            End::Bottom => self.bottom,
        }
    }

    /// Where it meets the station at one end.
    pub(crate) fn x_at(&self, end: End) -> f64 {
        match end {
            End::Top => self.top_x,
            End::Bottom => self.bottom_x,
        }
    }

    /// Stand its end at one station at an x.
    pub(crate) fn set_x_at(&mut self, end: End, x: f64) {
        match end {
            End::Top => self.top_x = x,
            End::Bottom => self.bottom_x = x,
        }
    }
}

/// One port a face must give: a trunk's, or a lone net's end.
#[derive(Clone, Debug)]
struct PortRequest {
    nets: Vec<NetId>,
    side: End,
    wanted: f64,
    order: f64,
}

/// A line's two end items: its first net's upper station's, and its last net's lower one's.
type Ends = (Option<ItemId>, Option<ItemId>);

/// The stretch of a face a port may stand on, clear of its corners.
pub(crate) fn port_reach(face: &Rect) -> (f64, f64) {
    let margin = js_min(PORT_MARGIN, face.width / 2.0);
    (face.x + margin, face.x + face.width - margin)
}

/// Spread the ports on one face, each as close to its other end as spacing
/// allows, in the order the ports must keep.
pub(crate) fn spread_ports(face: &Rect, wanted: &[f64]) -> Vec<f64> {
    let (low, high) = port_reach(face);
    let count = wanted.len();
    let gap = if count > 1 {
        js_min(LANE, (high - low) / (count - 1) as f64)
    } else {
        0.0
    };
    let mut ports: Vec<f64> = wanted
        .iter()
        .map(|&x| js_min(high, js_max(low, x)))
        .collect();
    for index in 1..count {
        ports[index] = js_max(ports[index], ports[index - 1] + gap);
    }
    if count > 0 && ports[count - 1] > high {
        ports[count - 1] = high;
        for index in (0..count - 1).rev() {
            ports[index] = js_min(ports[index], ports[index + 1] - gap);
        }
    }
    ports
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

/// What a channel's nets are grouped by into units: a trunk, or a lone net.
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum UnitKey {
    Trunk(TrunkId),
    Net(NetId),
}

impl Track<'_> {
    /// Group nets that share a card face, a channel, a kind and a standing
    /// into trunks: first those leaving a face, then, among the rest, those
    /// entering one.
    pub(crate) fn bundle_trunks(&mut self, nets: &[NetId]) {
        let line_ends = self.ends_of(nets);
        for side in [End::Top, End::Bottom] {
            let groups: Vec<Vec<NetId>> = self
                .trunk_groups(nets, side)
                .into_iter()
                .map(|one| self.without_twins(one, side, &line_ends))
                .collect();
            let pieces: Vec<Vec<NetId>> = groups
                .into_iter()
                .flat_map(|one| self.apart(one, nets, side))
                .collect();
            for group in pieces {
                if group.len() < 2 {
                    continue;
                }
                let other = side.other();
                let mut ends: Set<(bool, usize)> = Set::default();
                for &net in &group {
                    let station = self.station(self.net(net).at(other));
                    ends.insert(if station.kind == Kind::Card {
                        (true, station.item.map_or(usize::MAX, |item| item.0))
                    } else {
                        (false, net.0)
                    });
                }
                let whole = ends.len() == 1;
                self.trunks.push(Trunk {
                    side,
                    nets: group.clone(),
                    whole,
                });
                let trunk = TrunkId(self.trunks.len() - 1);
                for net in group {
                    self.net_mut(net).trunk = Some(trunk);
                }
            }
        }
    }

    /// Each line's two end items: the upper station of its first net and the
    /// lower station of its last.
    fn ends_of(&self, nets: &[NetId]) -> Map<Rc<str>, Ends> {
        let mut lines: Map<Rc<str>, Vec<NetId>> = Map::default();
        for &net in nets {
            lines
                .entry(self.net(net).edge.clone())
                .or_default()
                .push(net);
        }
        lines
            .into_iter()
            .map(|(edge, own)| {
                let sorted = sorted_by(&own, |&one, &other| {
                    self.net(one).channel as f64 - self.net(other).channel as f64
                });
                let first = self.station(self.net(sorted[0]).top).item;
                let last = self
                    .station(self.net(*sorted.last().expect("a net")).bottom)
                    .item;
                (edge, (first, last))
            })
            .collect()
    }

    /// Whether an end item is a block's one-point port.
    pub(crate) fn one_point(&self, item: Option<ItemId>) -> bool {
        item.is_some_and(|item| self.scene.item(item).bx.width <= 1.0)
    }

    /// Whether two end items stand for one place.
    fn same_place(&self, one: Option<ItemId>, other: Option<ItemId>) -> bool {
        one == other || (self.one_point(one) && self.one_point(other))
    }

    /// Whether two nets belong to different lines between the same two places.
    fn twins(&self, one: NetId, other: NetId, ends: &Map<Rc<str>, Ends>) -> bool {
        let (one, other) = (self.net(one), self.net(other));
        let (a, b) = (ends[&one.edge], ends[&other.edge]);
        one.edge != other.edge && self.same_place(a.0, b.0) && self.same_place(a.1, b.1)
    }

    /// A card face's trunk without the lines that run between the same two items as another of its lines.
    fn without_twins(&self, group: Vec<NetId>, side: End, ends: &Map<Rc<str>, Ends>) -> Vec<NetId> {
        if group.len() < 2 {
            return group;
        }
        let face = self
            .station(self.net(group[0]).at(side))
            .item
            .expect("a card face");
        if self.scene.item(face).bx.width <= 1.0 {
            return group;
        }
        group
            .iter()
            .copied()
            .filter(|&net| !group.iter().any(|&other| self.twins(net, other, ends)))
            .collect()
    }

    /// A face's trunk cut wherever another line from the same face comes
    /// between two of its members' other ends.
    fn apart(&self, group: Vec<NetId>, nets: &[NetId], side: End) -> Vec<Vec<NetId>> {
        if group.len() < 2 {
            return vec![group];
        }
        let other = side.other();
        let first = self.net(group[0]);
        let face = self.station(first.at(side)).item;
        let foreign: Vec<f64> = nets
            .iter()
            .filter(|&&net| {
                let one = self.net(net);
                !group.contains(&net)
                    && self.station(one.at(side)).item == face
                    && one.channel == first.channel
            })
            .map(|&net| self.x(self.net(net).at(other)))
            .collect();
        let sorted = sorted_by(&group, |&one, &next| {
            self.x(self.net(one).at(other)) - self.x(self.net(next).at(other))
        });
        let mut pieces: Vec<Vec<NetId>> = vec![vec![sorted[0]]];
        for index in 1..sorted.len() {
            let (low, high) = (
                self.x(self.net(sorted[index - 1]).at(other)),
                self.x(self.net(sorted[index]).at(other)),
            );
            if foreign.iter().any(|&x| x > low && x < high) {
                pieces.push(Vec::new());
            }
            pieces.last_mut().expect("a piece").push(sorted[index]);
        }
        pieces
    }

    /// Whether a net can run straight down from its upper station to its lower one.
    pub(crate) fn drops_straight(&self, net: NetId) -> bool {
        let net = self.net(net);
        let (a, b) = self.reach_of(net.top);
        let (c, d) = self.reach_of(net.bottom);
        js_max(a, c) <= js_min(b, d)
    }

    /// The nets that share a trunk on one side of their faces.
    fn trunk_groups(&self, nets: &[NetId], side: End) -> Vec<Vec<NetId>> {
        self.sharing(nets, side)
            .into_iter()
            .map(|group| self.joining(group, side))
            .collect()
    }

    /// The nets not yet in a trunk that end on one card face, grouped by card,
    /// channel, kind and standing, and by the point they are held to, if any.
    fn sharing(&self, nets: &[NetId], side: End) -> Vec<Vec<NetId>> {
        type Key = (usize, Rc<str>, Option<u64>);
        let mut groups: Map<ItemId, Map<Key, Vec<NetId>>> = Map::default();
        for &id in nets {
            let net = self.net(id);
            let station = self.station(net.at(side));
            if net.trunk.is_some() || station.kind != Kind::Card {
                continue;
            }
            let key = (net.channel, net.kind.clone(), station.at.map(number_key));
            groups
                .entry(station.item.expect("a card"))
                .or_default()
                .entry(key)
                .or_default()
                .push(id);
        }
        groups
            .into_values()
            .flat_map(|by_kind| by_kind.into_values())
            .collect()
    }

    /// The nets on one face that join its trunk.
    fn joining(&self, group: Vec<NetId>, side: End) -> Vec<NetId> {
        let other = side.other();
        let xs: Vec<f64> = group
            .iter()
            .filter(|&&net| !self.drops_straight(net))
            .map(|&net| self.x(self.net(net).at(other)))
            .collect();
        let (low, high) = (min(xs.iter().copied()), max(xs.iter().copied()));
        group
            .into_iter()
            .filter(|&net| {
                let x = self.x(self.net(net).at(other));
                !self.drops_straight(net) || (x > low && x < high)
            })
            .collect()
    }

    /// The trunk whose port one end of a net shares, if any.
    pub(crate) fn shared_at(&self, net: NetId, side: End) -> Option<TrunkId> {
        let trunk = self.net(net).trunk?;
        let one = &self.trunks[trunk.0];
        (one.side == side || one.whole).then_some(trunk)
    }

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
        let ports = spread_ports(&face, &if fan { fanned(&face, &wanted) } else { wanted });
        for (index, request) in ordered.iter().enumerate() {
            for &net in &request.nets {
                self.net_mut(net).set_x_at(request.side, ports[index]);
            }
        }
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

    /// The units of one channel that need a track: trunks, and lone nets that turn.
    fn units_of(&self, nets: &[NetId]) -> Vec<(Unit, Vec<NetId>)> {
        let mut groups: Map<UnitKey, Vec<NetId>> = Map::default();
        for &net in nets {
            let (key, members) = match self.net(net).trunk {
                Some(trunk) => (UnitKey::Trunk(trunk), self.trunks[trunk.0].nets.clone()),
                None => (UnitKey::Net(net), vec![net]),
            };
            groups.insert(key, members);
        }
        groups
            .into_values()
            .map(|members| (self.unit_of(&members), members))
            .filter(|(unit, _)| unit.high - unit.low > 0.5)
            .collect()
    }

    /// One trunk's or lone net's pins and run.
    fn unit_of(&self, members: &[NetId]) -> Unit {
        let nets: Vec<&Net> = members.iter().map(|&net| self.net(net)).collect();
        let tops = unique(
            &nets
                .iter()
                .filter(|net| net.wall != Some(End::Top))
                .map(|net| net.top_x)
                .collect::<Vec<_>>(),
        );
        let bottoms = unique(
            &nets
                .iter()
                .filter(|net| net.wall != Some(End::Bottom))
                .map(|net| net.bottom_x)
                .collect::<Vec<_>>(),
        );
        let walls: Vec<f64> = nets
            .iter()
            .filter_map(|net| match net.wall {
                Some(End::Top) => Some(net.top_x),
                Some(End::Bottom) => Some(net.bottom_x),
                None => None,
            })
            .collect();
        let low = min(tops.iter().chain(&bottoms).chain(&walls).copied());
        let high = max(tops.iter().chain(&bottoms).chain(&walls).copied());
        Unit {
            tops,
            bottoms,
            low,
            high,
            order: min(nets.iter().map(|net| net.order)),
        }
    }

    /// Assign the tracks of one channel, and answer how many it holds.
    pub(crate) fn assign_tracks(&mut self, nets: &[NetId]) -> usize {
        let units = self.units_of(nets);
        let plain: Vec<Unit> = units.iter().map(|(unit, _)| unit.clone()).collect();
        let tracks = stack_units(&plain);
        for &(unit, track) in &tracks {
            for &net in &units[unit].1 {
                self.net_mut(net).track = track;
            }
        }
        if tracks.is_empty() {
            0
        } else {
            max(tracks.iter().map(|&(_, track)| track as f64)) as usize + 1
        }
    }
}
