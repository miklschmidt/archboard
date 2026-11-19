//! A traffic mark's pulse train: the numbers every painter draws its pulses
//! from, and where a piece's bar stands at a moment of the painter's clock.

use std::f64::consts::FRAC_PI_4;

use archboard_scene::geometry::{Curve, Point, Rect, Segment};
use archboard_scene::scene::{
    Bar, Colour, LegMotion, Motion, PulseLook, PulseTrain, Token, TrafficMark, pulse_slide,
    pulse_train,
};

/// The pulse train of a route on a line 1.5 wide, whose pulses have a core 2.1 thick.
fn train(from: Point, segments: Vec<Segment>, motion: Motion) -> PulseTrain {
    pulse_train(&TrafficMark {
        look: PulseLook {
            head: Colour::from(Token::DiagramText),
            hot: Colour::from(Token::Background),
            line_width: 1.5,
        },
        route: Curve { from, segments },
        motion,
    })
}

const ORIGIN: Point = Point { x: 0.0, y: 0.0 };

fn steady(spacing: f64) -> Motion {
    Motion::Steady {
        speed: 40.0,
        spacing,
        phase: 0.0,
    }
}

fn close(actual: f64, expected: f64) -> bool {
    (actual - expected).abs() < 1e-9
}

#[track_caller]
fn assert_close(actual: f64, expected: f64) {
    assert!(close(actual, expected), "{actual} is not {expected}");
}

#[track_caller]
fn assert_point(actual: Point, x: f64, y: f64) {
    assert!(
        close(actual.x, x) && close(actual.y, y),
        "{actual:?} is not ({x}, {y})"
    );
}

#[test]
fn a_bent_route_gives_each_piece_its_frame_its_light_and_a_bar_over_its_bend() {
    let pulses = train(
        ORIGIN,
        vec![
            Segment::Line {
                to: Point { x: 100.0, y: 0.0 },
            },
            Segment::Cubic {
                first: Point { x: 130.0, y: 0.0 },
                second: Point { x: 150.0, y: 20.0 },
                to: Point { x: 150.0, y: 50.0 },
            },
        ],
        steady(80.0),
    );
    let [straight, bend] = pulses.legs.as_slice() else {
        panic!("two pieces, not {}", pulses.legs.len());
    };

    assert_close(straight.length, 100.0);
    assert_close(straight.turn, 0.0);
    assert_close(straight.stretch, 1.0);
    assert_point(straight.lead, -0.5, 0.0);
    assert_point(straight.trail, 100.5, 0.0);
    // The light reaches half the core and the widest glow, and its room, past the ink.
    let reach = 4.05 + 2.0;
    assert_eq!(
        straight.room,
        Rect {
            x: -reach,
            y: -reach,
            width: 100.0 + reach - -reach,
            height: reach - -reach,
        }
    );
    // A steady bar covers its piece and a spacing either side.
    assert_eq!(
        straight.bar,
        Bar {
            from: -81.0,
            width: 262.0,
            height: 2.1 + 6.0 + 2.0,
        }
    );

    assert_eq!(bend.from, Point { x: 100.0, y: 0.0 });
    assert_close(bend.turn, FRAC_PI_4);
    assert!(bend.length > 50.0 * 2f64.sqrt());
    assert_close(bend.stretch, 50.0 * 2f64.sqrt() / bend.length);
    // The narrow glow runs on along the bend's own tangents, not its chord.
    assert_point(bend.lead, 99.5, 0.0);
    assert_point(bend.trail, 150.0, 50.5);
    assert_close(bend.room.x, 100.0 - reach);
    assert_close(bend.room.width, 50.0 + 2.0 * reach);
    assert_close(bend.room.height, 50.0 + 2.0 * reach);
    // Both control points stray 1500 / (50 * sqrt 2) from the chord, and the bar covers that sag either side.
    let sag = 1500.0 / (50.0 * 2f64.sqrt());
    assert_close(bend.bar.height, 2.1 + 6.0 + 2.0 * sag + 2.0);
}

#[test]
fn a_piece_shorter_than_a_beam_is_skipped_and_still_counts_along_the_route() {
    let pulses = train(
        ORIGIN,
        vec![
            Segment::Line {
                to: Point { x: 0.4, y: 0.0 },
            },
            Segment::Line {
                to: Point { x: 0.4, y: 100.0 },
            },
        ],
        Motion::Turn {
            speed: 100.0,
            cycle: 2.0,
            start: 0.0,
        },
    );

    let [leg] = pulses.legs.as_slice() else {
        panic!("one piece, not {}", pulses.legs.len());
    };
    assert_eq!(leg.from, Point { x: 0.4, y: 0.0 });
    let LegMotion::Turn { along, .. } = leg.motion else {
        panic!("a turn's piece slides as a turn");
    };
    assert_close(along, 0.4);
}

