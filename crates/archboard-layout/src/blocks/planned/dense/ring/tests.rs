use super::*;

const FRAME: Rect = Rect {
    x: 0.0,
    y: 0.0,
    width: 1000.0,
    height: 600.0,
};

const PAGE: Point = Point {
    x: 3000.0,
    y: 2000.0,
};

fn part(x: f64, y: f64) -> Rect {
    Rect {
        x,
        y,
        width: 200.0,
        height: 100.0,
    }
}

/// A frame of some parts with some doors round it, and the boxes of the doors. The parts come
/// first, then the frame's outline, then the doors.
fn framed(parts: &[Rect], doors: &[Point]) -> (Scene, Vec<usize>) {
    let mut scene = Scene {
        frames: vec![FRAME],
        ..Scene::default()
    };
    for &at in parts {
        scene.boxes.push(at);
        scene.solid.push(true);
        scene.within.push(Some(0));
    }
    scene.boxes.push(FRAME);
    scene.solid.push(false);
    scene.within.push(Some(0));
    let mut ids = Vec::new();
    for &size in doors {
        ids.push(scene.boxes.len());
        scene.boxes.push(Rect {
            x: 0.0,
            y: 0.0,
            width: size.x,
            height: size.y,
        });
        scene.solid.push(true);
        scene.within.push(None);
    }
    (scene, ids)
}

fn link(scene: &mut Scene, from: usize, to: usize) {
    scene.lines.push(Line {
        from,
        to,
        plate: 0.0,
    });
}

/// A row of parts along the frame's foot, each part calling the next, and a door of some width
/// that answers each part.
fn foot_row(doors: usize, width: f64) -> (Scene, Vec<usize>) {
    let parts: Vec<Rect> = (0..4)
        .map(|at| part(20.0 + 250.0 * f64::from(at), 450.0))
        .collect();
    let (mut scene, ids) = framed(&parts, &vec![Point { x: width, y: 34.0 }; doors]);
    for (at, &door) in ids.iter().enumerate() {
        link(&mut scene, at, door);
    }
    for at in 0..3 {
        link(&mut scene, at, at + 1);
    }
    stand(&mut scene, &ids, FRAME, RING_GAP, PAGE);
    (scene, ids)
}

/// Three doors each answer one of a row of parts along the frame's foot. The wall below the
/// frame holds them all, and each stands there, on the wall that faces what it answers.
#[test]
fn a_door_stands_on_the_wall_that_faces_what_it_answers() {
    let (scene, doors) = foot_row(3, 250.0);
    for &door in &doors {
        let at = scene.boxes[door];
        assert!(
            at.y >= FRAME.y + FRAME.height,
            "door {door} stands at {at:?}"
        );
    }
}

/// Four wide doors each answer one of a row of parts along the frame's foot. Three fill the wall
/// below the frame. The fourth takes a wall along the page's width, not a column of its own
/// beside the frame, which would leave the rest of that column blank.
#[test]
fn a_door_takes_a_wall_along_the_page_before_a_column_of_its_own() {
    let (scene, doors) = foot_row(4, 300.0);
    for &door in &doors {
        let at = scene.boxes[door];
        let beside = at.y < FRAME.y + FRAME.height && at.y + at.height > FRAME.y;
        assert!(!beside, "door {door} stands beside the frame at {at:?}");
    }
}

/// More doors answer one part by the frame's corner than the wall beside it holds. Those that do
/// not fit stand further along, and no door stands over another.
#[test]
fn no_door_stands_over_another() {
    let (mut scene, doors) = framed(&[part(780.0, 100.0)], &[Point { x: 340.0, y: 113.0 }; 5]);
    for &door in &doors {
        link(&mut scene, 0, door);
    }
    stand(&mut scene, &doors, FRAME, RING_GAP, PAGE);
    for (index, &one) in doors.iter().enumerate() {
        for &other in &doors[index + 1..] {
            let (a, b) = (scene.boxes[one], scene.boxes[other]);
            let meet = a.x < b.x + b.width
                && b.x < a.x + a.width
                && a.y < b.y + b.height
                && b.y < a.y + a.height;
            assert!(!meet, "door {one} stands over door {other}");
        }
    }
}

/// Three doors answer one part in the middle of the frame's top. They stand round it, so one of
/// them stands before it and none stands far along the wall from it.
#[test]
fn doors_that_face_one_part_stand_round_it() {
    let (mut scene, doors) = framed(&[part(400.0, 20.0)], &[Point { x: 200.0, y: 34.0 }; 3]);
    for &door in &doors {
        link(&mut scene, door, 0);
    }
    stand(&mut scene, &doors, FRAME, RING_GAP, PAGE);
    let middle = 500.0;
    let boxes = || doors.iter().map(|&door| scene.boxes[door]);
    assert!(
        boxes().any(|at| at.x + at.width < middle),
        "no door stands before the part"
    );
    assert!(
        boxes().any(|at| at.x > middle),
        "no door stands after the part"
    );
}

/// Two doors answer the two ends of the frame's top. They keep the order of what they face, so
/// their lines do not cross.
#[test]
fn doors_keep_the_order_of_what_they_face() {
    let (mut scene, doors) = framed(
        &[part(20.0, 20.0), part(780.0, 20.0)],
        &[Point { x: 200.0, y: 34.0 }; 2],
    );
    link(&mut scene, 1, doors[0]);
    link(&mut scene, 0, doors[1]);
    stand(&mut scene, &doors, FRAME, RING_GAP, PAGE);
    let (first, second) = (scene.boxes[doors[0]], scene.boxes[doors[1]]);
    assert!(
        second.x < first.x,
        "the doors cross: {first:?} and {second:?}"
    );
    assert_eq!(scene.weigh().crossings, 0);
}
