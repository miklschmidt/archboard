//! A block's lines to and from its side walls: which wall a line leaves or
//! enters by, the lines drawn straight from a card's side to its wall,
//! running such a line onto the wall once routed, and the points the block's
//! parent must route around.

use crate::ecma::sorted_by;
use crate::geometry::{Point, Rect, Side};
use crate::track::chains::LANE;
use crate::track::scene::{ItemId, Map, Placement};

use super::leaves::PORT;
use super::tree::{Block, BlockTree, Kind, Line};

/// A line drawn straight from a card's side to the block's wall.
pub(crate) struct Beside {
    pub key: String,
    pub card: String,
    pub wall: Side,
}

/// A side wall, when a side is one.
fn wall(side: Option<&Side>) -> Option<Side> {
    side.copied()
        .filter(|side| matches!(side, Side::Left | Side::Right))
}

/// The wall a line leaves the block by, when its port is on one.
pub(crate) fn wall_of(block: &Block, line: &Line) -> Option<Side> {
    wall(block.ports.get(&line.to))
}

/// The wall a line enters the block by, when its port is on one.
pub(crate) fn enters_by(block: &Block, line: &Line) -> Option<Side> {
    wall(block.ports.get(&line.from))
}

/// The wall a line leaves the block by carrying its label, when its port is on one.
pub(crate) fn labelled_out(block: &Block, line: &Line) -> Option<Side> {
    if line.labelled {
        wall_of(block, line)
    } else {
        None
    }
}

/// Whether Graphviz ranks a line of the block: every line but one to a wall
/// that carries no label there, which runs from its card along the channel under it.
pub(crate) fn ranks(block: &Block, line: &Line) -> bool {
    wall_of(block, line).is_none() || line.labelled
}

/// The wall a line runs to along the channel under its card: a line to a
/// wall that Graphviz does not rank.
pub(crate) fn channel_wall(block: &Block, line: &Line) -> Option<Side> {
    if ranks(block, line) {
        None
    } else {
        wall_of(block, line)
    }
}

/// The wall an item stands apart toward: the one wall that every line to or
/// from it crosses. Lines to and from a wall are ranked only with their own
/// labels and stubs, so such an item is a part of the block's graph of its
/// own. Nothing when some line of it stays inside or they cross both.
fn wall_reached(block: &Block, item: &str) -> Option<Side> {
    let mut sides: Vec<Option<Side>> = Vec::new();
    for line in block.lines.values() {
        for (end, side) in [
            (&line.from, wall_of(block, line)),
            (&line.to, enters_by(block, line)),
        ] {
            if end == item && !sides.contains(&side) {
                sides.push(side);
            }
        }
    }
    if sides.len() == 1 { sides[0] } else { None }
}

/// A block's items in the order Graphviz meets them: the items that stand
/// apart toward the left wall first, those toward the right wall last.
/// Graphviz sets the parts of a graph side by side in the order it meets
/// them. In the board's order, Device CA certificate state stood at the far
/// end of its region from Device Identity beside it, and the line between them
/// ran the region's width (Device Trust Control Plane, native hosts, Blocks).
/// An item that some line holds among the rest keeps its place: Graphviz
/// orders it with them, and moving it only stirs that order.
fn toward_walls(block: &Block) -> Vec<String> {
    let at: Map<&str, f64> = block
        .items
        .iter()
        .map(|item| {
            let toward = match wall_reached(block, item) {
                Some(Side::Left) => -1.0,
                Some(Side::Right) => 1.0,
                _ => 0.0,
            };
            (item.as_str(), toward)
        })
        .collect();
    sorted_by(&block.items, |one, other| {
        at[one.as_str()] - at[other.as_str()]
    })
}

/// A block's items in the order Graphviz meets them: toward the walls when
/// every block faces its walls, else the board's order.
pub(crate) fn items_of(tree: &BlockTree, block: &Block) -> Vec<String> {
    if tree.facing {
        toward_walls(block)
    } else {
        block.items.clone()
    }
}

/// Whether facing every block's walls changes a board's blocks: some block
/// that holds a line's label turns it to a wall, or stands an item reached
/// only through a wall toward it. The tree is the one with every block facing
/// its walls.
pub(crate) fn facing_turns(tree: &BlockTree) -> bool {
    tree.blocks.values().any(|&id| {
        let block = tree.get(id);
        block
            .lines
            .values()
            .any(|line| labelled_out(block, line).is_some())
            || items_of(tree, block)
                .iter()
                .zip(&block.items)
                .any(|(item, at)| item != at)
    })
}

/// Every point the lines of a block inside the board draw, which its parent
/// must route around: all but the end where a line to or from a wall meets
/// the wall, which stands where the block ends.
pub(crate) fn inner_points(block: &Block, lines: &Map<String, Vec<Point>>) -> Vec<Point> {
    if block.kind == Kind::Root {
        return Vec::new();
    }
    block
        .lines
        .values()
        .flat_map(|line| {
            let points = lines.get(&line.key).map_or(&[][..], Vec::as_slice);
            if wall_of(block, line).is_some() {
                return points[..points.len().saturating_sub(1)].to_vec();
            }
            if enters_by(block, line).is_none() {
                points.to_vec()
            } else {
                points.iter().skip(1).copied().collect()
            }
        })
        .collect()
}

