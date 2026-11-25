//! A placed block's lines routed on tracks (TASK-349), and read back into the
//! laid-out block: its boxes and bands, and its final size.

use archboard_scene::paint::design::tab_width;

use crate::ecma::{js_max, max, min};
use crate::geometry::{Point, Rect};
use crate::lanes::route::{SceneLine, order_of, route_scene, trunk_kind};
use crate::lanes::scene::{ItemId, Map, Placement, Set};
use crate::lanes::score::laps_of;
use crate::placed::PlacedBlock;

use super::laid::{Band, Insets, Laid};
use super::leaves::{mark_regions, rim_of};
use super::tree::{Block, BlockId, BlockTree, Kind};
use super::walls::{
    beside_points, beside_walls, channel_wall, enters_by, inner_points, labelled_out, mark_besides,
    wall_lines,
};

/// What a routing of a placed block keeps of an earlier one.
pub(super) enum Settling<'a> {
    /// The first routing of a placement: a crowded card stops it.
    First,
    /// A routing that stands: the width the block keeps at least, and its settled ports.
    Again {
        held: f64,
        ports: &'a Map<String, f64>,
    },
}

impl<'a> Settling<'a> {
    /// The width and the ports this routing keeps, with `none` for the ports of a first one.
    fn kept(&self, none: &'a Map<String, f64>) -> (f64, &'a Map<String, f64>) {
        match self {
            Settling::First => (0.0, none),
            Settling::Again { held, ports } => (*held, ports),
        }
    }
}

/// Route a placed block's lines on tracks and read it back. A first routing
/// answers the widths its crowded cards need instead, by card.
pub(super) fn routed(
    tree: &BlockTree,
    id: BlockId,
    insets: Insets,
    placed: &PlacedBlock,
    settling: &Settling<'_>,
) -> Result<(Laid, f64), Map<String, f64>> {
    let block = tree.get(id);
    let mut scene = Placement::new(placed);
    if block.kind == Kind::Frame {
        let id = super::tree::header_of(block);
        if let (Some(&item), Some(header)) = (scene.cards.get(&id), block.header.as_ref()) {
            let one = scene.item_mut(item);
            one.bx.x = block.lone.as_ref().map_or(0.0, super::lone::room_of) - insets.side;
            one.bx.width = tab_width(header.painted(placed.header).width);
            one.inset = Some(0.0);
            one.face_top = block.lone.as_ref().map_or(0.0, super::lone::band_of);
        }
    }
    mark_regions(&mut scene, block, tree);
    let beside = beside_walls(block, tree, &scene);
    let straight: Set<&str> = beside.iter().map(|one| one.key.as_str()).collect();
    mark_besides(&mut scene, &beside);
    let lines: Vec<SceneLine<'_>> = placed
        .edges
        .iter()
        .filter(|edge| !straight.contains(edge.id.as_str()))
        .map(|edge| {
            let line = &block.lines[edge.id.as_str()];
            SceneLine {
                id: edge.id.clone(),
                order: order_of(edge),
                kind: trunk_kind(&edge.edge).into(),
                placed: edge,
                wall: channel_wall(block, line),
                enters: enters_by(block, line),
                leaves: labelled_out(block, line),
            }
        })
        .collect();
    let reserve = matches!(settling, Settling::First);
    let rim = rim_of(block, insets);
    let mut routes = route_scene(
        &mut scene,
        &lines,
        (insets.side, insets.top),
        rim,
        (reserve, tree.lanes),
    )
    .map_err(|widths| by_card(&scene, &widths))?;
    for (key, points) in beside_points(&scene, &beside, insets.side) {
        routes.insert(key, points);
    }
    let settled = Map::default();
    let (held, ports) = settling.kept(&settled);
    let (mut laid, left) = read(block, insets, &scene, routes, (held, tree.lanes));
    laid.header = placed.header;
    super::headers::place_header_entries(block, &mut laid, ports);
    Ok((laid, left))
}

/// Each crowded card's width, by the card's name.
fn by_card(scene: &Placement, widths: &Map<ItemId, f64>) -> Map<String, f64> {
    scene
        .cards
        .iter()
        .filter_map(|(name, item)| Some((name.clone(), *widths.get(item)?)))
        .collect()
}

/// Cards, labels, and the physical header ports of a routed scene.
fn boxes_of(side: f64, scene: &Placement) -> Map<String, Rect> {
    let mut boxes: Map<String, Rect> = Map::default();
    for (id, &item) in &scene.cards {
        let at = scene.moved_id(item, side);
        boxes.insert(id.clone(), at);
    }
    for (id, &item) in &scene.labels {
        boxes.insert(format!("label:{id}"), scene.moved_id(item, side));
    }
    boxes
}

/// Read the routed scene back into the laid-out block, at least as wide as it is held, and, in a
/// Lanes drawing, a picture wide and tall enough for every point its lines draw: a lane round the
/// outside of its outermost card stands on the page.
fn read(
    block: &Block,
    insets: Insets,
    scene: &Placement,
    lines: Map<String, Vec<Point>>,
    (held, lanes): (f64, bool),
) -> (Laid, f64) {
    let Insets { side, bottom, .. } = insets;
    let mut boxes = boxes_of(side, scene);
    let bands: Vec<Band> = scene
        .bands
        .iter()
        .enumerate()
        .map(|(index, band)| Band {
            top: band.new_top,
            bottom: band.new_top + band.bottom - band.top,
            items: block
                .items
                .iter()
                .filter(|item| {
                    scene
                        .cards
                        .get(item.as_str())
                        .is_some_and(|&card| scene.item(card).band == index)
                })
                .cloned()
                .collect(),
        })
        .collect();
    let mut walled = lines;
    let mut reach: Vec<Rect> = boxes.values().copied().collect();
    let inside = if lanes && block.kind == Kind::Root {
        walled.values().flatten().copied().collect()
    } else {
        inner_points(block, &walled)
    };
    let left = js_max(0.0, side - min(inside.iter().map(|point| point.x)));
    reach.extend(inside.into_iter().map(|Point { x, y }| Rect {
        x,
        y,
        width: 0.0,
        height: 0.0,
    }));
    let header = block.header.as_ref().map_or(0.0, |header| header.width);
    let width = max([
        held,
        header + left,
        block.port_width(header + left) + 2.0 * side,
    ]
    .into_iter()
    .chain(reach.iter().map(|one| one.x + one.width + side + left)));
    // A routed lane can stand left of its Graphviz placement. Keep it inside
    // the block that its parent treats as one obstacle, with the same inset.
    shift_left(&mut boxes, &mut walled, left);
    let tracks = wall_lines(block, &mut walled, &mut boxes, width);
    let cards: Vec<Rect> = boxes.values().copied().collect();
    let laps = laps_of(walled.values().map(Vec::as_slice), &cards);
    let height = max(reach.iter().map(|one| one.y + one.height).chain(tracks)) + bottom;
    (
        Laid {
            laps: Some(laps),
            port_widths: Map::default(),
            width,
            height,
            boxes,
            lines: walled,
            bands,
            header: None,
            reroute: None,
        },
        left,
    )
}

/// Move every part of a routed block by the same amount.
fn shift_left(boxes: &mut Map<String, Rect>, walled: &mut Map<String, Vec<Point>>, left: f64) {
    for bx in boxes.values_mut() {
        bx.x += left;
    }
    for point in walled.values_mut().flatten() {
        point.x += left;
    }
}
