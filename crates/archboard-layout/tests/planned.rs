//! Public solve contracts for graph classes that use planned channels.

use archboard_layout::lay_out_board;
use serde_json::{Value, json};

fn drawing(graph: &Value) -> Value {
    let answer = lay_out_board(&graph.to_string(), &mut archboard_graphviz::InCore)
        .expect("a planned drawing");
    let answer: Value = serde_json::from_str(&answer).expect("a planned drawing");
    serde_json::from_str(
        answer["layoutOptions"]["archboard.blocks.placed"]
            .as_str()
            .expect("a planned drawing"),
    )
    .expect("a planned drawing")
}

#[test]
fn an_adjacent_chain_uses_direct_channels_with_measured_cards() {
    let placed = drawing(
        &json!({"id":"root","layoutOptions":{"archboard.blocks.nesting":"blocks"},
        "children":[{"id":"a","width":200,"height":80},{"id":"b","width":160,"height":60},
            {"id":"c","width":180,"height":70}],
        "edges":[{"id":"ab","sources":["a"],"targets":["b"]},
            {"id":"bc","sources":["b"],"targets":["c"]}]}),
    );
    assert_eq!(placed["cards"].as_array().unwrap().len(), 3);
    assert!(placed["edges"].as_array().unwrap().iter().all(|edge| {
        let points = edge["points"].as_array().unwrap();
        points.len() == 2
            && ((points[0]["x"] == points[1]["x"]
                && points[0]["y"].as_f64().unwrap() < points[1]["y"].as_f64().unwrap())
                || (points[0]["y"] == points[1]["y"]
                    && points[0]["x"].as_f64().unwrap() < points[1]["x"].as_f64().unwrap()))
    }));
    assert_eq!(placed["cards"][0]["box"]["width"], 200.0);
    assert_eq!(placed["cards"][1]["box"]["height"], 60.0);
}

#[test]
fn an_isolated_nested_group_keeps_semantic_frame_depth_and_measured_caption() {
    let placed = drawing(
        &json!({"id":"root","layoutOptions":{"archboard.blocks.nesting":"blocks",
        "archboard.group.captions":"[[\"g\",90,20]]"},
        "children":[{"id":"outer","width":240,"height":60,"children":[
            {"id":"inner","width":200,"height":60,"layoutOptions":{"archboard.group":"g"},
                "children":[{"id":"leaf","width":160,"height":80}]}]}],"edges":[]}),
    );
    let frames = placed["frames"].as_array().unwrap();
    let depth = |id| {
        frames.iter().find(|frame| frame["id"] == id).unwrap()["depth"]
            .as_u64()
            .unwrap()
    };
    assert!(depth("inner") > depth("outer"));
    assert_eq!(placed["regions"][0]["parent"], "outer");
    assert_eq!(placed["regions"][0]["caption"]["width"], 90.0);
    assert_eq!(placed["regions"][0]["caption"]["height"], 20.0);
}

#[test]
fn a_label_fits_its_own_run_and_keeps_its_measured_rectangle() {
    for orders in [["0", "1"], ["1", "0"]] {
        let placed = drawing(
            &json!({"id":"root","layoutOptions":{"archboard.blocks.nesting":"blocks"},
        "children":[{"id":"a","width":200,"height":80,"layoutOptions":{"archboard.order":orders[0]}},{"id":"b","width":200,"height":80,"layoutOptions":{"archboard.order":orders[1]}}],
        "edges":[{"id":"ab","sources":["a"],"targets":["b"],"labels":[{"width":80,"height":24}]}]}),
        );
        let label = &placed["edges"][0]["label"];
        assert_eq!(
            (label["width"].as_f64(), label["height"].as_f64()),
            (Some(80.0), Some(24.0))
        );
        let points = placed["edges"][0]["points"].as_array().unwrap();
        assert!(points.windows(2).any(|pair| label_fits(label, pair)));
    }
}

