//! What the stage's values do over time, with no canvas.

use super::Stage;
use crate::between::PHASES;
use crate::draw::tests::painting;
use crate::palette::Theme;
use crate::presentation::{Camera, Light, Shine};
use std::collections::HashMap;

fn stage() -> Stage {
    Stage::new(Theme::Light, (100.0, 100.0))
}

#[test]
fn a_glide_moves_over_its_time_and_a_cut_moves_at_once() {
    let mut stage = stage();
    let camera = Camera {
        x: 100.0,
        y: 0.0,
        scale: 1.0,
    };
    stage.set_camera(camera, 100.0, 0.0);
    stage.advance(50.0);
    assert!(stage.presentation.camera.x > 0.0 && stage.presentation.camera.x < 100.0);
    assert!(stage.changing(50.0));
    stage.advance(100.0);
    assert_eq!(stage.presentation.camera.x, 100.0);
    assert!(!stage.changing(100.0));
    stage.set_camera(Camera { x: 0.0, ..camera }, 0.0, 100.0);
    stage.advance(100.0);
    assert_eq!(stage.presentation.camera.x, 0.0);
}

#[test]
fn what_leaves_the_light_fades_to_the_rest_and_is_forgotten() {
    let mut stage = stage();
    let lit = Light {
        rest: 0.14,
        labels: 0.28,
        subjects: HashMap::from([(
            "a".to_owned(),
            Shine {
                opacity: 1.0,
                delay: 0.0,
            },
        )]),
        duration: 100.0,
    };
    stage.set_light(&lit, 0.0);
    stage.advance(100.0);
    assert_eq!(stage.presentation.recede.subjects["a"], 1.0);
    assert!((stage.presentation.recede.rest - 0.14).abs() < 1e-6);
    let out = Light {
        rest: 1.0,
        labels: 1.0,
        subjects: HashMap::new(),
        duration: 100.0,
    };
    stage.set_light(&out, 100.0);
    stage.advance(150.0);
    assert!(stage.presentation.recede.subjects.contains_key("a"));
    stage.advance(200.0);
    assert!(stage.presentation.recede.subjects.is_empty());
    assert!((stage.presentation.recede.rest - 1.0).abs() < 1e-6);
}

/// A step's light, with everything out of it receding to `rest`.
fn veil(rest: f64) -> Light {
    Light {
        rest,
        labels: rest,
        subjects: HashMap::new(),
        duration: 900.0,
    }
}

#[test]
fn a_picture_leaves_in_its_own_light_and_the_next_stands_in_its_own_at_once() {
    let mut stage = stage();
    stage.set_phases(PHASES);
    stage.show(painting(Vec::new()));
    stage.set_light(&veil(0.14), 0.0);
    stage.advance(900.0);
    stage.enter(painting(Vec::new()), None, 100.0, (0.0, 0.0), 900.0);
    stage.set_light(&veil(0.3), 900.0);
    stage.advance(901.0);
    let left = stage.ghost.as_ref().map(|ghost| ghost.look.recede.rest);
    assert!(left.is_some_and(|rest| (rest - 0.14).abs() < 1e-6));
    assert!((stage.presentation.recede.rest - 0.3).abs() < 1e-6);
}

#[test]
fn a_further_hop_lights_later() {
    let mut stage = stage();
    let far_hop = Light {
        rest: 0.14,
        labels: 0.28,
        subjects: HashMap::from([(
            "far".to_owned(),
            Shine {
                opacity: 0.6,
                delay: 100.0,
            },
        )]),
        duration: 100.0,
    };
    stage.set_light(&far_hop, 0.0);
    stage.advance(50.0);
    assert_eq!(stage.presentation.recede.subjects["far"], 1.0);
    stage.advance(200.0);
    assert!((stage.presentation.recede.subjects["far"] - 0.6).abs() < 1e-6);
}
