//! Folding a block of cards into columns. A block whose ranks stack taller than
//! the page reads better as newspaper columns: its ranks, cut into runs, stand
//! side by side, each run a column block of its own. Here the cut is chosen and
//! the block's lines are cut where they leave and enter a column;
//! `fold_layout.rs` draws the folded block.

use std::rc::Rc;

use crate::ecma::{max, min};
use crate::geometry::Side;
use crate::track::scene::{Map, Set};
use crate::track::score::{Weighed, crossings_of, score_of, scores_better};
use crate::track::spacing::channel_height;

use super::laid::{Band, Insets, Laid};
use super::tree::{Block, BlockId, BlockTree, Kind, Line, Piece, Route};

/// The narrowest gutter between two columns.
pub(crate) const MIN_GUTTER: f64 = 48.0;
/// The most columns a block folds into.
const MOST_COLUMNS: usize = 4;
/// How much better a fold must fit the page than the block unfolded.
const WORTH_FOLDING: f64 = 1.1;

/// Visit each fold at the permitted boundaries, in search order, without
/// retaining the candidates. Each cut names the band that starts a later column.
fn visit_cuts(places: &[usize], chosen: &[usize], visit: &mut impl FnMut(&[usize])) {
    if chosen.len() + 1 >= MOST_COLUMNS {
        return;
    }
    for (index, &at) in places.iter().enumerate() {
        let mut next = chosen.to_vec();
        next.push(at);
        visit(&next);
        visit_cuts(&places[index + 1..], &next, visit);
    }
}

/// The width of a run of bands: from its leftmost item to its rightmost.
fn width_of(laid: &Laid, run: &[&Band]) -> f64 {
    let boxes: Vec<_> = run
        .iter()
        .flat_map(|band| band.items.iter().map(|item| laid.boxes[item.as_str()]))
        .collect();
    let right = max(boxes.iter().map(|one| one.x + one.width));
    right - min(boxes.iter().map(|one| one.x))
}

/// The size a block would have folded at some cuts, estimated from its unfolded layout.
fn folded_size(laid: &Laid, runs: &[Vec<&Band>], insets: Insets) -> (f64, f64) {
    let all: Vec<&Band> = runs.iter().flatten().copied().collect();
    let span = all[all.len() - 1].bottom - all[0].top;
    let widths: Vec<f64> = runs.iter().map(|run| width_of(laid, run)).collect();
    let tallest = max(runs
        .iter()
        .map(|run| run[run.len() - 1].bottom - run[0].top));
    let gutters = (runs.len() - 1) as f64 * MIN_GUTTER;
    let width = widths.iter().fold(0.0, |sum, width| sum + width) + gutters + 2.0 * insets.side;
    let height =
        laid.height - span + tallest + 2.0 * channel_height(runs.len() - 1, 0.0, false, false);
    (width, height)
}

/// A fold of a block: its items, column by column.
pub(crate) struct FoldPlan {
    pub items: Vec<Vec<String>>,
}

/// The columns a block of cards would better fold into, if any: the cut of
/// its ranks into runs that scores best, when that beats the block unfolded
/// by a clear margin. Only the board and a container folds.
pub(crate) fn fold_plan(
    block: &Block,
    laid: &Laid,
    insets: Insets,
    unfolded: &Weighed,
) -> Option<FoldPlan> {
    let bands: Vec<&Band> = laid
        .bands
        .iter()
        .filter(|band| !band.items.is_empty())
        .collect();
    if !matches!(block.kind, Kind::Root | Kind::Frame) || bands.len() < 3 {
        return None;
    }
    let (runs, _) = best_runs(block, laid, &bands, insets, unfolded)?;
    Some(FoldPlan {
        items: runs
            .iter()
            .map(|run| {
                run.iter()
                    .flat_map(|band| band.items.iter().cloned())
                    .collect()
            })
            .collect(),
    })
}

