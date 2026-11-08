//! The cards outside a reading's frames, stood round the walls of the whole they
//! make, each at the place along its wall that faces what it joins. A card takes
//! the wall where the way of every line, times what the page's room costs, is
//! least, so a card that would grow the page on its own takes a wall that holds it.

use rustc_hash::FxHashMap;

use crate::{
    blocks::assembly::PlacedCard,
    geometry::{Point, Rect},
    graph::Node,
};

use super::{super::reading::room_cost, Set};

/// Room between a frame's wall and the cards round it, before routing.
const RING_GAP: f64 = 112.0;
/// Room between two cards side by side.
const STEP: f64 = 40.0;
/// The room outside the outermost cards, where a line may run round them.
const PAGE_ROOM: f64 = 64.0;
/// What a line against the reading direction costs a wall.
const AGAINST: f64 = 200.0;
/// How many times every door may move to a wall that costs the ring less.
const MOVES: usize = 3;

/// A wall of the frame, in the order of `WALLS`.
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
    /// The wall it takes, once it has one.
    wall: Option<Wall>,
    /// What each wall costs it, in the order of `WALLS`.
    costs: [f64; 4],
    /// Where its lines face along a top or bottom wall, and along a side wall.
    facing: Point,
    /// How many lines it has to the inside of the frame.
    lines: f64,
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

    /// How far the door stands out from a wall.
    fn depth(&self, wall: Wall) -> f64 {
        if wall.level() {
            self.node.h()
        } else {
            self.node.w()
        }
    }

    /// Where its lines face along a wall.
    fn facing(&self, wall: Wall) -> f64 {
        if wall.level() {
            self.facing.x
        } else {
            self.facing.y
        }
    }
}

/// Doors stood round the frame: where each stands, and the page they make.
struct Arrangement {
    /// Where the frame's top left corner stands on the page.
    frame: Point,
    width: f64,
    height: f64,
    /// Each door's box, for a door with a wall.
    boxes: Vec<Option<Rect>>,
    /// How far, in all, the doors stand from where their lines face, line by line.
    drift: f64,
}

/// The wall a frame shuts a point off from, in the order of `WALLS`, and what a line
/// adds to go round the frame. A line does not pass through a frame it does not join.
fn shut_wall(frame: &Rect, at: Point) -> Option<(usize, f64)> {
    let (right, bottom) = (frame.x + frame.width, frame.y + frame.height);
    let beside = (frame.x..=right).contains(&at.x);
    let level = (frame.y..=bottom).contains(&at.y);
    match (beside, level) {
        (true, false) => {
            let way = 2.0 * (at.x - frame.x).min(right - at.x);
            Some((usize::from(bottom >= at.y), way))
        }
        (false, true) => {
            let way = 2.0 * (at.y - frame.y).min(bottom - at.y);
            Some((2 + usize::from(right >= at.x), way))
        }
        _ => None,
    }
}

