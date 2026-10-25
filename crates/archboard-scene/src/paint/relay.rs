//! How a board's traffic keeps time (ADR 0027). A line carries a steady train
//! of pulses; lines that keep the same time hand their pulses on through the
//! card between them, held for the shorter way round its edge. Everything is a
//! function of the board, so one board draws the same bytes every time.

use std::collections::HashMap;

use crate::drawing::Traffic;
use crate::geometry::{Point, Rect};
use crate::js;
use crate::paint::design::CARD_RADIUS;

/// The least distance between two pulses on a line.
const MIN_SPACING: f64 = 36.0;
/// How many times faster a pulse flies than the speed its author gave.
pub(super) const PULSE_PACE: f64 = 2.0;
const SLOWEST: f64 = 8.0;
const FASTEST: f64 = 600.0;

/// One line that carries traffic, as the rhythm is worked out.
#[derive(Clone, Debug)]
pub(super) struct Lane {
    pub id: String,
    pub from: String,
    pub to: String,
    pub traffic: Traffic,
    pub start: Point,
    pub end: Point,
    pub length: f64,
    /// How long the part the pulses ride is: none, when it is too short to ride.
    pub ride: f64,
}

/// How one line's pulses move.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Rhythm {
    pub speed: f64,
    pub spacing: f64,
    pub phase: f64,
}

/// Whether the pulses that sink into a card carry on out of a line there.
fn hands_on(arriving: &Lane, leaving: &Lane) -> bool {
    arriving.id != leaving.id
        && arriving.to == leaving.from
        && arriving.traffic.speed == leaving.traffic.speed
        && arriving.traffic.volume == leaving.traffic.volume
}

/// A deterministic number from 0 to 1: FNV-1a over the seed's UTF-16 code
/// units, one round of mulberry32 to read it.
fn seeded(seed: &str) -> f64 {
    let mut state: u32 = 0x811c_9dc5;
    for code in seed.encode_utf16() {
        state = (state ^ u32::from(code)).wrapping_mul(0x0100_0193);
    }
    let state = state.wrapping_add(0x6d2b_79f5);
    let mut mixed = (state ^ (state >> 15)).wrapping_mul(1 | state);
    mixed = mixed.wrapping_add((mixed ^ (mixed >> 7)).wrapping_mul(61 | mixed)) ^ mixed;
    f64::from(mixed ^ (mixed >> 14)) / 4_294_967_296.0
}

/// A number held to the range `[0, period)`.
pub(super) fn within(value: f64, period: f64) -> f64 {
    ((value % period) + period) % period
}

/// The lanes that keep each other's time, each group in the order its lanes were given.
fn chains(lanes: &[Lane]) -> Vec<Vec<&Lane>> {
    let mut head: Vec<usize> = (0..lanes.len()).collect();
    fn find(head: &mut [usize], index: usize) -> usize {
        let mut root = index;
        while head[root] != root {
            root = head[root];
        }
        head[index] = root;
        root
    }
    for (from, arriving) in lanes.iter().enumerate() {
        for (to, leaving) in lanes.iter().enumerate() {
            if hands_on(arriving, leaving) {
                let a = find(&mut head, from);
                let b = find(&mut head, to);
                head[a] = b;
            }
        }
    }
    let mut order: Vec<usize> = Vec::new();
    let mut groups: HashMap<usize, Vec<&Lane>> = HashMap::new();
    for (index, lane) in lanes.iter().enumerate() {
        let root = find(&mut head, index);
        if !groups.contains_key(&root) {
            order.push(root);
        }
        groups.entry(root).or_default().push(lane);
    }
    order
        .into_iter()
        .filter_map(|root| groups.remove(&root))
        .collect()
}

/// The distance between two pulses on every line of a chain.
fn spacing_of(chain: &[&Lane]) -> f64 {
    let Traffic { speed, volume } = chain[0].traffic;
    let shortest = js::min(
        chain
            .iter()
            .filter(|lane| lane.ride > 0.0)
            .map(|lane| lane.ride),
    );
    js::js_max(MIN_SPACING, js::js_min(speed / volume, shortest))
}