#[test]
fn a_crowded_train_has_no_tail_and_an_uncrowded_one_fades_its_longest_tail() {
    let line = vec![Segment::Line {
        to: Point { x: 100.0, y: 0.0 },
    }];
    let crowded = train(ORIGIN, line.clone(), steady(18.0));
    let uncrowded = train(ORIGIN, line, steady(200.0));

    assert!(crowded.repeats);
    assert_close(crowded.span, 18.0);
    assert_close(crowded.cycle, 18.0 / 40.0);
    let offsets: Vec<f64> = crowded.stops.iter().map(|stop| stop.offset).collect();
    let expected = [3.0 / 18.0, 9.6 / 18.0, 15.0 / 18.0, 1.0];
    assert!(
        offsets.len() == expected.len()
            && offsets
                .iter()
                .zip(expected)
                .all(|(&offset, at)| close(offset, at)),
        "{offsets:?} are not {expected:?}"
    );

    assert_eq!(uncrowded.stops.len(), 9 + 4);
    let first = uncrowded.stops[0];
    // The tail starts its longest, 56, behind the head and front, dark.
    assert_close(first.offset, (200.0 - 71.0) / 200.0);
    assert_close(first.light, 0.0);
    assert!(!first.hot);
    let front = uncrowded.stops[12];
    assert_close(front.offset, 1.0);
    assert!(front.hot);
}

#[test]
fn a_turn_keeps_its_window_on_a_piece_inside_its_cycle() {
    let line = || {
        vec![Segment::Line {
            to: Point { x: 100.0, y: 0.0 },
        }]
    };
    let window = |start: f64| {
        let pulses = train(
            ORIGIN,
            line(),
            Motion::Turn {
                speed: 100.0,
                cycle: 2.0,
                start,
            },
        );
        assert!(!pulses.repeats);
        assert_close(pulses.span, 71.0);
        assert_close(pulses.cycle, 2.0);
        let LegMotion::Turn {
            enters,
            leaves,
            from,
            to,
            ..
        } = pulses.legs[0].motion
        else {
            panic!("a turn's piece slides as a turn");
        };
        (enters, leaves, from, to)
    };

    // Leaving at the turn's start, the pulse would enter before it: the window opens at 0.
    let (enters, leaves, from, to) = window(0.0);
    assert_close(enters, 0.0);
    assert_close(leaves, 1.69);
    assert_close(from, 3.0 - 71.0);
    assert_close(to, 169.0 + 3.0 - 71.0);

    // Leaving late, it would leave after the turn ends: the window closes at the cycle.
    let (enters, leaves, from, to) = window(1.5);
    assert_close(enters, 1.46);
    assert_close(leaves, 2.0);
    assert_close(from, -4.0 + 3.0 - 71.0);
    assert_close(to, 50.0 + 3.0 - 71.0);
}

#[test]
fn a_bar_slides_with_the_clock_and_a_message_is_off_its_piece_outside_its_window() {
    let turn = LegMotion::Turn {
        enters: 1.46,
        leaves: 2.0,
        from: -72.0,
        to: -18.0,
        start: 1.5,
        speed: 100.0,
        along: 0.0,
        cycle: 2.0,
    };
    assert_eq!(pulse_slide(&turn, 1.0), None);
    let on = pulse_slide(&turn, 1.6).expect("on the piece in its window");
    assert_close(on, 10.0 + 3.0 - 71.0);
    // The clock runs on past a turn, and the next turn repeats it.
    let again = pulse_slide(&turn, 3.6).expect("on the piece in the next turn");
    assert_close(again, on);
    assert_eq!(pulse_slide(&turn, 2.2), None);

    let steady = LegMotion::Steady {
        shift: -77.0,
        period: 80.0,
        speed: 40.0,
    };
    assert_eq!(pulse_slide(&steady, 0.0), Some(-77.0));
    assert_eq!(pulse_slide(&steady, 1.0), Some(-37.0));
    // A steady train slides one spacing and starts again.
    assert_eq!(pulse_slide(&steady, 2.0), Some(-77.0));
}
