//! Small jogs closed (visual polish). A line whose neighbouring stations stand
//! a few points apart is drawn with a sideways step too short for its two
//! bends: a notch in a line that should run straight. A step of up to two
//! lanes still reads as a kink in one line rather than a route, and is closed
//! the same way. Each such step is closed by moving one of its ends onto the
//! other's column where that end can move without crowding anything: a card's
//! own port along its face (in a Lanes drawing, whose ports stand centred, the
//! card itself by no more than a kink), a run of lanes onto a free column, or a
//! label box clear of the rest of its band. A move that would bend a line that ran
//! straight on the moved station's other side is not made.
//!
//! Drawn as blocks, a step at a label of any width that turns its line back
//! against its last step is closed the same way. A card a line enters on top
//! and another leaves at the bottom a few points over is such a step too (`card_steps.rs`).
//!
//! A step no move can close is opened instead to the shortest step its two
//! bends turn whole. The same moves part two lines that read as one (`parting.rs`).

use crate::constants::{BEND_RADIUS, CARD_RADIUS};
use crate::ecma::{abs, js_min, sign};
use crate::geometry::Rect;
use crate::lanes::chains::{ChainId, Kind, LANE, Router, StationId};
use crate::lanes::channels::{End, NetId, PORT_MARGIN};
use crate::lanes::scene::{Item, Map, Set, card_face, centre_x};

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
pub(crate) type Guard = fn(&Router<'_>, NetId) -> bool;

/// What a stretch's move must keep: no new step `guard` counts on another
/// line, and a drawing `better` calls better when it is given; `piece` moves
/// only the pieces of runs the stretch stands on.
#[derive(Clone, Copy)]
pub(crate) struct Keeping<'b> {
    pub guard: Guard,
    pub piece: bool,
    pub better: Option<&'b dyn Fn(&Router<'_>) -> bool>,
}

