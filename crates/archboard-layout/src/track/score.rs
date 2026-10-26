//! How readable a routed layout is, and the ways to wrap a wide rank (TASK-349).
//! Two layouts of one board are compared on how easily each reads, their
//! measures in the order of ADR 0039 (`reading_order`), and their fit to the
//! reference pane only breaks a tie between layouts that read alike. Every
//! chooser ADR 0039 changed also weighs its two layouts as it did before, and
//! takes the pick of its reading measures only where the two agree or that
//! pick is no worse on any measure (`takes`). The choices made before the
//! drawing a reader sees exists weigh a layout's fit less a share for each
//! crossing (`score_of`).

use archboard_scene::geometry::{Point, Rect};
use serde::{Deserialize, Serialize};

use crate::constants::fit_in;
use crate::ecma::{abs, js_min, max, min, number_key, pow, round, via_text};
use crate::track::scene::{Map, Set};

/// What one crossing costs a layout, as the share of its fit it keeps.
const CROSSING_COST: f64 = 0.97;

/// What one line from a column to a later one costs: as much as eight crossings.
fn bus_cost() -> f64 {
    pow(CROSSING_COST, 8.0)
}

/// A straight run of one line, with whether each of its ends is a bend of that line.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Run {
    pub line: usize,
    pub from: Point,
    pub to: Point,
}

/// A place two lines cross: a level run of one through an upright run of the other, by its key.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Crossing {
    pub key: (u64, u64),
}

/// What a layout is weighed on: its page, its crossings and its lines between
/// columns, and what else a reader sees in it where an engine counts it.
#[derive(Clone, Copy, Debug, Default, PartialEq, Deserialize, Serialize)]
pub(crate) struct Weighed {
    pub width: f64,
    pub height: f64,
    pub crossings: f64,
    /// What its lines' runs away from their ends weigh, in crossings.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub away: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bus: Option<f64>,
    /// Its line ends hooking into a card's side, its pairs of lines that touch and its crowded joins.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hooks: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bends: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub length: Option<f64>,
}

/// How near two layouts' route lengths are for a reader to take them as alike: a twentieth.
const NEAR_LENGTH: f64 = 0.05;

/// Whether a value lies strictly between two others, clear of both.
fn inside(value: f64, one: f64, other: f64) -> bool {
    value > js_min(one, other) + 1.0 && value < crate::ecma::js_max(one, other) - 1.0
}

/// The key of a place: its rounded x and y, as a template literal spells them.
fn place_key(x: f64, y: f64) -> (u64, u64) {
    (
        number_key(via_text(round(x))),
        number_key(via_text(round(y))),
    )
}

/// Where two different lines cross: a level run of one through an upright run of another.
pub(crate) fn crossing_places<'a>(lines: impl IntoIterator<Item = &'a [Point]>) -> Vec<Crossing> {
    let mut runs = Vec::new();
    for (line, points) in lines.into_iter().enumerate() {
        for index in 0..points.len().saturating_sub(1) {
            runs.push(Run {
                line,
                from: points[index],
                to: points[index + 1],
            });
        }
    }
    let level: Vec<&Run> = runs
        .iter()
        .filter(|run| abs(run.from.y - run.to.y) < 0.5)
        .collect();
    let upright: Vec<&Run> = runs
        .iter()
        .filter(|run| abs(run.from.x - run.to.x) < 0.5)
        .collect();
    let mut crossings = Vec::new();
    for one in &level {
        for other in &upright {
            if other.line != one.line
                && inside(other.from.x, one.from.x, one.to.x)
                && inside(one.from.y, other.from.y, other.to.y)
            {
                crossings.push(Crossing {
                    key: place_key(other.from.x, one.from.y),
                });
            }
        }
    }
    crossings
}

/// How many places two different lines cross, drawn as one hop each.
pub(crate) fn crossings_of<'a>(lines: impl IntoIterator<Item = &'a [Point]>) -> f64 {
    let keys: Set<(u64, u64)> = crossing_places(lines)
        .into_iter()
        .map(|crossing| crossing.key)
        .collect();
    keys.len() as f64
}

/// How long an upright run beyond everything a block holds must be to lap round it.
pub(crate) const LAP: f64 = 200.0;

/// How many lines lap round a block: run down or up, for more than a short
/// way, beyond everything it holds on either side.
pub(crate) fn laps_of<'a>(lines: impl IntoIterator<Item = &'a [Point]>, boxes: &[Rect]) -> f64 {
    if boxes.is_empty() {
        return 0.0;
    }
    let left = min(boxes.iter().map(|bx| bx.x));
    let right = max(boxes.iter().map(|bx| bx.x + bx.width));
    lines
        .into_iter()
        .filter(|points| {
            points.windows(2).any(|pair| {
                let (from, to) = (pair[0], pair[1]);
                abs(to.x - from.x) < 0.5
                    && abs(to.y - from.y) > LAP
                    && (to.x < left || to.x > right)
            })
        })
        .count() as f64
}

