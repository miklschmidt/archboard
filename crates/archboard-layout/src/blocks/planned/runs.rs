//! Freeze shared ink once, with complete membership and a directed fan tree.

use std::collections::BTreeMap;

use super::geometry::clean;
use super::model::Model;
use super::topology::CommonEndpoint;
use crate::blocks::assembly::{Placed, PlacedLine};
use crate::geometry::{Point, Rect};
use crate::track::route::trunk_kind;

#[derive(Clone, Copy)]
enum Ownership {
    Private,
    Shared(CommonEndpoint),
}

struct Run {
    points: [Point; 2],
    members: Vec<usize>,
    common: Ownership,
}

struct Directed {
    run: usize,
    reverse: bool,
}
struct Path {
    edge: usize,
    runs: Vec<Directed>,
    label: Option<Rect>,
}

pub(super) struct Frozen {
    runs: Vec<Run>,
    paths: Vec<Path>,
}

struct Stroke {
    edge: usize,
    order: usize,
    start: f64,
    end: f64,
    forward: bool,
}

type Chunks = BTreeMap<usize, Vec<(usize, f64, Directed)>>;

impl Frozen {
    /// Each shared segment contributes once to the packing cost.
    pub(super) fn owned_length(&self) -> f64 {
        self.runs
            .iter()
            .map(|run| super::geometry::length(&run.points))
            .sum()
    }

    /// A junction is a tracing decision where more than two owned runs meet.
    pub(super) fn junctions(&self) -> usize {
        let mut degrees = BTreeMap::<(u64, u64), usize>::new();
        for point in self.runs.iter().flat_map(|run| run.points) {
            *degrees
                .entry((point.x.to_bits(), point.y.to_bits()))
                .or_default() += 1;
        }
        degrees.values().filter(|&&degree| degree > 2).count()
    }

    /// Expand the tree into real relationships without changing any chosen bend.
    pub(super) fn emit(self, model: &Model<'_>, mut drawing: Placed) -> Placed {
        drawing.edges = self
            .paths
            .into_iter()
            .map(|path| {
                let points = path
                    .runs
                    .into_iter()
                    .flat_map(|piece| {
                        let points = self.runs[piece.run].points;
                        if piece.reverse {
                            [points[1], points[0]]
                        } else {
                            points
                        }
                    })
                    .collect();
                PlacedLine {
                    id: model.edges[path.edge].id.clone(),
                    points: clean(points),
                    label: path.label,
                }
            })
            .collect();
        drawing
    }
}

pub(super) fn freeze(model: &Model<'_>, drawing: &Placed) -> Option<Frozen> {
    let ids: BTreeMap<_, _> = model
        .edges
        .iter()
        .enumerate()
        .map(|(i, edge)| (edge.id.as_str(), i))
        .collect();
    let mut groups: BTreeMap<(bool, u64), Vec<Stroke>> = BTreeMap::new();
    for line in &drawing.edges {
        let edge = *ids.get(line.id.as_str())?;
        for (order, points) in line.points.windows(2).enumerate() {
            let (a, b) = (points[0], points[1]);
            let vertical = a.x == b.x;
            let (start, end, fixed) = if vertical {
                (a.y, b.y, a.x)
            } else {
                (a.x, b.x, a.y)
            };
            groups
                .entry((vertical, fixed.to_bits()))
                .or_default()
                .push(Stroke {
                    edge,
                    order,
                    start: start.min(end),
                    end: start.max(end),
                    forward: start < end,
                });
        }
    }
    let mut runs = Vec::new();
    let mut chunks = Chunks::new();
    for ((vertical, fixed), strokes) in groups {
        split(
            model,
            vertical,
            f64::from_bits(fixed),
            &strokes,
            &mut runs,
            &mut chunks,
        )?;
    }
    let paths: Vec<_> = drawing
        .edges
        .iter()
        .map(|line| {
            let edge = ids[line.id.as_str()];
            let mut pieces = chunks.remove(&edge).unwrap_or_default();
            pieces.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.total_cmp(&b.1)));
            Path {
                edge,
                runs: pieces.into_iter().map(|(_, _, piece)| piece).collect(),
                label: line.label,
            }
        })
        .collect();
    let frozen = Frozen { runs, paths };
    frozen
        .paths
        .iter()
        .all(|path| ordered_fans(&frozen, path))
        .then_some(frozen)
}