/// Where the pulses of every lane of a chain are at time zero.
fn phases_of(
    chain: &[&Lane],
    spacing: f64,
    across: &dyn Fn(&str, Point, Point) -> f64,
) -> HashMap<String, f64> {
    let mut phases: HashMap<String, f64> = HashMap::new();
    let mut queue: std::collections::VecDeque<&Lane> = std::collections::VecDeque::new();
    let unfed: Vec<&Lane> = chain
        .iter()
        .copied()
        .filter(|lane| !chain.iter().any(|other| hands_on(other, lane)))
        .collect();
    let starts = if unfed.is_empty() {
        vec![chain[0]]
    } else {
        unfed
    };
    for start in starts.iter().chain(chain.iter()) {
        if phases.contains_key(&start.id) {
            continue;
        }
        phases.insert(start.id.clone(), seeded(&start.from) * spacing);
        queue.push_back(start);
        while let Some(lane) = queue.pop_front() {
            for next in chain {
                if phases.contains_key(&next.id) || !hands_on(lane, next) {
                    continue;
                }
                let arrived = within(phases[&lane.id] - lane.length, spacing);
                phases.insert(
                    next.id.clone(),
                    within(arrived - across(&lane.to, lane.end, next.start), spacing),
                );
                queue.push_back(next);
            }
        }
    }
    phases
}

/// How every lane's pulses move, by id.
pub(super) fn relay_rhythms(
    lanes: &[Lane],
    across: &dyn Fn(&str, Point, Point) -> f64,
) -> HashMap<String, Rhythm> {
    let mut rhythms = HashMap::new();
    for chain in chains(lanes) {
        let speed = js::js_min(
            js::js_max(chain[0].traffic.speed * PULSE_PACE, SLOWEST),
            FASTEST,
        );
        let spacing = spacing_of(&chain);
        let phases = phases_of(&chain, spacing, across);
        for lane in &chain {
            rhythms.insert(
                lane.id.clone(),
                Rhythm {
                    speed,
                    spacing,
                    phase: phases[&lane.id],
                },
            );
        }
    }
    rhythms
}

/// How many straight pieces walk a quarter turn of a corner.
const CORNER_PIECES: usize = 3;

/// A card's edge, walked clockwise from where its top edge begins.
struct Ring {
    points: Vec<Point>,
    along: Vec<f64>,
    length: f64,
}

/// The points of a quarter turn of a corner, after the one it starts at.
fn corner(centre: Point, radius: f64, from: f64) -> Vec<Point> {
    (0..CORNER_PIECES)
        .map(|step| {
            let angle =
                ((from + (step as f64 + 1.0) / CORNER_PIECES as f64) * std::f64::consts::PI) / 2.0;
            Point {
                x: centre.x + radius * libm::cos(angle),
                y: centre.y + radius * libm::sin(angle),
            }
        })
        .collect()
}

/// A card's edge as a ring of points.
fn ring_of(rect: Rect) -> Ring {
    let r = js::min([CARD_RADIUS, rect.width / 2.0, rect.height / 2.0]);
    let Rect {
        x,
        y,
        width,
        height,
    } = rect;
    let mut points = vec![
        Point { x: x + r, y },
        Point {
            x: x + width - r,
            y,
        },
    ];
    points.extend(corner(
        Point {
            x: x + width - r,
            y: y + r,
        },
        r,
        -1.0,
    ));
    points.push(Point {
        x: x + width,
        y: y + height - r,
    });
    points.extend(corner(
        Point {
            x: x + width - r,
            y: y + height - r,
        },
        r,
        0.0,
    ));
    points.push(Point {
        x: x + r,
        y: y + height,
    });
    points.extend(corner(
        Point {
            x: x + r,
            y: y + height - r,
        },
        r,
        1.0,
    ));
    points.push(Point { x, y: y + r });
    points.extend(corner(Point { x: x + r, y: y + r }, r, 2.0));
    points.pop();
    let mut along = vec![0.0];
    for (index, point) in points.iter().enumerate() {
        let next = points[(index + 1) % points.len()];
        along.push(along[index] + js::hypot(next.x - point.x, next.y - point.y));
    }
    let length = along.pop().unwrap_or(0.0);
    Ring {
        points,
        along,
        length,
    }
}

/// How far along the ring the place nearest a point is.
fn locate(ring: &Ring, point: Point) -> f64 {
    let mut best_gap = f64::INFINITY;
    let mut best_at = 0.0;
    for (index, from) in ring.points.iter().enumerate() {
        let to = ring.points[(index + 1) % ring.points.len()];
        let dx = to.x - from.x;
        let dy = to.y - from.y;
        let size = dx * dx + dy * dy;
        let t = if size == 0.0 {
            0.0
        } else {
            js::js_min(
                js::js_max(
                    ((point.x - from.x) * dx + (point.y - from.y) * dy) / size,
                    0.0,
                ),
                1.0,
            )
        };
        let gap = js::hypot(from.x + dx * t - point.x, from.y + dy * t - point.y);
        if gap < best_gap {
            best_gap = gap;
            best_at = ring.along[index] + t * size.sqrt();
        }
    }
    best_at
}

