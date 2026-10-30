//! Reconsider only the connected routes that block one relationship.
use super::{
    fixed::{compatible, route_cost},
    model::Model,
    selection::append,
    shape::Shape,
    topology::Topology,
};
use crate::blocks::assembly::PlacedLine;
struct Work {
    attempts: usize,
    generated: usize,
}
struct Conflict<'a> {
    bad: Vec<usize>,
    line: &'a PlacedLine,
}
pub(super) fn reconsider(
    model: &Model<'_>,
    topology: &Topology,
    shape: &Shape,
    paths: &[Vec<PlacedLine>],
    edge: usize,
) -> Option<Shape> {
    insert(
        model,
        topology,
        shape,
        paths,
        edge,
        &[],
        &mut Work {
            attempts: 96,
            generated: 0,
        },
    )
}
fn insert(
    model: &Model<'_>,
    topology: &Topology,
    shape: &Shape,
    paths: &[Vec<PlacedLine>],
    edge: usize,
    locked: &[usize],
    work: &mut Work,
) -> Option<Shape> {
    if let Some(next) = paths[edge]
        .iter()
        .find_map(|line| append(model, topology, shape, line))
        .or_else(|| extra(model, topology, shape, edge, locked, work))
    {
        return Some(next);
    }
    if locked.len() == 3 || work.attempts == 0 {
        return None;
    }
    let mut held = locked.to_vec();
    held.push(edge);
    let mut seen = std::collections::BTreeSet::new();
    conflicts(model, topology, shape, &paths[edge], edge, locked)
        .into_iter()
        .filter(|conflict| seen.insert(conflict.bad.clone()))
        .take(6)
        .find_map(|conflict| replace(model, topology, shape, paths, &held, work, conflict))
}
fn extra(
    model: &Model<'_>,
    topology: &Topology,
    shape: &Shape,
    edge: usize,
    locked: &[usize],
    work: &mut Work,
) -> Option<Shape> {
    if locked.is_empty() || work.generated >= 4 {
        return None;
    }
    work.generated += 1;
    super::choices::search(
        model,
        topology,
        edge,
        shape,
        None,
        None,
        super::fixed::Search::Ports,
    )
    .find_map(|line| append(model, topology, shape, &line))
}
fn conflicts<'a>(
    model: &Model<'_>,
    topology: &Topology,
    shape: &Shape,
    paths: &'a [PlacedLine],
    edge: usize,
    locked: &[usize],
) -> Vec<Conflict<'a>> {
    let mut choices: Vec<_> = paths
        .iter()
        .filter_map(|line| {
            let bad: Vec<_> = shape
                .routes
                .iter()
                .filter(|old| !compatible(model, topology, edge, line, old))
                .map(|old| model.edge_index[old.id.as_str()])
                .collect();
            (!bad.is_empty() && bad.len() <= 3 && !bad.iter().any(|e| locked.contains(e)))
                .then_some(Conflict { bad, line })
        })
        .collect();
    choices.sort_by(|a, b| {
        a.bad
            .len()
            .cmp(&b.bad.len())
            .then(route_cost(&a.line.points).total_cmp(&route_cost(&b.line.points)))
    });
    choices
}
fn replace(
    model: &Model<'_>,
    topology: &Topology,
    shape: &Shape,
    paths: &[Vec<PlacedLine>],
    held: &[usize],
    work: &mut Work,
    conflict: Conflict<'_>,
) -> Option<Shape> {
    if work.attempts == 0 {
        return None;
    }
    work.attempts -= 1;
    let mut partial = shape.clone();
    partial
        .routes
        .retain(|line| !conflict.bad.contains(&model.edge_index[line.id.as_str()]));
    let partial = append(model, topology, &partial, conflict.line)?;
    conflict
        .bad
        .into_iter()
        .try_fold(partial, |partial, other| {
            insert(model, topology, &partial, paths, other, held, work)
        })
}