/// A layout's reading measures, in the order of ADR 0039.
fn measures_of(layout: &Weighed) -> [f64; 4] {
    [
        layout.crossings + layout.away.unwrap_or(0.0),
        layout.hooks.unwrap_or(0.0),
        layout.bends.unwrap_or(0.0),
        layout.length.unwrap_or(0.0),
    ]
}

/// How one layout reads against another, on the measures of ADR 0039 in its
/// order: below zero when the first reads better, above when the other does,
/// zero when they read alike.
pub(crate) fn reading_order(one: &Weighed, other: &Weighed) -> f64 {
    let (mine, theirs) = (measures_of(one), measures_of(other));
    let at = (0..4).find(|&index| mine[index] != theirs[index]);
    if let Some(at) = at
        && at < 3
    {
        return mine[at] - theirs[at];
    }
    let (length, longest) = (mine[3], theirs[3]);
    if abs(length - longest) > NEAR_LENGTH * js_min(length, longest) {
        length - longest
    } else {
        0.0
    }
}

/// Whether one layout reads better than another; or, reading alike, fits the
/// reference pane better; or fits it as well on a smaller page.
pub(crate) fn reads_better(one: &Weighed, other: &Weighed) -> bool {
    let order = reading_order(one, other);
    if order == 0.0 {
        fits_better(one, other)
    } else {
        order < 0.0
    }
}

/// Whether one layout reads no worse than another on any measure of ADR 0039.
fn no_worse(one: &Weighed, other: &Weighed) -> bool {
    let ([crossings, hooks, bends, length], theirs) = (measures_of(one), measures_of(other));
    crossings <= theirs[0]
        && hooks <= theirs[1]
        && bends <= theirs[2]
        && length <= theirs[3] * (1.0 + NEAR_LENGTH)
}

/// Whether a chooser ADR 0039 changed takes the first of two layouts: its
/// reading pick where its earlier weighing agrees, or where that pick reads no
/// worse on any measure; else the earlier pick. `reads` is by default whether
/// the first reads better.
pub(crate) fn takes(one: &Weighed, other: &Weighed, earlier: bool, reads: Option<bool>) -> bool {
    let reads = reads.unwrap_or_else(|| reads_better(one, other));
    if reads == earlier {
        return reads;
    }
    if reads {
        no_worse(one, other)
    } else {
        !no_worse(other, one)
    }
}

/// Whether one layout fits the reference pane better than another, or as well on a smaller page.
fn fits_better(one: &Weighed, other: &Weighed) -> bool {
    let (fit, best) = (
        fit_in(one.width, one.height),
        fit_in(other.width, other.height),
    );
    if abs(fit - best) > 1e-9 {
        return fit > best;
    }
    one.width * one.height < other.width * other.height
}

/// A layout's fit to the reference pane, less a share for every crossing and
/// a greater one for every line between columns.
pub(crate) fn score_of(layout: &Weighed) -> f64 {
    let crossings = layout.crossings + layout.away.unwrap_or(0.0);
    fit_in(layout.width, layout.height)
        * pow(CROSSING_COST, crossings)
        * pow(bus_cost(), layout.bus.unwrap_or(0.0))
}

/// Whether one layout scores higher than another, or as high on a smaller page.
pub(crate) fn scores_better(one: &Weighed, other: &Weighed) -> bool {
    let (mine, theirs) = (score_of(one), score_of(other));
    if abs(mine - theirs) > 1e-9 {
        return mine > theirs;
    }
    one.width * one.height < other.width * other.height
}

/// A wrap of a wide rank: the row of every card of the rank, left to right.
pub(crate) type Plan = Map<String, usize>;

/// The ways to wrap a wide rank into rows, every row after the first lowered
/// one row of cards more.
pub(crate) fn wrap_plans(runs: &[(Vec<String>, f64)]) -> Vec<Plan> {
    let total = runs.iter().fold(0.0, |sum, (_, width)| sum + width);
    let cards: Vec<&String> = runs.iter().flat_map(|(ids, _)| ids).collect();
    let mut plans = Vec::new();
    for rows in [2usize, 3, 4] {
        let mut cut = Plan::default();
        let mut before = 0.0;
        for (ids, width) in runs {
            let share = (((before + width / 2.0) * rows as f64) / total).floor();
            #[expect(
                clippy::cast_possible_truncation,
                clippy::cast_sign_loss,
                reason = "a whole row from 0 to the last: the floor of a share of a positive total, clamped"
            )]
            let row = js_min((rows - 1) as f64, share) as usize;
            for id in ids {
                cut.insert(id.clone(), row);
            }
            before += width;
        }
        let dealt: Plan = cards
            .iter()
            .enumerate()
            .map(|(index, id)| ((*id).clone(), index % rows))
            .collect();
        if rows < cards.len() {
            plans.push(cut);
            plans.push(dealt);
        }
    }
    let mut seen: Set<Vec<(String, usize)>> = Set::default();
    plans
        .into_iter()
        .filter(|plan| {
            let key: Vec<(String, usize)> =
                plan.iter().map(|(id, &row)| (id.clone(), row)).collect();
            let fresh = plan.values().any(|&row| row > 0) && !seen.contains(&key);
            seen.insert(key);
            fresh
        })
        .collect()
}

