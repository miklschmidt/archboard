//! What the core weighs where it chooses between the solves of one board
//! (`architecture::choosing`). Each solve tells, with its drawing, the
//! drawing's reading: what every choice between two drawings reads of it.
//!
//! Lines that join on the way to one card stay one line into it: each such
//! join is kept whole by its labels before the join, or by its lines keeping
//! ports of their own, and the renderer lays a board out every way that asks
//! for and keeps the drawing that reads better (`draws_better`). A board drawn
//! inline whose groups gather into regions is laid out with each region
//! packed as a block of its own too, and the drawing that reads better kept
//! (`reads_better_packed`).

use serde::{Deserialize, Serialize};

use crate::constants::fit_in;
use crate::ecma::{abs, hypot, js_max, js_min, round};
use crate::geometry::Point;
use crate::graph::Node;
use crate::track::chains::LANE;
use crate::track::route::trunk_kind;
use crate::track::scene::{Map, Set};
use crate::track::score::{Weighed, crossings_of, score_of, takes};

use super::assembly::Placed;
use super::card_layout::{Arrangement, CardLayout};
use super::laid::LaidMap;
use super::laying::line_length;
use super::place::insets_of;
use super::stacking::{Scored, Stood, stacks};
use super::tree::{BlockTree, ClusterKind, Kept, Nesting, Projection};
use super::weighing::weighed_placed;
use super::wraps::{Search, Tried, Weighing, kept_of};

/// How much line costs as much as one crossing in the joins' earlier
/// weighing: a crossing the reader has to look twice at is worth a long run
/// of line, and less than this lets a trunk kept whole lose to lines that
/// each hop what it hopped once.
const LINE_PER_CROSSING: f64 = 1000.0;

/// How near two costs are for the page to decide between them, in that weighing: a twentieth.
const NEAR: f64 = 0.05;

/// What the choices between solves read of a drawing.
#[derive(Debug, Deserialize, Serialize)]
pub(crate) struct Reading {
    /// How many pairs of lines of one kind to one card share ink on the way
    /// and then end apart on it: what no way of keeping a join may leave.
    parted: f64,
    /// What its lines cost in the joins' earlier weighing.
    cost: f64,
    /// What it is weighed on as a whole drawing, its lines' runs away from
    /// their ends counted.
    weighed: Weighed,
    /// How often its lines cross, as placed.
    crossings: f64,
    /// How much line it draws, as placed.
    length: f64,
}

/// A route's straight runs, each as its two ends.
fn runs_of(points: &[Point]) -> impl Iterator<Item = (Point, Point)> + '_ {
    points.windows(2).map(|pair| (pair[0], pair[1]))
}

/// How long two routes run on one line, within a point.
fn shared_length(one: &[Point], other: &[Point]) -> f64 {
    let mut length = 0.0;
    for (a, b) in runs_of(one) {
        for (c, d) in runs_of(other) {
            for level in [true, false] {
                let across = |point: Point| if level { point.x } else { point.y };
                let along = |point: Point| if level { point.y } else { point.x };
                if [b, c, d]
                    .iter()
                    .any(|&point| abs(across(point) - across(a)) > 1.0)
                {
                    continue;
                }
                let low = js_max(js_min(along(a), along(b)), js_min(along(c), along(d)));
                let high = js_min(js_max(along(a), along(b)), js_max(along(c), along(d)));
                length += js_max(0.0, high - low);
            }
        }
    }
    length
}

/// How many pairs of lines of one kind to one card share ink on the way and
/// then end apart on it.
fn parted_of(placed: &Placed, projections: &[Projection]) -> f64 {
    let towards: Map<&str, String> = projections
        .iter()
        .map(|projection| {
            let edge = &projection.edge;
            (
                edge.id.as_str(),
                format!("{}|{}", edge.target(), trunk_kind(edge)),
            )
        })
        .collect();
    let lines: Vec<_> = placed
        .edges
        .iter()
        .filter(|edge| edge.points.len() > 1)
        .collect();
    let mut parted = 0.0;
    for (index, one) in lines.iter().enumerate() {
        for other in &lines[index + 1..] {
            if towards.get(one.id.as_str()) != towards.get(other.id.as_str()) {
                continue;
            }
            let (end, other_end) = (
                one.points[one.points.len() - 1],
                other.points[other.points.len() - 1],
            );
            if hypot(end.x - other_end.x, end.y - other_end.y) < 1.0 {
                continue;
            }
            if shared_length(&one.points, &other.points) > LANE {
                parted += 1.0;
            }
        }
    }
    parted
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

/// What a drawing's lines cost in the joins' earlier weighing: each crossing
/// half as much again for each line through it past the first, and its line
/// at a crossing's worth for every `LINE_PER_CROSSING`, from how often the
/// lines cross and how long they run.
fn cost_of(lines: &[&[Point]], seen: f64, length: f64) -> f64 {
    #[expect(
        clippy::cast_precision_loss,
        reason = "a count of crossings, far below 2^52"
    )]
    let pairs = pair_crossings(lines) as f64;
    seen + (pairs - seen) / 2.0 + length / LINE_PER_CROSSING
}

