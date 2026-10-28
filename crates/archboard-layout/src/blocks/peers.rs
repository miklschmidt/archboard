//! An exclusive loose collaborator shares its caller's physical port level.

use crate::geometry::{Point, Side};
use crate::track::scene::{Item, ItemId, Map, Placement};

use super::laid::LaidMap;
use super::tree::{Block, BlockTree, Line};

/// The source's actual face, including a port inside an opaque parent.
fn source(
    scene: &Placement,
    tree: &BlockTree,
    laid: &LaidMap,
    line: &Line,
    left: f64,
) -> Option<Point> {
    let pin = tree.pins.get(&line.from)?;
    let block = tree.get(pin.block);
    let inner = &laid[block.id.as_str()];
    let port = inner.boxes[pin.port.as_str()];
    let at = scene.moved_id(*scene.cards.get(&block.id)?, left);
    if !matches!(block.ports[pin.port.as_str()], Side::Left | Side::Right) {
        return None;
    }
    Some(Point {
        x: at.x + port.x + port.width / 2.0,
        y: at.y + port.y + port.height / 2.0,
    })
}

fn row_positions(
    tree: &BlockTree,
    block: &Block,
    laid: &LaidMap,
    line: &Line,
    centres: &Map<String, Point>,
) -> Option<[(String, f64); 2]> {
    let (owner, parent) = tree.peer_of(line.edge.target())?;
    (tree.get(owner).id == block.id).then_some(())?;
    let pin = tree.pins.get(&line.from)?;
    let inner = &laid[&parent];
    let port = inner.boxes[&pin.port];
    let before = port.x + port.width / 2.0 < inner.width / 2.0;
    let source = centres[&parent];
    let target = centres[line.edge.target()];
    if before == (target.x < source.x) {
        return None;
    }
    let width = tree.cards[line.edge.target()].width + room(tree, line.edge.target());
    let gap = (source.x - target.x).abs() - f64::midpoint(inner.width, width);
    let low = (source.x - inner.width / 2.0).min(target.x - width / 2.0);
    let (sx, tx) = if before {
        (low + width + gap + inner.width / 2.0, low + width / 2.0)
    } else {
        (
            low + inner.width / 2.0,
            low + inner.width + gap + width / 2.0,
        )
    };
    Some([(parent, sx), (line.edge.target().to_owned(), tx)])
}

/// Keep the peer on the side nearest the caller's internal column.
pub(super) fn arrange(
    tree: &BlockTree,
    block: &Block,
    laid: &LaidMap,
    centres: &mut Map<String, Point>,
    boxes: &mut Map<String, crate::geometry::Rect>,
) {
    let rows: Vec<_> = block
        .lines
        .values()
        .filter(|line| {
            tree.peer_of(line.edge.target())
                .is_some_and(|(owner, _)| tree.get(owner).id == block.id)
        })
        .collect();
    let positions: Vec<_> = rows
        .iter()
        .filter_map(|line| row_positions(tree, block, laid, line, centres))
        .flatten()
        .collect();
    for (id, x) in positions {
        centres.get_mut(&id).expect("a row member").x = x;
        if let Some(bx) = boxes.get_mut(&id) {
            bx.x = x - bx.width / 2.0;
        }
    }
    for line in rows.into_iter().filter(|line| line.labelled) {
        centres.insert(
            format!("label:{}", line.edge.id),
            centres[line.edge.target()],
        );
    }
}

/// The collaborator and its words occupy one measured box in the rank graph.
pub(super) fn room(tree: &BlockTree, id: &str) -> f64 {
    if tree.peer_of(id).is_none() {
        return 0.0;
    }
    tree.projections
        .iter()
        .find(|projection| projection.edge.target() == id)
        .and_then(|projection| projection.edge.label())
        .map_or(0.0, |label| {
            label.width.unwrap_or(0.0) + 2.0 * crate::track::chains::LANE
        })
}

