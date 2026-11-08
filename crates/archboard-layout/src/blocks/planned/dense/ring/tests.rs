use super::*;

#[test]
fn a_frame_between_a_part_and_a_wall_adds_the_way_round_it() {
    let graph: Node = serde_json::from_value(serde_json::json!({"id":"root"})).expect("a node");
    let set = Set {
        size: Point {
            x: 1000.0,
            y: 1000.0,
        },
        parts: Vec::new(),
    };
    let frame = |y: f64| Rect {
        x: 0.0,
        y,
        width: 1000.0,
        height: 400.0,
    };
    let ring = Ring {
        graph: &graph,
        frames: Vec::new(),
        boxes: vec![frame(0.0), frame(600.0)],
        set: &set,
        ids: Vec::new(),
        extra: 0.0,
        sides: true,
        centred: false,
        gap: RING_GAP,
    };
    let inside_upper = Point { x: 300.0, y: 200.0 };
    assert_eq!(ring.round_frames(inside_upper), [0.0, 600.0, 0.0, 0.0]);
}

/// Four wide doors each answer one of a row of parts along the frame's foot, and each
/// part calls the next. Three doors fill the wall below the frame. The fourth takes a
/// wall along the page's width, not a column of its own beside the frame.
#[test]
fn a_door_takes_a_wall_along_the_page_before_a_column_of_its_own() {
    let answers = (0..4).map(|at| {
        serde_json::json!({"id": format!("answer{at}"),
        "sources": [format!("part{at}")], "targets": [format!("door{at}")]})
    });
    let calls = (0..3).map(|at| {
        serde_json::json!({"id": format!("call{at}"),
        "sources": [format!("part{at}")], "targets": [format!("part{}", at + 1)]})
    });
    let graph: Node = serde_json::from_value(serde_json::json!({
        "id": "root",
        "children": (0..4).map(|at| serde_json::json!(
            {"id": format!("door{at}"), "width": 300, "height": 34})).collect::<Vec<_>>(),
        "edges": answers.chain(calls).collect::<Vec<_>>(),
    }))
    .expect("a node");
    let set = Set {
        size: Point {
            x: 1000.0,
            y: 600.0,
        },
        parts: (0..4)
            .map(|at| Rect {
                x: 20.0 + 250.0 * f64::from(at),
                y: 450.0,
                width: 200.0,
                height: 100.0,
            })
            .collect(),
    };
    let ring = Ring {
        graph: &graph,
        frames: Vec::new(),
        boxes: vec![Rect {
            x: 0.0,
            y: 0.0,
            width: 1000.0,
            height: 600.0,
        }],
        set: &set,
        ids: vec!["part0", "part1", "part2", "part3"],
        extra: 0.0,
        sides: true,
        centred: false,
        gap: RING_GAP,
    };
    let doors: Vec<&Node> = graph.kids().iter().collect();
    let page = ring.stand(&doors);
    for door in &page.doors {
        let beside =
            door.bx.y < page.frame.y + set.size.y && door.bx.y + door.bx.height > page.frame.y;
        assert!(!beside, "{} stands beside the frame", door.id);
    }
}

/// The owner's Layout timing and Module interface: more doors answer one part by the
/// frame's corner than the wall beside it holds. Those that do not fit take another
/// wall, and no door stands over another.
#[test]
fn a_wall_holds_only_the_doors_beside_the_frame_so_no_door_meets_another() {
    let answers = (0..5).map(|at| {
        serde_json::json!({"id": format!("answer{at}"),
        "sources": ["part"], "targets": [format!("door{at}")]})
    });
    let graph: Node = serde_json::from_value(serde_json::json!({
        "id": "root",
        "children": (0..5).map(|at| serde_json::json!(
            {"id": format!("door{at}"), "width": 340, "height": 113})).collect::<Vec<_>>(),
        "edges": answers.collect::<Vec<_>>(),
    }))
    .expect("a node");
    let set = Set {
        size: Point {
            x: 1000.0,
            y: 300.0,
        },
        parts: vec![Rect {
            x: 850.0,
            y: 100.0,
            width: 200.0,
            height: 100.0,
        }],
    };
    let ring = Ring {
        graph: &graph,
        frames: Vec::new(),
        boxes: vec![Rect {
            x: 0.0,
            y: 0.0,
            width: 1000.0,
            height: 300.0,
        }],
        set: &set,
        ids: vec!["part"],
        extra: 0.0,
        sides: true,
        centred: false,
        gap: RING_GAP,
    };
    let doors: Vec<&Node> = graph.kids().iter().collect();
    let page = ring.stand(&doors);
    for (index, one) in page.doors.iter().enumerate() {
        for other in &page.doors[index + 1..] {
            let (a, b) = (one.bx, other.bx);
            let meet = a.x < b.x + b.width
                && b.x < a.x + a.width
                && a.y < b.y + b.height
                && b.y < a.y + a.height;
            assert!(!meet, "{} stands over {}", one.id, other.id);
        }
    }
}

/// Three doors answer one part in the middle of the frame. Standing round what they face,
/// one of them stands before it, so none stands far along the wall from it.
#[test]
fn doors_that_face_one_part_stand_round_it() {
    let answers = (0..3).map(|at| {
        serde_json::json!({"id": format!("answer{at}"),
        "sources": [format!("door{at}")], "targets": ["part"]})
    });
    let graph: Node = serde_json::from_value(serde_json::json!({
        "id": "root",
        "children": (0..3).map(|at| serde_json::json!(
            {"id": format!("door{at}"), "width": 200, "height": 34})).collect::<Vec<_>>(),
        "edges": answers.collect::<Vec<_>>(),
    }))
    .expect("a node");
    let set = Set {
        size: Point {
            x: 1000.0,
            y: 300.0,
        },
        parts: vec![Rect {
            x: 450.0,
            y: 20.0,
            width: 100.0,
            height: 100.0,
        }],
    };
    let ring = Ring {
        graph: &graph,
        frames: Vec::new(),
        boxes: vec![Rect {
            x: 0.0,
            y: 0.0,
            width: 1000.0,
            height: 300.0,
        }],
        set: &set,
        ids: vec!["part"],
        extra: 0.0,
        sides: false,
        centred: true,
        gap: RING_GAP,
    };
    let doors: Vec<&Node> = graph.kids().iter().collect();
    let page = ring.stand(&doors);
    let facing = page.frame.x + 500.0;
    assert!(
        page.doors
            .iter()
            .any(|door| door.bx.x + door.bx.width < facing),
        "no door stands before the part it faces"
    );
}