/// A drawing's reading, as its solve tells it.
pub(crate) fn reading_of(placed: &Placed, projections: &[Projection]) -> Reading {
    let lines: Vec<&[Point]> = placed
        .edges
        .iter()
        .map(|edge| edge.points.as_slice())
        .collect();
    let crossings = crossings_of(lines.iter().copied());
    let length = line_length(lines.iter().copied());
    Reading {
        parted: parted_of(placed, projections),
        cost: cost_of(&lines, crossings, length),
        weighed: weighed_placed(placed, projections),
        crossings,
        length,
    }
}

/// A drawing's fit in the reference pane.
fn fit_of(reading: &Reading) -> f64 {
    fit_in(reading.weighed.width, reading.weighed.height)
}

/// Whether one drawing's lines cost less than another's, as the joins
/// weighed a drawing before ADR 0039; costing about as much, the page that
/// fits the reference pane better.
fn costs_less(one: &Reading, other: &Reading) -> bool {
    let (cost, least) = (one.cost, other.cost);
    let (fit, best) = (fit_of(one), fit_of(other));
    if abs(cost - least) > NEAR * js_min(cost, least) || abs(fit - best) < 1e-9 {
        return cost < least - 1e-9;
    }
    fit > best
}

/// A reading, read.
fn read(reading: &str) -> Result<Reading, String> {
    serde_json::from_str(reading)
        .map_err(|error| format!("A drawing's reading is unreadable: {error}"))
}

/// Whether one drawing reads better than another: it parts fewer joined
/// lines; or, as few, it draws no more line, and it reads better in the order
/// of ADR 0039 and no worse anywhere than the drawing whose lines cost less,
/// or else its lines cost less. A join kept another way that draws more line
/// buys what it saves with runs a reader follows further, as a packing does:
/// with a region round Pane session, Working with an agent (Blocks) kept its
/// joins into Agent apart to fit the pane better, at a crossing more and 6%
/// more line, and ran its lines into Agent from every side.
///
/// # Errors
///
/// When either reading is not one a solve told.
pub(crate) fn draws_better(one: &str, other: &str) -> Result<bool, String> {
    let (one, other) = (read(one)?, read(other)?);
    if one.parted != other.parted {
        return Ok(one.parted < other.parted);
    }
    if one.weighed.length.unwrap_or(0.0) > other.weighed.length.unwrap_or(0.0) {
        return Ok(false);
    }
    Ok(takes(
        &one.weighed,
        &other.weighed,
        costs_less(&one, &other),
        None,
    ))
}

/// Whether a board laid out with its groups packed reads better than laid
/// inline in the order of ADR 0039, and no worse anywhere than the drawing
/// taken before it: packed, where it scores higher, draws no more line, and
/// fits the pane no worse. Blocks standing side by side can trade a line's
/// straight run for one round both blocks, which the score alone does not
/// see; and packing is for a page the board's own ranks spread out, so a
/// packing that fits worse only buys its crossings with lines run round the
/// blocks. Both weighings count the lines' runs away from their ends as
/// crossings: packed, Device Trust Control Plane (Track) crossed five lines
/// more and ran its lines some 3900 px round its blocks, for 5% less line.
///
/// # Errors
///
/// When either reading is not one a solve told.
pub(crate) fn reads_better_packed(packed: &str, inline: &str) -> Result<bool, String> {
    let (one, other) = (read(packed)?, read(inline)?);
    let scored = |reading: &Reading| {
        score_of(&Weighed {
            width: reading.weighed.width,
            height: reading.weighed.height,
            crossings: reading.crossings,
            away: reading.weighed.away,
            ..Weighed::default()
        })
    };
    let earlier = scored(&one) > scored(&other)
        && one.length <= other.length
        && fit_of(&one) >= fit_of(&other);
    Ok(takes(&one.weighed, &other.weighed, earlier, None))
}

/// What a solve told its first block that could stack stood at.
#[derive(Deserialize)]
struct StoodTold {
    tied: ScoredTold,
    settled: SettledTold,
}

/// A score and a fit, as told.
#[derive(Deserialize)]
struct ScoredTold {
    score: f64,
    fit: f64,
}

