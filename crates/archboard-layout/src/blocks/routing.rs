//! A placed block's lines routed on tracks (TASK-349), and read back into the
//! laid-out block: its boxes, bands, frames and regions, and its final size.

use crate::ecma::{js_max, max, min};
use crate::geometry::{Point, Rect};
use crate::placed::PlacedBlock;
use crate::track::containers::Edges;
use crate::track::route::{SceneLine, order_of, route_scene, trunk_kind};
use crate::track::scene::{Map, Placement, Set};
use crate::track::score::laps_of;
use crate::track::sides::fit_sides;

use super::laid::{Band, Insets, Laid};
use super::leaves::{let_ports_slide, mark_regions, rim_of};
use super::lone::frame_shape;
use super::tree::{Block, BlockId, BlockTree, Kind, Nesting};
use super::walls::{
    beside_points, beside_walls, channel_wall, enters_by, inner_points, labelled_out, mark_besides,
    wall_lines,
};

/// Route a placed block's lines on tracks and read it back.
pub(super) fn routed(
    tree: &BlockTree,
    id: BlockId,
    insets: Insets,
    placed: &PlacedBlock,
    held: f64,
) -> (Laid, f64) {
    let block = tree.get(id);
    let mut scene = Placement::new(placed);
    if block.kind == Kind::Frame {
        let id = super::tree::header_of(block);
        if let (Some(&item), Some(header)) = (scene.cards.get(&id), block.header.as_ref()) {
            let one = scene.item_mut(item);
            one.bx.x = block.lone.as_ref().map_or(0.0, super::lone::room_of) - insets.side;
            one.bx.width = header.painted(placed.header).width;
            one.face_top = block.lone.as_ref().map_or(0.0, super::lone::band_of)
                + crate::constants::HEADER_SLAB_INSET;
        }
    }
    let inline = tree.nesting != Nesting::Blocks;
    scene.edges_page = inline && block.kind == Kind::Root;
    scene.inline = inline;
    mark_regions(&mut scene, block, tree);
    if inline {
        let_ports_slide(&mut scene, block);
    }
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
    let mut routes = route_scene(
        &mut scene,
        &lines,
        insets.side,
        insets.top,
        rim_of(block, insets),
    );
    for (key, points) in beside_points(&scene, &beside, insets.side) {
        routes.insert(key, points);
    }
    let edges: Edges<'_> = placed
        .edges
        .iter()
        .map(|edge| (edge.id.as_str(), edge))
        .collect();
    let (mut laid, left) = read(block, insets, &scene, routes, &edges, held);
    laid.header = placed.header;
    (laid, left)
}

/// Cards, labels, and the physical header ports of a routed scene.
fn boxes_of(block: &Block, side: f64, scene: &Placement) -> Map<String, Rect> {
    let mut boxes: Map<String, Rect> = Map::default();
    for (id, &item) in &scene.cards {
        let mut at = scene.moved_id(item, side);
        if block.kind == Kind::Frame && block.ports.get(id) == Some(&crate::geometry::Side::Top) {
            let header = scene.cards[super::tree::header_of(block).as_str()];
            at.y = scene.moved_id(header, side).y
                + block.lone.as_ref().map_or(0.0, super::lone::band_of)
                + crate::constants::HEADER_SLAB_INSET
                - at.height / 2.0;
        }
        boxes.insert(id.clone(), at);
    }
    for (id, &item) in &scene.labels {
        boxes.insert(format!("label:{id}"), scene.moved_id(item, side));
    }
    boxes
}

/// Read the routed scene back into the laid-out block.
fn read(
    block: &Block,
    insets: Insets,
    scene: &Placement,
    lines: Map<String, Vec<Point>>,
    edges: &Edges<'_>,
    held: f64,
) -> (Laid, f64) {
    let Insets { side, bottom, .. } = insets;
    let mut boxes = boxes_of(block, side, scene);
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
    let (mut drawn, mut regions) = {
        let routes: Vec<&[Point]> = lines.values().map(Vec::as_slice).collect();
        fit_sides(scene, edges, &routes, side)
    };
    // The joined-line simplifier must see titles at their fitted frame,
    // exactly where the painter puts their words.
    for frame in &drawn {
        let title = scene.titles[frame.id.as_str()];
        let row = scene.moved_id(title, side);
        boxes.insert(
            format!("title:{}", frame.id),
            Rect {
                x: frame.bx.x,
                width: frame.bx.width,
                ..row
            },
        );
    }
    let mut walled = lines;
    let mut reach: Vec<Rect> = boxes.values().copied().collect();
    reach.extend(drawn.iter().map(|frame| frame.bx));
    reach.extend(regions.iter().map(|region| region.bx));
    let inside = inner_points(block, &walled);
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
    shift_left(&mut boxes, &mut walled, &mut drawn, &mut regions, left);
    let tracks = wall_lines(block, &mut walled, &mut boxes, width);
    let cards: Vec<Rect> = boxes.values().copied().collect();
    let laps = laps_of(walled.values().map(Vec::as_slice), &cards);
    let height = max(reach.iter().map(|one| one.y + one.height).chain(tracks)) + bottom;
    (
        Laid {
            laps: Some(laps),
            width,
            height,
            boxes,
            lines: walled,
            bands,
            frames: Some(
                drawn
                    .into_iter()
                    .map(|shape| {
                        let lone = block
                            .clusters
                            .get(&shape.id)
                            .and_then(|cluster| cluster.lone.as_ref());
                        frame_shape(shape, lone)
                    })
                    .collect(),
            ),
            regions: Some(regions),
            header: None,
            reroute: None,
        },
        left,
    )
}

/// Move every part of a routed block by the same amount.
fn shift_left(
    boxes: &mut Map<String, Rect>,
    walled: &mut Map<String, Vec<Point>>,
    drawn: &mut [crate::track::containers::FrameShape],
    regions: &mut [crate::track::containers::RegionShape],
    left: f64,
) {
    for bx in boxes.values_mut() {
        bx.x += left;
    }
    for point in walled.values_mut().flatten() {
        point.x += left;
    }
    for frame in drawn {
        frame.bx.x += left;
        if let Some(region) = &mut frame.region {
            region.x += left;
        }
    }
    for region in regions {
        region.bx.x += left;
        region.caption.x += left;
    }
}
