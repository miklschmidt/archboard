//! Two lines that read as one, parted (visual polish). A line that comes down
//! onto its track and turns within a lane of where another line turns off a
//! lower track and goes on down draws one line with a kink, however their
//! tracks are ordered. One end of the pair moves a lane aside, or onto its own
//! line's column, by the moves that close jogs (`jogs.rs`), when that parts
//! more such pairs than it makes and crosses nothing. A pair no such move
//! parts is tried again moving only the piece of a run of lanes on the
//! stretch. Two lines that end at one point are never parted.

use crate::ecma::{abs, number_key, or, sorted_by};
use crate::lanes::chains::{ChainId, LANE, Router};
use crate::lanes::channels::{End, NetId, TrunkId};
use crate::lanes::jogs::{Keeping, MoveCache, PASSES, Place, STRAIGHT, notched};
use crate::lanes::scene::ItemId;

/// Compact snapshot of one net for fast channel-wise collinearity and crossing checks.
struct NetEntry<'a> {
    edge: &'a str,
    trunk: Option<TrunkId>,
    wall: Option<End>,
    top_x: f64,
    bottom_x: f64,
    top_item: Option<ItemId>,
    bottom_item: Option<ItemId>,
}

impl NetEntry<'_> {
    fn related(&self, other: &Self) -> bool {
        std::ptr::eq(self.edge, other.edge)
            || self.edge == other.edge
            || (self.trunk.is_some() && self.trunk == other.trunk)
    }

    fn meets_at_one_point(&self, other: &Self) -> bool {
        (self.top_item.is_some()
            && self.top_item == other.top_item
            && abs(self.top_x - other.top_x) <= STRAIGHT)
            || (self.bottom_item.is_some()
                && self.bottom_item == other.bottom_item
                && abs(self.bottom_x - other.bottom_x) <= STRAIGHT)
    }

    fn collinear_with(&self, other: &Self) -> bool {
        abs(self.top_x - other.bottom_x) < LANE
            && other.wall != Some(End::Bottom)
            && !self.related(other)
            && !self.meets_at_one_point(other)
    }
}

