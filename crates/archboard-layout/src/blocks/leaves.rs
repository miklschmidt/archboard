//! A block of cards' placed leaves, set right where Graphviz leaves them
//! off: the header in its corner, with the ports on its rank beside it.

use crate::constants::CONTAINER_INSET;
use crate::ecma::{js_max, js_min, max, min, via_text};
use crate::geometry::{Point, Rect, Side};
use crate::placed::PlacedNode;
use crate::track::chains::LANE;
use crate::track::labels::extent_of;
use crate::track::scene::{Map, Placement};
use crate::track::spacing::Rim;

use super::headers::{Room, TakenHeader, header_within};
use super::laid::{Insets, LaidMap};
use super::lone::side_room;
use super::tree::{Block, BlockTree, Kind, header_of};

/// The side of a port's square.
pub const PORT: f64 = 1.0;

/// Whether two leaves share some height.
fn level(one: &PlacedNode, other: &PlacedNode) -> bool {
    one.y < other.y + other.height && other.y < one.y + one.height
}

/// Stand the header in the block's top-left corner, over what the block
/// holds, and every leaf on its rank right of it a lane apart, at the widest
/// size it has room for there. Answers the header it took, if it has one.
pub fn corner_header(leaves: &mut [PlacedNode], block: &Block, side: f64) -> Option<TakenHeader> {
    let id = header_of(block);
    let at = leaves.iter().position(|leaf| leaf.id == id)?;
    let others: Vec<usize> = (0..leaves.len()).filter(|&index| index != at).collect();
    leaves[at].x = min(others.iter().map(|&index| leaves[index].x));
    let mut beside: Vec<usize> = others
        .iter()
        .copied()
        .filter(|&index| level(&leaves[index], &leaves[at]))
        .collect();
    beside.sort_by(|&one, &other| crate::ecma::order(leaves[one].x - leaves[other].x));
    let taken = widened(block, leaves, at, &others, &beside, side);
    let mut free = leaves[at].x + leaves[at].width + LANE;
    for index in beside {
        let leaf = &mut leaves[index];
        leaf.x = js_max(leaf.x, free);
        free = leaf.x + leaf.width + LANE;
    }
    Some(taken)
}

/// Give a block's header the widest size it has room for, now Graphviz has
/// said how wide what the block holds is: no wider than that, and left of
/// every leaf on its rank.
fn widened(
    block: &Block,
    leaves: &mut [PlacedNode],
    at: usize,
    others: &[usize],
    beside: &[usize],
    side: f64,
) -> TakenHeader {
    let least = block
        .header
        .as_ref()
        .expect("a block with a header leaf has a header");
    let x = leaves[at].x;
    let content = max(others
        .iter()
        .map(|&index| leaves[index].x + leaves[index].width))
        - x;
    let beside: Vec<f64> = beside
        .iter()
        .map(|&index| leaves[index].x - LANE - x)
        .collect();
    let taken = header_within(
        least,
        &Room {
            frame: content + 2.0 * side,
            content,
            beside: &beside,
        },
    );
    let header = &mut leaves[at];
    header.y += (header.height - taken.size.height) / 2.0;
    header.width = taken.size.width;
    header.height = taken.size.height;
    taken
}

/// Let a block's own top and bottom ports slide along its edge while it is
/// routed: Graphviz stands them beside the header, which may hold a port away
/// from its line, and a port may then move onto that line's column. A top
/// port keeps clear of the header. The root has no ports of its own.
pub fn let_ports_slide(scene: &mut Placement, block: &Block) {
    if block.kind == Kind::Root {
        return;
    }
    let (left, right) = extent_of(scene);
    let clear = block
        .header
        .as_ref()
        .map_or(left, |header| js_max(left, header.width + LANE));
    for (port, &side) in &block.ports {
        let Some(&item) = scene.cards.get(port) else {
            continue;
        };
        if matches!(side, Side::Left | Side::Right) {
            continue;
        }
        let low = if side == Side::Top { clear } else { left };
        scene.slides.insert(item, (low, js_max(low, right)));
    }
}

