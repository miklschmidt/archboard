//! A placed block's lines routed on tracks (TASK-349), and read back into the
//! laid-out block: its boxes, bands, frames and regions, and its final size.

use crate::ecma::max;
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
) -> Laid {
    let block = tree.get(id);
    let mut scene = Placement::new(placed);
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
    let mut laid = read(block, insets, &scene, routes, &edges, held);
    laid.header = placed.header;
    laid
}

/// Read the routed scene back into the laid-out block.
fn read(
    block: &Block,
    insets: Insets,
    scene: &Placement,
    lines: Map<String, Vec<Point>>,
    edges: &Edges<'_>,
    held: f64,
) -> Laid {
    let Insets { side, bottom, .. } = insets;
    let mut boxes: Map<String, Rect> = Map::default();
    for (id, &item) in &scene.cards {
        boxes.insert(id.clone(), scene.moved_id(item, side));
    }
    for (id, &item) in &scene.labels {
        boxes.insert(format!("label:{id}"), scene.moved_id(item, side));
    }
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
    let (drawn, regions) = {
        let routes: Vec<&[Point]> = lines.values().map(Vec::as_slice).collect();
        fit_sides(scene, edges, &routes, side)
    };
    let mut walled = lines;
    let mut reach: Vec<Rect> = boxes.values().copied().collect();
    reach.extend(drawn.iter().map(|frame| frame.bx));
    reach.extend(regions.iter().map(|region| region.bx));
    reach.extend(
        inner_points(block, &walled)
            .into_iter()
            .map(|Point { x, y }| Rect {
                x,
                y,
                width: 0.0,
                height: 0.0,
            }),
    );
    let header = block.header.as_ref().map_or(0.0, |header| header.width);
    let width = max([held, header]
        .into_iter()
        .chain(reach.iter().map(|one| one.x + one.width + side)));
    let tracks = wall_lines(block, &mut walled, &mut boxes, width);
    let cards: Vec<Rect> = boxes.values().copied().collect();
    let laps = laps_of(walled.values().map(Vec::as_slice), &cards);
    let height = max(reach.iter().map(|one| one.y + one.height).chain(tracks)) + bottom;
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
    }
}