/// The block with its titles pulled down, as told.
#[derive(Deserialize)]
struct SettledTold {
    score: f64,
    fit: f64,
    length: f64,
    weighed: Weighed,
}

/// What a block stood at, read.
fn stood_of(told: &str) -> Result<Stood, String> {
    let StoodTold { tied, settled } = serde_json::from_str(told)
        .map_err(|error| format!("What a block stood at is unreadable: {error}"))?;
    Ok(Stood {
        tied: Scored {
            score: tied.score,
            fit: tied.fit,
        },
        settled: Scored {
            score: settled.score,
            fit: settled.fit,
        },
        length: settled.length,
        weighed: settled.weighed,
    })
}

/// Whether the first block of a board that could stack stacks, from what two
/// solves told it stood at, laid stacked and laid plain.
///
/// # Errors
///
/// When either is not what a solve told.
pub(crate) fn stacks_of(stacked: &str, plain: &str) -> Result<bool, String> {
    Ok(stacks(&stood_of(stacked)?, &stood_of(plain)?))
}

/// A block's wrap search as a solve told it, and the root option that asks a
/// solve to try each of its candidates alone, in the order the search weighs them.
///
/// # Errors
///
/// When the search is not what a solve told.
pub(crate) fn wraps_asked(told: &str) -> Result<(Search, Vec<String>), String> {
    let search: Search = serde_json::from_str(told)
        .map_err(|error| format!("A block's wrap search is unreadable: {error}"))?;
    let asked = search
        .candidates
        .iter()
        .map(|candidate| {
            let alone = Tried {
                candidate: candidate.clone(),
                needed: search.needed,
            };
            serde_json::to_string(&Some(alone))
                .map_err(|error| format!("A wrap cannot be asked for: {error}"))
        })
        .collect::<Result<_, _>>()?;
    Ok((search, asked))
}

/// Which candidate of a wrap search to keep, from what each solve that tried
/// one alone told the search weighs it on, nothing where it sank a card: the
/// one the search keeps, or none.
///
/// # Errors
///
/// When there is not one answer for each candidate, or one is not what a solve told.
pub(crate) fn wrap_kept(search: &Search, told: &[Option<&str>]) -> Result<Option<usize>, String> {
    if told.len() != search.candidates.len() {
        return Err("A wrap search was answered for other candidates than it has.".to_owned());
    }
    let weighings = told
        .iter()
        .map(|told| {
            told.map(|told| {
                serde_json::from_str::<Weighing>(told)
                    .map_err(|error| format!("A wrap's weighing is unreadable: {error}"))
            })
            .transpose()
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(kept_of(search.needed, &weighings))
}

/// A measured hierarchy's blocks, drawn one way, as no layout has decided anything yet.
fn blocks_of(graph: &str, nesting: Nesting) -> Result<BlockTree, String> {
    let graph: Node = serde_json::from_str(graph)
        .map_err(|error| format!("The measured graph is unreadable: {error}"))?;
    BlockTree::new(&graph, Kept::default(), nesting, &Set::default())
}

/// The blocks whose joins of lines to one card the renderer keeps whole one
/// way or the other, by id, in the board's order, with its containers and
/// group regions drawn as `nesting` names: `blocks`, `inline` or `groups`.
///
/// # Errors
///
/// When the graph, its options or the nesting are unreadable.
pub(crate) fn joining_of(graph: &str, nesting: &str) -> Result<Vec<String>, String> {
    Ok(blocks_of(graph, Nesting::named(nesting)?)?
        .joining
        .into_iter()
        .collect())
}

/// Whether a board drawn inline may have a block that could stack, read from
/// its graph alone: its one block of cards does when a line runs from one
/// inline container into another. A board drawn with blocks inside it may.
///
/// # Errors
///
/// When the graph or its options are unreadable.
pub(crate) fn could_stack(graph: &str) -> Result<bool, String> {
    let tree = blocks_of(graph, Nesting::Inline)?;
    if tree.innermost_first(tree.root).len() != 1 {
        return Ok(true);
    }
    let insets = insets_of(tree.get(tree.root));
    let laid = LaidMap::default();
    Ok(CardLayout::new(&tree, &laid, tree.root, insets, Arrangement::default()).stacks())
}

/// How many leaf cards an inline graph holds, when it gathers a group into a region.
///
/// # Errors
///
/// When the graph or its options are unreadable.
pub(crate) fn region_cards(graph: &str) -> Result<Option<usize>, String> {
    let tree = blocks_of(graph, Nesting::Inline)?;
    Ok(tree
        .get(tree.root)
        .clusters
        .values()
        .any(|cluster| cluster.kind == ClusterKind::Region)
        .then_some(tree.cards.len()))
}