#[test]
fn a_nested_source_or_header_keeps_its_label_clear_of_frame_walls() {
    for source in ["a", "frame"] {
        let placed = drawing(
            &json!({"id":"root","layoutOptions":{"archboard.blocks.nesting":"blocks"},
            "children":[{"id":"frame","width":240,"height":60,"children":[{"id":"a","width":200,"height":80}]},
                {"id":"b","width":200,"height":80}],
            "edges":[{"id":"ab","sources":[source],"targets":["b"],"labels":[{"width":80,"height":24}]}]}),
        );
        let label = &placed["edges"][0]["label"];
        let frame = &placed["frames"][0]["box"];
        let interval = |r: &Value, axis: &str, size: &str| {
            (
                r[axis].as_f64().unwrap(),
                r[axis].as_f64().unwrap() + r[size].as_f64().unwrap(),
            )
        };
        let axes = [("x", "width"), ("y", "height")];
        let inside = axes.iter().all(|&(axis, size)| {
            let (a, b) = interval(label, axis, size);
            let (c, d) = interval(frame, axis, size);
            a >= c && b <= d
        });
        let outside = axes.iter().any(|&(axis, size)| {
            let (a, b) = interval(label, axis, size);
            let (c, d) = interval(frame, axis, size);
            b <= c || a >= d
        });
        assert!(inside || outside);
    }
}

#[test]
fn a_large_label_fan_and_parallel_relationships_keep_their_private_words() {
    let mut children = vec![json!({"id":"source","width":200,"height":105})];
    let mut edges = Vec::new();
    for index in 0..30 {
        let target = format!("target{}", index / 2);
        if index % 2 == 0 {
            children.push(json!({"id":target,"width":200,"height":80}));
        }
        edges.push(
            json!({"id":format!("edge{index}"),"sources":["source"],"targets":[target],
            "labels":[{"width":80,"height":24}]}),
        );
    }
    let placed = drawing(
        &json!({"id":"root","layoutOptions":{"archboard.blocks.nesting":"blocks"},
        "children":children,"edges":edges}),
    );
    let routes = placed["edges"].as_array().unwrap();
    assert_eq!(routes.len(), 30);
    for edge in routes {
        let label = &edge["label"];
        assert!(
            edge["points"]
                .as_array()
                .unwrap()
                .windows(2)
                .any(|pair| label_fits(label, pair))
        );
    }
}

#[test]
fn mixed_treatments_keep_distinct_routes() {
    let children: Vec<_> = std::iter::once(json!({"id":"source","width":200,"height":72}))
        .chain((0..7).map(|i| json!({"id":format!("target{i}"),"width":180,"height":72})))
        .collect();
    let edges: Vec<_> = (0..7).map(|i| json!({"id":format!("edge{i}"),"sources":["source"],"targets":[format!("target{i}")],
        "layoutOptions":{"archboard.relationship.kind":format!("kind{i}")},"labels":[{"width":100,"height":31}]})).collect();
    let placed = drawing(
        &json!({"id":"root","layoutOptions":{"archboard.blocks.nesting":"blocks"},"children":children,"edges":edges}),
    );
    assert_eq!(placed["edges"].as_array().unwrap().len(), 7);
}

#[test]
fn self_loops_keep_their_owned_routes_and_labels_on_cards_and_parent_headers() {
    for from in ["card", "frame"] {
        for labelled in [false, true] {
            let labels: Vec<_> = labelled
                .then(|| json!({"width":100,"height":24}))
                .into_iter()
                .collect();
            let placed = drawing(
                &json!({"id":"root","layoutOptions":{"archboard.blocks.nesting":"blocks"},
                "children":[{"id":"frame","width":240,"height":72,"children":[{"id":"card","width":200,"height":80}]}],
                "edges":[{"id":"loop","sources":[from],"targets":[from],"labels":labels}]}),
            );
            let line = &placed["edges"][0];
            assert_eq!(line["id"], "loop");
            assert!(line["points"].as_array().unwrap().len() >= 4);
            assert_eq!(line["label"].is_object(), labelled);
        }
    }
}

