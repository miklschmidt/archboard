//! Crossings along one line close enough that hops on it would touch are one
//! cluster: they are settled together, so a line rises over all of them or
//! none, and hops along one bundle layer the same way.

use crate::ecma::sorted_by;

use super::drawn_lines::{DrawnCrossing, Line, Run, along};
use super::hops::crest_margin;
use super::{BRIDGE_CLEARANCE, BRIDGE_RADIUS};

/// How close two crossings along one line are for single hops on it to touch.
const CLUSTER_REACH: f64 = (BRIDGE_RADIUS + BRIDGE_CLEARANCE) * 2.0;

/// Crossings along one run close enough that hops on it would touch.
#[derive(Clone, Debug)]
pub(super) struct Cluster {
    /// The run, by its index.
    pub(super) run: usize,
    /// Which of each crossing's lines the run draws: 0 the line across, 1 the line down.
    pub(super) side: usize,
    /// The crossings, by their index, in order along the run.
    pub(super) crossings: Vec<usize>,
}

/// The clusters along every run, and each crossing's cluster along each of
/// its lines, the one across first.
#[derive(Debug)]
pub(super) struct Clusters {
    pub(super) all: Vec<Cluster>,
    /// For each crossing, by its index, its two clusters by their index.
    pub(super) of: Vec<[usize; 2]>,
}

/// A crossing's line along a cluster, and the line crossing it.
pub(super) fn sides_of<'a>(cluster: &Cluster, crossing: &'a DrawnCrossing) -> (&'a Line, &'a Line) {
    (
        &crossing.lines[cluster.side],
        &crossing.lines[1 - cluster.side],
    )
}

/// Where a crossing lies along a run: its distance from the run's start.
pub(super) fn at_on(run: &Run, crossing: &DrawnCrossing) -> f64 {
    along(run, run.axis.of(crossing.point))
}

/// Crossings along one run, in order, split where hops on it would not touch.
/// A crest over several crossings runs on past its outer ones, so it touches
/// a hop that a single hop over its nearest crossing would not.
fn groups_along(run: &Run, crossings: &[DrawnCrossing], on: &[usize]) -> Vec<Vec<usize>> {
    let at = |crossing: usize| at_on(run, &crossings[crossing]);
    let touch = |before: &[usize], after: &[usize]| {
        at(after[0]) - at(before[before.len() - 1])
            <= CLUSTER_REACH + crest_margin(before.len()) + crest_margin(after.len())
    };
    let mut groups: Vec<Vec<usize>> = Vec::new();
    for crossing in sorted_by(on, |&a, &b| at(a) - at(b)) {
        groups.push(vec![crossing]);
        // A group that grows reaches further, so it may now touch the one before.
        while let [.., before, after] = groups.as_slice()
            && touch(before, after)
        {
            let after = groups.pop().expect("the group that touches");
            groups
                .last_mut()
                .expect("the group it touches")
                .extend(after);
        }
    }
    groups
}

/// The clusters along the runs drawing one side of the crossings, each run in
/// the order its first crossing comes.
fn clusters_on_side(runs: &[Run], crossings: &[DrawnCrossing], side: usize) -> Vec<Cluster> {
    let mut drawers: Vec<usize> = Vec::new();
    for crossing in crossings {
        let drawer = crossing.lines[side].drawer;
        if !drawers.contains(&drawer) {
            drawers.push(drawer);
        }
    }
    drawers
        .into_iter()
        .flat_map(|run| {
            let on: Vec<usize> = (0..crossings.len())
                .filter(|&crossing| crossings[crossing].lines[side].drawer == run)
                .collect();
            groups_along(&runs[run], crossings, &on)
                .into_iter()
                .map(move |group| Cluster {
                    run,
                    side,
                    crossings: group,
                })
        })
        .collect()
}

/// The clusters along every run, side by side: first along each line across,
/// then along each line down.
pub(super) fn clusters_of(runs: &[Run], crossings: &[DrawnCrossing]) -> Clusters {
    let mut all = clusters_on_side(runs, crossings, 0);
    all.extend(clusters_on_side(runs, crossings, 1));
    let mut of = vec![[0, 0]; crossings.len()];
    for (index, cluster) in all.iter().enumerate() {
        for &crossing in &cluster.crossings {
            of[crossing][cluster.side] = index;
        }
    }
    Clusters { all, of }
}
