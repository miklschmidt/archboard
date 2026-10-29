//! Freeze shared ink once, with complete membership and a directed fan tree.

use std::collections::BTreeMap;

use super::geometry::clean;
use super::model::Model;
use super::topology::CommonEndpoint;
use crate::blocks::assembly::{Placed, PlacedLine};
use crate::geometry::{Point, Rect};

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

pub(super) fn freeze(model: &Model<'_>, lines: &[PlacedLine]) -> Option<Frozen> {
    let ids = &model.edge_index;
    let mut groups: BTreeMap<(bool, u64), Vec<Stroke>> = BTreeMap::new();
    for line in lines {
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
    let paths: Vec<_> = lines
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
    let mut frozen = Frozen { runs, paths };
    assign_suffixes(model, &mut frozen);
    frozen
        .paths
        .iter()
        .all(|path| ordered_fans(&frozen, path))
        .then_some(frozen)
}

fn assign_suffixes(model: &Model<'_>, frozen: &mut Frozen) {
    // Parallel relationships can share both ends. After their private labels,
    // a common suffix belongs to the target rather than a reunited source fan.
    let targets: Vec<_> = frozen.runs.iter().enumerate().filter_map(|(index,run)| {
        let Ownership::Shared(CommonEndpoint::Source(source)) = run.common else {return None};
        let target=model.ends[run.members[0]].1;
        if !run.members.iter().all(|&edge|model.ends[edge].1==target) {return None;}
        let after_split=frozen.paths.iter().filter(|path|run.members.contains(&path.edge)).any(|path| {
            path.runs.iter().take_while(|piece|piece.run!=index).any(|piece| !matches!(frozen.runs[piece.run].common, Ownership::Shared(CommonEndpoint::Source(owner)) if owner==source))
        });
        after_split.then_some((index,target))
    }).collect();
    for (run, target) in targets {
        frozen.runs[run].common = Ownership::Shared(CommonEndpoint::Target(target));
    }
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
    let treatment = &model.treatments[members[0]];
    if members
        .iter()
        .any(|&edge| &model.treatments[edge] != treatment)
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

/// Previously accepted routes already have ordered fans. Pairwise junction
/// checks preserve that order, so insertion only needs to test new shared runs.
/// The final drawing still passes the complete freeze before emission.
pub(super) fn accepts(model: &Model<'_>, lines: &[PlacedLine], next: &PlacedLine) -> bool {
    let edge = model.edge_index[next.id.as_str()];
    next.points.windows(2).all(|pair| {
        let horizontal = pair[0].y == pair[1].y;
        let coordinate = |p: Point| if horizontal { p.x } else { p.y };
        let (start, end) = (coordinate(pair[0]), coordinate(pair[1]));
        let (low, high) = (start.min(end), start.max(end));
        let mut strokes = Vec::new();
        for line in lines {
            for other in line
                .points
                .windows(2)
                .filter(|other| same_axis(pair, other, horizontal))
            {
                let (a, b) = (coordinate(other[0]), coordinate(other[1]));
                strokes.push((
                    model.edge_index[line.id.as_str()],
                    a.min(b),
                    a.max(b),
                    a < b,
                ));
            }
        }
        accepts_spans(model, edge, (low, high, start < end), &strokes)
    })
}
fn same_axis(one: &[Point], other: &[Point], horizontal: bool) -> bool {
    if horizontal {
        one[0].y == other[0].y && other[0].y == other[1].y
    } else {
        one[0].x == other[0].x && other[0].x == other[1].x
    }
}
fn accepts_spans(
    model: &Model<'_>,
    edge: usize,
    (low, high, forward): (f64, f64, bool),
    strokes: &[(usize, f64, f64, bool)],
) -> bool {
    let mut stops = vec![low, high];
    for &(_, a, b, _) in strokes.iter().filter(|&&(_, a, b, _)| a < high && b > low) {
        stops.extend([a.max(low), b.min(high)]);
    }
    stops.sort_by(f64::total_cmp);
    stops.dedup();
    stops.windows(2).all(|span| {
        let cover: Vec<_> = strokes
            .iter()
            .filter(|&&(_, a, b, _)| a <= span[0] && b >= span[1])
            .collect();
        let mut members = vec![edge];
        members.extend(cover.iter().map(|s| s.0));
        members.sort_unstable();
        members.dedup();
        cover.iter().all(|s| s.3 == forward) && ownership(model, &members).is_some()
    })
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
        assert!(freeze(&model, &drawing.edges).is_none());
        assert!(!accepts(&model, &drawing.edges[..2], &drawing.edges[2]));
        assert!(accepts(&model, &drawing.edges[..1], &drawing.edges[1]));
        let mut fan = drawing;
        fan.edges.pop();
        let frozen = freeze(&model, &fan.edges).expect("a complete common-source fan");
        let emitted = frozen.emit(&model, fan.clone());
        for (before, after) in fan.edges.iter().zip(emitted.edges) {
            assert_eq!(before.points, after.points);
        }
    }
}