fn channel_collinear_count(entries: &[NetEntry<'_>]) -> usize {
    let mut count = 0;
    for up in entries {
        if up.wall == Some(End::Top) {
            continue;
        }
        for down in entries {
            count += usize::from(up.collinear_with(down));
        }
    }
    count
}

impl Router<'_> {
    /// Whether two nets belong to one line or one trunk.
    fn related(&self, one: NetId, other: NetId) -> bool {
        let (one, other) = (self.net(one), self.net(other));
        one.edge == other.edge || (one.trunk.is_some() && one.trunk == other.trunk)
    }

    /// Whether a line leaving a station into a channel and another line
    /// entering the station below from the same channel stand within a lane
    /// of each other, and so read as one line.
    pub(crate) fn collinear(&self, leaving: NetId, entering: NetId) -> bool {
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

    fn entry_of(&self, id: NetId) -> NetEntry<'_> {
        let net = self.net(id);
        NetEntry {
            edge: &net.edge,
            trunk: net.trunk,
            wall: net.wall,
            top_x: net.top_x,
            bottom_x: net.bottom_x,
            top_item: self.station(net.top).item,
            bottom_item: self.station(net.bottom).item,
        }
    }

    /// How many pairs of lines read as one.
    pub(crate) fn collinear_pairs(&self, nets: &[NetId]) -> f64 {
        let channels = by_channel_vec(self, nets.iter().copied(), |&net| net);
        let mut count = 0usize;
        let mut entries: Vec<NetEntry<'_>> = Vec::new();
        for channel in &channels {
            if channel.len() < 2 {
                continue;
            }
            entries.clear();
            entries.extend(channel.iter().map(|&id| self.entry_of(id)));
            count += channel_collinear_count(&entries);
        }
        count as f64
    }

    /// How many pairs of lines swap sides across a channel.
    fn swapped(&self, nets: &[NetId]) -> f64 {
        let channels = by_channel_vec(self, nets.iter().copied(), |&net| net);
        let mut count = 0usize;
        let mut ends: Vec<(f64, f64)> = Vec::new();
        for channel in &channels {
            if channel.len() < 2 {
                continue;
            }
            ends.clear();
            ends.extend(channel.iter().map(|&id| {
                let net = self.net(id);
                (net.top_x, net.bottom_x)
            }));
            for (i, &(t1, b1)) in ends.iter().enumerate() {
                for &(t2, b2) in &ends[i + 1..] {
                    if (t1 - t2) * (b1 - b2) < 0.0 {
                        count += 2;
                    }
                }
            }
        }
        count as f64
    }

    /// Part one pair of lines that read as one, by the nearest move that
    /// parts more pairs than it makes and makes no two lines cross.
    fn part(
        &mut self,
        chains: &[ChainId],
        routes: &[Vec<NetId>],
        nets: &[NetId],
        (leaving, entering, piece): (Place, Place, bool),
        (cache, baseline): (&mut MoveCache, &mut Option<(f64, f64)>),
    ) -> bool {
        let (up, down) = (
            routes[leaving.route][leaving.index],
            routes[entering.route][entering.index],
        );
        let (count, crossing) =
            *baseline.get_or_insert_with(|| (self.collinear_pairs(nets), self.swapped(nets)));
        let (upper_top, upper_bottom) = {
            let u = self.net(up);
            (u.top_x, u.bottom_x)
        };
        let (lower_top, lower_bottom) = {
            let l = self.net(down);
            (l.top_x, l.bottom_x)
        };
        // A stretch moved onto its own line's column straightens that line as
        // it parts the pair, so those moves come before a lane aside.
        let own_a = number_key(upper_bottom);
        let own_b = number_key(lower_top);
        let leaving_stretch = self.stretch_beyond(&routes[leaving.route], leaving.index, End::Top);
        let entering_stretch =
            self.stretch_beyond(&routes[entering.route], entering.index, End::Bottom);
        let stretches = [&leaving_stretch, &entering_stretch];
        let raw_moves = [
            (lower_bottom - LANE, upper_top, 0usize),
            (lower_bottom + LANE, upper_top, 0),
            (upper_bottom, upper_top, 0),
            (upper_top - LANE, lower_bottom, 1),
            (upper_top + LANE, lower_bottom, 1),
            (lower_top, lower_bottom, 1),
        ];
        let away = |x: f64| {
            let k = number_key(x);
            f64::from(u8::from(k != own_a && k != own_b))
        };
        let moves = sorted_by(&raw_moves, |one, other| {
            or(
                away(one.0) - away(other.0),
                abs(one.0 - one.1) - abs(other.0 - other.1),
            )
        });
        let better = |track: &Router<'_>| {
            track.collinear_pairs(nets) < count && track.swapped(nets) <= crossing
        };
        // A lane aside opens a 16 px step on purpose: only a notch is new.
        let keeping = Keeping {
            guard: notched,
            piece,
            better: Some(&better),
        };
        let parted = moves.iter().any(|&(x, from, which)| {
            abs(x - from) > STRAIGHT
                && self.move_stretch(chains, nets, stretches[which], x, keeping, cache)
        });
        if parted {
            *baseline = None;
        }
        parted
    }

    /// Part every pair of lines that read as one where a move can: moving
    /// whole runs of lanes first, then only the pieces of runs a stretch stands on.
    pub(crate) fn part_collinear(&mut self, chains: &[ChainId], routes: &[Vec<NetId>]) {
        let nets: Vec<NetId> = routes.concat();
        let places: Vec<(NetId, Place)> = routes
            .iter()
            .enumerate()
            .flat_map(|(route, nets)| {
                nets.iter()
                    .enumerate()
                    .map(move |(index, &net)| (net, Place { route, index }))
            })
            .collect();
        let channels = by_channel_vec(self, places.iter().copied(), |(net, _)| *net);
        let mut cache = MoveCache::default();
        let mut baseline = None;
        for piece in [false, true] {
            for _ in 0..PASSES {
                let mut parted = false;
                for &(net, leaving) in &places {
                    let enterings: Vec<Place> = channels[self.net(net).channel]
                        .iter()
                        .filter(|(entering, _)| self.collinear(net, *entering))
                        .map(|&(_, place)| place)
                        .collect();
                    for entering in enterings {
                        parted |= self.part(
                            chains,
                            routes,
                            &nets,
                            (leaving, entering, piece),
                            (&mut cache, &mut baseline),
                        );
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
fn by_channel_vec<T>(
    track: &Router<'_>,
    items: impl IntoIterator<Item = T>,
    net_of: impl Fn(&T) -> NetId,
) -> Vec<Vec<T>> {
    let mut channels: Vec<Vec<T>> = Vec::with_capacity(track.scene.bands.len());
    for item in items {
        let channel = track.net(net_of(&item)).channel;
        if channel >= channels.len() {
            channels.resize_with(channel + 1, Vec::new);
        }
        channels[channel].push(item);
    }
    channels
}
