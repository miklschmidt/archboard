//! Public solve contracts for graph classes that use planned channels.

use archboard_layout::{Graphviz, lay_out_board};
use serde_json::{Value, json};

struct NoRanker;
impl Graphviz for NoRanker {
    fn render(&mut self, _: &str) -> Result<String, String> {
        Err("This fixture must use planned channels".to_owned())
    }
}

fn drawing(graph: &Value) -> Value {
    let answer = lay_out_board(&graph.to_string(), &mut NoRanker).expect("a planned drawing");
    let answer: Value = serde_json::from_str(&answer).expect("a planned drawing");
    serde_json::from_str(
        answer["layoutOptions"]["archboard.blocks.placed"]
            .as_str()
            .expect("a planned drawing"),
    )
    .expect("a planned drawing")
}

#[test]
fn an_adjacent_chain_uses_direct_channels_with_measured_cards_and_no_ranker() {
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
fn a_label_has_one_horizontal_source_owned_run_and_keeps_its_measured_rectangle() {
    for orders in [["0", "1"], ["1", "0"]] {
        let placed = drawing(
            &json!({"id":"root","layoutOptions":{"archboard.blocks.nesting":"blocks"},
        "children":[{"id":"a","width":200,"height":80,"layoutOptions":{"archboard.order":orders[0]}},{"id":"b","width":200,"height":80,"layoutOptions":{"archboard.order":orders[1]}}],
        "edges":[{"id":"ab","sources":["a"],"targets":["b"],"labels":[{"width":80,"height":24}]}]}),
        );
        let label = &placed["edges"][0]["label"];
        let (x, y) = (label["x"].as_f64().unwrap(), label["y"].as_f64().unwrap());
        assert_eq!(
            (label["width"].as_f64(), label["height"].as_f64()),
            (Some(80.0), Some(24.0))
        );
        let points = placed["edges"][0]["points"].as_array().unwrap();
        assert!(points.windows(2).any(|pair| {
            let (a, b) = (
                pair[0]["x"].as_f64().unwrap(),
                pair[1]["x"].as_f64().unwrap(),
            );
            pair[0]["y"].as_f64() == Some(y + 12.0)
                && pair[1]["y"] == pair[0]["y"]
                && a.min(b) <= x
                && a.max(b) >= x + 80.0
        }));
        assert!((points[0]["x"].as_f64().unwrap() - x - 40.0).abs() < 200.0);
    }
}

#[test]
fn a_fan_has_one_owned_departure_before_its_private_branches() {
    let placed = drawing(
        &json!({"id":"root","layoutOptions":{"archboard.blocks.nesting":"blocks"},
        "children":[{"id":"a","width":160,"height":200},{"id":"b","width":160,"height":80},
            {"id":"c","width":160,"height":80}],
        "edges":[{"id":"ab","sources":["a"],"targets":["b"]},
            {"id":"ac","sources":["a"],"targets":["c"]}]}),
    );
    let one = placed["edges"][0]["points"].as_array().unwrap();
    let other = placed["edges"][1]["points"].as_array().unwrap();
    assert_eq!(one[0], other[0]);
    assert!(one[1]["x"] == other[1]["x"] || one[1]["y"] == other[1]["y"]);
    assert_eq!(placed["edges"].as_array().unwrap().len(), 2);
}

#[test]
fn a_nested_source_or_header_keeps_its_label_inside_its_own_frame() {
    for source in ["a", "frame"] {
        let placed = drawing(
            &json!({"id":"root","layoutOptions":{"archboard.blocks.nesting":"blocks"},
            "children":[{"id":"frame","width":240,"height":60,"children":[{"id":"a","width":200,"height":80}]},
                {"id":"b","width":200,"height":80}],
            "edges":[{"id":"ab","sources":[source],"targets":["b"],"labels":[{"width":80,"height":24}]}]}),
        );
        let label = &placed["edges"][0]["label"];
        let frame = &placed["frames"][0]["box"];
        assert!(
            [("x", "width"), ("y", "height")]
                .into_iter()
                .all(|(axis, size)| {
                    label[axis].as_f64().unwrap() >= frame[axis].as_f64().unwrap()
                        && label[axis].as_f64().unwrap() + label[size].as_f64().unwrap()
                            <= frame[axis].as_f64().unwrap() + frame[size].as_f64().unwrap()
                })
        );
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
        let (left, top) = (label["x"].as_f64().unwrap(), label["y"].as_f64().unwrap());
        assert!(edge["points"].as_array().unwrap().windows(2).any(|pair| {
            let (a, b) = (
                pair[0]["x"].as_f64().unwrap(),
                pair[1]["x"].as_f64().unwrap(),
            );
            pair[0]["y"].as_f64() == Some(top + 12.0)
                && pair[1]["y"] == pair[0]["y"]
                && a.min(b) <= left
                && a.max(b) >= left + 80.0
        }));
    }
}
