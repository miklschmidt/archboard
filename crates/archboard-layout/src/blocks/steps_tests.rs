//! Steps a joined line need not take, taken out (`steps.rs`). What this
//! catches: a line joined from pieces routed in different blocks that steps
//! sideways and on, or doubles back, where one turn would do, alone or on a
//! trunk; and a slide that takes a step out by moving part of a trunk, by
//! carrying a trunk's line the long way round, by moving a line's end run or
//! its run through its label, or by running a new stretch into a card or past
//! it nearer than the router keeps lines, a title band, a wall it did not
//! cross, along a wall, onto another line's axis, beside it, across it where it
//! did not cross or where that line turns, or into a jog too short for its
//! bends, or that leaves the last run too short for its bend and its
//! arrowhead; and a step left in place because a line that slides away later
//! stood in its way.

use std::slice;

use crate::geometry::{Point, Rect};

use super::steps::{Drawn, Surroundings, unstepped};

/// What the lines keep clear of, owned.
#[derive(Default)]
struct Around {
    boxes: Vec<Rect>,
    walls: Vec<Rect>,
    bands: Vec<Rect>,
}

fn line(points: &[(f64, f64)]) -> Vec<Point> {
    points.iter().map(|&(x, y)| Point { x, y }).collect()
}

fn rect(x: f64, y: f64, width: f64, height: f64) -> Rect {
    Rect {
        x,
        y,
        width,
        height,
    }
}

/// Right, down, right, back up and right again: a line that doubles back.
fn doubling() -> Vec<Point> {
    line(&[
        (0.0, 50.0),
        (100.0, 50.0),
        (100.0, 150.0),
        (200.0, 150.0),
        (200.0, 100.0),
        (300.0, 100.0),
    ])
}

/// The doubling line unstepped onto its first row.
fn on_first() -> Vec<Point> {
    line(&[(0.0, 50.0), (200.0, 50.0), (200.0, 100.0), (300.0, 100.0)])
}

/// The doubling line unstepped onto its last row.
fn on_last() -> Vec<Point> {
    line(&[(0.0, 50.0), (100.0, 50.0), (100.0, 100.0), (300.0, 100.0)])
}

/// Every line unstepped, each with its label, among what they keep clear of.
fn unstepped_labelled(lines: &[(Vec<Point>, Option<Rect>)], around: &Around) -> Vec<Vec<Point>> {
    let drawn: Vec<Drawn<'_>> = lines
        .iter()
        .map(|(points, label)| Drawn {
            points,
            label: *label,
        })
        .collect();
    unstepped(
        &drawn,
        &Surroundings {
            boxes: &around.boxes,
            walls: &around.walls,
            bands: &around.bands,
        },
    )
}

/// Every line unstepped, none labelled.
fn unstepped_all(lines: &[Vec<Point>], around: &Around) -> Vec<Vec<Point>> {
    let labelled: Vec<(Vec<Point>, Option<Rect>)> =
        lines.iter().map(|points| (points.clone(), None)).collect();
    unstepped_labelled(&labelled, around)
}

/// The first line unstepped, among the others.
fn first_unstepped(lines: &[Vec<Point>], around: &Around) -> Vec<Point> {
    unstepped_all(lines, around).swap_remove(0)
}

/// How far a line runs.
fn reach(points: &[Point]) -> f64 {
    points.windows(2).fold(0.0, |sum, pair| {
        sum + (pair[1].x - pair[0].x).abs() + (pair[1].y - pair[0].y).abs()
    })
}

#[test]
fn a_staircase_between_blocks_climbs_with_one_turn_each_way() {
    let stairs = line(&[
        (100.0, 0.0),
        (100.0, 100.0),
        (300.0, 100.0),
        (300.0, 200.0),
        (500.0, 200.0),
        (500.0, 300.0),
    ]);
    let drawn = first_unstepped(slice::from_ref(&stairs), &Around::default());
    assert_eq!(drawn.len(), 4);
    assert_eq!(
        (drawn.first(), drawn.last()),
        (stairs.first(), stairs.last())
    );
}