/// A line's points run onto the block's wall: its last point when it leaves
/// by a wall, its first when it enters by one.
fn walled_points(
    points: &[Point],
    leaves: Option<Side>,
    enters: Option<Side>,
    width: f64,
) -> Option<Vec<Point>> {
    let x = |side: Side| if side == Side::Left { 0.0 } else { width };
    if let Some(leaves) = leaves {
        let mut moved = points[..points.len() - 1].to_vec();
        moved.push(Point {
            x: x(leaves),
            y: points[points.len() - 1].y,
        });
        return Some(moved);
    }
    let enters = enters?;
    let mut moved = vec![Point {
        x: x(enters),
        y: points[0].y,
    }];
    moved.extend_from_slice(&points[1..]);
    Some(moved)
}

/// Run every line to a wall onto the block's own wall, and stand its port
/// there. Answers the height of every such line's track, which the block must hold.
pub(crate) fn wall_lines(
    block: &Block,
    lines: &mut Map<String, Vec<Point>>,
    boxes: &mut Map<String, Rect>,
    width: f64,
) -> Vec<f64> {
    let mut tracks = Vec::new();
    for line in block.lines.values() {
        let Some(points) = lines.get(&line.key) else {
            continue;
        };
        let (leaves, enters) = (wall_of(block, line), enters_by(block, line));
        let Some(moved) = walled_points(points, leaves, enters, width) else {
            continue;
        };
        let end = if leaves.is_none() {
            moved[0]
        } else {
            moved[moved.len() - 1]
        };
        let port = if leaves.is_none() {
            &line.from
        } else {
            &line.to
        };
        lines.insert(line.key.clone(), moved);
        boxes.insert(
            port.clone(),
            Rect {
                x: end.x - PORT / 2.0,
                y: end.y - PORT / 2.0,
                width: PORT,
                height: PORT,
            },
        );
        tracks.push(end.y + LANE);
    }
    tracks
}

/// The lines that leave a block by a wall straight from their card's side: a
/// card that stands outermost on its band toward the wall, with nothing
/// between, and no other line to that wall from that side. A group region
/// keeps its lines on the tracks.
pub(crate) fn beside_walls(block: &Block, tree: &BlockTree, scene: &Placement) -> Vec<Beside> {
    if block.kind == Kind::Region {
        return Vec::new();
    }
    let beside: Vec<Beside> = block
        .lines
        .values()
        .filter_map(|line| {
            let wall = channel_wall(block, line)?;
            let item = *scene.cards.get(&line.from)?;
            if !tree.cards.contains_key(&line.from) {
                return None;
            }
            if block.cluster_of.contains_key(&line.from) || !outermost(scene, item, wall) {
                return None;
            }
            Some(Beside {
                key: line.key.clone(),
                card: line.from.clone(),
                wall,
            })
        })
        .collect();
    let sides: Vec<String> = beside
        .iter()
        .map(|one| format!("{}|{}", one.card, one.wall.name()))
        .collect();
    beside
        .into_iter()
        .enumerate()
        .filter(|(index, _)| sides.iter().filter(|side| **side == sides[*index]).count() == 1)
        .map(|(_, one)| one)
        .collect()
}

/// Mark on a scene the stretch of its band that each line drawn straight to
/// a wall runs along, which the scene's router does not route.
pub(crate) fn mark_besides(scene: &mut Placement, beside: &[Beside]) {
    for one in beside {
        let item = *scene.item(scene.cards[one.card.as_str()]);
        let run = if one.wall == Side::Left {
            (f64::NEG_INFINITY, item.bx.x)
        } else {
            (item.bx.x + item.bx.width, f64::INFINITY)
        };
        scene.besides.entry(item.band).or_default().push(run);
    }
}

/// Whether nothing stands between a card and a wall on the card's band.
fn outermost(scene: &Placement, item: ItemId, wall: Side) -> bool {
    let card = *scene.item(item);
    scene
        .cards
        .values()
        .chain(scene.labels.values())
        .chain(scene.titles.values())
        .all(|&one| {
            let other = scene.item(one);
            if one == item || other.band != card.band || other.bx.width <= PORT {
                return true;
            }
            if wall == Side::Right {
                other.bx.x < card.bx.x + card.bx.width
            } else {
                other.bx.x + other.bx.width > card.bx.x
            }
        })
}

/// The points of the lines drawn straight from a card's side to a wall, level
/// with the card's middle; the end at the wall stands a lane out from the
/// card, and is run onto the wall once the block's width is known.
pub(crate) fn beside_points(
    scene: &Placement,
    beside: &[Beside],
    left: f64,
) -> Vec<(String, Vec<Point>)> {
    beside
        .iter()
        .map(|one| {
            let bx = scene.moved_id(scene.cards[one.card.as_str()], left);
            let y = bx.y + bx.height / 2.0;
            let x = if one.wall == Side::Right {
                bx.x + bx.width
            } else {
                bx.x
            };
            let out = if one.wall == Side::Right { LANE } else { -LANE };
            (
                one.key.clone(),
                vec![Point { x, y }, Point { x: x + out, y }],
            )
        })
        .collect()
}