#[test]
fn decision_answers_keep_their_declared_bottom_points_and_separate_incoming_route() {
    let placed = drawing(
        &json!({"id":"root","layoutOptions":{"archboard.blocks.nesting":"blocks"},
        "children":[{"id":"source","width":180,"height":80},{"id":"decision","width":240,"height":100},
            {"id":"left","width":180,"height":80},{"id":"right","width":180,"height":80}],
        "edges":[{"id":"enter","sources":["source"],"targets":["decision"]},
            {"id":"leftward","sources":["decision"],"targets":["left"],"labels":[{"width":60,"height":24}],
                "layoutOptions":{"archboard.from-points":"sw","archboard.from-points.inset":"24"}},
            {"id":"rightward","sources":["decision"],"targets":["right"],"labels":[{"width":60,"height":24}],
                "layoutOptions":{"archboard.from-points":"se","archboard.from-points.inset":"24"}}]}),
    );
    let card = &placed["cards"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["id"] == "decision")
        .unwrap()["box"];
    for (id, x) in [("leftward", 24.0), ("rightward", 216.0)] {
        let line = placed["edges"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["id"] == id)
            .unwrap();
        let first = &line["points"][0];
        assert!((first["x"].as_f64().unwrap() - card["x"].as_f64().unwrap() - x).abs() < 0.05);
        assert!((first["y"].as_f64().unwrap() - card["y"].as_f64().unwrap() - 100.0).abs() < 0.05);
    }
}

fn label_fits(label: &Value, pair: &[Value]) -> bool {
    let number = |v: &Value, key: &str| v[key].as_f64().expect("a measured coordinate");
    [("x", "y", "width", "height"), ("y", "x", "height", "width")]
        .iter()
        .any(|&(along, across, size, cross_size)| {
            let (a, b) = (number(&pair[0], along), number(&pair[1], along));
            number(&pair[0], across) == number(&pair[1], across)
                && (number(&pair[0], across)
                    - number(label, across)
                    - number(label, cross_size) / 2.0)
                    .abs()
                    < 1e-6
                && a.min(b) <= number(label, along)
                && a.max(b) >= number(label, along) + number(label, size)
        })
}

#[test]
fn reciprocal_labeled_calls_keep_the_short_gap_between_neighbors() {
    let placed = drawing(&json!({"id":"root","layoutOptions":{
        "archboard.blocks.nesting":"blocks",
        "archboard.group.captions":"[[\"panes\",126.44,42]]"},
        "children":[
            {"id":"session","width":340,"height":122,"layoutOptions":{"archboard.order":"0"}},
            {"id":"presence","width":340,"height":122,"layoutOptions":{"archboard.order":"1","archboard.group":"panes"}},
            {"id":"history","width":340,"height":122,"layoutOptions":{"archboard.order":"2"}}],
        "edges":[
            {"id":"return","sources":["presence"],"targets":["session"],"layoutOptions":{"archboard.order":"0"},"labels":[{"width":118.5,"height":46}]},
            {"id":"record","sources":["session"],"targets":["history"],"layoutOptions":{"archboard.order":"1"},"labels":[{"width":144.9,"height":46}]},
            {"id":"show","sources":["session"],"targets":["presence"],"layoutOptions":{"archboard.order":"2"},"labels":[{"width":163.49,"height":46}]}]}));
    for edge in placed["edges"].as_array().unwrap() {
        let points = edge["points"].as_array().unwrap();
        let length: f64 = points
            .windows(2)
            .map(|pair| {
                (pair[0]["x"].as_f64().unwrap() - pair[1]["x"].as_f64().unwrap()).abs()
                    + (pair[0]["y"].as_f64().unwrap() - pair[1]["y"].as_f64().unwrap()).abs()
            })
            .sum();
        assert!(
            length < 300.0,
            "a neighboring call takes a perimeter detour: {edge}"
        );
        assert!(
            points
                .windows(2)
                .any(|pair| label_fits(&edge["label"], pair))
        );
    }
}

