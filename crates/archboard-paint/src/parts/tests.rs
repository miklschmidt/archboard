//! A strip canvas that keeps its parts draws the frames that it would draw
//! afresh, byte for byte, while the camera moves (ADR 0074). The picture is the
//! dogfood vault's "Codex session", the fixture of `archboard-scene`.

use super::{Keeper, MOST_KEPT};
use crate::canvas::{Canvas, Count, Ink, PartKey};
use crate::cpu::CpuCanvas;
use crate::palette::Theme;
use crate::presentation::Camera;
use crate::stage::Stage;
use archboard_scene::paint::paint;
use archboard_scene::request::PaintRequest;
use archboard_scene::scene::Painting;
use kurbo::{Affine, BezPath, PathEl, Point};
use peniko::Color;

/// The paint request of "Codex session".
const REQUEST: &str =
    include_str!("../../../archboard-scene/tests/fixtures/codex-session.paint.json");

/// The canvas, in pixels.
const SIZE: (u16, u16) = (400, 300);

/// A stage that shows the picture.
fn stage() -> Stage {
    let request: PaintRequest = serde_json::from_str(REQUEST).expect("the fixture is a request");
    let mut stage = Stage::new(Theme::Dark, (f64::from(SIZE.0), f64::from(SIZE.1)));
    stage.show(Painting {
        scene: paint(&request),
        icons: std::collections::BTreeMap::new(),
    });
    stage
}

/// Where the camera stands in each frame: the picture fitted, a step in, half
/// of it off the canvas, and closer than a pixel to a unit.
const CAMERAS: [Camera; 5] = [
    Camera {
        x: 0.0,
        y: 0.0,
        scale: 0.2,
    },
    Camera {
        x: 12.5,
        y: 3.25,
        scale: 0.21,
    },
    Camera {
        x: 80.3,
        y: -40.7,
        scale: 0.37,
    },
    Camera {
        x: -300.0,
        y: -150.6,
        scale: 0.6,
    },
    Camera {
        x: -900.0,
        y: -700.0,
        scale: 2.5,
    },
];

/// Draw a frame of a stage under a camera.
fn frame<C: Canvas>(stage: &mut Stage, canvas: &mut C, camera: Camera, now: f64) {
    stage.set_camera(camera, 0.0, now);
    stage.draw(canvas, now);
}

#[test]
fn a_kept_frame_is_the_frame_drawn_afresh() {
    let (mut kept, mut fresh) = (stage(), stage());
    let mut keeper = Keeper::new(
        CpuCanvas::new(SIZE.0, SIZE.1),
        (f64::from(SIZE.0), f64::from(SIZE.1)),
    );
    let mut plain = CpuCanvas::new(SIZE.0, SIZE.1);
    for (index, camera) in CAMERAS.into_iter().enumerate() {
        let now = 16.0 * index as f64;
        keeper.canvas().begin();
        frame(&mut kept, &mut keeper, camera, now);
        plain.begin();
        frame(&mut fresh, &mut plain, camera, now);
        let drawn = keeper.canvas().finish().to_vec();
        assert!(
            drawn == plain.finish(),
            "frame {index} differs from the frame drawn afresh"
        );
    }
}

#[test]
fn a_kept_part_draws_its_strokes_as_their_outlines() {
    let mut stage = stage();
    let mut keeper = Keeper::new(Count::default(), (f64::from(SIZE.0), f64::from(SIZE.1)));
    // The first two cameras show the whole picture, so nothing is left out.
    for (index, camera) in CAMERAS.into_iter().take(2).enumerate() {
        *keeper.canvas() = Count::default();
        frame(&mut stage, &mut keeper, camera, 16.0 * index as f64);
    }
    let kept = *keeper.canvas();
    let mut afresh = Count::default();
    frame(&mut stage, &mut afresh, CAMERAS[1], 32.0);
    assert!(kept.strokes < afresh.strokes, "{kept:?} {afresh:?}");
    assert_eq!(kept.fills + kept.strokes, afresh.fills + afresh.strokes);
    assert_eq!(kept.layers, afresh.layers);
}

/// Enough path storage that two separate copies exceed the keeper's budget.
fn large_path() -> BezPath {
    BezPath::from_vec(vec![PathEl::MoveTo(Point::ORIGIN); MOST_KEPT / 2 + 1])
}

/// Record one filled path without rasterizing its geometry.
fn keep_fill(keeper: &mut Keeper<Count>, key: PartKey, path: &BezPath) {
    assert!(keeper.keep());
    keeper.fill(path, &Ink::Solid(Color::BLACK), false);
    keeper.kept(key, Affine::IDENTITY);
}

#[test]
fn evicted_children_still_count_while_their_parent_holds_them() {
    let mut keeper = Keeper::new(Count::default(), (10.0, 10.0));
    let path = large_path();
    assert!(keeper.keep());
    for key in [PartKey::Text(1), PartKey::Text(2)] {
        keep_fill(&mut keeper, key, &path);
    }
    keeper.kept(PartKey::Text(3), Affine::IDENTITY);
    // A root must not keep an over-budget graph alive after the child index
    // was cleared. It still draws once, and later parts can be kept normally.
    assert!(!keeper.again(PartKey::Text(3), Affine::IDENTITY));
    assert_eq!(keeper.canvas().fills, 2);
    keep_fill(&mut keeper, PartKey::Text(4), &BezPath::new());
    assert!(keeper.again(PartKey::Text(4), Affine::IDENTITY));
}

#[test]
fn shared_child_paths_count_once() {
    let mut keeper = Keeper::new(Count::default(), (10.0, 10.0));
    let path = large_path();
    keep_fill(&mut keeper, PartKey::Text(1), &path);
    assert!(keeper.keep());
    for _ in 0..2 {
        assert!(keeper.again(PartKey::Text(1), Affine::IDENTITY));
    }
    keeper.kept(PartKey::Text(2), Affine::IDENTITY);
    assert!(keeper.again(PartKey::Text(1), Affine::IDENTITY));
    assert!(keeper.again(PartKey::Text(2), Affine::IDENTITY));
}