#[test]
fn a_line_that_doubles_back_at_a_wall_runs_on_without_the_loop() {
    assert_eq!(
        first_unstepped(&[doubling()], &Around::default()),
        on_first()
    );
}

#[test]
fn a_step_stays_where_a_card_or_a_wall_stands_in_either_slide() {
    let cases = [
        (
            "a card where either slide would run",
            Around {
                boxes: vec![rect(120.0, 40.0, 60.0, 70.0)],
                ..Around::default()
            },
        ),
        (
            "a wall either slide would cross",
            Around {
                walls: vec![rect(130.0, 0.0, 40.0, 120.0)],
                ..Around::default()
            },
        ),
    ];
    for (case, around) in cases {
        assert_eq!(
            first_unstepped(&[doubling()], &around),
            doubling(),
            "{case}"
        );
    }
}

#[test]
fn a_step_stays_where_either_slide_crosses_a_line_it_did_not() {
    let across = line(&[(150.0, 0.0), (150.0, 130.0)]);
    assert_eq!(
        first_unstepped(&[doubling(), across], &Around::default()),
        doubling()
    );
}

#[test]
fn a_step_stays_where_either_slide_leaves_a_run_too_short_for_its_two_bends() {
    let shallow = line(&[
        (0.0, 50.0),
        (100.0, 50.0),
        (100.0, 150.0),
        (200.0, 150.0),
        (200.0, 60.0),
        (300.0, 60.0),
    ]);
    assert_eq!(
        first_unstepped(slice::from_ref(&shallow), &Around::default()),
        shallow
    );
}

#[test]
fn a_step_stays_where_the_slide_leaves_the_last_run_too_short_for_its_bend_and_arrowhead() {
    // Reduced from Board viewer's TASK-365 comparison under blocks (TASK-403):
    // the slide left 16 units, a bend of 8 and 8 of straight, under a head
    // whose ink reaches 8.8 back.
    let rising = line(&[
        (0.0, 0.0),
        (100.0, 0.0),
        (100.0, 26.0),
        (200.0, 26.0),
        (200.0, -16.0),
    ]);
    assert_eq!(
        first_unstepped(slice::from_ref(&rising), &Around::default()),
        rising
    );
}

#[test]
fn a_step_stays_where_it_is_the_line_s_run_through_its_label() {
    let label = rect(130.0, 140.0, 40.0, 20.0);
    let drawn = unstepped_labelled(&[(doubling(), Some(label))], &Around::default());
    assert_eq!(drawn[0], doubling());
}

#[test]
fn a_step_another_line_held_is_taken_out_once_that_line_has_slid_away() {
    // Its middle run crosses one of the doubling line's slides and runs beside
    // the other, until it slides onto the column of its first run.
    let later = line(&[
        (350.0, -100.0),
        (350.0, -60.0),
        (150.0, -60.0),
        (150.0, 90.0),
        (450.0, 90.0),
        (450.0, 300.0),
    ]);
    assert_eq!(
        first_unstepped(&[doubling(), later], &Around::default()),
        on_first()
    );
}

#[test]
fn lines_that_share_a_step_s_whole_run_between_two_turns_slide_it_together() {
    let tail = Point { x: 300.0, y: 200.0 };
    let branch: Vec<Point> = doubling().into_iter().chain([tail]).collect();
    let drawn = unstepped_all(&[doubling(), branch], &Around::default());
    let branched: Vec<Point> = on_first().into_iter().chain([tail]).collect();
    assert_eq!(drawn, [on_first(), branched]);
}

#[test]
fn a_step_another_line_shares_only_part_of_stays() {
    let trunk = line(&[(100.0, 150.0), (200.0, 150.0)]);
    assert_eq!(
        first_unstepped(&[doubling(), trunk], &Around::default()),
        doubling()
    );
}

#[test]
fn a_slide_runs_level_no_nearer_a_container_s_title_band_than_a_lane() {
    let around = Around {
        bands: vec![rect(0.0, 0.0, 300.0, 80.0)],
        ..Around::default()
    };
    assert_eq!(first_unstepped(&[doubling()], &around), on_last());
}

