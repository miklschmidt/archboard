//! Two routes that end on one row, each turning toward the other's side,
//! cross inside their rounded corners, where no hop fits and neither can be
//! followed. Exchanging their lanes moves that crossing onto straight runs,
//! where the crossing pass hops it like any other.
//! A fan whose lanes stand in the wrong order is put in order first.

use std::collections::BTreeSet;

use archboard_scene::drawing::{ArchitectureDrawing, DrawingEdge, EdgeFacts, NodeFacts};
use archboard_scene::geometry::{
    EPSILON, Point, Rect, curve_through, inflate, path_of, vertices_of,
};

use crate::constants::{LABEL_CARD_CLEARANCE, LABEL_LABEL_CLEARANCE};
use crate::ecma::{js_max, js_min, sign};

use super::clearance::lacks_clearance;
use super::drawn_lines::{Axis, straight_axis};
use super::fans::order_fans;
use super::{LABEL_ROUTE_CLEARANCE, ROUTE_OBSTACLE_CLEARANCE};

/// The routes of a drawing.
type Edges = Vec<DrawingEdge<EdgeFacts>>;

/// A route's end: the row at its card, the lane off that row, and the run after the lane.
#[derive(Clone, Copy, Debug)]
pub(super) struct Leg {
    pub(super) edge_index: usize,
    /// Vertex indices of the port, the row's corner, the lane's far corner and the vertex beyond.
    pub(super) at: [usize; 4],
    /// The axis the row runs along.
    pub(super) axis: Axis,
    pub(super) port: Point,
    pub(super) corner: Point,
    pub(super) far: Point,
    pub(super) beyond: Point,
}

/// The routes one pair of lanes is exchanged in, beside the drawing's cards
/// and frames, which no exchange moves.
#[derive(Clone, Debug)]
pub(super) struct Scene<'a> {
    pub(super) drawing: &'a ArchitectureDrawing<NodeFacts, EdgeFacts>,
    pub(super) edges: Edges,
    /// Each route's vertices, or nothing for a route that is not its rounded vertices.
    pub(super) vertices: Vec<Option<Vec<Point>>>,
}

/// One straight piece of a route, named by its route and its lower vertex index.
#[derive(Clone, Copy, Debug)]
pub(super) struct Piece {
    pub(super) edge_index: usize,
    pub(super) index: usize,
    pub(super) from: Point,
    pub(super) to: Point,
}

/// What a route's ink or label comes closer to than routing and label
/// placement allow: a card or another route's label, by its index.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum Obstacle {
    Card(usize),
    Label(usize),
}

/// One crowded pair, for the route of the first index.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum Crowd {
    /// Its ink near an obstacle.
    Ink(usize, Obstacle),
    /// Its label near an obstacle.
    Label(usize, Obstacle),
    /// Its label near another route's ink.
    Route(usize, usize),
}

/// Whether a value lies strictly between two others, in either order.
pub(super) fn between(value: f64, a: f64, b: f64) -> bool {
    value > js_min(a, b) + EPSILON && value < js_max(a, b) - EPSILON
}

/// Whether a straight piece, or a box given by two corners, reaches into a box's interior.
pub(super) fn enters(bounds: Rect, from: Point, to: Point) -> bool {
    js_max(from.x, to.x) > bounds.x + EPSILON
        && js_min(from.x, to.x) < bounds.x + bounds.width - EPSILON
        && js_max(from.y, to.y) > bounds.y + EPSILON
        && js_min(from.y, to.y) < bounds.y + bounds.height - EPSILON
}

/// Whether one box reaches into another.
pub(super) fn meets(bounds: Rect, other: Rect) -> bool {
    enters(
        bounds,
        Point {
            x: other.x,
            y: other.y,
        },
        Point {
            x: other.x + other.width,
            y: other.y + other.height,
        },
    )
}

/// Both end legs of one route whose row, lane and following run alternate axes.
fn legs_of(points: &[Point], edge_index: usize) -> Vec<Leg> {
    if points.len() < 4 {
        return Vec::new();
    }
    let last = points.len() - 1;
    [[0, 1, 2, 3], [last, last - 1, last - 2, last - 3]]
        .into_iter()
        .filter_map(|at| {
            let [port, corner, far, beyond] = at.map(|index| points[index]);
            let axis = straight_axis(port, corner)?;
            (straight_axis(corner, far) == Some(axis.across())
                && straight_axis(far, beyond) == Some(axis))
            .then_some(Leg {
                edge_index,
                at,
                axis,
                port,
                corner,
                far,
                beyond,
            })
        })
        .collect()
}

