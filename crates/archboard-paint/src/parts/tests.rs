//! A strip canvas that keeps its parts draws the frames that it would draw
//! afresh, byte for byte, while the camera moves (ADR 0074). The picture is the
//! dogfood vault's "Codex session", the fixture of `archboard-scene`.

use super::{MOST_KEPT, Parts};
use crate::canvas::{Canvas, Ink, PartKey};
use crate::cpu::CpuCanvas;
use crate::palette::Theme;
use crate::presentation::Camera;
use crate::stage::{Arrival, Pace, Stage, Surface};
use crate::testing::Record;
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
    let size = (f64::from(SIZE.0), f64::from(SIZE.1));
    let mut stage = Stage::new(Theme::Dark, size, Pace::default());
    let painting = Painting {
        scene: paint(&request),
        icons: std::collections::BTreeMap::new(),
    };
    stage.arrive(painting, Arrival::Cut);
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

/// Move the camera of a stage at a moment.
fn look(stage: &mut Stage, to: Camera, now: f64) {
    stage.present(crate::testing::camera(to, 0.0, now));
}

#[test]
fn a_kept_frame_is_the_frame_drawn_afresh() {
    let (mut kept, mut fresh) = (stage(), stage());
    let mut strips = CpuCanvas::new(SIZE.0, SIZE.1);
    let mut plain = CpuCanvas::new(SIZE.0, SIZE.1);
    for (index, camera) in CAMERAS.into_iter().enumerate() {
        let now = 16.0 * index as f64;
        look(&mut kept, camera, now);
        kept.draw(Surface::Strips(&mut strips), now);
        look(&mut fresh, camera, now);
        fresh.draw(Surface::Direct(&mut plain), now);
        assert!(
            strips.pixels() == plain.pixels(),
            "frame {index} differs from the frame drawn afresh"
        );
    }
}

#[test]
fn a_kept_part_draws_its_strokes_as_their_outlines() {
    let mut stage = stage();
    let mut kept = Record::default();
    // The first two cameras show the whole picture, so nothing is left out.
    for (index, camera) in CAMERAS.into_iter().take(2).enumerate() {
        kept = Record::default();
        look(&mut stage, camera, 16.0 * index as f64);
        stage.draw(Surface::Strips(&mut kept), 16.0 * index as f64);
    }
    let mut afresh = Record::default();
    stage.draw(Surface::Direct(&mut afresh), 32.0);
    let strokes = |record: &Record| record.ops.iter().filter(|op| op.stroked).count();
    assert!(strokes(&kept) < strokes(&afresh));
    assert_eq!(kept.ops.len(), afresh.ops.len());
    assert_eq!(kept.layers, afresh.layers);
}

/// Enough path storage that two separate copies exceed the keeper's budget.
fn large_path() -> BezPath {
    BezPath::from_vec(vec![PathEl::MoveTo(Point::ORIGIN); MOST_KEPT / 2 + 1])
}

/// Record one filled path without rasterizing its geometry.
fn keep_fill<C: Canvas>(keeper: &mut C, key: PartKey, path: &BezPath) {
    assert!(keeper.keep());
    keeper.fill(path, &Ink::Solid(Color::BLACK), false);
    keeper.kept(key, Affine::IDENTITY);
}

#[test]
fn evicted_children_still_count_while_their_parent_holds_them() {
    let mut parts = Parts::new((10.0, 10.0));
    let mut record = Record::default();
    let mut keeper = parts.over(&mut record);
    let path = large_path();
    assert!(keeper.keep());
    for key in [PartKey::Text(1), PartKey::Text(2)] {
        keep_fill(&mut keeper, key, &path);
    }
    keeper.kept(PartKey::Text(3), Affine::IDENTITY);
    // A root must not keep an over-budget graph alive after the child index
    // was cleared. It still draws once, and later parts can be kept normally.
    assert!(!keeper.again(PartKey::Text(3), Affine::IDENTITY));
    assert_eq!(record.ops.len(), 2);
    let mut keeper = parts.over(&mut record);
    keep_fill(&mut keeper, PartKey::Text(4), &BezPath::new());
    assert!(keeper.again(PartKey::Text(4), Affine::IDENTITY));
}

#[test]
fn shared_child_paths_count_once() {
    let mut parts = Parts::new((10.0, 10.0));
    let mut record = Record::default();
    let mut keeper = parts.over(&mut record);
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
