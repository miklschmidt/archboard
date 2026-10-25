//! The trunks of a block of blocks, routed by the orthogonal router
//! (`archboard-router`, ADR 0057) around the blocks it packs: each between two
//! pins on its blocks' edges, or the block's own port or header, and how much
//! room the routes spend running round the blocks.

use archboard_router::{Dir, End, Params, Route, Scene, route};

use crate::ecma::{abs, js_max, number_key, round};
use crate::geometry::{Point, Rect, Side};
use crate::track::chains::LANE;
use crate::track::scene::{Map, Set};
use crate::track::score::{Weighed, crossings_of};

use super::super::laid::{Laid, LaidMap, SAME};
use super::super::tree::{Block, BlockTree, Line, header_of};

/// How far a trunk keeps from a block it passes.
pub(crate) const TRUNK_CLEARANCE: f64 = 16.0;
/// How much a trunk pays for each turn, in diagram points.
const TRUNK_TURN: f64 = 60.0;
/// How much a trunk pays for crossing another, in diagram points.
const TRUNK_CROSSING: f64 = 300.0;

/// The edge a trunk leaves a block's own port by: into the block.
fn inward(side: Side) -> Side {
    match side {
        Side::Top => Side::Bottom,
        Side::Bottom => Side::Top,
        Side::Left => Side::Right,
        Side::Right => Side::Left,
    }
}

/// The way the router leaves a pin on an edge: outward from it.
fn leaving(side: Side) -> Dir {
    match side {
        Side::Top => Dir::Up,
        Side::Right => Dir::Right,
        Side::Bottom => Dir::Down,
        Side::Left => Dir::Left,
    }
}

/// A plain dogleg between two ends: across then down for ends that face
/// sideways, down then across for ends that face up or down.
fn dogleg(from: Point, side: Side, to: Point) -> Vec<Point> {
    if matches!(side, Side::Left | Side::Right) {
        let middle = f64::midpoint(from.x, to.x);
        return vec![
            from,
            Point {
                x: middle,
                y: from.y,
            },
            Point { x: middle, y: to.y },
            to,
        ];
    }
    let middle = f64::midpoint(from.y, to.y);
    vec![
        from,
        Point {
            x: from.x,
            y: middle,
        },
        Point { x: to.x, y: middle },
        to,
    ]
}

/// How far a route runs beyond the shortest orthogonal path between its ends,
/// each turn counted as the router counts it.
fn detour_of(points: &[Point]) -> f64 {
    let (first, last) = (points[0], points[points.len() - 1]);
    let length = points.windows(2).fold(0.0, |sum, pair| {
        sum + abs(pair[1].x - pair[0].x) + abs(pair[1].y - pair[0].y)
    });
    let turns = points.len().saturating_sub(2) as f64;
    length + turns * TRUNK_TURN - abs(last.x - first.x) - abs(last.y - first.y)
}

/// What a layout is weighed on, as every layout choice weighs it, with the
/// room its lines spend running round what they pass counted as crossings at
/// the trunk router's own rate.
pub(crate) fn routed_weighed(width: f64, height: f64, lines: &[&[Point]]) -> Weighed {
    let detour = lines
        .iter()
        .fold(0.0, |sum, points| sum + detour_of(points));
    Weighed {
        width,
        height,
        crossings: crossings_of(lines.iter().copied()) + detour / TRUNK_CROSSING,
        ..Weighed::default()
    }
}

/// What a block of blocks is weighed on laid out, its trunks' detours counted.
pub(crate) fn packed_weighed(laid: &Laid) -> Weighed {
    let lines: Vec<&[Point]> = laid.lines.values().map(Vec::as_slice).collect();
    routed_weighed(laid.width, laid.height, &lines)
}

/// Whether a value lies strictly between two others.
fn between(low: f64, high: f64, at: f64) -> bool {
    at > low && at < high
}

/// How many different rounded places some coordinates stand at.
fn places(values: impl Iterator<Item = f64>) -> usize {
    values
        .map(|value| number_key(round(value)))
        .collect::<Set<u64>>()
        .len()
}

