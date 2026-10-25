//! Which edge of each block a relationship crosses, chosen once the board is
//! laid out. The tree first sends every relationship out of the bottom of each
//! block around its source and into the top of each block around its target
//! (upward, the other way round). Where the two blocks it runs between in the
//! block that holds both ends stand beside each other, or the wrong way up,
//! the board is laid out again with the line leaving and entering every block
//! of its chain by the edges that face each other: the walls where the two
//! blocks stand further apart across than up and down, else the faces toward
//! each other. A region round one node stands its node taller, and turns no
//! line's faces.

use crate::ecma::js_max;
use crate::geometry::{Rect, Side};
use crate::track::scene::Map;

use super::laid::LaidMap;
use super::lone::grown_by;
use super::tree::{BlockId, BlockTree, Projection, exit_key};

/// The edges of each block a line's chain crosses, where its outermost blocks
/// do not stand the way its faces point, keyed by `exit_key` by the port it
/// would otherwise be.
pub(crate) fn sides_of(tree: &BlockTree, laid: &LaidMap) -> Map<String, Side> {
    let mut sides = Map::default();
    let back = tree.back_edges();
    for projection in &tree.projections {
        let upward = back.contains(&projection.edge.id);
        let Some((leaves, enters)) = facing_of(projection, laid, upward, tree) else {
            continue;
        };
        let (out_face, in_face) = if upward {
            (Side::Top, Side::Bottom)
        } else {
            (Side::Bottom, Side::Top)
        };
        let kind = tree.kind_of(&projection.edge);
        for &block in &projection.out {
            sides.insert(
                exit_key(
                    &tree.get(block).id,
                    "out",
                    out_face,
                    &format!("{}|{kind}", projection.to),
                ),
                leaves,
            );
        }
        for &block in &projection.into {
            sides.insert(
                exit_key(
                    &tree.get(block).id,
                    "in",
                    in_face,
                    &format!("{}|{kind}", projection.from),
                ),
                enters,
            );
        }
    }
    sides
}

/// The edges a line's two outermost blocks face each other by, when its faces do not.
fn facing_of(
    projection: &Projection,
    laid: &LaidMap,
    upward: bool,
    tree: &BlockTree,
) -> Option<(Side, Side)> {
    let (&leaves, &enters) = (projection.out.last()?, projection.into.last()?);
    let boxes = &laid.get(tree.get(projection.at).id.as_str())?.boxes;
    let one = *boxes.get(&tree.get(leaves).id)?;
    let other = *boxes.get(&tree.get(enters).id)?;
    let room = grown_in(tree, leaves) + grown_in(tree, enters);
    let stands = if upward {
        other.y + other.height <= one.y + room
    } else {
        other.y + room >= one.y + one.height
    };
    if stands {
        None
    } else {
        Some(sides_between(&one, &other))
    }
}

/// How much taller a block stands for the regions round one node it is or holds.
fn grown_in(tree: &BlockTree, block: BlockId) -> f64 {
    let own = tree.get(block).lone.as_ref().map_or(0.0, grown_by);
    tree.innermost_first(block).iter().fold(own, |sum, &inner| {
        sum + tree.get(inner).items.iter().fold(0.0, |more, item| {
            more + tree.lone.get(item).map_or(0.0, grown_by)
        })
    })
}

/// The edges two boxes face each other by: their walls where they stand
/// further apart across than up and down, else their tops and bottoms.
fn sides_between(one: &Rect, other: &Rect) -> (Side, Side) {
    let across = js_max(other.x - one.x - one.width, one.x - other.x - other.width);
    let down = js_max(other.y - one.y - one.height, one.y - other.y - other.height);
    if across >= down {
        return if other.x > one.x {
            (Side::Right, Side::Left)
        } else {
            (Side::Left, Side::Right)
        };
    }
    if other.y > one.y {
        (Side::Bottom, Side::Top)
    } else {
        (Side::Top, Side::Bottom)
    }
}