/// The lowered cards of a wrap that no line arrives at, each with its rows and
/// the card of its rank that stays in the first row and holds it down.
pub(crate) fn anchored(plan: &Plan, arriving: &Set<String>) -> Vec<(String, usize, String)> {
    let Some(anchor) = plan
        .iter()
        .find(|&(_, &row)| row == 0)
        .map(|(card, _)| card.clone())
    else {
        return Vec::new();
    };
    plan.iter()
        .filter(|&(card, &row)| row > 0 && !arriving.contains(card))
        .map(|(card, &rows)| (card.clone(), rows, anchor.clone()))
        .collect()
}

/// Whether two boxes share some width, one over the other.
fn across(one: &Rect, other: &Rect) -> bool {
    one.x < other.x + other.width && other.x < one.x + one.width
}

/// Whether a wrap leaves a lowered card without any possible supporting row.
/// A group that starts on a later row can stand on another group's cards.
/// Once it starts, each of its later rows needs the preceding row in that group.
/// This is the coordinate-independent part of `sinks`.
pub(crate) fn unsupported(plan: &Plan, around: impl Fn(&str) -> Option<String>) -> bool {
    let mut groups: Map<Option<String>, Set<usize>> = Map::default();
    let rows: Set<usize> = plan.values().copied().collect();
    for (card, &row) in plan {
        groups.entry(around(card)).or_default().insert(row);
    }
    groups.values().any(|kin| {
        let first = kin.iter().copied().min().unwrap_or(0);
        kin.iter().copied().filter(|&row| row > 0).any(|row| {
            let support = if row == first { &rows } else { kin };
            !support.contains(&(row - 1))
        })
    })
}