/// What a pass keeps from growing: a count over every net, never more after a move than before it.
pub(crate) type Kept<'k> = &'k dyn Fn(&Router<'_>, &[NetId]) -> f64;

/// What a pass that runs first keeps: nothing.
pub(crate) fn nothing(_: &Router<'_>, _: &[NetId]) -> f64 {
    0.0
}

/// What a stretch's move changes, to put back when part of it cannot move.
struct Saved {
    lanes: Map<StationId, f64>,
    boxes: Map<StationId, Item>,
    ends: Vec<(NetId, f64, f64)>,
}

/// How far a net steps sideways.
pub(crate) fn step(track: &Router<'_>, net: NetId) -> f64 {
    let net = track.net(net);
    abs(net.top_x - net.bottom_x)
}

/// Whether a net steps sideways by less than its two bends need.
pub(crate) fn notched(track: &Router<'_>, net: NetId) -> bool {
    let step = step(track, net);
    step > STRAIGHT && step < 2.0 * BEND_RADIUS
}

/// Whether a net steps sideways by no more than a kink.
pub(crate) fn kinked(track: &Router<'_>, net: NetId) -> bool {
    let step = step(track, net);
    step > STRAIGHT && step <= KINK + STRAIGHT
}

/// Whether two x stand closer than a line's two bends can turn between, yet apart.
pub(super) fn too_short(one: f64, other: f64) -> bool {
    let gap = abs(one - other);
    gap > STRAIGHT && gap < 2.0 * BEND_RADIUS
}

impl Router<'_> {
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

    /// Whether an x stands on a card's face, clear of its corners.
    fn on_face(&self, station: StationId, x: f64, half: f64) -> bool {
        let item = self.scene.item(self.station(station).item.expect("a card"));
        let (left, width) = (item.bx.x, item.bx.width);
        let room = js_min(CORNER_ROOM, width / 2.0);
        let face = card_face(item);
        let margin = if half > 0.0 { PORT_MARGIN } else { CARD_RADIUS };
        x - half >= left + room
            && x + half <= left + width - room
            && x - half >= face.x + margin
            && x + half <= face.x + face.width - margin
    }

    /// Move a card's own port along its face to an x, when the port is no
    /// trunk's and clear of the face's corners and its
    /// other ports. A bus's ports stand centred on their face (`place_ports`) and never move
    /// to close a jog: their card slides instead (`slide_card`).
    fn move_port(&mut self, nets: &[NetId], net: NetId, end: End, x: f64) -> bool {
        let station = self.net(net).at(end);
        let item = self.station(station).item;
        if self.sided.contains(&(net, end)) {
            return false;
        }
        if self.bus {
            return self.slide_card(nets, net, end, x);
        }
        let half = self.net(net).reach();
        if self.shared_at(net, end).is_some() || !self.on_face(station, x, half) {
            return false;
        }
        let crowded = nets.iter().any(|&other| {
            other != net
                && self.station(self.net(other).at(end)).item == item
                && abs(self.net(other).x_at(end) - x) < LANE + half + self.net(other).reach()
        });
        if crowded {
            return false;
        }
        self.net_mut(net).set_x_at(end, x);
        true
    }

    /// Slide a card along its band by a kink, so its centred port stands at an x: the card and
    /// every line end on it, kept a lane clear of everything else on the band and half a lane
    /// clear of the lines that pass it. It stays inside the placed block, whose x starts at zero
    /// and whose right edge is the furthest right any box on it stands.
    /// A card laid out as the region round it stays.
    fn slide_card(&mut self, nets: &[NetId], net: NetId, end: End, x: f64) -> bool {
        let item = self.station(self.net(net).at(end)).item.expect("a card");
        let one = *self.scene.item(item);
        let shift = x - self.net(net).x_at(end);
        if one.inset.is_some() || abs(shift) > KINK + STRAIGHT {
            return false;
        }
        let moved = Rect {
            x: one.bx.x + shift,
            ..one.bx
        };
        // A lane apart from every other box on the band, and half a lane from a line passing it.
        let apart = |low: f64, high: f64, gap: f64| {
            high + gap <= moved.x || low >= moved.x + moved.width + gap
        };
        // Two doors, slivers a lane apart, stand a lane apart from middle to middle.
        let sliver = |bx: &Rect| bx.width <= 2.0 * STRAIGHT + 1.0;
        // The block's extent: from zero, or the furthest left any box stands, to the furthest
        // right one does.
        let right = (self.scene.items.iter())
            .map(|item| item.bx.x + item.bx.width)
            .fold(one.bx.x + one.bx.width, f64::max);
        let clear = moved.x >= one.bx.x.min(0.0)
            && moved.x + moved.width <= right
            && (self.scene.cards.values().chain(self.scene.labels.values()))
                .filter(|&&other| other != item && self.scene.item(other).band == one.band)
                .map(|&other| self.scene.item(other).bx)
                .all(|bx| {
                    let gap = if sliver(&bx) && sliver(&one.bx) {
                        LANE - bx.width
                    } else {
                        LANE
                    };
                    apart(bx.x, bx.x + bx.width, gap)
                })
            && self.lanes_by_band(nets)[one.band]
                .iter()
                .all(|&lane| apart(lane, lane, LANE / 2.0));
        if !clear {
            return false;
        }
        self.scene.item_mut(item).bx = moved;
        for &other in nets {
            for side in [End::Top, End::Bottom] {
                if self.station(self.net(other).at(side)).item == Some(item) {
                    let at = self.net(other).x_at(side);
                    self.net_mut(other).set_x_at(side, at + shift);
                }
            }
        }
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
            // A card slides too (`slide_card`).
            if one.kind != Kind::Lane {
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
    pub(super) fn move_kept(
        &mut self,
        chains: &[ChainId],
        nets: &[NetId],
        moved: &[Reach],
        x: f64,
        kept: Kept<'_>,
    ) -> bool {
        let before = kept(self, nets);
        let better = |track: &Router<'_>| kept(track, nets) <= before;
        let keeping = Keeping {
            guard: kinked,
            piece: false,
            better: Some(&better),
        };
        self.move_stretch(chains, nets, moved, x, keeping)
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
                        || (pass == 0 && self.turns_back(&routes[route], index)))
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lanes::chains::Station;
    use crate::lanes::channels::Net;
    use crate::lanes::scene::{Band, Placement};

    /// A block of two bands: a card at `x` on the first, and a line from its bottom at its middle
    /// down to a lane on the second, with a wider card on the second that sets the block's width.
    fn block(x: f64) -> Placement {
        let mut scene = Placement::default();
        for (top, bottom) in [(0.0, 40.0), (100.0, 140.0)] {
            scene.bands.push(Band {
                top,
                bottom,
                new_top: top,
                first_track: 0.0,
            });
        }
        let card = scene.add(Item::new(
            Rect {
                x,
                y: 0.0,
                width: 100.0,
                height: 40.0,
            },
            0,
        ));
        scene.cards.insert("card".to_owned(), card);
        let wide = scene.add(Item::new(
            Rect {
                x: 0.0,
                y: 100.0,
                width: 300.0,
                height: 40.0,
            },
            1,
        ));
        scene.cards.insert("wide".to_owned(), wide);
        scene
    }

    /// Whether the card slides 16 to the right to stand its port over the line's lane.
    fn slides(x: f64) -> bool {
        let mut scene = block(x);
        let card = scene.cards["card"];
        let mut track = Router::new(&mut scene);
        track.bus = true;
        let middle = x + 50.0;
        let top = track.add(Station::new(Kind::Card, 0, Some(card), middle));
        let bottom = track.add(Station::new(Kind::Lane, 1, None, middle + 16.0));
        track.nets.push(Net {
            edge: "line".into(),
            order: 0.0,
            channel: 0,
            kind: "call".into(),
            top,
            bottom,
            top_x: middle,
            bottom_x: middle + 16.0,
            track: 0,
            trunk: None,
            wall: None,
        });
        track.slide_card(&[NetId(0)], NetId(0), End::Top, middle + 16.0)
    }

    #[test]
    fn a_card_slides_only_while_it_stays_inside_its_block() {
        assert!(slides(100.0), "a card with room to its right slides");
        assert!(!slides(200.0), "a card at the block's right edge stays");
    }
}
