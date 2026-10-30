//! The cards outside a frame, stood round its walls. Each takes the wall that
//! is nearest what it joins, at the place along that wall that faces it.

use rustc_hash::FxHashMap;

use crate::{
    blocks::assembly::PlacedCard,
    geometry::{Point, Rect},
    graph::Node,
};

use super::Set;

/// Room between a frame's wall and the cards round it, before routing.
const RING_GAP: f64 = 112.0;
/// Room between two cards side by side.
const STEP: f64 = 40.0;
/// The room outside the outermost cards, where a line may run round them.
const PAGE_ROOM: f64 = 64.0;
/// What a line against the reading direction costs a wall.
const AGAINST: f64 = 200.0;
/// The page shape a row of doors can grow to, width over height.
const PAGE_SHAPE: f64 = 1.65;

/// A wall of the frame.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Wall {
    Top,
    Bottom,
    Left,
    Right,
}

impl Wall {
    fn level(self) -> bool {
        matches!(self, Wall::Top | Wall::Bottom)
    }
}

const WALLS: [Wall; 4] = [Wall::Top, Wall::Bottom, Wall::Left, Wall::Right];

/// A card outside the frame, with the wall it takes and where along it.
struct Door<'a> {
    node: &'a Node,
    wall: Wall,
    /// What each wall costs it, in the order of `WALLS`.
    costs: [f64; 4],
}

impl Door<'_> {
    /// How much of a wall the door takes.
    fn span(&self, wall: Wall) -> f64 {
        if wall.level() {
            self.node.w()
        } else {
            self.node.h()
        }
    }

    /// How far the door stands out from its wall.
    fn depth(&self) -> f64 {
        if self.wall.level() {
            self.node.h()
        } else {
            self.node.w()
        }
    }
}

/// What a ring reads.
pub(super) struct Ring<'a> {
    pub graph: &'a Node,
    pub frame: &'a str,
    pub header: Point,
    pub set: &'a Set,
    pub ids: Vec<&'a str>,
    pub extra: f64,
    pub sides: bool,
}

/// The page a ring answers: where the frame stands, and every door.
pub(super) struct Page {
    pub frame: Point,
    pub width: f64,
    pub height: f64,
    pub doors: Vec<PlacedCard>,
}