/// The room the trunks running between two neighbouring blocks need: a lane
/// either side of each, where the router squeezed more into a gap than it
/// holds a lane apart. Answers the room the most crowded gap needs.
pub(crate) fn room_needed(items: &[Rect], lines: &[&[Point]], gap: f64) -> f64 {
    let runs: Vec<(Point, Point)> = lines
        .iter()
        .flat_map(|points| points.windows(2).map(|pair| (pair[0], pair[1])))
        .collect();
    let mut most = 0.0;
    for one in items {
        for other in items {
            let across = (one.x + one.width, other.x);
            let down = (one.y + one.height, other.y);
            let beside = across.1 - across.0 > 0.0 && across.1 - across.0 <= gap + SAME;
            let under = down.1 - down.0 > 0.0 && down.1 - down.0 <= gap + SAME;
            let columns = places(
                runs.iter()
                    .filter(|(from, to)| beside && abs(from.x - to.x) < SAME)
                    .filter(|(from, _)| between(across.0, across.1, from.x))
                    .map(|(from, _)| from.x),
            );
            let rows = places(
                runs.iter()
                    .filter(|(from, to)| under && abs(from.y - to.y) < SAME)
                    .filter(|(from, _)| between(down.0, down.1, from.y))
                    .map(|(from, _)| from.y),
            );
            most = js_max(most, columns.max(rows) as f64);
        }
    }
    (most + 1.0) * LANE
}

/// Where on its obstacle a pinned end stands, and which way it leaves.
struct PinnedOn {
    owner: String,
    x: f64,
    y: f64,
    side: Side,
}

/// The trunks of one block of blocks, routed around its packed blocks.
pub(crate) struct TrunkRouter<'a> {
    pub block: &'a Block,
    pub laid: &'a LaidMap,
    pub tree: &'a BlockTree,
    /// Where the block put its items, header and own ports.
    pub boxes: &'a Map<String, Rect>,
}