/// How far the shorter way round the edge of a card is from one place to another.
pub(super) fn rim_length(rect: Rect, from: Point, to: Point) -> f64 {
    let ring = ring_of(rect);
    let forward = within(locate(&ring, to) - locate(&ring, from), ring.length);
    js::js_min(forward, ring.length - forward)
}

#[cfg(test)]
mod tests {
    //! How traffic keeps time (ADR 0027): lines that keep the same time hand
    //! their pulses on through the card between them, a line's pulses lie
    //! behind its feeder's by the line and the way round the card, and where
    //! the time differs nothing is handed on. Every line carries a pulse at
    //! every moment, and no two are closer than a blur.

    use super::{Lane, relay_rhythms, rim_length, within};
    use crate::drawing::Traffic;
    use crate::geometry::{Point, Rect};

    const SAME: Traffic = Traffic {
        speed: 40.0,
        volume: 0.5,
    };

    /// A line that carries traffic, ending where its feeder's pulses go.
    fn lane(id: &str, from: &str, to: &str) -> Lane {
        Lane {
            id: id.to_owned(),
            from: from.to_owned(),
            to: to.to_owned(),
            traffic: SAME,
            start: Point { x: 0.0, y: 0.0 },
            end: Point { x: 0.0, y: 100.0 },
            length: 100.0,
            ride: 90.0,
        }
    }

    fn with_traffic(mut lane: Lane, speed: f64, volume: f64) -> Lane {
        lane.traffic = Traffic { speed, volume };
        lane
    }

    fn with_ride(mut lane: Lane, ride: f64) -> Lane {
        lane.ride = ride;
        lane
    }

