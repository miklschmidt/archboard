//! The drawing a solve's geometry describes: every card and container at its
//! box, and every relationship along its route with its label.

use std::collections::BTreeMap;

use archboard_scene::drawing::{
    ArchitectureDrawing, DrawingEdge, DrawingNode, EdgeFacts, NodeFacts, PlacedLabel,
    ReadingDirection,
};
use archboard_scene::geometry::{Curve, Point, Rect, curve_through};

use super::choosing::Placed;
use super::content::Content;
use super::measured::Measured;
use crate::constants::{FAN, STRAND, fan_jog_depth, fans_at_bend};
use crate::ecma;

/// How far a part's loop to itself reaches out of its side.
const SELF_LOOP_REACH: f64 = 26.0;

/// A loop off a part's right face, for a relationship from a part to itself:
/// out square, down, and square back in, rounded like every other route.
fn self_loop(bounds: Rect) -> Curve {
    let x = bounds.x + bounds.width;
    let top = Point {
        x,
        y: bounds.y + bounds.height / 3.0,
    };
    let bottom = Point {
        x,
        y: bounds.y + (bounds.height * 2.0) / 3.0,
    };
    curve_through(
        &[
            top,
            Point {
                x: top.x + SELF_LOOP_REACH,
                y: top.y,
            },
            Point {
                x: bottom.x + SELF_LOOP_REACH,
                y: bottom.y,
            },
            bottom,
        ],
        false,
    )
}

/// A route moved to the left of its way, each run square to itself by as much as `by` gives for
/// it, as a strand of a cable stands beside the cable's route: each corner moves along both of
/// its runs, by each run's own amount.
fn beside(points: &[Point], by: impl Fn(usize) -> f64) -> Vec<Point> {
    let normal = |a: Point, b: Point| {
        let length = (b.x - a.x).hypot(b.y - a.y);
        if length == 0.0 {
            return Point { x: 0.0, y: 0.0 };
        }
        Point {
            x: (a.y - b.y) / length,
            y: (b.x - a.x) / length,
        }
    };
    let last = points.len().saturating_sub(1);
    let moved = |run: usize| {
        let along = normal(points[run], points[run + 1]);
        let by = by(run);
        Point {
            x: along.x * by,
            y: along.y * by,
        }
    };
    (points.iter().enumerate())
        .map(|(at, &point)| {
            let before = (at > 0).then(|| (normal(points[at - 1], point), moved(at - 1)));
            let after = (at < last).then(|| (normal(point, points[at + 1]), moved(at)));
            let shift = match (before, after) {
                (Some((one, _)), Some((other, shift))) if one == other => shift,
                (Some((_, one)), Some((_, other))) => Point {
                    x: one.x + other.x,
                    y: one.y + other.y,
                },
                (Some((_, one)), None) | (None, Some((_, one))) => one,
                (None, None) => Point { x: 0.0, y: 0.0 },
            };
            Point {
                x: point.x + shift.x,
                y: point.y + shift.y,
            }
        })
        .collect()
}

/// A strand of a cable, `place` strands to the left of the cable's middle among `count`: half a lane
/// from the next along the cable's body, where the strands run as one ribbon, and a lane from the
/// next where they reach a card, so that each strand's mark lands on a port of its own. An end run
/// short enough fans out whole, its strands spreading at the bend before it
/// (`constants::fans_at_bend`). On a longer one the strands step out at the card's
/// apron: each outer strand jogs to its port, the outermost furthest from the card, so that no
/// strand crosses another and each keeps a straight approach to its mark.
fn strand(points: &[Point], place: f64, count: usize) -> Vec<Point> {
    let runs = points.len() - 1;
    let gaps = (count - 1) as f64;
    let (half, reach) = (gaps * STRAND / 2.0, gaps * FAN / 2.0);
    let [first_spreads, last_spreads] = fans_at_bend(points, (half, reach));
    let fans = |run: usize| (run == 0 && first_spreads) || (run + 1 == runs && last_spreads);
    let mut moved = beside(points, |run| place * if fans(run) { FAN } else { STRAND });
    if place == 0.0 || runs == 1 {
        return moved;
    }
    // How far from its card a strand steps out to its port: the further out it stands, the further
    // from the card, a strand's pitch apart.
    let depth = fan_jog_depth(place.abs() * STRAND);
    let step = place * (FAN - STRAND);
    // A strand's end run, from its end on the card to its corner, stepped out to its port
    // with a jog at its depth.
    let out = |(end, corner): (Point, Point), (from, to): (Point, Point)| -> Vec<Point> {
        let run = length(from, to);
        let aside = |point: Point| Point {
            x: point.x + (from.y - to.y) / run * step,
            y: point.y + (to.x - from.x) / run * step,
        };
        let own = length(end, corner);
        let body = Point {
            x: end.x + (corner.x - end.x) * depth / own,
            y: end.y + (corner.y - end.y) * depth / own,
        };
        vec![aside(end), aside(body), body, corner]
    };
    if !fans(runs - 1) {
        let last = moved.len() - 1;
        let mut stepped = out(
            (moved[last], moved[last - 1]),
            (points[runs - 1], points[runs]),
        );
        stepped.reverse();
        moved.splice(last - 1.., stepped);
    }
    if !fans(0) {
        let stepped = out((moved[0], moved[1]), (points[0], points[1]));
        moved.splice(..2, stepped);
    }
    moved
}

/// How far apart two points are along a run.
fn length(a: Point, b: Point) -> f64 {
    (b.x - a.x).abs() + (b.y - a.y).abs()
}