/// The straight pieces of every route.
pub(super) fn pieces_of(vertices: &[Option<Vec<Point>>]) -> Vec<Piece> {
    let mut pieces = Vec::new();
    for (edge_index, points) in vertices.iter().enumerate() {
        let Some(points) = points else { continue };
        for (index, pair) in points.windows(2).enumerate() {
            pieces.push(Piece {
                edge_index,
                index,
                from: pair[0],
                to: pair[1],
            });
        }
    }
    pieces
}

/// The pieces a leg moves, by their lower vertex index: its row, its lane and
/// the run after the lane.
fn moving_pieces(leg: &Leg) -> [usize; 3] {
    [0, 1, 2].map(|index| leg.at[index + 1].min(leg.at[index]))
}

/// Whether a label sits on a leg's lane, so it moves with it.
fn rides_lane(label: Rect, leg: &Leg) -> bool {
    enters(label, leg.corner, leg.far)
}

/// Something ink and a label must each keep their distance from.
#[derive(Clone, Copy, Debug)]
struct Kept {
    id: Obstacle,
    /// The route it belongs to, for a label.
    edge_index: Option<usize>,
    bounds: Rect,
    /// How far a route's ink keeps from it.
    ink: f64,
    /// How far a label keeps from it.
    label: f64,
}

/// Cards and labels, which ink and labels keep their distance from.
fn obstacles_of(scene: &Scene<'_>) -> Vec<Kept> {
    let cards = scene
        .drawing
        .cards
        .iter()
        .enumerate()
        .map(|(index, card)| Kept {
            id: Obstacle::Card(index),
            edge_index: None,
            bounds: card.bounds,
            ink: ROUTE_OBSTACLE_CLEARANCE,
            label: LABEL_CARD_CLEARANCE,
        });
    let labels = scene.edges.iter().enumerate().filter_map(|(index, edge)| {
        edge.label.as_ref().map(|label| Kept {
            id: Obstacle::Label(index),
            edge_index: Some(index),
            bounds: label.bounds,
            ink: LABEL_ROUTE_CLEARANCE,
            label: LABEL_LABEL_CLEARANCE,
        })
    });
    cards.chain(labels).collect()
}

/// What one route's ink and label are closer to than routing and label
/// placement allow, added to `crowds`.
fn crowds_of(
    scene: &Scene<'_>,
    pieces: &[Piece],
    obstacles: &[Kept],
    edge_index: usize,
    crowds: &mut BTreeSet<Crowd>,
) {
    let others: Vec<&Kept> = obstacles
        .iter()
        .filter(|obstacle| obstacle.edge_index != Some(edge_index))
        .collect();
    let ink: Vec<&Piece> = pieces
        .iter()
        .filter(|piece| piece.edge_index == edge_index)
        .collect();
    crowds.extend(
        others
            .iter()
            .filter(|obstacle| {
                let near = inflate(obstacle.bounds, obstacle.ink);
                ink.iter().any(|piece| enters(near, piece.from, piece.to))
            })
            .map(|obstacle| Crowd::Ink(edge_index, obstacle.id)),
    );
    let Some(label) = scene.edges[edge_index].label.as_ref() else {
        return;
    };
    let label = label.bounds;
    crowds.extend(
        others
            .iter()
            .filter(|obstacle| meets(inflate(label, obstacle.label), obstacle.bounds))
            .map(|obstacle| Crowd::Label(edge_index, obstacle.id)),
    );
    crowds.extend(
        pieces
            .iter()
            .filter(|piece| {
                piece.edge_index != edge_index
                    && enters(inflate(label, LABEL_ROUTE_CLEARANCE), piece.from, piece.to)
            })
            .map(|piece| Crowd::Route(edge_index, piece.edge_index)),
    );
}

/// Everything the given routes and their labels are closer to than routing
/// and label placement allow.
fn crowding(scene: &Scene<'_>, moving: &[usize]) -> BTreeSet<Crowd> {
    let pieces = pieces_of(&scene.vertices);
    let obstacles = obstacles_of(scene);
    let mut crowds = BTreeSet::new();
    for &edge_index in moving {
        crowds_of(scene, &pieces, &obstacles, edge_index, &mut crowds);
    }
    crowds
}