impl Ring<'_> {
    /// The centre of everything inside the frame that a line can reach.
    fn inside(&self) -> FxHashMap<&str, Point> {
        let centre = |at: &Rect| Point {
            x: at.x + at.width / 2.0,
            y: at.y + at.height / 2.0,
        };
        let mut inside: FxHashMap<&str, Point> = self
            .ids
            .iter()
            .copied()
            .zip(self.set.parts.iter().map(centre))
            .collect();
        inside.insert(
            self.frame,
            Point {
                x: self.header.x / 2.0,
                y: self.header.y / 2.0,
            },
        );
        inside
    }

    /// Each line of a door to something inside the frame: where that stands,
    /// and whether the line runs from the door into the frame.
    fn partners(&self, id: &str, inside: &FxHashMap<&str, Point>) -> Vec<(Point, bool)> {
        self.graph
            .edges
            .iter()
            .flatten()
            .filter_map(|edge| {
                let (partner, enters) = if edge.source() == id {
                    (edge.target(), true)
                } else if edge.target() == id {
                    (edge.source(), false)
                } else {
                    return None;
                };
                inside.get(partner).map(|&at| (at, enters))
            })
            .collect()
    }

    /// What each wall costs a door: the way to what it joins, and a line against the reading.
    fn door<'n>(&self, node: &'n Node, inside: &FxHashMap<&str, Point>) -> Door<'n> {
        let size = self.set.size;
        let against = |wrong: bool| if wrong { AGAINST } else { 0.0 };
        let mut costs = [0.0; 4];
        for (at, enters) in self.partners(&node.id, inside) {
            costs[0] += at.y + against(!enters);
            costs[1] += size.y - at.y + against(enters);
            costs[2] += at.x + against(!enters);
            costs[3] += size.x - at.x + against(enters);
        }
        let side = if self.sides {
            node.w() + RING_GAP
        } else {
            f64::INFINITY
        };
        Door {
            node,
            wall: Wall::Top,
            costs: [costs[0], costs[1], costs[2] + side, costs[3] + side],
        }
    }

    /// The most a wall holds.
    fn room(&self, wall: Wall) -> f64 {
        let size = self.set.size;
        if wall.level() {
            size.x.max(size.y * PAGE_SHAPE)
        } else {
            size.y
        }
    }

    /// Give each door its wall, the most decided first, while the wall has room.
    fn assign(&self, doors: &mut [Door<'_>]) {
        let regret = |door: &Door<'_>| {
            let mut costs = door.costs;
            costs.sort_by(f64::total_cmp);
            costs[1] - costs[0]
        };
        let mut order: Vec<usize> = (0..doors.len()).collect();
        order.sort_by(|&a, &b| {
            regret(&doors[b])
                .total_cmp(&regret(&doors[a]))
                .then(a.cmp(&b))
        });
        let mut used = [0.0; 4];
        for at in order {
            let door = &mut doors[at];
            let mut ranked = [0, 1, 2, 3];
            ranked.sort_by(|&a, &b| door.costs[a].total_cmp(&door.costs[b]).then(a.cmp(&b)));
            let fits =
                |&wall: &usize| used[wall] + door.span(WALLS[wall]) <= self.room(WALLS[wall]);
            let wall = ranked.iter().copied().find(fits).unwrap_or(ranked[0]);
            used[wall] += door.span(WALLS[wall]) + STEP;
            door.wall = WALLS[wall];
        }
    }

    /// Where a door's lines face along its wall.
    fn facing(&self, door: &Door<'_>, inside: &FxHashMap<&str, Point>) -> f64 {
        let partners = self.partners(&door.node.id, inside);
        let sum: f64 = partners
            .iter()
            .map(|(at, _)| if door.wall.level() { at.x } else { at.y })
            .sum();
        sum / f64::max(partners.len() as f64, 1.0)
    }

    /// The depth a wall's doors add to the page.
    fn band(&self, doors: &[Door<'_>], wall: Wall) -> f64 {
        let held = doors.iter().filter(|door| door.wall == wall);
        held.map(Door::depth)
            .fold(None, |most: Option<f64>, depth| {
                Some(most.map_or(depth, |one| one.max(depth)))
            })
            .map_or(0.0, |depth| depth + RING_GAP + self.extra)
    }

    /// Each door on one wall, along it: as near what it faces as its neighbours let it.
    fn line_up(
        &self,
        doors: &[Door<'_>],
        wall: Wall,
        inside: &FxHashMap<&str, Point>,
    ) -> Vec<(usize, f64)> {
        let mut held: Vec<(usize, f64)> = doors
            .iter()
            .enumerate()
            .filter(|(_, door)| door.wall == wall)
            .map(|(at, door)| (at, self.facing(door, inside)))
            .collect();
        held.sort_by(|a, b| a.1.total_cmp(&b.1).then(a.0.cmp(&b.0)));
        let mut free = f64::NEG_INFINITY;
        held.iter()
            .map(|&(at, facing)| {
                let span = doors[at].span(wall);
                let place = f64::max(facing - span / 2.0, free);
                free = place + span + STEP;
                (at, place)
            })
            .collect()
    }

    /// Stand every door round the frame.
    pub(super) fn stand(&self, nodes: &[&Node]) -> Page {
        let inside = self.inside();
        let mut doors: Vec<Door<'_>> = nodes.iter().map(|node| self.door(node, &inside)).collect();
        self.assign(&mut doors);
        let gap = RING_GAP + self.extra;
        let size = self.set.size;
        let (left, top) = (self.band(&doors, Wall::Left), self.band(&doors, Wall::Top));
        let bottom = self.band(&doors, Wall::Bottom);
        let origin = Point { x: left, y: top };
        let mut placed: Vec<PlacedCard> = Vec::new();
        for wall in WALLS {
            for (at, along) in self.line_up(&doors, wall, &inside) {
                let node = doors[at].node;
                let (x, y) = match wall {
                    Wall::Top => (origin.x + along, origin.y - gap - node.h()),
                    Wall::Bottom => (origin.x + along, origin.y + size.y + gap),
                    Wall::Left => (origin.x - gap - node.w(), origin.y + along),
                    Wall::Right => (origin.x + size.x + gap, origin.y + along),
                };
                placed.push(PlacedCard {
                    id: node.id.clone(),
                    bx: Rect {
                        x,
                        y,
                        width: node.w(),
                        height: node.h(),
                    },
                    depth: 0,
                    header: None,
                });
            }
        }
        let low = placed.iter().map(|card| card.bx.x).fold(origin.x, f64::min);
        let high = placed
            .iter()
            .map(|card| card.bx.x + card.bx.width)
            .fold(origin.x + size.x, f64::max);
        let lowest = placed.iter().map(|card| card.bx.y).fold(origin.y, f64::min);
        for card in &mut placed {
            card.bx.x += PAGE_ROOM - low;
            card.bx.y += PAGE_ROOM - lowest;
        }
        Page {
            frame: Point {
                x: origin.x + PAGE_ROOM - low,
                y: origin.y + PAGE_ROOM - lowest,
            },
            width: high - low + 2.0 * PAGE_ROOM,
            height: top + size.y + bottom + 2.0 * PAGE_ROOM,
            doors: placed,
        }
    }
}
