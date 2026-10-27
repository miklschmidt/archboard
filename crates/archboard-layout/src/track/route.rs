//! The track router (TASK-349): every relationship drawn on tracks it owns.
//!
//! A block's placement put cards, label boxes and frame title rows on ranks,
//! and said where each relationship passes the ranks between its ends. Here
//! the ranks become bands and the space between two bands a channel. A
//! relationship is a chain of stations (`chains.rs`); between two stations it
//! leaves the upper one straight down, runs across on a track of the channel,
//! and enters the lower one straight down (`channels.rs`). Each channel is
//! made as tall as its tracks need, so lanes keep one spacing and never
//! squeeze, and every label sits on its own line by construction.

use std::rc::Rc;

use crate::ecma::{abs, max, min, number_of};
use crate::geometry::{Point, Side};
use crate::placed::PlacedEdge;
use crate::track::chains::{ChainId, Kind, LANE, Station, StationId, Track};
use crate::track::channels::{End, Net, NetId};
use crate::track::containers::{Containers, Edges};
use crate::track::jogs::nothing;
use crate::track::scene::{Map, Placement, Set, centre_x};
use crate::track::spacing::Rim;

/// Space kept around the drawing.
pub(crate) const PAGE_MARGIN: f64 = 24.0;
/// How far outside the scene a line to a wall aims while its ports and tracks are settled.
const WALL_REACH: f64 = 4.0 * LANE;
/// How far apart two ends may be and still be drawn as one straight drop.
const STRAIGHT: f64 = 0.5;

/// One line a scene is routed for: a relationship, or the part of one a block draws.
#[derive(Clone, Debug)]
pub(crate) struct SceneLine<'a> {
    pub id: String,
    pub order: f64,
    /// What must match for two lines to share a trunk: kind and standing.
    pub kind: Rc<str>,
    /// Its placed ends, label and polyline.
    pub placed: &'a PlacedEdge,
    /// The wall it runs to from its source, when it leaves its block sideways.
    pub wall: Option<Side>,
    /// The wall it comes from, when it enters its block sideways.
    pub enters: Option<Side>,
    /// The wall it runs to through its label, when it leaves its block sideways carrying its label there.
    pub leaves: Option<Side>,
}

/// A relationship's nets, top to bottom, and whether it runs upward.
struct Routed {
    nets: Vec<NetId>,
    upward: bool,
}

/// The kind two lines must share to share a trunk, read off a relationship:
/// its kind, its comparison standing, its emphasis and whether it carries
/// traffic.
pub(crate) fn trunk_kind(edge: &crate::graph::Edge) -> String {
    [
        edge.option("archboard.relationship.kind").unwrap_or(""),
        edge.option("archboard.relationship.standing")
            .unwrap_or("unchanged"),
        edge.option("archboard.relationship.emphasis")
            .unwrap_or("normal"),
        edge.option("archboard.relationship.traffic")
            .unwrap_or("off"),
    ]
    .join("|")
}

/// The order a placed relationship carries: `Number(options["archboard.order"] ?? 0)`.
pub(crate) fn order_of(edge: &PlacedEdge) -> f64 {
    number_of(edge.option("archboard.order").unwrap_or("0"))
}

