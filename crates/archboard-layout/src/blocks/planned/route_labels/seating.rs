//! The words of a shape's placed routes, ready for one more route at a time.

use super::{StrokeIndex, available, clear, slot_index};
use crate::{
    blocks::{
        assembly::PlacedLine,
        planned::{label_space::Labels, model::Model, shape::Shape},
    },
    geometry::{Rect, inflate},
};

/// When a placed line's words need a spot of their own once one more route joins.
#[derive(Clone, Copy)]
enum Need {
    /// The line has no words.
    Never,
    /// The line has no spot yet, or the placed ink covers its words.
    Always,
    /// Where the new route's ink covers the words.
    Covered(Rect),
}

/// The words of a shape's placed routes, ready for one more route at a time. Whether the
/// placed ink leaves a line's words clear is the same for every new route, so `available`
/// tests only the new route's ink against them.
pub(in crate::blocks::planned) struct Seating<'a> {
    /// The placement without routes or words.
    bare: Shape,
    /// The placed routes, each with its line and what its words need.
    lines: Vec<(&'a PlacedLine, usize, Need)>,
    /// The ink of the placed routes.
    strokes: StrokeIndex,
}
impl<'a> Seating<'a> {
    /// The seating of a shape's routes, if each is a line of the model.
    pub(in crate::blocks::planned) fn new(model: &Model<'_>, shape: &'a Shape) -> Option<Self> {
        let strokes = StrokeIndex::new(model, shape);
        let bare = shape.bare();
        let labels = &Labels::default();
        let lines = (shape.routes.iter())
            .map(|line| {
                let edge = *model.edge_index.get(line.id.as_str())?;
                let need = match line.label {
                    _ if model.edges[edge].label().is_none() => Need::Never,
                    Some(at) if clear(&bare, edge, at, &strokes, labels) => Need::Covered(at),
                    _ => Need::Always,
                };
                Some((line, edge, need))
            })
            .collect::<Option<_>>()?;
        Some(Self {
            bare,
            lines,
            strokes,
        })
    }

    /// The lines of the placed routes.
    pub(in crate::blocks::planned) fn indices(&self) -> impl Iterator<Item = usize> {
        self.lines.iter().map(|&(_, edge, _)| edge)
    }

    /// `available` for the placed routes and one more route of a line, with the index of the
    /// ink of them all, which `seated` takes next.
    pub(in crate::blocks::planned) fn admit(
        &self,
        model: &Model<'_>,
        edge: usize,
        line: &PlacedLine,
    ) -> Option<StrokeIndex> {
        let strokes = self.strokes.with(edge, &line.points);
        let labels = &Labels::default();
        for &(placed, other, need) in &self.lines {
            let covered = match need {
                Need::Never => false,
                Need::Always => true,
                Need::Covered(words) => {
                    StrokeIndex::path_crosses(edge, &line.points, other, inflate(words, 12.01))
                }
            };
            if covered {
                slot_index(model, other, &self.bare, &placed.points, &strokes, labels)?;
            }
        }
        available(model, &self.bare, [(line, edge)], &strokes)?;
        Some(strokes)
    }
}
