//! A block of blocks' own edges: its header in the top-left corner, its own
//! ports over or under what their lines reach and on its side walls, its
//! trunks routed between them, and the unused strips under its header and
//! over its bottom ports closed.

use crate::ecma::{abs, js_max, js_min, sort_by};
use crate::geometry::{Point, Rect, Side};
use crate::track::chains::LANE;
use crate::track::channels::{spread_along, spread_ports};
use crate::track::scene::Set;

use super::super::laid::SAME;
use super::super::leaves::{PORT, rim_of};
use super::open_edge::{Span, open_stretch};
use super::pack::{HEAD_GAP, PackLayout};
use super::trunks::{TRUNK_CLEARANCE, TrunkRouter};

impl PackLayout<'_> {
    /// The x of a pin: its port's middle on its block.
    fn pin_x(&self, end: &str) -> f64 {
        let pin = &self.tree.pins[end];
        let inner = &self.tree.get(pin.block).id;
        let at = self.laid[inner.as_str()].boxes[pin.port.as_str()];
        self.boxes[inner.as_str()].x + at.x + at.width / 2.0
    }

    /// The block's own ports on one edge.
    fn own_ports(&self, side: Side) -> Vec<String> {
        self.block
            .ports
            .iter()
            .filter(|&(port, &at)| at == side && !self.block.header_entry(port))
            .map(|(port, _)| port.clone())
            .collect()
    }

    /// Place the block's own ports on one edge, at a height: each over or
    /// under the pins its lines reach, clear of the header, a lane apart.
    fn place_ports(&mut self, side: Side, width: f64, y: f64) {
        let ports = self.own_ports(side);
        let header = self.boxes.get(&self.header_id()).copied();
        let low = self.insets.side
            + match header {
                Some(header) if side == Side::Top => {
                    header.x + header.width + TRUNK_CLEARANCE - self.insets.side
                }
                _ => 0.0,
            };
        let high = js_max(
            width - self.insets.side,
            low + LANE * (ports.len() + 1) as f64,
        );
        let mut wanted: Vec<(String, f64)> = ports
            .into_iter()
            .map(|port| {
                let x = self.wanted_x(&port, side, y, (low, high));
                (port, x)
            })
            .collect();
        sort_by(&mut wanted, |one, other| one.1 - other.1);
        let xs = spread_ports(
            &Rect {
                x: low,
                y: 0.0,
                width: high - low,
                height: 0.0,
            },
            &wanted.iter().map(|(_, x)| *x).collect::<Vec<_>>(),
        );
        for ((port, _), x) in wanted.into_iter().zip(xs) {
            let x = self.settled.get(&port).copied().unwrap_or(x);
            self.boxes.insert(
                port,
                Rect {
                    x: x - PORT / 2.0,
                    y,
                    width: PORT,
                    height: PORT,
                },
            );
        }
    }

    /// Where one of the block's own ports wants to stand: over or under the
    /// pins its lines reach, on a stretch of its edge that no other packed
    /// block stands against, a lane clear of their sides, since a trunk
    /// reaches a port under a block only round it. The port is on `side`, at
    /// height `y`, and may stand on `edge`.
    pub(super) fn wanted_x(&self, port: &str, side: Side, y: f64, edge: Span) -> f64 {
        let pins: Vec<&String> = self
            .block
            .lines
            .values()
            .filter_map(|line| {
                if line.tail == port {
                    Some(&line.head)
                } else if line.head == port {
                    Some(&line.tail)
                } else {
                    None
                }
            })
            .filter(|end| self.tree.pins.contains_key(end.as_str()))
            .collect();
        let x = pins.iter().fold(0.0, |sum, end| sum + self.pin_x(end))
            / js_max(1.0, pins.len() as f64);
        let reached: Set<&str> = pins
            .iter()
            .map(|end| {
                self.tree
                    .get(self.tree.pins[end.as_str()].block)
                    .id
                    .as_str()
            })
            .collect();
        let against: Vec<Rect> = self
            .block
            .items
            .iter()
            .filter(|item| !reached.contains(item.as_str()))
            .map(|item| self.boxes[item.as_str()])
            .filter(|at| {
                let apart = if side == Side::Top {
                    at.y - y
                } else {
                    y - at.y - at.height
                };
                apart < HEAD_GAP + self.gap
            })
            .collect();
        let (low, high) = open_stretch(edge, &against, TRUNK_CLEARANCE + LANE, x);
        js_min(high, js_max(low, x))
    }

    /// Place the block's own ports on its side walls, within the block: each
    /// level with the pins its lines reach (`level_of`), and a lane from the
    /// others on its wall, between where the packed items start and end.
    /// Ports of two kinds that reach one block want one place: on one point
    /// they drew the two lines as one, and the later of two pins on one point
    /// of a block found no route, so on Codex realtime voice (Blocks) three
    /// trunks out of Workhorses took a dogleg through Chat conversations and
    /// its Workhorse list (TASK-536).
    fn place_walls(&mut self, width: f64, top: f64, bottom: f64) {
        for side in [Side::Left, Side::Right] {
            let mut wanted: Vec<(String, f64)> = self
                .block
                .ports
                .iter()
                .filter(|&(port, &at)| at == side && !self.block.header_entry(port))
                .map(|(port, _)| (port.clone(), self.level_of(port, side)))
                .collect();
            sort_by(&mut wanted, |one, other| one.1 - other.1);
            let levels: Vec<f64> = wanted.iter().map(|&(_, y)| y).collect();
            let ys = spread_along((top, bottom), &levels);
            let x = if side == Side::Left { 0.0 } else { width };
            for ((port, _), y) in wanted.into_iter().zip(ys) {
                self.boxes.insert(
                    port,
                    Rect {
                        x: x - PORT / 2.0,
                        y: y - PORT / 2.0,
                        width: PORT,
                        height: PORT,
                    },
                );
            }
        }
    }

    /// Where one of the block's own ports on a side wall wants to stand: level
    /// with the pins its lines reach on that wall of their blocks, else with
    /// their blocks' middle.
    fn level_of(&self, port: &str, side: Side) -> f64 {
        let reached: Vec<f64> = self
            .block
            .lines
            .values()
            .filter_map(|line| {
                if line.to == port {
                    Some(&line.from)
                } else if line.from == port {
                    Some(&line.to)
                } else {
                    None
                }
            })
            .filter_map(|end| {
                let pin = self.tree.pins.get(end.as_str())?;
                let owner = self.boxes.get(&self.tree.get(pin.block).id)?;
                let (at, on) = self.pin_at(end);
                Some(if on == side {
                    at.y
                } else {
                    owner.y + owner.height / 2.0
                })
            })
            .collect();
        reached.iter().fold(0.0, |sum, y| sum + y) / js_max(1.0, reached.len() as f64)
    }

    /// Place the block's header and its own ports on every edge, its top and
    /// bottom ports at the heights given.
    pub(super) fn place_edges(&mut self, width: f64, top: f64, bottom: f64) {
        if let Some(header) = self.header {
            self.boxes.insert(
                self.header_id(),
                Rect {
                    x: self
                        .block
                        .lone
                        .as_ref()
                        .map_or(0.0, |lone| super::super::lone::side_room(width, lone)),
                    y: top,
                    width: self
                        .block
                        .header
                        .as_ref()
                        .expect("a header")
                        .painted(header.index)
                        .width,
                    height: header.size.height,
                },
            );
        }
        self.place_ports(Side::Top, width, top);
        self.place_ports(Side::Bottom, width, bottom);
        self.place_walls(width, top, bottom);
    }

    /// Route every trunk around the packed blocks.
    pub(super) fn route(&mut self) {
        let routes = TrunkRouter {
            block: self.block,
            laid: self.laid,
            tree: self.tree,
            boxes: &self.boxes,
        }
        .route();
        for (key, points) in routes {
            self.lines.insert(key, points);
        }
    }

    /// Close unused trunk space to the header or bottom port inset (`rim_of`).
    /// The packed items start at `items` and the bottom ports stand at
    /// `bottom`; answers where the bottom ports stand now.
    pub(super) fn close_strips(&mut self, items: f64, bottom: f64, ended: bool) -> f64 {
        let under = rim_of(self.block, self.insets).map_or(self.insets.side, |rim| rim.head);
        let head = if self.head_room() > 0.0 {
            self.close(items - HEAD_GAP, items, under)
        } else {
            0.0
        };
        let low = bottom - head;
        if ended {
            low - self.close(low - HEAD_GAP, low, self.insets.side)
        } else {
            low
        }
    }

    /// Close a strip without turns, moving its lower geometry up, keeping some
    /// room. Answers how far everything below it moved up.
    fn close(&mut self, from: f64, to: f64, room: f64) -> f64 {
        let by = to - from - room;
        let turns = self.lines.values().any(|points| {
            points.windows(2).any(|pair| {
                abs(pair[1].y - pair[0].y) < SAME
                    && pair[1].y > from + SAME
                    && pair[1].y < to - SAME
            })
        });
        if by <= 0.0 || turns {
            return 0.0;
        }
        self.move_up(to, by);
        by
    }

    /// Move every box and point at or below a height up by some distance.
    fn move_up(&mut self, below: f64, by: f64) {
        for one in self.boxes.values_mut() {
            if one.y >= below - SAME {
                one.y -= by;
            }
        }
        for point in self.lines.values_mut().flat_map(|points| points.iter_mut()) {
            if point.y >= below - SAME {
                *point = Point {
                    x: point.x,
                    y: point.y - by,
                };
            }
        }
    }
}