/// The run of bands each item and each container drawn inline stands in: a
/// container stands in the run that holds its cards.
fn run_of<'b>(block: &'b Block, runs: &[Vec<&'b Band>]) -> Map<&'b str, usize> {
    let mut run_of: Map<&str, usize> = Map::default();
    for (index, run) in runs.iter().enumerate() {
        let items = run.iter().flat_map(|band| band.items.iter());
        run_of.extend(items.map(|item| (item.as_str(), index)));
    }
    let mut clusters: Map<&str, usize> = Map::default();
    for (item, &index) in &run_of {
        for cluster in block.clusters_from(block.cluster_of.get(*item).map(String::as_str)) {
            clusters.insert(cluster, index);
        }
    }
    for (cluster, index) in clusters {
        run_of.insert(cluster, index);
    }
    run_of
}

/// How many of a block's lines run from one run of bands to another: each is
/// drawn from the bottom of one column round to the top of a later one.
fn bus_lines(block: &Block, runs: &[Vec<&Band>]) -> f64 {
    let run_of = run_of(block, runs);
    block
        .lines
        .values()
        .filter(|line| {
            match (
                run_of.get(line.tail.as_str()),
                run_of.get(line.head.as_str()),
            ) {
                (Some(tail), Some(head)) => tail != head,
                _ => false,
            }
        })
        .count() as f64
}

/// The bands each cluster a block draws inline spans, as the first and last
/// band holding one of its cards.
fn cluster_spans(block: &Block, bands: &[&Band]) -> Vec<(usize, usize)> {
    let mut band_of: Map<&str, usize> = Map::default();
    for (index, band) in bands.iter().enumerate() {
        for item in &band.items {
            band_of.insert(item, index);
        }
    }
    let mut spans: Map<&str, (usize, usize)> = Map::default();
    for (item, &band) in &band_of {
        for cluster in block.clusters_from(block.cluster_of.get(*item).map(String::as_str)) {
            let (low, high) = spans.get(cluster).copied().unwrap_or((band, band));
            spans.insert(cluster, (low.min(band), high.max(band)));
        }
    }
    spans.into_values().collect()
}

/// The boundaries between bands that keep every container and region whole.
fn cut_points(count: usize, spans: &[(usize, usize)]) -> Vec<usize> {
    (1..count)
        .filter(|&cut| !spans.iter().any(|&(low, high)| low < cut && cut <= high))
        .collect()
}

/// The runs of bands that score best folded, when they beat the bands
/// unfolded by a clear margin. Each run is estimated at its size with the
/// block's own crossings, so a fold never trades a crossing for fit.
fn best_runs<'b>(
    block: &Block,
    laid: &Laid,
    bands: &[&'b Band],
    insets: Insets,
    unfolded: &Weighed,
) -> Option<(Vec<Vec<&'b Band>>, Weighed)> {
    let crossings = crossings_of(laid.lines.values().map(Vec::as_slice));
    let places = cut_points(bands.len(), &cluster_spans(block, bands));
    let mut best: Option<(Vec<Vec<&'b Band>>, Weighed)> = None;
    visit_cuts(&places, &[], &mut |cuts| {
        let mut starts = vec![0];
        starts.extend(cuts);
        let runs: Vec<Vec<&Band>> = starts
            .iter()
            .enumerate()
            .map(|(index, &start)| {
                bands[start..starts.get(index + 1).copied().unwrap_or(bands.len())].to_vec()
            })
            .collect();
        let (width, height) = folded_size(laid, &runs, insets);
        let weighed = Weighed {
            width,
            height,
            crossings,
            bus: Some(bus_lines(block, &runs)),
        };
        if best
            .as_ref()
            .is_none_or(|(_, one)| scores_better(&weighed, one))
        {
            best = Some((runs, weighed));
        }
    });
    best.filter(|(_, weighed)| score_of(weighed) > score_of(unfolded) * WORTH_FOLDING)
}

/// Fold a block into columns: its items move into one column block each, in
/// order, each cluster the block draws inline into the column that holds its
/// cards, and every line of the block is cut where it leaves and enters a
/// column. Answers the columns.
pub(crate) fn fold_block(
    tree: &mut BlockTree,
    block: BlockId,
    groups: &[Vec<String>],
) -> Vec<BlockId> {
    tree.get_mut(block).items.clear();
    let id = tree.get(block).id.clone();
    let columns: Vec<BlockId> = groups
        .iter()
        .enumerate()
        .map(|(index, items)| {
            let column = tree.block(
                format!("{id}#{index}"),
                Kind::Column,
                Some(block),
                None,
                None,
            );
            tree.get_mut(column).items.extend(items.iter().cloned());
            for item in items {
                match tree.block_of(item) {
                    None => {
                        tree.holder.insert(item.clone(), column);
                    }
                    Some(inner) => tree.get_mut(inner).parent = Some(column),
                }
            }
            column
        })
        .collect();
    for &column in &columns {
        hold_clusters(tree, block, column);
    }
    let folded = tree.get_mut(block);
    folded.clusters.clear();
    folded.cluster_of.clear();
    cut_all(tree, block, &columns);
    columns
}

/// Give one column the clusters around its cards, in the block's order so a
/// parent comes before the clusters inside it.
fn hold_clusters(tree: &mut BlockTree, block: BlockId, column: BlockId) {
    let folded = tree.get(block);
    let held: Set<String> = tree
        .get(column)
        .items
        .iter()
        .flat_map(|item| folded.clusters_from(folded.cluster_of.get(item).map(String::as_str)))
        .map(str::to_owned)
        .collect();
    let clusters: Vec<_> = folded
        .clusters
        .iter()
        .filter(|(id, _)| held.contains(*id))
        .map(|(id, cluster)| (id.clone(), cluster.clone()))
        .collect();
    let members: Vec<(String, String)> = folded
        .cluster_of
        .iter()
        .filter(|(_, around)| held.contains(*around))
        .map(|(member, around)| (member.clone(), around.clone()))
        .collect();
    let frames: Vec<String> = clusters
        .iter()
        .filter(|(_, cluster)| cluster.kind == super::tree::ClusterKind::Frame)
        .map(|(id, _)| id.clone())
        .collect();
    let target = tree.get_mut(column);
    target.clusters.extend(clusters);
    target.cluster_of.extend(members);
    for id in frames {
        tree.holder.insert(id, column);
    }
}

/// The column holding a line end, if a column holds it.
fn column_of(tree: &BlockTree, columns: &[BlockId], end: &str) -> Option<BlockId> {
    let item = tree
        .pins
        .get(end)
        .map_or(end, |pin| tree.get(pin.block).id.as_str());
    columns.iter().copied().find(|&column| {
        let held = tree.get(column);
        held.items.iter().any(|one| one == item) || held.clusters.contains_key(item)
    })
}

/// Cut every line of the block where it leaves and enters a column, and put
/// each relationship's pieces and label where the cut left them.
fn cut_all(tree: &mut BlockTree, block: BlockId, columns: &[BlockId]) {
    let lines: Vec<Line> = std::mem::take(&mut tree.get_mut(block).lines)
        .into_values()
        .collect();
    let mut replaced: Map<String, Vec<Piece>> = Map::default();
    for line in lines {
        let pieces = cut(tree, block, columns, &line);
        replaced.insert(line.key.clone(), pieces);
    }
    let routes: Vec<(String, Route)> = tree
        .routes
        .iter()
        .map(|(edge, route)| (edge.clone(), route.clone()))
        .collect();
    for (edge, route) in routes {
        let pieces: Vec<Piece> = route
            .pieces
            .iter()
            .flat_map(|(at, key)| {
                if *at == block {
                    replaced.get(key).cloned().unwrap_or_default()
                } else {
                    vec![(*at, key.clone())]
                }
            })
            .collect();
        let labelled = pieces.iter().find(|(at, key)| {
            tree.get(*at)
                .lines
                .get(key)
                .is_some_and(|line| line.labelled)
        });
        let label_at = if route.label_at == block {
            labelled.map_or(block, |(at, _)| *at)
        } else {
            route.label_at
        };
        tree.routes.insert(edge, Route { pieces, label_at });
    }
}

/// Cut one line of the block at the columns it leaves and enters. What
/// leaves a column leaves its bottom and what enters one enters its top,
/// since a column only ever holds later ranks than the one before it.
/// Answers its pieces, from its source-side end to its target-side end.
fn cut(tree: &mut BlockTree, block: BlockId, columns: &[BlockId], line: &Line) -> Vec<Piece> {
    let upper = column_of(tree, columns, &line.tail);
    let lower = column_of(tree, columns, &line.head);
    if let Some(upper) = upper
        && Some(upper) == lower
    {
        tree.get_mut(upper)
            .lines
            .insert(line.key.clone(), line.clone());
        return vec![(upper, line.key.clone())];
    }
    let forward = line.from == line.tail;
    let label_in = if forward {
        lower.or(upper)
    } else {
        upper.or(lower)
    };
    let (leaving, from) = match upper {
        None => (Vec::new(), line.tail.clone()),
        Some(column) => {
            let port = tree.port(column, &format!("fold|{}", line.key), Side::Bottom);
            let key = part(
                tree,
                column,
                line,
                &line.tail,
                &port,
                label_in == Some(column),
            );
            (vec![(column, key)], tree.pin(column, &port))
        }
    };
    let (entering, to) = match lower {
        None => (Vec::new(), line.head.clone()),
        Some(column) => {
            let port = tree.port(column, &format!("fold|{}", line.key), Side::Top);
            let key = part(
                tree,
                column,
                line,
                &port,
                &line.head,
                label_in == Some(column),
            );
            (vec![(column, key)], tree.pin(column, &port))
        }
    };
    let middle = part(tree, block, line, &from, &to, false);
    let mut pieces = leaving;
    pieces.push((block, middle));
    pieces.extend(entering);
    if !forward {
        pieces.reverse();
    }
    pieces
}

/// One piece of a cut line, in a block, between two ends as Graphviz ranks them.
fn part(
    tree: &mut BlockTree,
    block: BlockId,
    line: &Line,
    tail: &str,
    head: &str,
    labelled: bool,
) -> String {
    let forward = line.from == line.tail;
    let carries = labelled && line.labelled;
    let key = if carries {
        line.edge.id.clone()
    } else {
        format!("{}@{}", line.key, tree.get(block).id)
    };
    let (from, to) = if forward { (tail, head) } else { (head, tail) };
    tree.get_mut(block).lines.insert(
        key.clone(),
        Line {
            key: key.clone(),
            edge: Rc::clone(&line.edge),
            from: from.to_owned(),
            to: to.to_owned(),
            tail: tail.to_owned(),
            head: head.to_owned(),
            labelled: carries,
            source: line.source.clone(),
            target: line.target.clone(),
        },
    );
    key
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folds_keep_clusters_whole_in_the_order_that_breaks_score_ties() {
        let places = cut_points(9, &[(0, 1), (2, 4), (5, 6), (7, 8)]);
        let mut folds = Vec::new();
        visit_cuts(&places, &[], &mut |cuts| folds.push(cuts.to_vec()));
        assert_eq!(
            folds,
            vec![
                vec![2],
                vec![2, 5],
                vec![2, 5, 7],
                vec![2, 7],
                vec![5],
                vec![5, 7],
                vec![7],
            ]
        );
    }
}
