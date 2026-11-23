//! A block as Graphviz placed it, the way the lane scene reads it: every
//! card, port, header and pin a node, and every line its ends, its label's
//! box and the polyline Graphviz drew it on.
//!
//! The TypeScript engine carried these as text in layout options; a number
//! read back from its text loses its negative zero, which is why every
//! reader here takes them through `ecma::via_text`.

use std::rc::Rc;

use archboard_scene::geometry::{Point, Rect};

use crate::graph::Edge;

/// A placed card, port, header or pin.
#[derive(Clone, Debug)]
pub(crate) struct PlacedNode {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// A placed line: its ends in the scene, its label's box, and its polyline.
#[derive(Clone, Debug)]
pub(crate) struct PlacedEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub label: Option<Rect>,
    pub polyline: Vec<Point>,
    /// The relationship it draws, whose layout options it carries.
    pub edge: Rc<Edge>,
}

impl PlacedEdge {
    /// One of the relationship's layout options.
    pub(crate) fn option(&self, name: &str) -> Option<&str> {
        self.edge.option(name)
    }
}

/// A placed block.
#[derive(Clone, Debug)]
pub(crate) struct PlacedBlock {
    pub nodes: Vec<PlacedNode>,
    pub edges: Vec<PlacedEdge>,
    /// Which of its header's wider sizes the block took, when it took one.
    pub header: Option<usize>,
}
