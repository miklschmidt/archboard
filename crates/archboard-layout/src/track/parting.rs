//! Two lines that read as one, parted (visual polish). A line that comes down
//! onto its track and turns within a lane of where another line turns off a
//! lower track and goes on down draws one line with a kink, however their
//! tracks are ordered. One end of the pair moves a lane aside, or onto its own
//! line's column, by the moves that close jogs (`jogs.rs`), when that parts
//! more such pairs than it makes and crosses nothing. A pair no such move
//! parts is tried again moving only the piece of a run of lanes on the
//! stretch. Two lines that end at one point are never parted.

use crate::ecma::{abs, number_key, or, sorted_by};
use crate::track::chains::{ChainId, Kind, LANE, Track};
use crate::track::channels::{End, NetId};
use crate::track::jogs::{PASSES, Place, Reach, STRAIGHT, notched};
use crate::track::scene::{Map, Set};

impl Track<'_> {
    /// Whether two nets belong to one line or one trunk.
    fn related(&self, one: NetId, other: NetId) -> bool {
        let (one, other) = (self.net(one), self.net(other));
        one.edge == other.edge || (one.trunk.is_some() && one.trunk == other.trunk)
    }

    /// Whether a line leaving a station into a channel and another line
    /// entering the station below from the same channel stand within a lane
    /// of each other, and so read as one line.
    pub fn collinear(&self, leaving: NetId, entering: NetId) -> bool {
        let (up, down) = (self.net(leaving), self.net(entering));
        let within = abs(up.top_x - down.bottom_x) < LANE;
        if up.channel != down.channel || !within {
            return false;
        }
        if self.related(leaving, entering)
            || up.wall == Some(End::Top)
            || down.wall == Some(End::Bottom)
        {
            return false;
        }
        !self.meet_at_one_point(leaving, entering)
    }

    /// Whether two nets end at one point of one station.
    fn meet_at_one_point(&self, one: NetId, other: NetId) -> bool {
        [End::Top, End::Bottom].into_iter().any(|end| {
            let item = self.station(self.net(one).at(end)).item;
            item.is_some()
                && item == self.station(self.net(other).at(end)).item
                && abs(self.net(one).x_at(end) - self.net(other).x_at(end)) <= STRAIGHT
        })
    }

    /// How many pairs of lines read as one.
    pub fn collinear_pairs(&self, nets: &[NetId]) -> f64 {
        let mut count = 0.0;
        for channel in by_channel(self, nets.iter().copied(), |&net| net).values() {
            for &leaving in channel {
                for &entering in channel {
                    if self.collinear(leaving, entering) {
                        count += 1.0;
                    }
                }
            }
        }
        count
    }

    /// How many pairs of lines swap sides across a channel.
    fn swapped(&self, nets: &[NetId]) -> f64 {
        let mut count = 0.0;
        for channel in by_channel(self, nets.iter().copied(), |&net| net).values() {
            for &one in channel {
                for &other in channel {
                    let (a, b) = (self.net(one), self.net(other));
                    if (a.top_x - b.top_x) * (a.bottom_x - b.bottom_x) < 0.0 {
                        count += 1.0;
                    }
                }
            }
        }
        count
    }

    /// The stretches of a line a part may move beyond one end of a net: the
    /// whole straight stretch, and, drawn inline, when that runs on through
    /// lanes into a label or a card, its lanes alone.
    fn stretches_beyond(&self, routes: &[Vec<NetId>], place: Place, end: End) -> Vec<Vec<Reach>> {
        let whole = self.stretch_beyond(&routes[place.route], place.index, end);
        let cut = whole
            .iter()
            .position(|one| self.station(one.station).kind != Kind::Lane);
        match cut {
            Some(cut) if self.scene.inline && cut > 0 => {
                let lanes = whole[..cut].to_vec();
                vec![whole, lanes]
            }
            _ => vec![whole],
        }
    }

    /// Part one pair of lines that read as one, by the nearest move that
    /// parts more pairs than it makes and makes no two lines cross.
    fn part(
        &mut self,
        chains: &[ChainId],
        routes: &[Vec<NetId>],
        leaving: Place,
        entering: Place,
        piece: bool,
    ) -> bool {
        let nets: Vec<NetId> = routes.concat();
        let (up, down) = (
            routes[leaving.route][leaving.index],
            routes[entering.route][entering.index],
        );
        let (count, crossing) = (self.collinear_pairs(&nets), self.swapped(&nets));
        let (upper, lower) = (self.net(up).clone(), self.net(down).clone());
        // A stretch moved onto its own line's column straightens that line as
        // it parts the pair, so those moves come before a lane aside.
        let own: Set<u64> = [upper.bottom_x, lower.top_x]
            .into_iter()
            .map(number_key)
            .collect();
        let mut moves: Vec<(f64, f64, Vec<Reach>)> = Vec::new();
        for x in [lower.bottom_x - LANE, lower.bottom_x + LANE, upper.bottom_x] {
            for stretch in self.stretches_beyond(routes, leaving, End::Top) {
                moves.push((x, upper.top_x, stretch));
            }
        }
        for x in [upper.top_x - LANE, upper.top_x + LANE, lower.top_x] {
            for stretch in self.stretches_beyond(routes, entering, End::Bottom) {
                moves.push((x, lower.bottom_x, stretch));
            }
        }
        let away = |x: f64| f64::from(u8::from(!own.contains(&number_key(x))));
        let moves = sorted_by(&moves, |one, other| {
            or(
                away(one.0) - away(other.0),
                abs(one.0 - one.1) - abs(other.0 - other.1),
            )
        });
        let better = |track: &Track<'_>| {
            track.collinear_pairs(&nets) < count && track.swapped(&nets) <= crossing
        };
        moves.iter().any(|(x, from, stretch)| {
            abs(x - from) > STRAIGHT
                // A lane aside opens a 16 px step on purpose: only a notch is new.
                && self.move_stretch(chains, &nets, stretch, *x, notched, piece, Some(&better))
        })
    }

    /// Part every pair of lines that read as one where a move can: moving
    /// whole runs of lanes first, then only the pieces of runs a stretch stands on.
    pub fn part_collinear(&mut self, chains: &[ChainId], routes: &[Vec<NetId>]) {
        let places: Vec<(NetId, Place)> = routes
            .iter()
            .enumerate()
            .flat_map(|(route, nets)| {
                nets.iter()
                    .enumerate()
                    .map(move |(index, &net)| (net, Place { route, index }))
            })
            .collect();
        let channels = by_channel(self, places.iter().copied(), |(net, _)| *net);
        for piece in [false, true] {
            for _ in 0..PASSES {
                let mut parted = false;
                for &(net, leaving) in &places {
                    let enterings: Vec<Place> = channels[&self.net(net).channel]
                        .iter()
                        .filter(|(entering, _)| self.collinear(net, *entering))
                        .map(|&(_, place)| place)
                        .collect();
                    for entering in enterings {
                        parted |= self.part(chains, routes, leaving, entering, piece);
                    }
                }
                if !parted {
                    break;
                }
            }
        }
    }
}

/// Items by the channel their net runs in, each in the order given.
fn by_channel<T>(
    track: &Track<'_>,
    items: impl IntoIterator<Item = T>,
    net_of: impl Fn(&T) -> NetId,
) -> Map<usize, Vec<T>> {
    let mut channels: Map<usize, Vec<T>> = Map::default();
    for item in items {
        let channel = track.net(net_of(&item)).channel;
        channels.entry(channel).or_default().push(item);
    }
    channels
}
