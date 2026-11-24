//! Pairwise junction checks between a candidate route and placed routes.

use std::cell::RefCell;

use crate::blocks::assembly::PlacedLine;
use crate::blocks::planned::geometry::intersection;
use crate::blocks::planned::junctions::{
    Envelope, Piece, ordered_pieces, pieces, pieces_into, readable, sharing,
};
use crate::blocks::planned::model::Model;
use crate::blocks::planned::topology::Topology;
use crate::geometry::Point;

use super::TWO_WAY;

pub(super) struct Junction<'a> {
    line: &'a PlacedLine,
    /// How far a candidate's ink reaches along its body and at its cards (`Model::ink`).
    ours: (f64, f64),
    /// The line's straight pieces, each with its ink (`junctions::pieces`).
    theirs: Vec<Piece>,
    /// How much further than two lone lines' the two lines' ink reaches between them at the most.
    most: f64,
    bounds: Envelope,
    shared: bool,
    /// Whether the two share their source, and their target.
    ends: [bool; 2],
    /// Whether the two share their source and either draws an arrowhead there, and whether
    /// they share their target.
    arrows: [bool; 2],
}

impl<'a> Junction<'a> {
    pub(super) fn new(
        model: &Model<'_>,
        topology: &Topology,
        index: usize,
        line: &'a PlacedLine,
    ) -> Option<Self> {
        let &other = model.edge_index.get(line.id.as_str())?;
        let source = model.ends[index].0 == model.ends[other].0;
        let target = model.ends[index].1 == model.ends[other].1;
        let two_way = |edge: usize| model.edges[edge].option(TWO_WAY).is_some();
        Some(Self {
            line,
            ours: model.ink(index),
            theirs: pieces(&line.points, model.ink(other)),
            most: model.reach(index) + model.reach(other),
            bounds: Envelope::new(&line.points),
            shared: topology.memberships[index]
                .iter()
                .flatten()
                .any(|fan| topology.memberships[other].contains(&Some(*fan))),
            ends: [source, target],
            arrows: [source && (two_way(index) || two_way(other)), target],
        })
    }

    pub(super) fn clear(
        &self,
        points: &[Point],
        bounds: Envelope,
        ours_pieces: &mut Vec<Piece>,
    ) -> bool {
        if bounds.apart_by(self.bounds, self.most) {
            return true;
        }
        if self.shared
            && !(sharing(points, &self.line.points, self.ends[0], self.ends[1])
                && readable(points, &self.line.points, self.arrows[0], self.arrows[1]))
        {
            return false;
        }
        if ours_pieces.is_empty() {
            pieces_into(points, self.ours, ours_pieces);
        }
        ordered_pieces(ours_pieces, (self.bounds, &self.theirs), self.shared)
    }
}

/// The junctions of one line's candidates with every placed route, each route indexed once.
pub(in crate::blocks::planned) struct Junctions<'a> {
    /// The junction with each placed route, if the route is a line of the model.
    pairs: Vec<Option<Junction<'a>>>,
    /// Scratch buffer holding the current candidate's inked pieces.
    pieces: RefCell<Vec<Piece>>,
    /// The route that refused the last candidate, tested first.
    blocker: std::cell::Cell<usize>,
}

impl<'a> Junctions<'a> {
    pub(in crate::blocks::planned) fn new(
        model: &Model<'_>,
        topology: &Topology,
        index: usize,
        routes: &'a [PlacedLine],
    ) -> Self {
        Self {
            pairs: (routes.iter())
                .map(|line| Junction::new(model, topology, index, line))
                .collect(),
            pieces: RefCell::new(Vec::new()),
            blocker: std::cell::Cell::new(0),
        }
    }

    /// Whether a candidate keeps `shared_junction` with every placed route.
    pub(in crate::blocks::planned) fn clear(&self, points: &[Point]) -> bool {
        let bounds = Envelope::new(points);
        let mut pieces = self.pieces.borrow_mut();
        pieces.clear();
        let first = self.blocker.get();
        if first < self.pairs.len() && !self.shares_with(first, points, bounds, &mut pieces) {
            return false;
        }
        if let Some(at) = (0..self.pairs.len())
            .position(|at| at != first && !self.shares_with(at, points, bounds, &mut pieces))
        {
            self.blocker.set(at);
            return false;
        }
        true
    }

    /// `shared_junction` of a candidate, whose envelope is `bounds`, with the placed route at
    /// `at`, reusing `ours_pieces` across routes of the same candidate.
    pub(in crate::blocks::planned) fn shares_with(
        &self,
        at: usize,
        points: &[Point],
        bounds: Envelope,
        ours_pieces: &mut Vec<Piece>,
    ) -> bool {
        self.pairs[at]
            .as_ref()
            .is_some_and(|pair| pair.clear(points, bounds, ours_pieces))
    }
}

pub(in crate::blocks::planned) fn shared_junction(
    model: &Model<'_>,
    topology: &Topology,
    index: usize,
    points: &[Point],
    line: &PlacedLine,
) -> bool {
    let bounds = Envelope::new(points);
    // A line far from this one clears it whatever their fans and ends.
    let spread = model.reach(index)
        + (model.edge_index.get(line.id.as_str())).map_or(0.0, |&other| model.reach(other));
    if bounds.apart_by(Envelope::new(&line.points), spread) {
        return model.edge_index.contains_key(line.id.as_str());
    }
    let mut pieces = Vec::new();
    Junction::new(model, topology, index, line)
        .is_some_and(|pair| pair.clear(points, bounds, &mut pieces))
}

pub(in crate::blocks::planned) fn shared_fragment(
    model: &Model<'_>,
    edge: usize,
    points: &[Point],
    line: &PlacedLine,
) -> bool {
    if !intersection(points, &line.points).0 {
        return true;
    }
    let Some(&other) = model.edge_index.get(line.id.as_str()) else {
        return false;
    };
    model.treatments[edge] == model.treatments[other]
        && (model.ends[edge].0 == model.ends[other].0 || model.ends[edge].1 == model.ends[other].1)
}
