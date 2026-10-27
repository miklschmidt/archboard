//! Group nesting fixed by the graph, and crossing counts for measurements.

use crate::ecma::{abs, js_max, js_min, round};
use crate::geometry::Point;
use crate::graph::Node;
use crate::track::scene::Set;

use super::tree::{BlockTree, ClusterKind, Kept, Nesting};

/// A route's straight runs, each as its two ends.
fn runs_of(points: &[Point]) -> impl Iterator<Item = (Point, Point)> + '_ {
    points.windows(2).map(|pair| (pair[0], pair[1]))
}

/// Whether a value lies inside a run, more than a unit from either end.
fn clear(value: f64, one: f64, other: f64) -> bool {
    value > js_min(one, other) + 1.0 && value < js_max(one, other) - 1.0
}

/// A whole number as a crossing's place is keyed by: `Math.round`, negative
/// zero written as zero.
#[expect(
    clippy::cast_possible_truncation,
    reason = "a rounded coordinate of a drawing, far inside an i64"
)]
fn place(value: f64) -> i64 {
    round(value) as i64
}

/// How many times one line crosses another, each pair of lines counted at
/// each place: a trunk of several lines crosses a line once for each of them,
/// as a join kept before its labels draws its trunk far across the drawing.
pub fn pair_crossings<P: AsRef<[Point]>>(lines: &[P]) -> usize {
    let runs: Vec<(usize, Point, Point)> = lines
        .iter()
        .enumerate()
        .flat_map(|(line, points)| runs_of(points.as_ref()).map(move |(from, to)| (line, from, to)))
        .collect();
    let upright: Vec<&(usize, Point, Point)> = runs
        .iter()
        .filter(|(_, from, to)| abs(from.x - to.x) < 0.5)
        .collect();
    let mut places: Set<(usize, usize, i64, i64)> = Set::default();
    for (line, from, to) in runs.iter().filter(|(_, from, to)| abs(from.y - to.y) < 0.5) {
        for (other, start, end) in &upright {
            if other != line && clear(start.x, from.x, to.x) && clear(from.y, start.y, end.y) {
                places.insert((*line, *other, place(start.x), place(from.y)));
            }
        }
    }
    places.len()
}

/// A measured hierarchy's blocks, drawn one way, as no layout has decided anything yet.
fn blocks_of(graph: &str, nesting: Nesting) -> Result<BlockTree, String> {
    let graph: Node = serde_json::from_str(graph)
        .map_err(|error| format!("The measured graph is unreadable: {error}"))?;
    BlockTree::new(&graph, Kept::default(), nesting)
}

/// Whether an inline graph gathers any multi-member group into a region.
///
/// # Errors
///
/// When the graph or its options are unreadable.
pub(crate) fn has_regions(graph: &str) -> Result<bool, String> {
    let tree = blocks_of(graph, Nesting::Inline)?;
    Ok(tree
        .get(tree.root)
        .clusters
        .values()
        .any(|cluster| cluster.kind == ClusterKind::Region))
}