/// Whether routes of one kind share a trunk at a common endpoint on purpose,
/// so an apparent contact between them is intended.
pub(super) fn shared_trunk(a: &EdgeFacts, b: &EdgeFacts) -> bool {
    a.kind == b.kind
        && [&a.from, &a.to]
            .into_iter()
            .any(|id| *id == b.from || *id == b.to)
}

/// Whether two legs on one axis fold one crossing into their corners: their
/// rows lie on one line, each runs from its corner past the other's corner,
/// and their far runs lie on separate lines, so exchanging the lanes leaves
/// no overlap.
fn opposed(one: &Leg, other: &Leg) -> bool {
    let axis = one.axis;
    let row = axis.across();
    (row.of(one.corner) - row.of(other.corner)).abs() < EPSILON
        && between(
            axis.of(other.corner),
            axis.of(one.corner),
            axis.of(one.port),
        )
        && between(
            axis.of(one.corner),
            axis.of(other.corner),
            axis.of(other.port),
        )
        && (row.of(one.far) - row.of(other.far)).abs() >= EPSILON
}

/// Whether the lane exchange applies to two legs: they fold a crossing
/// between unrelated routes.
fn folded(scene: &Scene<'_>, one: &Leg, other: &Leg) -> bool {
    if one.edge_index == other.edge_index || one.axis != other.axis {
        return false;
    }
    opposed(one, other)
        && !shared_trunk(
            &scene.edges[one.edge_index].edge,
            &scene.edges[other.edge_index].edge,
        )
}

/// A box between two coordinates along a row's axis and two across it.
pub(super) fn box_on(axis: Axis, low: f64, high: f64, top: f64, bottom: f64) -> Rect {
    match axis {
        Axis::X => Rect {
            x: low,
            y: top,
            width: high - low,
            height: bottom - top,
        },
        Axis::Y => Rect {
            x: top,
            y: low,
            width: bottom - top,
            height: high - low,
        },
    }
}

/// The area both lanes and their far runs move within: between the two
/// lanes, from the row to the farther far run.
fn swept_by(legs: [&Leg; 2]) -> Rect {
    let axis = legs[0].axis;
    let row = axis.across();
    let lanes = legs.map(|leg| axis.of(leg.corner));
    let rows = [
        row.of(legs[0].corner),
        row.of(legs[0].far),
        row.of(legs[1].corner),
        row.of(legs[1].far),
    ];
    let min = |values: &[f64]| values.iter().copied().fold(f64::INFINITY, js_min);
    let max = |values: &[f64]| values.iter().copied().fold(f64::NEG_INFINITY, js_max);
    box_on(axis, min(&lanes), max(&lanes), min(&rows), max(&rows))
}

/// The four sides of a frame.
fn borders(bounds: Rect) -> [(Point, Point); 4] {
    let corners = [
        Point {
            x: bounds.x,
            y: bounds.y,
        },
        Point {
            x: bounds.x + bounds.width,
            y: bounds.y,
        },
        Point {
            x: bounds.x + bounds.width,
            y: bounds.y + bounds.height,
        },
        Point {
            x: bounds.x,
            y: bounds.y + bounds.height,
        },
    ];
    [0, 1, 2, 3].map(|index| (corners[index], corners[(index + 1) % 4]))
}

/// Whether anything but the two legs and the labels on their lanes is in the
/// swept area: a card, a frame's border, another label or another route.
/// Frames may hold the area whole.
fn occupied(scene: &Scene<'_>, legs: [&Leg; 2]) -> bool {
    let swept = swept_by(legs);
    if scene
        .drawing
        .cards
        .iter()
        .any(|card| meets(swept, card.bounds))
    {
        return true;
    }
    let label_there = scene.edges.iter().enumerate().any(|(edge_index, edge)| {
        edge.label.as_ref().is_some_and(|label| {
            let rides = legs
                .iter()
                .find(|leg| leg.edge_index == edge_index)
                .is_some_and(|leg| rides_lane(label.bounds, leg));
            !rides && meets(swept, label.bounds)
        })
    });
    if label_there {
        return true;
    }
    let border_there = scene
        .drawing
        .containers
        .iter()
        .flat_map(|container| borders(container.bounds))
        .any(|(from, to)| enters(swept, from, to));
    border_there
        || pieces_of(&scene.vertices).into_iter().any(|piece| {
            let moves = legs.iter().any(|leg| {
                leg.edge_index == piece.edge_index && moving_pieces(leg).contains(&piece.index)
            });
            !moves && enters(swept, piece.from, piece.to)
        })
}

