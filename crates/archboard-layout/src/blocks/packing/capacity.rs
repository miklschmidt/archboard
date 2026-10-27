//! Parallel lanes needed where two packed boxes actually face each other.

use crate::geometry::{Point, Rect};
use crate::track::chains::LANE;

use super::super::laid::SAME;
use super::trunks::TRUNK_CLEARANCE;

struct Run {
    route: usize,
    low: f64,
    high: f64,
}

/// Concurrent routes retain room for their turns, including shared branches.
fn peak(runs: &[Run]) -> usize {
    let mut ends: Vec<f64> = runs.iter().flat_map(|run| [run.low, run.high]).collect();
    ends.sort_by(f64::total_cmp);
    ends.dedup();
    ends.windows(2)
        .map(|span| {
            let at = f64::midpoint(span[0], span[1]);
            runs.iter()
                .filter(|run| run.low < at && run.high > at)
                .map(|run| run.route)
                .collect::<crate::track::scene::Set<_>>()
                .len()
        })
        .max()
        .unwrap_or(0)
}

struct Gutter {
    vertical: bool,
    low: f64,
    high: f64,
}

/// Facing boxes share a corridor even where a route turns past their ends.
fn gutter(one: &Rect, other: &Rect, vertical: bool, gap: f64) -> Option<Gutter> {
    let (low, high, start, end) = if vertical {
        (
            one.x + one.width,
            other.x,
            one.y.max(other.y),
            (one.y + one.height).min(other.y + other.height),
        )
    } else {
        (
            one.y + one.height,
            other.y,
            one.x.max(other.x),
            (one.x + one.width).min(other.x + other.width),
        )
    };
    (high > low && high - low <= gap + SAME && end > start).then_some(Gutter {
        vertical,
        low,
        high,
    })
}

fn runs_in(gutter: &Gutter, lines: &[&[Point]]) -> Vec<Run> {
    let mut runs = Vec::new();
    for (route, points) in lines.iter().enumerate() {
        for pair in points.windows(2) {
            let (lane, other_lane, a, b) = if gutter.vertical {
                (pair[0].x, pair[1].x, pair[0].y, pair[1].y)
            } else {
                (pair[0].y, pair[1].y, pair[0].x, pair[1].x)
            };
            if (lane - other_lane).abs() < SAME && lane > gutter.low && lane < gutter.high && a != b
            {
                runs.push(Run {
                    route,
                    // Nearby elbows still need independent approach room.
                    low: a.min(b) - TRUNK_CLEARANCE,
                    high: a.max(b) + TRUNK_CLEARANCE,
                });
            }
        }
    }
    runs
}

/// Reuse a lane at different heights, but retain room for simultaneous runs.
pub(super) fn room_needed(items: &[Rect], lines: &[&[Point]], gap: f64) -> f64 {
    let most = items
        .iter()
        .flat_map(|one| {
            items.iter().flat_map(move |other| {
                [true, false]
                    .into_iter()
                    .filter_map(move |vertical| gutter(one, other, vertical, gap))
            })
        })
        .map(|gutter| peak(&runs_in(&gutter, lines)))
        .max()
        .unwrap_or(0);
    most.saturating_sub(1) as f64 * LANE + 2.0 * TRUNK_CLEARANCE
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(route: usize, low: f64, high: f64) -> Run {
        Run { route, low, high }
    }
    #[test]
    fn a_gutter_reuses_its_room_after_a_route_turns_away() {
        assert_eq!(peak(&[run(0, 0.0, 20.0), run(1, 30.0, 50.0)]), 1);
        assert_eq!(peak(&[run(0, 0.0, 40.0), run(1, 30.0, 50.0)]), 2);
    }
}