/// Keep the peer and its words at the source port, within their common row.
fn prepare(tree: &BlockTree, block: &Block, laid: &LaidMap, scene: &mut Placement) -> Vec<String> {
    let mut peers = Vec::new();
    for line in block.lines.values() {
        if tree.peer_of(line.edge.target()).is_none() || line.to != line.edge.target() {
            continue;
        }
        // Bands have not moved yet. Their common top becomes their new top.
        let Some(mut at) = source(scene, tree, laid, line, 0.0) else {
            continue;
        };
        let card = scene.cards[&line.to];
        let band = scene.item(card).band;
        at.y += scene.bands[band].top - scene.bands[band].new_top;
        let shift = room(tree, &line.to) / 2.0;
        scene.item_mut(card).bx.x += if scene.item(card).bx.x > at.x {
            shift
        } else {
            -shift
        };
        let width = scene.item(card).bx.width;
        let target_x = scene.item(card).bx.x;
        let end_x = if target_x > at.x {
            target_x
        } else {
            target_x + width
        };
        scene.item_mut(card).bx.y = at.y - scene.item(card).bx.height / 2.0;
        if let Some(&label) = scene.labels.get(&line.key) {
            let bx = scene.item(label).bx;
            scene.item_mut(label).bx.x = (at.x + end_x - bx.width) / 2.0;
            scene.item_mut(label).bx.y = at.y - bx.height / 2.0;
        }
        scene
            .besides
            .entry(band)
            .or_default()
            .push((at.x.min(end_x), at.x.max(end_x)));
        peers.push(line.key.clone());
    }
    peers
}

/// A peer's short horizontal route after the common row moves.
fn points(
    tree: &BlockTree,
    block: &Block,
    laid: &LaidMap,
    scene: &Placement,
    key: &str,
    left: f64,
) -> Option<Vec<Point>> {
    let line = &block.lines[key];
    let at = source(scene, tree, laid, line, left)?;
    let card = scene.moved_id(scene.cards[&line.to], left);
    let x = if card.x > at.x {
        card.x
    } else {
        card.x + card.width
    };
    Some(vec![at, Point { x, y: at.y }])
}

/// Labels on these horizontal routes stay outside the between-row track pass.
#[derive(Default)]
pub(super) struct Peers {
    pub keys: Vec<String>,
    labels: Vec<(String, ItemId)>,
    cards: Vec<(ItemId, Item)>,
}

impl Peers {
    pub(super) fn new(
        tree: &BlockTree,
        block: &Block,
        laid: &LaidMap,
        scene: &mut Placement,
    ) -> Self {
        let keys = prepare(tree, block, laid, scene);
        let mut cards = Vec::new();
        for key in &keys {
            let Some(&label) = scene.labels.get(key) else {
                continue;
            };
            let card = scene.cards[&block.lines[key].to];
            let original = *scene.item(card);
            cards.push((card, original));
            let words = scene.item(label).bx;
            let body = original.bx;
            let low = body.x.min(words.x);
            scene.item_mut(card).bx.x = low;
            scene.item_mut(card).bx.width = (body.x + body.width).max(words.x + words.width) - low;
            scene.item_mut(card).inset = None;
        }
        let labels = keys
            .iter()
            .filter_map(|key| scene.labels.shift_remove_entry(key))
            .collect();
        Self {
            keys,
            labels,
            cards,
        }
    }

    pub(super) fn finish(
        self,
        tree: &BlockTree,
        block: &Block,
        laid: &LaidMap,
        scene: &mut Placement,
        routes: &mut Map<String, Vec<Point>>,
        left: f64,
    ) {
        for (card, original) in self.cards {
            *scene.item_mut(card) = original;
        }
        scene.labels.extend(self.labels);
        for key in self.keys {
            if let Some(points) = points(tree, block, laid, scene, &key, left) {
                routes.insert(key, points);
            }
        }
    }
}
