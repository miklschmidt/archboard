//! A block as Graphviz placed it, the way the track scene reads it: every
//! card, port, header and pin a leaf, every container a node round its
//! members carrying its title row, every line its ends, its label's box and
//! the polyline Graphviz drew it on, and every group region a row on the root.
//!
//! The TypeScript engine carried these as text in layout options; a number
//! read back from its text loses its negative zero, which is why every
//! reader here takes them through `ecma::via_text`.

use std::rc::Rc;

use archboard_scene::geometry::{Point, Rect};

use crate::graph::Edge;

/// A placed card, port, header or pin, or a container round its members.
#[derive(Clone, Debug)]
pub(crate) struct PlacedNode {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    /// What a container holds; none for a leaf.
    pub children: Option<Vec<PlacedNode>>,
    /// A container's title row, absent on a leaf.
    pub frame: Option<FrameRow>,
}

/// What a container laid out inline tells the track scene of itself.
#[derive(Clone, Debug)]
pub(crate) struct FrameRow {
    /// Its title row's box, as `x, y, width, height`, and how far its words reach in.
    pub title: [f64; 5],
    /// Each size its title row can take, as `[words, height]`, narrowest first.
    pub steps: Option<Vec<(f64, f64)>>,
    /// Caption room above the visible header card.
    pub above: f64,
    /// The region's inset it keeps below what it holds, laid out as its lone region.
    pub below: Option<f64>,
    /// How wide its lone region's caption needs it.
    pub wide: Option<f64>,
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

/// A group region as placement answers it.
#[derive(Clone, Debug)]
pub(crate) struct PlacedRegion {
    pub group: String,
    pub parent: Option<String>,
    pub members: Vec<String>,
    pub bx: [f64; 4],
    pub caption: [f64; 4],
}

/// A placed block.
#[derive(Clone, Debug)]
pub(crate) struct PlacedBlock {
    pub children: Vec<PlacedNode>,
    pub edges: Vec<PlacedEdge>,
    pub regions: Vec<PlacedRegion>,
    /// Which of its header's wider sizes the block took, when it took one.
    pub header: Option<usize>,
}