/// Each relationship's place in its cable, by id: its strand, counted from the cable's left in
/// the picture's order, and how many strands the cable holds.
fn strands(
    content: &Content,
    riders: &BTreeMap<String, String>,
) -> BTreeMap<String, (usize, usize)> {
    let mut cables: BTreeMap<&str, Vec<&super::content::Edge>> = BTreeMap::new();
    for edge in ecma::sorted_by(&content.edges.iter().collect::<Vec<_>>(), |one, other| {
        one.order - other.order
    }) {
        let leader = riders.get(&edge.id).unwrap_or(&edge.id);
        cables.entry(leader.as_str()).or_default().push(edge);
    }
    (cables.into_values())
        .filter(|members| members.len() > 1)
        .flat_map(|members| {
            let count = members.len();
            (members.into_iter().enumerate()).map(move |(at, edge)| (edge.id.clone(), (at, count)))
        })
        .collect()
}

/// Every relationship along its route, in the picture's order. A rider runs beside the route of
/// the relationship it rides with, a strand of their cable, and wears no words.
fn edges_of(
    content: &Content,
    measured: &Measured,
    placed: &Placed,
    (boxes, riders): (&BTreeMap<&str, Rect>, &BTreeMap<String, String>),
) -> Vec<DrawingEdge<EdgeFacts>> {
    let routes: BTreeMap<&str, _> = placed
        .edges
        .iter()
        .map(|edge| (edge.id.as_str(), edge))
        .collect();
    let strands = strands(content, riders);
    ecma::sorted_by(&content.edges.iter().collect::<Vec<_>>(), |one, other| {
        one.order - other.order
    })
    .into_iter()
    .map(|edge| {
        let ridden = riders.get(&edge.id);
        let route = routes.get(ridden.unwrap_or(&edge.id).as_str());
        let curve = match route {
            Some(route) if route.points.len() >= 2 => {
                let points = strands.get(&edge.id).map_or_else(
                    || route.points.clone(),
                    |&(at, count)| {
                        strand(&route.points, at as f64 - (count - 1) as f64 / 2.0, count)
                    },
                );
                curve_through(&points, true)
            }
            _ => self_loop(boxes.get(edge.from.as_str()).copied().unwrap_or(Rect {
                x: 0.0,
                y: 0.0,
                width: 0.0,
                height: 0.0,
            })),
        };
        // A plate as wide as the narrow one carries the narrow plate's lines.
        let label = measured
            .labels
            .get(&edge.id)
            .zip(
                route
                    .filter(|_| ridden.is_none())
                    .and_then(|route| route.label),
            )
            .map(|(wide, bounds)| {
                let narrow = measured.narrow_labels.get(&edge.id);
                let words = narrow.filter(|narrow| (narrow.width - bounds.width).abs() < 1e-6);
                PlacedLabel {
                    bounds,
                    measured: words.unwrap_or(wide).clone(),
                }
            });
        DrawingEdge {
            edge: edge.facts(),
            curve,
            label,
        }
    })
    .collect()
}

/// The drawing a solve's geometry describes.
pub(crate) fn drawing_of(
    content: &Content,
    measured: &Measured,
    placed: &Placed,
    riders: &BTreeMap<String, String>,
) -> ArchitectureDrawing<NodeFacts, EdgeFacts> {
    let cards: Vec<DrawingNode<NodeFacts>> = placed
        .cards
        .iter()
        .filter_map(|card| {
            let measured = measured.nodes.get(&card.id)?.clone();
            Some(DrawingNode {
                measured,
                bounds: card.bounds,
                depth: card.depth,
            })
        })
        .collect();
    let containers: Vec<DrawingNode<NodeFacts>> = placed
        .frames
        .iter()
        .filter_map(|frame| {
            let node = measured.nodes.get(&frame.id)?;
            // The header as wide as the layout made room for (TASK-486).
            let header = frame
                .header
                .and_then(|at| node.headers.as_ref()?.get(at))
                .unwrap_or(node);
            Some(DrawingNode {
                measured: header.clone(),
                bounds: frame.bounds,
                depth: frame.depth,
            })
        })
        .collect();
    let boxes: BTreeMap<&str, Rect> = cards
        .iter()
        .chain(&containers)
        .map(|node| (node.measured.node.id.as_str(), node.bounds))
        .collect();
    let edges = edges_of(content, measured, placed, (&boxes, riders));
    ArchitectureDrawing {
        direction: ReadingDirection::Down,
        width: placed.width,
        height: placed.height,
        cards,
        containers,
        edges,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::apron;
    use archboard_scene::geometry::{Segment, segment_start};

    #[test]
    fn the_cable_returns_to_its_body_width_at_the_end_of_each_apron() {
        let points = [
            Point { x: 0.0, y: 0.0 },
            Point { x: 200.0, y: 0.0 },
            Point { x: 200.0, y: 200.0 },
            Point { x: 400.0, y: 200.0 },
        ];
        for count in [2, 3, 5, 7] {
            let place = (count - 1) as f64 / 2.0;
            let half = place * STRAND;
            let reach = place * FAN;
            let curve = curve_through(&strand(&points, place, count), true);
            let bends: Vec<_> = curve
                .segments
                .iter()
                .enumerate()
                .filter_map(|(index, segment)| match segment {
                    Segment::Cubic { to, .. } => Some((segment_start(&curve, index), *to)),
                    Segment::Line { .. } => None,
                })
                .collect();
            let apron = apron(half, reach);
            assert_eq!(bends[1].1, Point { x: apron, y: half }, "{count} strands");
            assert_eq!(
                bends[bends.len() - 2].0,
                Point {
                    x: 400.0 - apron,
                    y: 200.0 + half
                },
                "{count} strands"
            );
        }
    }
}
