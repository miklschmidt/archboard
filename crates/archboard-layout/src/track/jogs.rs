//! Small jogs closed (visual polish). A line whose neighbouring stations stand
//! a few points apart is drawn with a sideways step too short for its two
//! bends: a notch in a line that should run straight. A step of up to two
//! lanes still reads as a kink in one line rather than a route, and is closed
//! the same way. Each such step is closed by moving one of its ends onto the
//! other's column where that end can move without crowding anything: a card's
//! own port along its face, a run of lanes onto a free column, or a label box
//! clear of the rest of its band. A move that would bend a line that ran
//! straight on the moved station's other side is not made.
//!
//! Drawn as blocks, a step at a label of any width that turns its line back
//! against its last step is closed the same way. A card a line enters on top
//! and another leaves at the bottom a few points over is such a step too.
//!
//! A step no move can close is opened instead to the shortest step its two
//! bends turn whole. The same moves part two lines that read as one (`parting.rs`).

use crate::constants::{BEND_RADIUS, CARD_RADIUS};
use crate::ecma::{abs, js_min, sign, to_fixed};
use crate::track::chains::{ChainId, Kind, LANE, StationId, Track};
use crate::track::channels::{End, NetId};
use crate::track::scene::{Item, Map, Set, card_face, centre_x};

/// Under this, two stations stand in one column.
pub(crate) const STRAIGHT: f64 = 0.5;
/// How near its card's corner a port may come to let its line run straight.
const CORNER_ROOM: f64 = 12.0;
/// How many passes close jogs that one move opens elsewhere.
pub(crate) const PASSES: usize = 3;
/// Up to this, a sideways step reads as a kink in one line, not a route.
const KINK: f64 = 2.0 * LANE;

/// Where a net stands: its line, top to bottom, and its place in it.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Place {
    pub route: usize,
    pub index: usize,
}

/// A station of a stretch, with the net arriving at it and which end of the net it stands at.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Reach {
    pub station: StationId,
    pub net: NetId,
    pub end: End,
}

/// Which steps count as new ones a move must not open.
pub(crate) type Guard = fn(&Track<'_>, NetId) -> bool;

/// What a stretch's move must keep: no new step `guard` counts on another
/// line, and a drawing `better` calls better when it is given; `piece` moves
/// only the pieces of runs the stretch stands on.
#[derive(Clone, Copy)]
pub(crate) struct Keeping<'b> {
    pub guard: Guard,
    pub piece: bool,
    pub better: Option<&'b dyn Fn(&Track<'_>) -> bool>,
}

