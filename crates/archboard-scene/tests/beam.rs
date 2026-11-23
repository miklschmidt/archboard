//! The beam a train of pulses resolves into: what every painter draws, tested
//! where the painters meet it.

use archboard_scene::geometry::{Curve, Point, Segment};
use archboard_scene::scene::{
    Beam, BeamPiece, Colour, Motion, PulseLook, Slide, Token, TrafficMark,
};

const fn at(x: f64, y: f64) -> Point {
    Point { x, y }
}

/// A route that runs right, bends down and runs down, with a stub too short to carry light.
fn route() -> Curve {
    Curve {
        from: at(0.0, 0.0),
        segments: vec![
            Segment::Line { to: at(100.0, 0.0) },
            Segment::Cubic {
                first: at(110.0, 0.0),
                second: at(120.0, 10.0),
                to: at(120.0, 20.0),
            },
            Segment::Line {
                to: at(120.0, 20.3),
            },
            Segment::Line {
                to: at(120.0, 120.0),
            },
        ],
    }
}

fn beam(motion: Motion) -> Beam {
    TrafficMark {
        look: PulseLook {
            head: Colour::Token {
                token: Token::Border,
            },
            hot: Colour::White,
            line_width: 1.5,
        },
        route: route(),
        motion,
    }
    .beam()
}

const TURN: Motion = Motion::Turn {
    speed: 200.0,
    cycle: 3.0,
    start: 0.5,
};

#[test]
fn a_piece_too_short_for_light_carries_no_beam() {
    let pieces = beam(TURN).pieces;
    assert_eq!(pieces.len(), 3);
    assert!(
        pieces
            .iter()
            .all(|piece| piece.frame.origin != at(120.0, 20.0))
    );
}

/// Where a piece's bar stands along its frame at a moment: its back and its front.
fn bar_at(piece: &BeamPiece, seconds: f64) -> (f64, f64) {
    let back = piece.rest + piece.slide.at(seconds) + piece.bar.x;
    (back, back + piece.bar.width)
}

/// A train's round: how far its bar slides before it starts over, and how long that takes.
fn round_of(piece: &BeamPiece) -> (f64, f64) {
    let Slide::Loop { length, speed } = piece.slide else {
        panic!("a train loops");
    };
    (length, length / speed)
}

/// A message's window on a piece: its cycle, and when it enters and leaves.
fn window_of(piece: &BeamPiece) -> (f64, f64, f64) {
    let Slide::Pass {
        cycle,
        enter,
        leave,
        ..
    } = piece.slide
    else {
        panic!("a message passes");
    };
    (cycle, enter, leave)
}

const TRAIN: Motion = Motion::Steady {
    speed: 80.0,
    spacing: 40.0,
    phase: 7.0,
};

#[test]
fn a_train_slides_one_spacing_a_round_on_a_repeating_gradient() {
    let beam = beam(TRAIN);
    assert!(beam.gradient.repeat);
    assert!((beam.gradient.span - 40.0).abs() < 1e-9);
    let first = &beam.pieces[0];
    let (length, round) = round_of(first);
    assert!((length - 40.0).abs() < 1e-9);
    // One spacing a round, then back where it started: no seam shows.
    assert!((first.slide.at(round * 0.999) - length * 0.999).abs() < 1e-6);
    assert!(first.slide.at(round * 1.001) < length * 0.01);
}

#[test]
fn a_trains_bar_covers_its_piece_wherever_it_slides() {
    let first = &beam(TRAIN).pieces[0];
    let (_, round) = round_of(first);
    for step in 0..40 {
        let (back, front) = bar_at(first, round * f64::from(step) / 40.0);
        assert!(back < 0.0 && front > 100.0, "{back} {front}");
    }
}

#[test]
fn a_message_stands_off_its_piece_outside_its_window() {
    let first = &beam(TURN).pieces[0];
    let (cycle, enter, leave) = window_of(first);
    // Before its entry, the front stands short of the piece's start.
    assert!(bar_at(first, 0.0).1 < 0.0 && bar_at(first, enter).1 < 0.0);
    // After its exit, and to the end of the turn, its back stands past the piece's end.
    assert!(bar_at(first, leave).0 > 100.0);
    assert!((bar_at(first, cycle - 1e-9).0 - bar_at(first, leave).0).abs() < 1e-9);
    // The turn wraps to where it began.
    assert!((bar_at(first, cycle).1 - bar_at(first, 0.0).1).abs() < 1e-9);
}

#[test]
fn a_message_rides_its_pieces_in_order_at_its_speed() {
    let beam = beam(TURN);
    assert!(!beam.gradient.repeat);
    let first = &beam.pieces[0];
    let (_, enter, leave) = window_of(first);
    let middle = f64::midpoint(enter, leave);
    assert!((0.0..100.0).contains(&bar_at(first, middle).1));
    assert!((bar_at(first, middle + 0.01).1 - bar_at(first, middle).1 - 2.0).abs() < 1e-9);
    let entries: Vec<f64> = beam.pieces.iter().map(|piece| window_of(piece).1).collect();
    assert!(entries.windows(2).all(|pair| pair[0] < pair[1]));
}
