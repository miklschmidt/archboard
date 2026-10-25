//! The stretches of a block's top or bottom edge a line inside can reach a
//! port on straight: clear of the boxes standing against that edge. A port
//! under such a box is reached only round it, along the edge.

use crate::ecma::{js_max, js_min, order};
use crate::geometry::Rect;

/// A stretch of an edge: its lowest and highest x.
pub(crate) type Span = (f64, f64);

/// The stretches of an edge no blocked stretch covers, left to right.
fn free_of(edge: Span, blocked: &[Span]) -> Vec<Span> {
    let mut sorted = blocked.to_vec();
    sorted.sort_by(|one, other| order(one.0 - other.0));
    let mut free = Vec::new();
    let mut from = edge.0;
    for (low, high) in sorted {
        if from >= edge.1 {
            break;
        }
        if low > from {
            free.push((from, js_min(low, edge.1)));
        }
        from = js_max(from, high);
    }
    if from < edge.1 {
        free.push((from, edge.1));
    }
    free
}

/// The free stretch of an edge nearest an x, clear of some boxes by a margin;
/// nothing when the boxes cover the edge.
pub(crate) fn nearest_free(edge: Span, boxes: &[Rect], margin: f64, x: f64) -> Option<Span> {
    let blocked: Vec<Span> = boxes
        .iter()
        .map(|at| (at.x - margin, at.x + at.width + margin))
        .collect();
    let apart = |span: &Span| js_max(js_max(span.0 - x, x - span.1), 0.0);
    let mut free = free_of(edge, &blocked);
    free.sort_by(|one, other| order(apart(one) - apart(other)));
    free.into_iter().next()
}

/// The free stretch of an edge nearest an x, clear of some boxes by a margin,
/// or the whole edge when the boxes cover it.
pub(crate) fn open_stretch(edge: Span, boxes: &[Rect], margin: f64, x: f64) -> Span {
    nearest_free(edge, boxes, margin, x).unwrap_or(edge)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A box whose horizontal span blocks a port's edge.
    fn obstacle(x: f64, width: f64) -> Rect {
        Rect {
            x,
            y: 0.0,
            width,
            height: 100.0,
        }
    }

    #[test]
    fn obstacles_beyond_an_edge_never_offer_reversed_free_stretches() {
        let edge = (0.0, 100.0);
        let boxes = [obstacle(40.0, 80.0), obstacle(150.0, 30.0)];
        assert_eq!(nearest_free(edge, &boxes, 0.0, 90.0), Some((0.0, 40.0)));
    }

    #[test]
    fn a_covered_edge_keeps_its_fallback_with_more_obstacles_beyond_it() {
        let edge = (0.0, 100.0);
        let boxes = [obstacle(-10.0, 120.0), obstacle(150.0, 30.0)];
        assert_eq!(nearest_free(edge, &boxes, 0.0, 50.0), None);
        assert_eq!(open_stretch(edge, &boxes, 0.0, 50.0), edge);
    }
}