/// Mark the items of a block's scene that stand for group regions: a region
/// packed whole, and a card laid out as the region it is alone in, whose own
/// faces stand in from its box. A lane keeps a region's clearance off each.
pub fn mark_regions(scene: &mut Placement, block: &Block, tree: &BlockTree) {
    for item in &block.items {
        let card = scene.cards.get(item).copied();
        if let Some(lone) = tree.lone.get(item) {
            let card = card.expect("a card laid out as its region is on its block's scene");
            let width = scene.item(card).bx.width;
            scene.item_mut(card).inset = Some(side_room(width, lone));
        }
        let region = tree
            .block_of(item)
            .is_some_and(|inner| tree.get(inner).kind == Kind::Region);
        if tree.lone.contains_key(item) || region {
            scene
                .region_blocks
                .insert(card.expect("a region is on its block's scene"));
        }
    }
}

/// A pin as a block's scene reads it: a sliver as tall as its child block, at its port's x.
pub fn pinned_leaf(
    tree: &BlockTree,
    laid: &LaidMap,
    pin: &str,
    centres: &Map<String, Point>,
) -> PlacedNode {
    let held = &tree.pins[pin];
    let child = tree.get(held.block);
    let inner = &laid[child.id.as_str()];
    let at = inner.boxes[held.port.as_str()];
    let centre = centres[child.id.as_str()];
    let x = centre.x - inner.width / 2.0 + at.x + at.width / 2.0;
    let y = centre.y - inner.height / 2.0;
    PlacedNode {
        id: pin.to_owned(),
        x: x - PORT / 2.0,
        y,
        width: PORT,
        height: inner.height,
        children: None,
        frame: None,
    }
}

/// Every leaf under a block's placed nodes, those inside its frames included.
pub fn leaves_of(nodes: &mut [PlacedNode]) -> Vec<&mut PlacedNode> {
    let mut leaves = Vec::new();
    for node in nodes {
        if node.children.is_none() {
            leaves.push(node);
        } else if let Some(children) = &mut node.children {
            leaves.extend(leaves_of(children));
        }
    }
    leaves
}

/// Where a block routed again stands a pin or a block inside it: a pin where
/// its block's settled port now stands, and a block as large as it was routed
/// again, round the same centre; nothing for a leaf that stays where it is.
pub fn settled_leaf(
    tree: &BlockTree,
    laid: &LaidMap,
    id: &str,
    centres: &Map<String, Point>,
) -> Option<Rect> {
    if tree.pins.contains_key(id) {
        let pin = pinned_leaf(tree, laid, id, centres);
        return Some(Rect {
            x: pin.x,
            y: pin.y,
            width: pin.width,
            height: pin.height,
        });
    }
    let inner = if tree.is_block(id) {
        laid.get(id)?
    } else {
        return None;
    };
    let centre = centres[id];
    let (width, height) = (inner.width, inner.height);
    Some(Rect {
        x: centre.x - width / 2.0,
        y: centre.y - height / 2.0,
        width,
        height,
    })
}

/// Grow inline frames around children resized after their ports settle.
pub fn hold_resized_children(nodes: &mut [PlacedNode]) {
    for node in nodes {
        let Some(children) = node
            .children
            .as_mut()
            .filter(|children| !children.is_empty())
        else {
            continue;
        };
        hold_resized_children(children);
        let Some(row) = &node.frame else {
            continue;
        };
        let inset = CONTAINER_INSET + row.below.map_or(0.0, via_text);
        let low = js_min(node.x, min(children.iter().map(|child| child.x - inset)));
        let high = js_max(
            node.x + node.width,
            max(children.iter().map(|child| child.x + child.width + inset)),
        );
        node.x = low;
        node.width = high - low;
        let row = node.frame.as_mut().expect("a frame");
        row.title[0] = low;
        row.title[2] = node.width;
    }
}

/// The room a block of cards keeps where no line turns under its header, and
/// over its bottom ports when they stand on its edge: the inset it keeps at
/// its sides. Nothing when the block draws no edge.
pub fn rim_of(block: &Block, insets: Insets) -> Option<Rim> {
    block.header.as_ref()?;
    let own = insets.side;
    Some(Rim {
        head: own,
        foot: block.has_bottom_port().then_some(own),
    })
}