fn split(
    model: &Model<'_>,
    vertical: bool,
    fixed: f64,
    strokes: &[Stroke],
    runs: &mut Vec<Run>,
    chunks: &mut Chunks,
) -> Option<()> {
    let mut cuts: Vec<_> = strokes
        .iter()
        .flat_map(|stroke| [stroke.start, stroke.end])
        .collect();
    cuts.sort_by(f64::total_cmp);
    cuts.dedup();
    for pair in cuts.windows(2) {
        let cover: Vec<_> = strokes
            .iter()
            .filter(|stroke| stroke.start <= pair[0] && stroke.end >= pair[1])
            .collect();
        if cover.is_empty() {
            continue;
        }
        let mut members: Vec<_> = cover.iter().map(|stroke| stroke.edge).collect();
        members.sort_unstable();
        members.dedup();
        let common = ownership(model, &members)?;
        if cover
            .iter()
            .any(|stroke| stroke.forward != cover[0].forward)
        {
            return None;
        }
        let points = [pair[0], pair[1]].map(|at| {
            if vertical {
                Point { x: fixed, y: at }
            } else {
                Point { x: at, y: fixed }
            }
        });
        let run = runs.len();
        runs.push(Run {
            points,
            members,
            common,
        });
        for stroke in cover {
            chunks.entry(stroke.edge).or_default().push((
                stroke.order,
                if stroke.forward { pair[0] } else { -pair[0] },
                Directed {
                    run,
                    reverse: !stroke.forward,
                },
            ));
        }
    }
    Some(())
}

/// The whole member set agrees on one endpoint and one treatment.
fn ownership(model: &Model<'_>, members: &[usize]) -> Option<Ownership> {
    if members.len() == 1 {
        return Some(Ownership::Private);
    }
    let (source, target) = model.ends[members[0]];
    let treatment = trunk_kind(model.edges[members[0]]);
    if members
        .iter()
        .any(|&edge| trunk_kind(model.edges[edge]) != treatment)
    {
        return None;
    }
    if members.iter().all(|&edge| model.ends[edge].0 == source) {
        Some(Ownership::Shared(CommonEndpoint::Source(source)))
    } else if members.iter().all(|&edge| model.ends[edge].1 == target) {
        Some(Ownership::Shared(CommonEndpoint::Target(target)))
    } else {
        None
    }
}

fn ordered_fans(frozen: &Frozen, path: &Path) -> bool {
    ordered_end(frozen, path.runs.iter().map(|piece| piece.run), true)
        && ordered_end(frozen, path.runs.iter().rev().map(|piece| piece.run), false)
}

/// Outward branches only lose members. A split cannot silently merge again.
fn ordered_end(frozen: &Frozen, pieces: impl Iterator<Item = usize>, source: bool) -> bool {
    let mut left = false;
    let mut previous: Option<&[usize]> = None;
    for piece in pieces {
        let run = &frozen.runs[piece];
        let same_end = matches!(
            (run.common, source),
            (Ownership::Shared(CommonEndpoint::Source(_)), true)
                | (Ownership::Shared(CommonEndpoint::Target(_)), false)
        );
        if !same_end {
            left = true;
            continue;
        }
        if left
            || previous
                .is_some_and(|members| run.members.iter().any(|edge| !members.contains(edge)))
        {
            return false;
        }
        previous = Some(&run.members);
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph::Node;
    use serde_json::json;

    #[test]
    fn three_collinear_routes_need_one_common_endpoint_for_the_entire_trunk() {
        let graph: Node = serde_json::from_value(json!({"id":"root","children":[
            {"id":"a","width":100,"height":60},{"id":"b","width":100,"height":60},
            {"id":"x","width":100,"height":60},{"id":"y","width":100,"height":60}],
            "edges":[{"id":"ax","sources":["a"],"targets":["x"]},
                {"id":"ay","sources":["a"],"targets":["y"]},
                {"id":"by","sources":["b"],"targets":["y"]}]}))
        .unwrap();
        let model = Model::new(&graph).unwrap();
        let drawing = Placed {
            width: 200.0,
            height: 200.0,
            cards: vec![],
            frames: vec![],
            regions: vec![],
            titles: vec![],
            edges: model
                .edges
                .iter()
                .map(|edge| PlacedLine {
                    id: edge.id.clone(),
                    label: None,
                    points: vec![Point { x: 0.0, y: 20.0 }, Point { x: 100.0, y: 20.0 }],
                })
                .collect(),
        };
        assert!(freeze(&model, &drawing).is_none());
        let mut fan = drawing;
        fan.edges.pop();
        let frozen = freeze(&model, &fan).expect("a complete common-source fan");
        assert_eq!(frozen.owned_length(), 100.0);
        let emitted = frozen.emit(&model, fan.clone());
        for (before, after) in fan.edges.iter().zip(emitted.edges) {
            assert_eq!(before.points, after.points);
        }
    }
}