impl TrunkRouter<'_> {
    /// Where on its obstacle a pinned end stands, and which way it leaves: a
    /// pin on a packed block's edge leaves outward, the block's own port
    /// inward, so no trunk reaches either by running along an edge.
    fn pin_on(&self, at: &str) -> PinnedOn {
        if let Some(&own) = self.block.ports.get(at) {
            return PinnedOn {
                owner: at.to_owned(),
                x: 0.5,
                y: 0.5,
                side: inward(own),
            };
        }
        let Some(pin) = self.tree.pins.get(at) else {
            return PinnedOn {
                owner: at.to_owned(),
                x: 0.5,
                y: 1.0,
                side: Side::Bottom,
            };
        };
        let child = self.tree.get(pin.block);
        let inner = &self.laid[child.id.as_str()];
        let port = inner.boxes[pin.port.as_str()];
        let side = child.ports[pin.port.as_str()];
        let x = (port.x + port.width / 2.0) / inner.width;
        let y = (port.y + port.height / 2.0) / inner.height;
        let (x, y) = match side {
            Side::Top => (x, 0.0),
            Side::Bottom => (x, 1.0),
            Side::Left => (0.0, y),
            Side::Right => (1.0, y),
        };
        PinnedOn {
            owner: child.id.clone(),
            x,
            y,
            side,
        }
    }

    /// The point a pinned end stands at on its obstacle.
    fn pinned_point(&self, on: &PinnedOn) -> Point {
        let at = self.boxes[on.owner.as_str()];
        Point {
            x: at.x + on.x * at.width,
            y: at.y + on.y * at.height,
        }
    }

    /// Where a trunk's end stands and which way it leaves: a pin on its block's
    /// edge, or the middle of the block's own port or header. A plain item end
    /// stands at its box's middle and leaves by the edge its port is on, or by
    /// its bottom, unlike the ends the router reads (`pin_on`).
    fn pin_point(&self, at: &str) -> (Point, Side) {
        if !self.tree.pins.contains_key(at) && at != header_of(self.block) {
            let item = self.boxes[at];
            let side = self.block.ports.get(at).copied().unwrap_or(Side::Bottom);
            let point = Point {
                x: item.x + item.width / 2.0,
                y: item.y + item.height / 2.0,
            };
            return (point, side);
        }
        let on = self.pin_on(at);
        (self.pinned_point(&on), on.side)
    }

    /// One end of a trunk as the router reads it: a pin on a packed block's
    /// port, on the block's own port, or on the bottom of its header, or the
    /// middle of an own port as a free point when the ports are not directed.
    fn end_of(&self, at: &str, obstacles: &Map<&str, usize>, directed: bool) -> End {
        if !directed && self.block.ports.contains_key(at) {
            let item = self.boxes[at];
            return End::Free {
                at: router_point(Point {
                    x: item.x + item.width / 2.0,
                    y: item.y + item.height / 2.0,
                }),
            };
        }
        let on = self.pin_on(at);
        End::Pin {
            obstacle: obstacles[on.owner.as_str()],
            at: router_point(self.pinned_point(&on)),
            leaves: leaving(on.side),
        }
    }

    /// Route every trunk around the packed blocks: into the block's own ports
    /// as pins, or, where the router finds no route that way for some trunk,
    /// every trunk to them as free points, and a trunk it still finds none for
    /// as a plain dogleg. Answers each line's points, by key, from its source end.
    pub(crate) fn route(&self) -> Map<String, Vec<Point>> {
        let lines: Vec<&Line> = self.block.lines.values().collect();
        let pinned = self.routed(&lines, true);
        let routes = if pinned.iter().any(Vec::is_empty) {
            self.routed(&lines, false)
        } else {
            pinned
        };
        lines
            .iter()
            .zip(routes)
            .map(|(line, routed)| {
                let mut points = if routed.is_empty() {
                    let (from, side) = self.pin_point(&line.tail);
                    dogleg(from, side, self.pin_point(&line.head).0)
                } else {
                    routed
                };
                if line.from != line.tail {
                    points.reverse();
                }
                (line.key.clone(), points)
            })
            .collect()
    }

    /// Every trunk as the router routes it, the router given every obstacle
    /// (the packed blocks, the header and, directed, the block's own ports)
    /// and each trunk's two ends. Answers each trunk's points, in order; none
    /// where the router found no route.
    fn routed(&self, lines: &[&Line], directed: bool) -> Vec<Vec<Point>> {
        let header = self.block.header.as_ref().map(|_| header_of(self.block));
        let owned: Vec<&String> = if directed {
            self.block.ports.keys().collect()
        } else {
            Vec::new()
        };
        let ids: Vec<&str> = self
            .block
            .items
            .iter()
            .map(String::as_str)
            .chain(header.as_deref())
            .chain(owned.into_iter().map(String::as_str))
            .collect();
        let obstacles: Map<&str, usize> = ids
            .iter()
            .enumerate()
            .map(|(index, &id)| (id, index))
            .collect();
        let scene = Scene {
            obstacles: ids
                .iter()
                .map(|&id| {
                    let at = self.boxes[id];
                    archboard_router::Rect {
                        x: at.x,
                        y: at.y,
                        width: at.width,
                        height: at.height,
                    }
                })
                .collect(),
            connectors: lines
                .iter()
                .map(|line| {
                    (
                        self.end_of(&line.tail, &obstacles, directed),
                        self.end_of(&line.head, &obstacles, directed),
                    )
                })
                .collect(),
            params: Params {
                clearance: TRUNK_CLEARANCE,
                lane: LANE,
                bend: TRUNK_TURN,
                crossing: TRUNK_CROSSING,
            },
        };
        route(&scene)
            .into_iter()
            .map(|one| match one {
                Route::Routed(points) => points
                    .into_iter()
                    .map(|at| Point { x: at.x, y: at.y })
                    .collect(),
                Route::Unroutable => Vec::new(),
            })
            .collect()
    }
}

/// A point as the router reads it.
fn router_point(at: Point) -> archboard_router::Point {
    archboard_router::Point { x: at.x, y: at.y }
}