impl Track<'_> {
    /// Where a line to or from a wall aims while ports and tracks are settled.
    fn wall_x(&self, side: Side) -> f64 {
        let boxes = self
            .scene
            .cards
            .values()
            .chain(self.scene.labels.values())
            .map(|&item| self.scene.item(item).bx);
        if side == Side::Left {
            min(boxes.map(|bx| bx.x)) - WALL_REACH
        } else {
            max(boxes.map(|bx| bx.x + bx.width)) + WALL_REACH
        }
    }

    /// Keep a new net.
    fn add_net(&mut self, net: Net) -> NetId {
        self.nets.push(net);
        NetId(self.nets.len() - 1)
    }

    /// A line to a wall: from its source down into the channel under it, and
    /// along that channel's track to the wall.
    fn wall_net(&mut self, line: &SceneLine<'_>) -> NetId {
        let item = self.scene.endpoint(&line.placed.source);
        let x = self.wall_x(line.wall.expect("a wall"));
        let card = *self.scene.item(item);
        let top_x = centre_x(&card);
        let top = self.add(Station::new(Kind::Card, card.band, Some(item), top_x));
        let bottom = self.add(Station::new(Kind::Lane, card.band + 1, None, x));
        self.add_net(Net {
            edge: line.id.as_str().into(),
            order: line.order,
            channel: card.band,
            kind: Rc::clone(&line.kind),
            top,
            bottom,
            top_x,
            bottom_x: x,
            track: 0,
            trunk: None,
            wall: Some(End::Bottom),
        })
    }

    /// Turn a line that enters or leaves its block by a wall onto that wall.
    fn turn_to_wall(&mut self, line: &SceneLine<'_>, nets: &[NetId]) {
        if let Some(enters) = line.enters {
            let x = self.wall_x(enters);
            let first = self.net_mut(nets[0]);
            first.wall = Some(End::Top);
            first.top_x = x;
        }
        if let Some(leaves) = line.leaves {
            let x = self.wall_x(leaves);
            let last = self.net_mut(*nets.last().expect("a net"));
            last.wall = Some(End::Bottom);
            last.bottom_x = x;
        }
    }

    /// A chain's nets: one for each pair of stations on neighbouring bands, top to bottom.
    fn nets_of(&mut self, line: &SceneLine<'_>, chain: ChainId) -> Vec<NetId> {
        let kind: Rc<str> = chain_kind(line, self.chain(chain).upward).into();
        let stations = self.chain(chain).stations.clone();
        let edge: Rc<str> = line.id.as_str().into();
        (0..stations.len() - 1)
            .map(|index| {
                let (top, bottom) = (stations[index], stations[index + 1]);
                let net = Net {
                    edge: Rc::clone(&edge),
                    order: line.order,
                    channel: self.station(top).band,
                    kind: Rc::clone(&kind),
                    top,
                    bottom,
                    top_x: self.x(top),
                    bottom_x: self.x(bottom),
                    track: 0,
                    trunk: None,
                    wall: None,
                };
                self.add_net(net)
            })
            .collect()
    }

    /// Whether a net's ends stand apart by a sliver: straight to within half a unit, but not exactly.
    fn sliver(&self, net: NetId) -> bool {
        let net = self.net(net);
        abs(net.top_x - net.bottom_x) <= STRAIGHT && net.top_x != net.bottom_x
    }

    /// Make every drop that is straight to within half a unit exactly straight.
    fn settle_straights(&mut self, nets: &[NetId]) {
        for (index, &net) in nets.iter().enumerate() {
            if !self.sliver(net) {
                continue;
            }
            let bottom = self.net(net).bottom;
            if self.station(bottom).kind == Kind::Label {
                self.settle_above(nets, index);
                continue;
            }
            let top_x = self.net(net).top_x;
            if self.station(bottom).kind == Kind::Lane {
                self.set_x(bottom, top_x);
                if let Some(&next) = nets.get(index + 1) {
                    self.net_mut(next).top_x = top_x;
                }
            }
            self.net_mut(net).bottom_x = top_x;
        }
    }

    /// Stand a net's upper end over its lower one, and each sliver above it
    /// over the one below, for as far as lanes carry the move up.
    fn settle_above(&mut self, nets: &[NetId], index: usize) {
        let x = self.net(nets[index]).bottom_x;
        for at in (0..=index).rev() {
            let net = nets[at];
            if at < index && !self.sliver(net) {
                return;
            }
            self.net_mut(net).top_x = x;
            let top = self.net(net).top;
            if self.station(top).kind != Kind::Lane {
                return;
            }
            self.set_x(top, x);
            if at == 0 {
                return;
            }
            self.net_mut(nets[at - 1]).bottom_x = x;
        }
    }

    /// Where a net leaves its upper station, after spacing.
    fn leaves_at(&self, net: &Net, left: f64) -> f64 {
        let top = self.station(net.top);
        let band = self.scene.bands[top.band];
        match top.item {
            None => band.new_top + band.bottom - band.top,
            Some(item) => {
                let bx = self.scene.moved_id(item, left);
                bx.y + bx.height
            }
        }
    }

    /// Where a net enters its lower station, after spacing.
    fn enters_at(&self, net: &Net, left: f64) -> f64 {
        let bottom = self.station(net.bottom);
        match bottom.item {
            None => self.scene.bands[bottom.band].new_top,
            Some(item) => self.scene.moved_id(item, left).y,
        }
    }

    /// The points of one relationship, from its upper end to its lower end.
    fn points_of(&self, nets: &[NetId], left: f64) -> Vec<Point> {
        let mut points = Vec::new();
        for &id in nets {
            let net = self.net(id);
            let upper = self.scene.bands[self.station(net.top).band];
            let from = Point {
                x: net.top_x + left,
                y: self.leaves_at(net, left),
            };
            let track = upper.new_top
                + (upper.bottom - upper.top)
                + upper.first_track
                + net.track as f64 * LANE;
            if net.wall == Some(End::Bottom) {
                points.extend([
                    from,
                    Point {
                        x: from.x,
                        y: track,
                    },
                    Point {
                        x: net.bottom_x + left,
                        y: track,
                    },
                ]);
                continue;
            }
            let to = Point {
                x: net.bottom_x + left,
                y: self.enters_at(net, left),
            };
            if net.wall == Some(End::Top) {
                points.extend([
                    Point {
                        x: from.x,
                        y: track,
                    },
                    Point { x: to.x, y: track },
                    to,
                ]);
            } else if abs(from.x - to.x) <= STRAIGHT {
                points.extend([from, to]);
            } else if let Some(x) = net.detour_x() {
                points.extend([
                    from,
                    Point {
                        x: from.x,
                        y: track,
                    },
                    Point {
                        x: x + left,
                        y: track,
                    },
                    Point {
                        x: x + left,
                        y: track + LANE,
                    },
                    Point {
                        x: to.x,
                        y: track + LANE,
                    },
                    to,
                ]);
            } else {
                points.extend([
                    from,
                    Point {
                        x: from.x,
                        y: track,
                    },
                    Point { x: to.x, y: track },
                    to,
                ]);
            }
        }
        points
    }

    /// Move every net's ends that stand on a lane to where the lane now stands.
    fn follow_lanes(&mut self, nets: &[NetId]) {
        for &net in nets {
            let (top, bottom) = (self.net(net).top, self.net(net).bottom);
            if self.station(top).kind == Kind::Lane {
                self.net_mut(net).top_x = self.x(top);
            }
            if self.station(bottom).kind == Kind::Lane {
                self.net_mut(net).bottom_x = self.x(bottom);
            }
        }
    }

    /// The port each lane beside a card wants: where the net between them meets the card.
    fn ports_of(&self, nets: &[NetId]) -> Map<StationId, f64> {
        let mut ports = Map::default();
        for &id in nets {
            let net = self.net(id);
            let (top, bottom) = (self.station(net.top).kind, self.station(net.bottom).kind);
            if top == Kind::Card && bottom == Kind::Lane {
                ports.insert(net.bottom, net.top_x);
            }
            if bottom == Kind::Card && top == Kind::Lane {
                ports.insert(net.top, net.bottom_x);
            }
        }
        ports
    }

    /// Where a lane feeding a trunk would stand to meet its line's column there.
    fn trunk_feed(&self, own: &[NetId], index: usize) -> Option<(StationId, f64)> {
        let net = self.net(own[index]);
        let trunk = &self.trunks[net.trunk?.0];
        let (lane, x, below) = if trunk.side == End::Bottom {
            (
                net.top,
                index.checked_sub(1).map(|at| self.net(own[at]).top_x),
                true,
            )
        } else {
            (
                net.bottom,
                own.get(index + 1).map(|&at| self.net(at).bottom_x),
                false,
            )
        };
        if self.station(lane).kind != Kind::Lane {
            return None;
        }
        let x = x?;
        (abs(x - self.x(lane)) >= STRAIGHT && self.covers(own[index], below, x))
            .then_some((lane, x))
    }

    /// Whether a trunk's track already spans an x: between its shared port and
    /// its other members' far ends.
    fn covers(&self, id: NetId, below: bool, x: f64) -> bool {
        let net = self.net(id);
        let others = self.trunks[net.trunk.expect("a trunk").0]
            .nets
            .iter()
            .filter(|&&other| other != id)
            .map(|&other| self.net(other));
        let pins: Vec<f64> = if below {
            std::iter::once(net.bottom_x)
                .chain(others.map(|other| other.top_x))
                .collect()
        } else {
            std::iter::once(net.top_x)
                .chain(others.map(|other| other.bottom_x))
                .collect()
        };
        x >= min(pins.iter().copied()) && x <= max(pins.iter().copied())
    }

    /// Whether a lane may stand at an x: a lane clear of every card, label,
    /// title row and other lane on its band.
    fn lane_free(&self, nets: &[NetId], lane: StationId, x: f64) -> bool {
        let band = self.station(lane).band;
        let scene = &*self.scene;
        let items = scene
            .cards
            .values()
            .chain(scene.labels.values())
            .chain(scene.titles.values())
            .map(|&item| scene.item(item))
            .filter(|item| item.band == band)
            .map(|item| (item.bx.x - LANE, item.bx.x + item.bx.width + LANE));
        let lanes = nets
            .iter()
            .flat_map(|&net| [self.net(net).top, self.net(net).bottom])
            .filter(|&station| {
                self.station(station).kind == Kind::Lane
                    && self.station(station).band == band
                    && station != lane
            })
            .map(|station| (self.x(station) - LANE, self.x(station) + LANE));
        items
            .chain(lanes)
            .collect::<Vec<_>>()
            .into_iter()
            .all(|(low, high)| x <= low || x >= high)
    }

    /// Move each lane that feeds a trunk onto the column its line comes from,
    /// when the trunk's track covers that column anyway and it is free.
    fn pull_into_trunks(&mut self, routes: &[Vec<NetId>], nets: &[NetId]) -> bool {
        let mut moved = false;
        for own in routes {
            for index in 0..own.len() {
                // One at a time, so a lane moved first is where the next one must keep clear of.
                let Some((lane, x)) = self.trunk_feed(own, index) else {
                    continue;
                };
                if !self.lane_free(nets, lane, x) {
                    continue;
                }
                self.set_x(lane, x);
                moved = true;
            }
        }
        moved
    }

    /// Pull lanes onto the ports and trunks their lines meet, and settle the
    /// labels and ports that follow them.
    fn pull_onto_ports(&mut self, chains: &[ChainId], routes: &[Vec<NetId>], nets: &[NetId]) {
        let ports = self.ports_of(nets);
        if self.pull_to_ports(chains, &ports) {
            self.follow_lanes(nets);
            self.settle_labels(nets);
            if self.close_lane_steps(chains) {
                self.follow_lanes(nets);
            }
            self.assign_ports(nets);
        }
        if self.pull_into_trunks(routes, nets) {
            self.follow_lanes(nets);
        }
    }

    /// Part the lines that read as one, then close the jogs that frees, and
    /// open a step still too short for its bends.
    fn part_and_close(&mut self, chains: &[ChainId], routes: &[Vec<NetId>]) {
        let nets: Vec<NetId> = routes.concat();
        self.ports_onto_lanes(&nets);
        self.part_collinear(chains, routes);
        // Closing a jog never stands two lines parted just now back on one column.
        self.close_jogs(chains, routes, &|track: &Track<'_>, nets: &[NetId]| {
            track.collinear_pairs(nets)
        });
        self.open_notches(chains, routes);
    }
}