/// What a pass keeps from growing: a count over every net, never more after a move than before it.
pub(crate) type Kept<'k> = &'k dyn Fn(&Track<'_>, &[NetId]) -> f64;

/// What a pass that runs first keeps: nothing.
pub(crate) fn nothing(_: &Track<'_>, _: &[NetId]) -> f64 {
    0.0
}

/// What a stretch's move changes, to put back when part of it cannot move.
struct Saved {
    lanes: Map<StationId, f64>,
    boxes: Map<StationId, Item>,
    ends: Vec<(NetId, f64, f64)>,
}

/// How far a net steps sideways.
pub(crate) fn step(track: &Track<'_>, net: NetId) -> f64 {
    let net = track.net(net);
    abs(net.top_x - net.bottom_x)
}

/// Whether a net steps sideways by less than its two bends need.
pub(crate) fn notched(track: &Track<'_>, net: NetId) -> bool {
    let step = step(track, net);
    step > STRAIGHT && step < 2.0 * BEND_RADIUS
}

/// Whether a net steps sideways by no more than a kink.
pub(crate) fn kinked(track: &Track<'_>, net: NetId) -> bool {
    let step = step(track, net);
    step > STRAIGHT && step <= KINK + STRAIGHT
}

/// Whether two x stand closer than a line's two bends can turn between, yet apart.
fn too_short(one: f64, other: f64) -> bool {
    let gap = abs(one - other);
    gap > STRAIGHT && gap < 2.0 * BEND_RADIUS
}

impl Track<'_> {
    /// Whether a net from or to a label steps back against the line's last step before it.
    fn turns_back(&self, route: &[NetId], index: usize) -> bool {
        let net = self.net(route[index]);
        if self.station(net.top).kind != Kind::Label && self.station(net.bottom).kind != Kind::Label
        {
            return false;
        }
        let Some(&before) = route[..index]
            .iter()
            .rev()
            .find(|&&one| step(self, one) > STRAIGHT)
        else {
            return false;
        };
        if step(self, route[index]) <= STRAIGHT {
            return false;
        }
        let before = self.net(before);
        sign(net.bottom_x - net.top_x) != sign(before.bottom_x - before.top_x)
    }

    /// Whether a net's end at a card is a trunk's shared port.
    fn trunk_at(&self, net: NetId, end: End) -> bool {
        self.net(net).trunk.is_some_and(|trunk| {
            let trunk = &self.trunks[trunk.0];
            trunk.side == end || trunk.whole
        })
    }

    /// Whether an x stands on a card's face, clear of its corners.
    fn on_face(&self, station: StationId, x: f64) -> bool {
        let item = self.scene.item(self.station(station).item.expect("a card"));
        let (left, width) = (item.bx.x, item.bx.width);
        let room = js_min(CORNER_ROOM, width / 2.0);
        let face = card_face(item);
        x >= left + room
            && x <= left + width - room
            && x >= face.x + CARD_RADIUS
            && x <= face.x + face.width - CARD_RADIUS
    }

    /// Move a card's own port along its face to an x, when the port is no
    /// trunk's, held to no point, and clear of the face's corners and its
    /// other ports; a block's own port slides along the block's edge instead.
    fn move_port(&mut self, nets: &[NetId], net: NetId, end: End, x: f64) -> bool {
        let station = self.net(net).at(end);
        let item = self.station(station).item;
        if item.is_some_and(|item| self.scene.slides.contains_key(&item)) {
            return self.slide_port(nets, net, end, x);
        }
        if self.trunk_at(net, end)
            || self.station(station).at.is_some()
            || !self.on_face(station, x)
        {
            return false;
        }
        let crowded = nets.iter().any(|&other| {
            other != net
                && self.station(self.net(other).at(end)).item == item
                && abs(self.net(other).x_at(end) - x) < LANE
        });
        if crowded {
            return false;
        }
        self.net_mut(net).set_x_at(end, x);
        true
    }

    /// The stretch of a line beyond one end of a net: that end's station, and
    /// every station after it the line reaches straight, nearest first.
    pub(crate) fn stretch_beyond(&self, route: &[NetId], index: usize, end: End) -> Vec<Reach> {
        let net = route[index];
        let mut stretch = vec![Reach {
            station: self.net(net).at(end),
            net,
            end,
        }];
        let onward = |at: usize| {
            if end == End::Bottom {
                Some(at + 1).filter(|&below| below < route.len())
            } else {
                at.checked_sub(1)
            }
        };
        let mut at = onward(index);
        while let Some(here) = at {
            let next = route[here];
            if step(self, next) > STRAIGHT {
                break;
            }
            stretch.push(Reach {
                station: self.net(next).at(end),
                net: next,
                end,
            });
            at = onward(here);
        }
        stretch
    }

    /// Keep what moving some stations could change.
    fn save(&self, chains: &[ChainId], nets: &[NetId], stations: &[StationId]) -> Saved {
        let mut lanes: Map<StationId, f64> = Map::default();
        for &station in stations {
            if let Some(run) = self.run_of(chains, station) {
                for lane in run.lanes {
                    lanes.insert(lane, self.x(lane));
                }
            }
        }
        let mut boxes: Map<StationId, Item> = Map::default();
        for &station in stations {
            let one = self.station(station);
            if one.kind == Kind::Label
                || one
                    .item
                    .is_some_and(|item| self.scene.slides.contains_key(&item))
            {
                boxes.insert(station, *self.scene.item(one.item.expect("a box")));
            }
        }
        let ends = nets
            .iter()
            .map(|&net| (net, self.net(net).top_x, self.net(net).bottom_x))
            .collect();
        Saved { lanes, boxes, ends }
    }

    /// Put back what a failed stretch moved.
    fn restore(&mut self, saved: &Saved) {
        for (&lane, &x) in &saved.lanes {
            self.set_x(lane, x);
        }
        for (&station, item) in &saved.boxes {
            let id = self.station(station).item.expect("a box");
            self.scene.item_mut(id).bx = item.bx;
        }
        for &(net, top, bottom) in &saved.ends {
            let one = self.net_mut(net);
            one.top_x = top;
            one.bottom_x = bottom;
        }
    }

    /// Stand every net's end at its station where the station is a lane or a label.
    pub(crate) fn follow(&mut self, nets: &[NetId]) {
        for &net in nets {
            for end in [End::Top, End::Bottom] {
                let station = self.net(net).at(end);
                let one = *self.station(station);
                match one.kind {
                    Kind::Lane => {
                        let x = self.x(station);
                        self.net_mut(net).set_x_at(end, x);
                    }
                    Kind::Label => {
                        let x = centre_x(self.scene.item(one.item.expect("a label")));
                        self.net_mut(net).set_x_at(end, x);
                    }
                    Kind::Card => {}
                }
            }
        }
    }

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

    /// A key for every card step among some nets, to tell a new one from an old one.
    fn card_step_keys(&self, nets: &[NetId]) -> Vec<String> {
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
                    keys.push(format!(
                        "{}|{}|{}",
                        one.edge,
                        one.channel,
                        to_fixed(bottom_x, 2)
                    ));
                }
            }
        }
        keys
    }

    /// Move one station onto a column: a run of lanes onto it where it is
    /// free, a label box where it stays clear, and a card by its own port.
    fn move_station(
        &mut self,
        chains: &[ChainId],
        nets: &[NetId],
        one: Reach,
        x: f64,
        piece: bool,
    ) -> bool {
        match self.station(one.station).kind {
            Kind::Lane => self.x(one.station) == x || self.move_run(chains, one.station, x, piece),
            Kind::Label => {
                let item = self.station(one.station).item.expect("a label");
                self.nudge_label(nets, item, x)
            }
            Kind::Card => self.move_port(nets, one.net, one.end, x),
        }
    }

    /// Move a stretch of stations onto one column: all of it moves, or none,
    /// and none when the move would not keep what `keeping` asks.
    pub(crate) fn move_stretch(
        &mut self,
        chains: &[ChainId],
        nets: &[NetId],
        stretch: &[Reach],
        x: f64,
        keeping: Keeping<'_>,
    ) -> bool {
        let Keeping {
            guard,
            piece,
            better,
        } = keeping;
        let stations: Vec<StationId> = stretch.iter().map(|one| one.station).collect();
        let saved = self.save(chains, nets, &stations);
        let notches: Set<NetId> = nets
            .iter()
            .copied()
            .filter(|&net| guard(self, net))
            .collect();
        let steps: Set<String> = self.card_step_keys(nets).into_iter().collect();
        let moved = stretch
            .iter()
            .all(|&one| self.move_station(chains, nets, one, x, piece));
        if moved {
            self.follow(nets);
        }
        let done = moved
            && nets
                .iter()
                .all(|&net| notches.contains(&net) || !guard(self, net))
            && self
                .card_step_keys(nets)
                .iter()
                .all(|key| steps.contains(key))
            && better.is_none_or(|better| better(self));
        if !done {
            self.restore(&saved);
        }
        done
    }

    /// Close one net's short step by moving the stretch beyond one of its ends
    /// onto the other end's column, with the lines that run straight on through
    /// the card it ends on when it cannot move alone.
    fn close(
        &mut self,
        chains: &[ChainId],
        routes: &[Vec<NetId>],
        nets: &[NetId],
        place: Place,
        kept: Kept<'_>,
    ) -> bool {
        let route = &routes[place.route];
        let net = route[place.index];
        for end in [End::Top, End::Bottom] {
            let x = self.net(net).x_at(end.other());
            let stretch = self.stretch_beyond(route, place.index, end);
            if self.move_kept(chains, nets, &stretch, x, kept) {
                return true;
            }
            let through = self.through_card(routes, *stretch.last().expect("a station"));
            if !through.is_empty() {
                let mut all = stretch.clone();
                all.extend(through);
                if self.move_kept(chains, nets, &all, x, kept) {
                    return true;
                }
            }
        }
        false
    }

    /// Move some stations onto a column, where nothing the pass keeps grows.
    fn move_kept(
        &mut self,
        chains: &[ChainId],
        nets: &[NetId],
        moved: &[Reach],
        x: f64,
        kept: Kept<'_>,
    ) -> bool {
        let before = kept(self, nets);
        let better = |track: &Track<'_>| kept(track, nets) <= before;
        let keeping = Keeping {
            guard: kinked,
            piece: false,
            better: Some(&better),
        };
        self.move_stretch(chains, nets, moved, x, keeping)
    }

    /// The lines that run straight on through a card laid out as the region
    /// round it from where a stretch ends on it: each line that leaves its
    /// other face at the same x, and the straight stretch beyond.
    fn through_card(&self, routes: &[Vec<NetId>], last: Reach) -> Vec<Reach> {
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
    fn card_steps(&self, routes: &[Vec<NetId>]) -> Vec<(Place, Place)> {
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
    fn close_card_step(
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

    /// Close every step too short for its two bends that a move can close,
    /// and, in the first pass of a block the Blocks engine lays out, every
    /// step back at a label. `kept` is what no move may add to.
    pub(crate) fn close_jogs(&mut self, chains: &[ChainId], routes: &[Vec<NetId>], kept: Kept<'_>) {
        let nets: Vec<NetId> = routes.concat();
        for pass in 0..PASSES {
            let mut closed = Vec::new();
            for route in 0..routes.len() {
                for index in 0..routes[route].len() {
                    let net = routes[route][index];
                    let wants = (kinked(self, net)
                        || (pass == 0
                            && !self.scene.inline
                            && self.turns_back(&routes[route], index)))
                        && self.net(net).wall.is_none();
                    closed.push(
                        wants && self.close(chains, routes, &nets, Place { route, index }, kept),
                    );
                }
            }
            for (into, out_of) in self.card_steps(routes) {
                closed.push(self.close_card_step(chains, routes, &nets, into, out_of, kept));
            }
            if !closed.iter().any(|&one| one) {
                return;
            }
        }
    }

    /// Open every step still too short for its two bends, one no move could
    /// close, to the shortest step they turn whole.
    pub(crate) fn open_notches(&mut self, chains: &[ChainId], routes: &[Vec<NetId>]) {
        let nets: Vec<NetId> = routes.concat();
        for route in routes {
            for (index, &net) in route.iter().enumerate() {
                if !notched(self, net) || self.net(net).wall.is_some() {
                    continue;
                }
                for end in [End::Top, End::Bottom] {
                    let other = self.net(net).x_at(end.other());
                    let x = other + sign(self.net(net).x_at(end) - other) * 2.0 * BEND_RADIUS;
                    let stretch = self.stretch_beyond(route, index, end);
                    let keeping = Keeping {
                        guard: notched,
                        piece: false,
                        better: None,
                    };
                    if self.move_stretch(chains, &nets, &stretch, x, keeping) {
                        break;
                    }
                }
            }
        }
    }
}
