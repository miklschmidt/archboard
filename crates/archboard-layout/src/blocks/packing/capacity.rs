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

/// Several overlapping runs of one route still occupy only one lane.
fn occupy(active: &mut crate::track::scene::Map<usize, usize>, route: usize, starts: bool) {
    if starts {
        *active.entry(route).or_default() += 1;
    } else if let Some(count) = active.get_mut(&route) {
        *count -= 1;
        if *count == 0 {
            active.swap_remove(&route);
        }
    }
}

/// Concurrent routes retain room for their turns, including shared branches.
fn peak(runs: &[Run]) -> usize {
    let mut events: Vec<_> = runs
        .iter()
        .flat_map(|run| [(run.low, run.route, true), (run.high, run.route, false)])
        .collect();
    // Ends precede starts at one coordinate. A midpoint can round onto an end,
    // where only runs strictly containing that coordinate occupy a lane.
    events.sort_by(|one, other| one.0.total_cmp(&other.0).then(one.2.cmp(&other.2)));
    let mut active = crate::track::scene::Map::<usize, usize>::default();
    let (mut cursor, mut most) = (0, 0);
    for span in events.windows(2).filter(|span| span[0].0 != span[1].0) {
        let at = f64::midpoint(span[0].0, span[1].0);
        while let Some(&(position, route, starts)) = events.get(cursor) {
            if position > at || (position == at && starts) {
                break;
            }
            occupy(&mut active, route, starts);
            cursor += 1;
        }
        most = most.max(active.len());
    }
    most
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

    #[test]
    fn overlapping_runs_of_one_route_reserve_one_lane() {
        assert_eq!(
            peak(&[run(0, 0.0, 40.0), run(0, 20.0, 60.0), run(1, 45.0, 80.0)]),
            2
        );
        assert_eq!(peak(&[run(0, 0.0, 20.0), run(1, 20.0, 40.0)]), 1);
        assert_eq!(peak(&[]), 0);
    }

    #[test]
    fn an_ordered_pass_counts_the_same_routes_as_each_open_span() {
        // Route identities can recur, runs can share endpoints, and adjacent
        // floating-point endpoints need the same strict containment test.
        for offset in [0.0, 1.0, 1e16] {
            let runs: Vec<_> = (0..64)
                .map(|index| {
                    let low = offset + ((index * 17) % 41) as f64;
                    run(index % 11, low, low + ((index * 7) % 23 + 1) as f64)
                })
                .collect();
            let mut ends: Vec<_> = runs.iter().flat_map(|run| [run.low, run.high]).collect();
            ends.sort_by(f64::total_cmp);
            ends.dedup();
            let expected = ends
                .windows(2)
                .map(|span| {
                    let at = f64::midpoint(span[0], span[1]);
                    runs.iter()
                        .filter(|run| run.low < at && run.high > at)
                        .map(|run| run.route)
                        .collect::<crate::track::scene::Set<_>>()
                        .len()
                })
                .max()
                .unwrap_or(0);
            assert_eq!(peak(&runs), expected);
        }
    }
}