/// What a line's nets must share with another's to share a trunk: its kind,
/// and its direction, since a trunk carries its lines one way.
fn chain_kind(line: &SceneLine<'_>, upward: bool) -> String {
    if upward {
        format!("{}|upward", line.kind)
    } else {
        line.kind.to_string()
    }
}

/// Each line's nets: an inner line's on its chain, in the order given, then a
/// wall line's one net from or to its wall.
fn routed_of(
    track: &mut Track<'_>,
    lines: &[SceneLine<'_>],
    inner: &[&SceneLine<'_>],
    chains: &Map<String, ChainId>,
) -> Map<String, Routed> {
    let mut routed: Map<String, Routed> = Map::default();
    for line in inner {
        let chain = chains[&line.id];
        let nets = track.nets_of(line, chain);
        routed.insert(
            line.id.clone(),
            Routed {
                nets,
                upward: track.chain(chain).upward,
            },
        );
    }
    for line in lines.iter().filter(|line| line.wall.is_some()) {
        let net = track.wall_net(line);
        routed.insert(
            line.id.clone(),
            Routed {
                nets: vec![net],
                upward: false,
            },
        );
    }
    routed
}

/// Route lines through a banded scene, each on tracks of its own, and space
/// the bands for the tracks each channel holds. `margin` is how far every x
/// moves, `top` where the first band starts, and `rim` the room the block
/// keeps at its edge rows where no line turns. Answers each line's points,
/// from its source to its target.
pub(crate) fn route_scene(
    scene: &mut Placement,
    lines: &[SceneLine<'_>],
    margin: f64,
    top: f64,
    rim: Option<Rim>,
) -> Map<String, Vec<Point>> {
    let mut track = Track::new(scene);
    let inner: Vec<&SceneLine<'_>> = lines.iter().filter(|line| line.wall.is_none()).collect();
    let chains: Map<String, ChainId> = inner
        .iter()
        .map(|line| (line.id.clone(), track.chain_of(line.placed)))
        .collect();
    track.hold_to_points(&inner, &chains);
    // A line that enters or leaves its block by a wall comes from or goes to that wall, not its stub.
    let movable: Vec<ChainId> = inner
        .iter()
        .filter(|line| line.enters.is_none() && line.leaves.is_none())
        .map(|line| chains[&line.id])
        .collect();
    let all: Vec<ChainId> = chains.values().copied().collect();
    track.fit_title_rows(&all);
    track.clear_headings(&all);
    track.straighten_lanes(&all);
    let kinds: Vec<(ChainId, Rc<str>)> = inner
        .iter()
        .map(|line| {
            let chain = chains[&line.id];
            (chain, chain_kind(line, track.chain(chain).upward).into())
        })
        .collect();
    track.relay_laps(&kinds, &movable);
    track.straighten_through_labels(&all);
    let routed = routed_of(&mut track, lines, &inner, &chains);
    let nets: Vec<NetId> = routed
        .values()
        .flat_map(|route| route.nets.iter().copied())
        .collect();
    let routes: Vec<Vec<NetId>> = routed.values().map(|route| route.nets.clone()).collect();
    track.bundle_trunks(&nets);
    track.assign_ports(&nets);
    track.slide_labels(&nets);
    if track.straighten_into_containers(&all) {
        track.follow_lanes(&nets);
    }
    if track.unstrand_lanes(&all) {
        track.follow_lanes(&nets);
    }
    track.assign_ports(&nets);
    track.pull_onto_ports(&all, &routes, &nets);
    track.close_jogs(&all, &routes, &nothing);
    for route in &routes {
        track.settle_straights(route);
    }
    for line in &inner {
        let nets = routed[&line.id].nets.clone();
        track.turn_to_wall(line, &nets);
    }
    track.part_and_close(&all, &routes);
    let edges: Edges<'_> = lines
        .iter()
        .map(|line| (line.id.as_str(), line.placed))
        .collect();
    let rising: Set<NetId> = routed
        .values()
        .filter(|route| route.upward)
        .map(|route| route.nets[0])
        .collect();
    let (closings, facing) = {
        let containers = Containers::new(track.scene, &edges);
        (containers.closings(), containers.facing())
    };
    track.space_bands(&nets, &closings, &facing, &rising, top, rim);
    routed
        .iter()
        .map(|(id, route)| {
            let mut points = track.points_of(&route.nets, margin);
            if route.upward {
                points.reverse();
            }
            (id.clone(), points)
        })
        .collect()
}