#[test]
fn a_slide_passes_a_card_no_nearer_than_the_router_keeps_lines_from_it() {
    let around = Around {
        boxes: vec![rect(120.0, 0.0, 60.0, 40.0)],
        ..Around::default()
    };
    assert_eq!(first_unstepped(&[doubling()], &around), on_last());
}

#[test]
fn a_slide_runs_along_a_wall_no_nearer_than_a_lane_and_a_half() {
    let around = Around {
        walls: vec![rect(-50.0, -100.0, 450.0, 140.0)],
        ..Around::default()
    };
    assert_eq!(first_unstepped(&[doubling()], &around), on_last());
}

#[test]
fn a_slide_keeps_off_a_new_stretch_near_another_line() {
    let cases = [
        (
            "beside another line nearer than a lane",
            line(&[(120.0, 60.0), (180.0, 60.0)]),
        ),
        (
            "onto another line's axis end to end with it",
            line(&[(230.0, 50.0), (400.0, 50.0)]),
        ),
        (
            "across another line beside where it turns",
            line(&[(150.0, 40.0), (150.0, 170.0)]),
        ),
    ];
    for (case, other) in cases {
        assert_eq!(
            first_unstepped(&[doubling(), other], &Around::default()),
            on_last(),
            "{case}"
        );
    }
}

/// The near line of a trunk, and the card beside the trunk's last turn.
fn trunk_near_a_card() -> (Vec<Point>, Around) {
    let near = line(&[
        (1100.0, 0.0),
        (1100.0, 100.0),
        (1000.0, 100.0),
        (1000.0, 200.0),
        (1200.0, 200.0),
        (1200.0, 300.0),
    ]);
    let around = Around {
        boxes: vec![rect(1150.0, 120.0, 100.0, 60.0)],
        ..Around::default()
    };
    (near, around)
}

#[test]
fn a_slide_carries_no_line_of_a_trunk_the_long_way_round() {
    let far = line(&[
        (0.0, 0.0),
        (0.0, 100.0),
        (1000.0, 100.0),
        (1000.0, 200.0),
        (1200.0, 200.0),
        (1200.0, 300.0),
    ]);
    let (near, around) = trunk_near_a_card();
    let drawn = unstepped_all(&[far.clone(), near.clone()], &around);
    assert!(reach(&drawn[0]) <= reach(&far));
    assert!(reach(&drawn[1]) <= reach(&near));
}

#[test]
fn a_slide_carries_a_trunk_s_line_a_little_further_to_take_its_step_out() {
    let jog = line(&[
        (950.0, 0.0),
        (950.0, 100.0),
        (1000.0, 100.0),
        (1000.0, 200.0),
        (1200.0, 200.0),
        (1200.0, 300.0),
    ]);
    let (near, around) = trunk_near_a_card();
    let drawn = first_unstepped(&[jog.clone(), near], &around);
    assert!(drawn.len() < jog.len());
}

#[test]
fn a_small_offset_between_joined_runs_never_stretches_into_a_diagonal() {
    // Reduced from Board persistence: a quarter-point offset at a block port
    // looked upright when projected onto an axis. Sliding its lower run made
    // the run above diagonal, which that projection hid from clearance tests.
    let points = line(&[
        (1648.0, 650.0),
        (1648.0, 682.0),
        (1882.0, 682.0),
        (1881.75, 1583.0),
        (1881.75, 1647.0),
        (2038.0, 1647.0),
        (2038.0, 2833.0),
        (1813.0, 2833.0),
        (1813.0, 2877.0),
    ]);
    let label = rect(1808.0, 726.0, 148.0, 31.0);
    let around = Around {
        walls: vec![rect(201.0, 197.0, 2012.0, 1386.0)],
        ..Around::default()
    };
    let drawn = unstepped_labelled(&[(points, Some(label))], &around);
    let on_axes = drawn[0]
        .windows(2)
        .all(|pair| (pair[1].x - pair[0].x).abs() < 0.5 || (pair[1].y - pair[0].y).abs() < 0.5);
    assert!(on_axes);
}