    /// The way across a card: a fixed distance.
    fn round(length: f64) -> impl Fn(&str, Point, Point) -> f64 {
        move |_, _, _| length
    }

    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-6
    }

    #[test]
    fn the_line_out_lies_the_line_in_and_the_way_round_behind_it() {
        let rhythms = relay_rhythms(&[lane("ab", "a", "b"), lane("bc", "b", "c")], &round(50.0));
        let (ab, bc) = (rhythms["ab"], rhythms["bc"]);
        assert_eq!(bc.spacing, ab.spacing);
        assert_eq!(bc.speed, ab.speed);
        // The pulse is a line's length behind where it began when it reaches the
        // card, and the way round behind that when it leaves.
        assert!(close(bc.phase, within(ab.phase - 100.0 - 50.0, ab.spacing)));
    }

    #[test]
    fn every_line_out_of_the_card_that_keeps_the_time_takes_the_pulse_and_the_others_do_not() {
        let rhythms = relay_rhythms(
            &[
                lane("ab", "a", "b"),
                lane("bc", "b", "c"),
                lane("bd", "b", "d"),
                with_traffic(lane("be", "b", "e"), 40.0, 2.0),
            ],
            &round(50.0),
        );
        let behind = within(rhythms["ab"].phase - 100.0 - 50.0, rhythms["ab"].spacing);
        assert!(close(rhythms["bc"].phase, behind));
        assert!(close(rhythms["bd"].phase, behind));
        // The line at another volume keeps a rhythm of its own.
        assert_ne!(rhythms["be"].spacing, rhythms["ab"].spacing);
    }

    #[test]
    fn lines_that_differ_in_speed_or_in_volume_hand_nothing_on() {
        for (speed, volume) in [(80.0, 0.5), (40.0, 1.0)] {
            let fed = relay_rhythms(
                &[
                    lane("ab", "a", "b"),
                    with_traffic(lane("bc", "b", "c"), speed, volume),
                ],
                &round(50.0),
            );
            let alone = relay_rhythms(
                &[with_traffic(lane("bc", "b", "c"), speed, volume)],
                &round(50.0),
            );
            assert_eq!(fed["bc"], alone["bc"]);
        }
    }

    #[test]
    fn a_line_that_nothing_feeds_starts_with_the_others_that_leave_its_card_and_apart_from_other_cards()
     {
        let rhythms = relay_rhythms(
            &[
                lane("xy", "x", "y"),
                lane("xz", "x", "z"),
                lane("uv", "u", "v"),
            ],
            &round(50.0),
        );
        assert_eq!(rhythms["xy"].phase, rhythms["xz"].phase);
        assert_ne!(rhythms["uv"].phase, rhythms["xy"].phase);
    }

    #[test]
    fn a_line_that_two_others_feed_follows_the_first_in_the_order_the_lines_are_drawn() {
        let rhythms = relay_rhythms(
            &[
                lane("pc", "p", "c"),
                lane("qc", "q", "c"),
                lane("cd", "c", "d"),
            ],
            &round(50.0),
        );
        assert!(close(
            rhythms["cd"].phase,
            within(rhythms["pc"].phase - 100.0 - 50.0, rhythms["pc"].spacing)
        ));
    }

    #[test]
    fn a_chain_that_closes_on_itself_still_gives_every_line_a_place() {
        let rhythms = relay_rhythms(&[lane("ab", "a", "b"), lane("ba", "b", "a")], &round(50.0));
        assert!(rhythms["ab"].phase.is_finite() && rhythms["ba"].phase.is_finite());
    }

    #[test]
    fn a_card_with_almost_no_way_across_still_holds_the_pulse_for_it() {
        let rhythms = relay_rhythms(&[lane("ab", "a", "b"), lane("bc", "b", "c")], &round(2.0));
        assert!(close(
            rhythms["bc"].phase,
            within(rhythms["ab"].phase - 100.0 - 2.0, rhythms["ab"].spacing)
        ));
    }

    #[test]
    fn pulses_are_as_far_apart_as_the_authored_speed_over_volume_says_and_fly_twice_the_speed() {
        let rhythms = relay_rhythms(&[with_ride(lane("ab", "a", "b"), 500.0)], &round(0.0));
        assert_eq!(rhythms["ab"].spacing, 80.0);
        assert_eq!(rhythms["ab"].speed, 80.0);
    }

    #[test]
    fn but_never_further_apart_than_the_shortest_line_of_their_chain_is_long() {
        let rhythms = relay_rhythms(
            &[
                with_ride(with_traffic(lane("ab", "a", "b"), 40.0, 0.01), 300.0),
                with_ride(with_traffic(lane("bc", "b", "c"), 40.0, 0.01), 70.0),
            ],
            &round(0.0),
        );
        assert_eq!(rhythms["ab"].spacing, 70.0);
        assert_eq!(rhythms["bc"].spacing, 70.0);
    }

    #[test]
    fn and_never_closer_than_a_blur() {
        let rhythms = relay_rhythms(
            &[with_ride(
                with_traffic(lane("ab", "a", "b"), 10.0, 5.0),
                500.0,
            )],
            &round(0.0),
        );
        assert_eq!(rhythms["ab"].spacing, 36.0);
    }

    #[test]
    fn however_extreme_the_speed_a_pulse_flies_at_a_speed_a_browser_keeps() {
        for speed in [f64::from_bits(1), 1e-9, 1e12, f64::MAX] {
            let rhythms = relay_rhythms(
                &[with_traffic(lane("ab", "a", "b"), speed, 1.0)],
                &round(0.0),
            );
            let rhythm = rhythms["ab"];
            assert!((8.0..=600.0).contains(&rhythm.speed));
            assert!(rhythm.spacing / rhythm.speed > 0.05);
        }
    }

    const CARD: Rect = Rect {
        x: 0.0,
        y: 0.0,
        width: 200.0,
        height: 80.0,
    };

    /// Half the way round a 200 by 80 card with 6 unit corners, as the ring of
    /// short pieces walks it.
    fn half() -> f64 {
        (2.0 * (200.0 - 12.0) + 2.0 * (80.0 - 12.0) + 2.0 * std::f64::consts::PI * 6.0) / 2.0
    }

    fn at(x: f64, y: f64) -> Point {
        Point { x, y }
    }

    #[test]
    fn a_pulse_held_in_a_card_takes_the_shorter_way_round_whichever_side_it_is_on() {
        assert!((rim_length(CARD, at(100.0, 0.0), at(150.0, 0.0)) - 50.0).abs() < 0.05);
        assert!((rim_length(CARD, at(150.0, 0.0), at(100.0, 0.0)) - 50.0).abs() < 0.05);
    }

    #[test]
    fn it_is_never_more_than_halfway_round_and_halfway_is_the_far_side() {
        assert!((rim_length(CARD, at(100.0, 0.0), at(100.0, 80.0)) - half()).abs() < 0.5);
        for (from, to) in [
            (at(20.0, 0.0), at(200.0, 60.0)),
            (at(0.0, 40.0), at(200.0, 40.0)),
            (at(190.0, 80.0), at(5.0, 80.0)),
        ] {
            assert!(rim_length(CARD, from, to) <= half() + 0.01);
        }
    }

    #[test]
    fn a_pulse_that_leaves_where_it_came_in_goes_nowhere() {
        assert!(rim_length(CARD, at(100.0, 0.0), at(100.0, 0.0)).abs() < 1e-6);
    }

    #[test]
    fn a_place_off_the_outline_is_taken_to_the_nearest_place_on_it() {
        assert!((rim_length(CARD, at(100.0, -3.0), at(150.0, 3.0)) - 50.0).abs() < 0.05);
    }
}
