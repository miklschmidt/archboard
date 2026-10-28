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
            && points[0]["x"] == points[1]["x"]
            && points[0]["y"].as_f64().unwrap() < points[1]["y"].as_f64().unwrap()
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
