//! A page comes from what is drawn, not from its placement: every engine's
//! settled drawing is moved to the margin and its page cut to what it draws,
//! so every side keeps the same margin.

use archboard_scene::drawing::{ArchitectureDrawing, DrawingNode, EdgeFacts, NodeFacts};
use archboard_scene::geometry::{Curve, Point, Rect, Segment, curve_bounds, path_of, union};
use archboard_scene::paint::design::DIAGRAM_MARGIN;

/// A point moved.
fn shifted(point: Point, by: Point) -> Point {
    Point {
        x: point.x + by.x,
        y: point.y + by.y,
    }
}

/// A box moved.
fn moved(bounds: Rect, by: Point) -> Rect {
    let corner = shifted(
        Point {
            x: bounds.x,
            y: bounds.y,
        },
        by,
    );
    Rect {
        x: corner.x,
        y: corner.y,
        ..bounds
    }
}

/// A route moved, every corner and control point with it.
fn moved_curve(curve: &Curve, by: Point) -> Curve {
    Curve {
        from: shifted(curve.from, by),
        segments: curve
            .segments
            .iter()
            .map(|segment| match *segment {
                Segment::Line { to } => Segment::Line {
                    to: shifted(to, by),
                },
                Segment::Cubic { first, second, to } => Segment::Cubic {
                    first: shifted(first, by),
                    second: shifted(second, by),
                    to: shifted(to, by),
                },
            })
            .collect(),
    }
}

/// The box covering everything a drawing draws.
fn drawn_bounds(drawing: &ArchitectureDrawing<NodeFacts, EdgeFacts>) -> Option<Rect> {
    let nodes = drawing
        .cards
        .iter()
        .chain(&drawing.containers)
        .map(|node| node.bounds);
    let edges = drawing.edges.iter().flat_map(|edge| {
        std::iter::once(curve_bounds(&edge.curve))
            .chain(edge.label.as_ref().map(|label| label.bounds))
    });
    let regions = drawing.regions.iter().flatten().map(|region| region.bounds);
    union(nodes.chain(edges).chain(regions))
}

/// A settled drawing moved so what it draws starts at the margin, on a page
/// that ends the margin past it.
pub(crate) fn fitted_page(
    drawing: ArchitectureDrawing<NodeFacts, EdgeFacts>,
) -> ArchitectureDrawing<NodeFacts, EdgeFacts> {
    let Some(drawn) = drawn_bounds(&drawing) else {
        return drawing;
    };
    let by = Point {
        x: DIAGRAM_MARGIN - drawn.x,
        y: DIAGRAM_MARGIN - drawn.y,
    };
    let node = |node: DrawingNode<NodeFacts>| DrawingNode {
        bounds: moved(node.bounds, by),
        ..node
    };
    ArchitectureDrawing {
        width: drawn.width + 2.0 * DIAGRAM_MARGIN,
        height: drawn.height + 2.0 * DIAGRAM_MARGIN,
        cards: drawing.cards.into_iter().map(node).collect(),
        containers: drawing.containers.into_iter().map(node).collect(),
        edges: drawing
            .edges
            .into_iter()
            .map(|mut edge| {
                edge.curve = moved_curve(&edge.curve, by);
                edge.path = path_of(&edge.curve);
                if let Some(label) = edge.label.as_mut() {
                    label.bounds = moved(label.bounds, by);
                }
                edge
            })
            .collect(),
        regions: drawing.regions.map(|regions| {
            regions
                .into_iter()
                .map(|mut region| {
                    region.bounds = moved(region.bounds, by);
                    region.caption.bounds = moved(region.caption.bounds, by);
                    region
                })
                .collect()
        }),
        direction: drawing.direction,
    }
}