/// Whether a wrap, laid out, sinks a card rather than wrapping it: some
/// lowered card has no card in the row above standing over it.
pub(crate) fn sinks(
    plan: &Plan,
    boxes: &Map<String, Rect>,
    around: impl Fn(&str) -> Option<String>,
) -> bool {
    let cards: Vec<(&String, usize)> = plan.iter().map(|(card, &row)| (card, row)).collect();
    cards.iter().any(|&(card, row)| {
        if row == 0 {
            return false;
        }
        let kin: Vec<(&String, usize)> = cards
            .iter()
            .copied()
            .filter(|&(other, _)| around(other) == around(card))
            .collect();
        let led = kin.iter().any(|&(_, above)| above < row);
        let under = (if led { &kin } else { &cards })
            .iter()
            .filter(|&&(_, above)| above == row - 1);
        !under
            .into_iter()
            .any(|&(other, _)| across(&boxes[other.as_str()], &boxes[card.as_str()]))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // How the layout choosers compare two layouts (ADR 0039), on layouts
    // weighed by hand: each measure decides only between layouts alike on
    // every earlier one, fit only between layouts that read alike, and a
    // chooser keeps its earlier pick wherever its reading pick reads worse on
    // some measure. What this catches: a rank of the order dropped or moved,
    // fit buying a reading measure, and a guarded choice taking a layout that
    // reads worse.

    /// A layout on a page that fits the reference pane at full scale, read cleanly.
    fn clean() -> Weighed {
        Weighed {
            width: 1000.0,
            height: 700.0,
            crossings: 4.0,
            hooks: Some(0.0),
            bends: Some(20.0),
            length: Some(10_000.0),
            ..Weighed::default()
        }
    }

    /// The clean layout on a page too tall for the reference pane, fitting it worse.
    fn cramped() -> Weighed {
        Weighed {
            height: 2800.0,
            ..clean()
        }
    }

    #[test]
    fn the_clean_page_fits_the_pane_whole_and_the_cramped_page_does_not() {
        assert_eq!(fit_in(clean().width, clean().height), 1.0);
        assert!(fit_in(cramped().width, cramped().height) < 1.0);
    }

    #[test]
    fn each_reading_measure_decides_before_every_later_one_and_before_fit() {
        // A layout worse by one on a measure, against one alike up to it and
        // worse on every later measure and on fit.
        let ranks = [
            (
                Weighed {
                    crossings: 5.0,
                    ..clean()
                },
                Weighed {
                    hooks: Some(3.0),
                    bends: Some(40.0),
                    length: Some(20_000.0),
                    ..cramped()
                },
            ),
            (
                Weighed {
                    hooks: Some(1.0),
                    ..clean()
                },
                Weighed {
                    bends: Some(40.0),
                    length: Some(20_000.0),
                    ..cramped()
                },
            ),
            (
                Weighed {
                    bends: Some(21.0),
                    ..clean()
                },
                Weighed {
                    length: Some(20_000.0),
                    ..cramped()
                },
            ),
            (
                Weighed {
                    length: Some(11_000.0),
                    ..clean()
                },
                cramped(),
            ),
        ];
        for (rank, (worse, later)) in ranks.iter().enumerate() {
            assert!(reads_better(later, worse), "rank {rank}");
            assert!(!reads_better(worse, later), "rank {rank}");
        }
    }

    #[test]
    fn route_lengths_within_a_twentieth_of_each_other_are_alike_and_fit_decides() {
        let longer = Weighed {
            length: Some(10_400.0),
            ..clean()
        };
        assert!(reads_better(&longer, &cramped()));
        let longest = Weighed {
            length: Some(10_600.0),
            ..clean()
        };
        assert!(!reads_better(&longest, &cramped()));
    }

    #[test]
    fn a_guarded_choice_keeps_the_earlier_pick_where_the_reading_pick_reads_worse_somewhere() {
        let fewer = Weighed {
            crossings: 2.0,
            bends: Some(28.0),
            length: Some(13_000.0),
            ..clean()
        };
        // The reading order takes the drawing with fewer crossings ...
        assert!(reads_better(&fewer, &clean()));
        // ... but it turns more and runs longer, so the earlier pick stands.
        assert!(!takes(&fewer, &clean(), false, None));
        assert!(takes(&clean(), &fewer, true, None));
        // Where the two agree, that pick is taken.
        assert!(takes(&fewer, &clean(), true, None));
    }

    #[test]
    fn a_guarded_choice_takes_the_reading_pick_where_it_is_nowhere_worse() {
        let cleaner = Weighed {
            crossings: 2.0,
            ..clean()
        };
        assert!(takes(&cleaner, &clean(), false, None));
        assert!(!takes(&clean(), &cleaner, true, None));
    }

    // Whether a wrap sinks a card rather than wrapping it, on wraps laid by
    // hand. What this catches: a group region the wrap lowers whole refused,
    // because its topmost cards stand under cards of the fan rather than of
    // the region, so the region stands on a row of its own above the fan's
    // other cards (Starting a workhorse, Track); and a lowered card under no
    // card at all taken.

    /// Where the wrap lays each card: a fan of two over the two cards of one region, and one card astray.
    fn wrapped() -> Map<String, Rect> {
        [
            ("hub", 0.0),
            ("peer", 300.0),
            ("first", 0.0),
            ("second", 300.0),
            ("astray", 900.0),
        ]
        .into_iter()
        .map(|(card, x)| {
            (
                card.to_owned(),
                Rect {
                    x,
                    y: 0.0,
                    width: 200.0,
                    height: 80.0,
                },
            )
        })
        .collect()
    }

    /// The cluster round a card: the region's two cards stand in one.
    fn around(card: &str) -> Option<String> {
        matches!(card, "first" | "second").then(|| "region".to_owned())
    }

    fn plan(rows: &[(&str, usize)]) -> Plan {
        rows.iter()
            .map(|&(card, row)| (card.to_owned(), row))
            .collect()
    }

    #[test]
    fn a_region_the_wrap_lowers_whole_may_stand_under_any_card_of_the_row_above() {
        let plan = plan(&[("hub", 0), ("peer", 0), ("first", 1), ("second", 1)]);
        assert!(!sinks(&plan, &wrapped(), around));
    }

    #[test]
    fn a_group_with_a_gap_between_its_rows_cannot_wrap() {
        let plan = plan(&[("hub", 0), ("peer", 1), ("first", 0), ("second", 2)]);
        assert!(unsupported(&plan, around));
        assert!(sinks(&plan, &wrapped(), around));
    }

    #[test]
    fn a_region_that_starts_on_a_later_row_can_use_another_groups_support() {
        let plan = plan(&[("hub", 0), ("peer", 0), ("first", 1), ("second", 1)]);
        assert!(!unsupported(&plan, around));
        assert!(!sinks(&plan, &wrapped(), around));
    }

    #[test]
    fn a_lowered_card_under_no_card_of_the_row_above_sinks() {
        let plan = plan(&[("hub", 0), ("peer", 0), ("astray", 1)]);
        assert!(sinks(&plan, &wrapped(), around));
    }
}