/// What a ring reads.
pub(super) struct Ring<'a> {
    pub graph: &'a Node,
    /// Each frame, with the middle of its tab.
    pub frames: Vec<(&'a str, Point)>,
    /// Where each frame stands.
    pub boxes: Vec<Rect>,
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
        inside.extend(self.frames.iter().copied());
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

    /// What a line from a point to each wall, in the order of `WALLS`, adds to go round
    /// the frames between them.
    fn round_frames(&self, at: Point) -> [f64; 4] {
        let mut added = [0.0; 4];
        for (wall, way) in self.boxes.iter().filter_map(|frame| shut_wall(frame, at)) {
            added[wall] += way;
        }
        added
    }

    /// What each wall costs a door: the way to what it joins, the way round a frame
    /// that stands between them, and a line against the reading.
    fn door<'n>(&self, node: &'n Node, inside: &FxHashMap<&str, Point>) -> Door<'n> {
        let size = self.set.size;
        let against = |wrong: bool| if wrong { AGAINST } else { 0.0 };
        let partners = self.partners(&node.id, inside);
        let mut costs = [0.0; 4];
        for &(at, enters) in &partners {
            let round = self.round_frames(at);
            costs[0] += at.y + against(!enters) + round[0];
            costs[1] += size.y - at.y + against(enters) + round[1];
            costs[2] += at.x + against(!enters) + round[2];
            costs[3] += size.x - at.x + against(enters) + round[3];
        }
        let side = if self.sides { 0.0 } else { f64::INFINITY };
        let lines = partners.len() as f64;
        let mean = |of: fn(&Point) -> f64| {
            partners.iter().map(|(at, _)| of(at)).sum::<f64>() / lines.max(1.0)
        };
        Door {
            node,
            wall: None,
            costs: [costs[0], costs[1], costs[2] + side, costs[3] + side],
            facing: Point {
                x: mean(|at| at.x),
                y: mean(|at| at.y),
            },
            lines,
        }
    }

    /// What a ring of doors costs: the way of every line, times what the page's room
    /// costs, as a placement promises it (`reading::promise`).
    fn cost(&self, doors: &[Door<'_>], inner: f64) -> f64 {
        let arranged = self.arrange(doors);
        let way: f64 = (doors.iter())
            .filter_map(|door| Some(door.costs[door.wall? as usize]))
            .sum();
        (1.0 + inner + way + arranged.drift) * room_cost(arranged.width, arranged.height)
    }

    /// Give each door the wall that costs the ring least, the most decided door first,
    /// then move any door whose move makes the ring cost less.
    fn assign(&self, doors: &mut [Door<'_>], inner: f64) {
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
        for &at in &order {
            doors[at].wall = self.cheapest(doors, at, inner).map(|(wall, _)| wall);
        }
        for _ in 0..MOVES {
            let mut moved = false;
            let mut least = self.cost(doors, inner);
            for &at in &order {
                if let Some((wall, cost)) = self.cheapest(doors, at, inner)
                    && cost < least
                    && Some(wall) != doors[at].wall
                {
                    doors[at].wall = Some(wall);
                    least = cost;
                    moved = true;
                }
            }
            if !moved {
                break;
            }
        }
    }

    /// The wall that costs the ring least for one door, and that cost.
    fn cheapest(&self, doors: &mut [Door<'_>], at: usize, inner: f64) -> Option<(Wall, f64)> {
        let kept = doors[at].wall;
        let mut best: Option<(Wall, f64)> = None;
        for (index, wall) in WALLS.into_iter().enumerate() {
            if !doors[at].costs[index].is_finite() {
                continue;
            }
            doors[at].wall = Some(wall);
            let cost = self.cost(doors, inner);
            if best.is_none_or(|(_, least)| cost < least) {
                best = Some((wall, cost));
            }
        }
        doors[at].wall = kept;
        best
    }

    /// The depth a wall's doors add to the page.
    fn band(&self, doors: &[Door<'_>], wall: Wall) -> f64 {
        let held = doors.iter().filter(|door| door.wall == Some(wall));
        held.map(|door| door.depth(wall))
            .fold(None, |most: Option<f64>, depth| {
                Some(most.map_or(depth, |one| one.max(depth)))
            })
            .map_or(0.0, |depth| depth + RING_GAP + self.extra)
    }

    /// Each door on one wall, along it: as near what it faces as its neighbours let it.
    fn line_up(doors: &[Door<'_>], wall: Wall) -> Vec<(usize, f64)> {
        let mut held: Vec<(usize, f64)> = doors
            .iter()
            .enumerate()
            .filter(|(_, door)| door.wall == Some(wall))
            .map(|(at, door)| (at, door.facing(wall)))
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

    /// Every door with a wall stood round the frame, and the page they make.
    fn arrange(&self, doors: &[Door<'_>]) -> Arrangement {
        let gap = RING_GAP + self.extra;
        let size = self.set.size;
        let origin = Point {
            x: self.band(doors, Wall::Left),
            y: self.band(doors, Wall::Top),
        };
        let mut boxes = vec![None; doors.len()];
        let mut drift = 0.0;
        for wall in WALLS {
            for (at, along) in Self::line_up(doors, wall) {
                let door = &doors[at];
                let node = door.node;
                drift += door.lines * (along + door.span(wall) / 2.0 - door.facing(wall)).abs();
                let (x, y) = match wall {
                    Wall::Top => (origin.x + along, origin.y - gap - node.h()),
                    Wall::Bottom => (origin.x + along, origin.y + size.y + gap),
                    Wall::Left => (origin.x - gap - node.w(), origin.y + along),
                    Wall::Right => (origin.x + size.x + gap, origin.y + along),
                };
                boxes[at] = Some(Rect {
                    x,
                    y,
                    width: node.w(),
                    height: node.h(),
                });
            }
        }
        let placed = || boxes.iter().flatten();
        let low = placed().map(|bx| bx.x).fold(origin.x, f64::min);
        let high = placed()
            .map(|bx| bx.x + bx.width)
            .fold(origin.x + size.x, f64::max);
        let lowest = placed().map(|bx| bx.y).fold(origin.y, f64::min);
        let highest = placed()
            .map(|bx| bx.y + bx.height)
            .fold(origin.y + size.y, f64::max);
        let shift = Point {
            x: PAGE_ROOM - low,
            y: PAGE_ROOM - lowest,
        };
        for bx in boxes.iter_mut().flatten() {
            bx.x += shift.x;
            bx.y += shift.y;
        }
        Arrangement {
            frame: Point {
                x: origin.x + shift.x,
                y: origin.y + shift.y,
            },
            width: high - low + 2.0 * PAGE_ROOM,
            height: highest - lowest + 2.0 * PAGE_ROOM,
            boxes,
            drift,
        }
    }

    /// The straight way of the lines between the parts inside the frame.
    fn inner(&self, inside: &FxHashMap<&str, Point>) -> f64 {
        (self.graph.edges.iter().flatten())
            .filter_map(|edge| {
                let (one, two) = (inside.get(edge.source())?, inside.get(edge.target())?);
                Some((one.x - two.x).abs() + (one.y - two.y).abs())
            })
            .sum()
    }

    /// Stand every door round the frame.
    pub(super) fn stand(&self, nodes: &[&Node]) -> Page {
        let inside = self.inside();
        let mut doors: Vec<Door<'_>> = nodes.iter().map(|node| self.door(node, &inside)).collect();
        self.assign(&mut doors, self.inner(&inside));
        let arranged = self.arrange(&doors);
        let placed = (doors.iter().zip(arranged.boxes))
            .filter_map(|(door, bx)| {
                Some(PlacedCard {
                    id: door.node.id.clone(),
                    bx: bx?,
                    depth: 0,
                    header: None,
                })
            })
            .collect();
        Page {
            frame: arranged.frame,
            width: arranged.width,
            height: arranged.height,
            doors: placed,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_frame_between_a_part_and_a_wall_adds_the_way_round_it() {
        let graph: Node = serde_json::from_value(serde_json::json!({"id":"root"})).expect("a node");
        let set = Set {
            size: Point {
                x: 1000.0,
                y: 1000.0,
            },
            parts: Vec::new(),
        };
        let frame = |y: f64| Rect {
            x: 0.0,
            y,
            width: 1000.0,
            height: 400.0,
        };
        let ring = Ring {
            graph: &graph,
            frames: Vec::new(),
            boxes: vec![frame(0.0), frame(600.0)],
            set: &set,
            ids: Vec::new(),
            extra: 0.0,
            sides: true,
        };
        let inside_upper = Point { x: 300.0, y: 200.0 };
        assert_eq!(ring.round_frames(inside_upper), [0.0, 600.0, 0.0, 0.0]);
    }

    /// Four wide doors each answer one of a row of parts along the frame's foot, and each
    /// part calls the next. Three doors fill the wall below the frame. The fourth takes a
    /// wall along the page's width, not a column of its own beside the frame.
    #[test]
    fn a_door_takes_a_wall_along_the_page_before_a_column_of_its_own() {
        let answers = (0..4).map(|at| {
            serde_json::json!({"id": format!("answer{at}"),
            "sources": [format!("part{at}")], "targets": [format!("door{at}")]})
        });
        let calls = (0..3).map(|at| {
            serde_json::json!({"id": format!("call{at}"),
            "sources": [format!("part{at}")], "targets": [format!("part{}", at + 1)]})
        });
        let graph: Node = serde_json::from_value(serde_json::json!({
            "id": "root",
            "children": (0..4).map(|at| serde_json::json!(
                {"id": format!("door{at}"), "width": 300, "height": 34})).collect::<Vec<_>>(),
            "edges": answers.chain(calls).collect::<Vec<_>>(),
        }))
        .expect("a node");
        let set = Set {
            size: Point {
                x: 1000.0,
                y: 600.0,
            },
            parts: (0..4)
                .map(|at| Rect {
                    x: 20.0 + 250.0 * f64::from(at),
                    y: 450.0,
                    width: 200.0,
                    height: 100.0,
                })
                .collect(),
        };
        let ring = Ring {
            graph: &graph,
            frames: Vec::new(),
            boxes: vec![Rect {
                x: 0.0,
                y: 0.0,
                width: 1000.0,
                height: 600.0,
            }],
            set: &set,
            ids: vec!["part0", "part1", "part2", "part3"],
            extra: 0.0,
            sides: true,
        };
        let doors: Vec<&Node> = graph.kids().iter().collect();
        let page = ring.stand(&doors);
        for door in &page.doors {
            let beside =
                door.bx.y < page.frame.y + set.size.y && door.bx.y + door.bx.height > page.frame.y;
            assert!(!beside, "{} stands beside the frame", door.id);
        }
    }
}