// A labelled fan with boundary ports reaches the dense-scope limit even
// with only eight cards. It still needs the compact two-row cut.
fn small_labelled_fan() -> Value {
    let card = |id: &str, width: u32, height: u32, order: u32| json!({"id":id,"width":width,"height":height,"layoutOptions":{"archboard.order":order.to_string()}});
    let mut members = vec![
        card("caller", 340, 88, 1000),
        card("registry", 340, 88, 2000),
        card("flags", 340, 105, 3000),
        card("dispatch", 260, 72, 4000),
        card("execute", 340, 88, 5000),
        card("failure", 260, 72, 7000),
        card("help", 340, 88, 9000),
        card("vault", 340, 122, 12000),
    ];
    members[0]["layoutOptions"]["archboard.entry"] = json!("true");
    members[1]["layoutOptions"]["archboard.entry"] = json!("false");
    members[7]["layoutOptions"]["archboard.entry"] = json!("false");
    let mut frame = card("frame", 356, 113, 11000);
    frame["layoutOptions"]["archboard.header.size"] = json!("113");
    frame["children"] = json!(members);
    let children = vec![
        card("command", 340, 88, 6000),
        card("catalogue", 340, 88, 8000),
        card("context", 340, 105, 10000),
        frame,
        card("checkouts", 340, 122, 14000),
    ];
    let links = [
        ("e0", "caller", "help", 1000, 162, 31),
        ("e1", "caller", "flags", 2000, 83, 31),
        ("e2", "caller", "dispatch", 3000, 48, 31),
        ("e3", "caller", "execute", 4000, 58, 31),
        ("e4", "execute", "command", 5000, 0, 0),
        ("e5", "caller", "failure", 6000, 65, 31),
        ("e6", "catalogue", "caller", 7000, 41, 31),
        ("e7", "dispatch", "registry", 8000, 54, 31),
        ("e8", "catalogue", "registry", 9000, 176, 31),
        ("e9", "caller", "context", 10000, 190, 31),
        ("e11", "caller", "vault", 14000, 139, 31),
        ("e12", "vault", "context", 17000, 121, 46),
    ];
    let edges: Vec<_> = links
        .into_iter()
        .map(|(id, from, to, order, width, height)| {
            let mut edge = json!({"id":id,"sources":[from],"targets":[to],"layoutOptions":{
            "archboard.order":order.to_string(),"archboard.relationship.kind":"call",
            "archboard.relationship.held-kind":"call"}});
            if width > 0 {
                edge["labels"] = json!([{"width":width,"height":height}]);
            }
            edge
        })
        .collect();
    json!({"id":"root","layoutOptions":{"archboard.blocks.nesting":"blocks"},"children":children,"edges":edges})
}

#[test]
fn a_small_labelled_fan_keeps_its_nearby_first_row() {
    let placed = drawing(&small_labelled_fan());
    let cards = placed["cards"].as_array().unwrap();
    let y = |id| {
        cards.iter().find(|card| card["id"] == id).unwrap()["box"]["y"]
            .as_f64()
            .unwrap()
    };
    let first = ["help", "failure", "vault"].map(&y);
    let second = ["execute", "dispatch", "flags"].map(&y);
    assert_eq!(first, [first[0]; 3]);
    assert_eq!(second, [second[0]; 3]);
    assert!(
        [y("caller"), first[0], second[0], y("registry")]
            .windows(2)
            .all(|pair| pair[0] < pair[1])
    );
}

#[test]
fn boundary_calls_choose_a_clear_order_before_saving_area() {
    let graph = serde_json::from_str(include_str!("fixtures/clear-approaches.json")).unwrap();
    let placed = drawing(&graph);
    let edges = placed["edges"].as_array().unwrap();
    let points = |id| {
        edges.iter().find(|edge| edge["id"] == id).unwrap()["points"]
            .as_array()
            .unwrap()
    };
    assert_eq!(points("invoke").len(), 2);
    assert!(points("work").len() <= 4);
    let arrival = points("invoke").last().unwrap();
    let x = arrival["x"].as_f64().unwrap();
    let y = arrival["y"].as_f64().unwrap();
    assert!(points("remember").windows(2).all(|run| {
        let a = run[0]["x"].as_f64().unwrap();
        let b = run[1]["x"].as_f64().unwrap();
        let height = run[0]["y"].as_f64().unwrap();
        !(run[0]["y"] == run[1]["y"] && x > a.min(b) && x < a.max(b) && (height - y).abs() < 32.0)
    }));
}

#[test]
fn a_global_saving_keeps_a_callers_compact_fan() {
    let graph: Value = serde_json::from_str(include_str!("fixtures/compact-fan.json")).unwrap();
    let placed = drawing(&graph);
    let cards = placed["cards"].as_array().unwrap();
    let mut rows: Vec<_> = graph["edges"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|edge| edge["sources"][0] == "n0")
        .map(|edge| {
            cards
                .iter()
                .find(|card| card["id"] == edge["targets"][0])
                .unwrap()["box"]["y"]
                .as_f64()
                .unwrap()
        })
        .collect();
    rows.sort_by(f64::total_cmp);
    rows.dedup();
    assert!(rows.len() <= 3);
}