/// A route redrawn through new vertices, and those vertices.
pub(super) struct Moved {
    pub(super) edge: DrawingEdge<EdgeFacts>,
    pub(super) points: Vec<Point>,
}

/// Redraw one leg's route with its lane at another coordinate along its row,
/// taking a label that rides the lane along; nothing when the route would not
/// be sound or the run after the lane would turn back.
pub(super) fn moved_lane(scene: &Scene<'_>, leg: &Leg, to: f64) -> Option<Moved> {
    let axis = leg.axis;
    let shift = to - axis.of(leg.far);
    if sign(to - axis.of(leg.beyond)) != sign(axis.of(leg.far) - axis.of(leg.beyond)) {
        return None;
    }
    let points: Vec<Point> = scene.vertices[leg.edge_index]
        .as_ref()?
        .iter()
        .enumerate()
        .map(|(index, &point)| {
            if index == leg.at[1] || index == leg.at[2] {
                axis.with(point, to)
            } else {
                point
            }
        })
        .collect();
    let mut edge = scene.edges[leg.edge_index].clone();
    if let Some(label) = edge.label.as_mut()
        && rides_lane(label.bounds, leg)
    {
        label.bounds = match axis {
            Axis::X => Rect {
                x: label.bounds.x + shift,
                ..label.bounds
            },
            Axis::Y => Rect {
                y: label.bounds.y + shift,
                ..label.bounds
            },
        };
    }
    let curve = curve_through(&points, false);
    if lacks_clearance(&curve, edge.label.as_ref().map(|label| label.bounds)) {
        return None;
    }
    edge.path = path_of(&curve);
    edge.curve = curve;
    Some(Moved { edge, points })
}

/// Whether every crowded pair after a move was crowded before it: the moved
/// ink and any label riding it come no closer to anything new.
pub(super) fn no_closer(before: &Scene<'_>, after: &Scene<'_>, moving: &[usize]) -> bool {
    crowding(after, moving).is_subset(&crowding(before, moving))
}

/// Exchange two legs' lanes when the rule applies and the result is sound.
fn exchange<'a>(scene: &Scene<'a>, legs: [&Leg; 2]) -> Option<Scene<'a>> {
    if !folded(scene, legs[0], legs[1]) || occupied(scene, legs) {
        return None;
    }
    let mut after = scene.clone();
    for (side, leg) in legs.into_iter().enumerate() {
        let moved = moved_lane(scene, leg, leg.axis.of(legs[1 - side].corner))?;
        after.edges[leg.edge_index] = moved.edge;
        after.vertices[leg.edge_index] = Some(moved.points);
    }
    let moving = legs.map(|leg| leg.edge_index);
    no_closer(scene, &after, &moving).then_some(after)
}

/// Exchanges the lanes of route pairs whose rows fold a crossing into their
/// corners (`unfoldCrossings`), after putting crossed fans in order. Cards and
/// every other route keep their geometry; a label on a moved lane moves with
/// it. Only a route that is exactly its rounded vertices is redrawn.
pub fn unfold_crossings(
    drawing: &ArchitectureDrawing<NodeFacts, EdgeFacts>,
) -> ArchitectureDrawing<NodeFacts, EdgeFacts> {
    let vertices: Vec<Option<Vec<Point>>> = drawing
        .edges
        .iter()
        .map(|edge| {
            let points = vertices_of(&edge.curve);
            (path_of(&curve_through(&points, false)) == path_of(&edge.curve)).then_some(points)
        })
        .collect();
    let legs: Vec<Leg> = vertices
        .iter()
        .enumerate()
        .flat_map(|(edge_index, points)| {
            points
                .as_ref()
                .map_or_else(Vec::new, |points| legs_of(points, edge_index))
        })
        .collect();
    let mut moved = BTreeSet::new();
    let start = Scene {
        drawing,
        edges: drawing.edges.clone(),
        vertices,
    };
    let mut scene = order_fans(start, &legs, &mut moved);
    for (index, one) in legs.iter().enumerate() {
        for other in &legs[index + 1..] {
            if moved.contains(&one.edge_index) || moved.contains(&other.edge_index) {
                continue;
            }
            let Some(next) = exchange(&scene, [one, other]) else {
                continue;
            };
            scene = next;
            moved.insert(one.edge_index);
            moved.insert(other.edge_index);
        }
    }
    ArchitectureDrawing {
        edges: scene.edges,
        ..drawing.clone()
    }
}
