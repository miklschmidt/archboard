//! Lanes lays every picture out on its lanes and never plans. Its look is a bus: no line words,
//! the lines between two cards in one bundle a lane apart, every card ranked with what it talks
//! to, inside a container or beside it, and every line on its page.

mod common;

use archboard_layout::lay_out_picture;
use common::crowded_card;
use serde_json::{Value, json};

/// The room between two lanes of a bus.
const LANE: f64 = 16.0;

#[test]
fn wide_fallback_cables_leave_their_card_a_lane_apart() {
    let targets = ["left", "centre", "right"];
    let children: Vec<_> = std::iter::once(json!({"id": "source", "width": 120, "height": 80}))
        .chain(targets.map(|id| json!({"id": id, "width": 200, "height": 80})))
        .collect();
    let edges = targets.map(|id| {
        json!({
            "id": id, "sources": ["source"], "targets": [id],
            "layoutOptions": {"archboard.cable": format!("{id};async;http;rpc;queue")}
        })
    });
    let graph = json!({
        "id": "root", "layoutOptions": {"archboard.layout.engine": "lanes"},
        "children": children, "edges": edges
    });
    let (placed, _) = told(&graph);
    let placed: Value = serde_json::from_str(&placed).expect("a drawing");
    let card = placed["cards"]
        .as_array()
        .expect("the cards")
        .iter()
        .find(|card| card["id"] == "source")
        .expect("the source card");
    let mut ports: Vec<f64> = placed["edges"]
        .as_array()
        .expect("the lines")
        .iter()
        .map(|line| line["points"][0]["x"].as_f64().expect("a port"))
        .collect();
    ports.sort_by(f64::total_cmp);
    // Five strands span 32 units. A clear lane between the outer strands takes 16 more.
    assert!(
        ports.windows(2).all(|pair| pair[1] - pair[0] >= 48.0),
        "{ports:?}"
    );
    let left = card["box"]["x"].as_f64().expect("the left wall");
    let right = left + card["box"]["width"].as_f64().expect("the card's width");
    assert!(ports[0] - left >= 36.0);
    assert!(right - ports[2] >= 36.0);
}

#[test]
fn lanes_takes_the_lanes_placement_where_blocks_plans() {
    for graph in [
        include_str!("fixtures/refused-dense.json"),
        include_str!("fixtures/trunk-words.json"),
    ] {
        let mut graph: Value = serde_json::from_str(graph).unwrap();
        let told = |graph: &Value| {
            let answer = lay_out_picture(&graph.to_string(), &mut archboard_graphviz::InCore)
                .expect("a drawing");
            let answer: Value = serde_json::from_str(&answer).expect("an answer");
            answer["layoutOptions"]
                .get("archboard.blocks.planned")
                .is_some()
        };
        assert!(told(&graph), "Blocks plans this reading");
        graph["layoutOptions"]["archboard.layout.engine"] = json!("lanes");
        assert!(!told(&graph), "Lanes never plans");
    }
}

#[test]
fn a_fallback_cable_leaves_room_for_its_marks_at_both_ends() {
    let graph = json!({
        "id": "root", "layoutOptions": {"archboard.layout.engine": "lanes"},
        "children": [
            {"id": "source", "width": 120, "height": 80},
            {"id": "left", "width": 200, "height": 80},
            {"id": "right", "width": 200, "height": 80}
        ],
        "edges": [
            {"id": "a", "sources": ["source"], "targets": ["left"],
                "layoutOptions": {"archboard.cable": "sync;async"}},
            {"id": "b", "sources": ["source"], "targets": ["right"],
                "layoutOptions": {"archboard.cable": "http;rpc"}}
        ]
    });
    let (placed, _) = told(&graph);
    let placed: Value = serde_json::from_str(&placed).expect("a drawing");
    let minimum = archboard_scene::paint::design::approach_straight()
        + archboard_scene::geometry::bend_radius()
        + archboard_scene::paint::design::echelon()
        + 4.0;
    let length = |one: &Value, two: &Value| {
        let coordinate = |point: &Value, axis: &str| point[axis].as_f64().expect("a coordinate");
        (coordinate(one, "x") - coordinate(two, "x")).abs()
            + (coordinate(one, "y") - coordinate(two, "y")).abs()
    };
    let mut bent = 0;
    for line in placed["edges"].as_array().expect("the lines") {
        let points = line["points"].as_array().expect("the route");
        if let [first, second, _, ..] = points.as_slice() {
            bent += 1;
            assert!(length(first, second) >= minimum, "{line}");
            assert!(
                length(&points[points.len() - 2], &points[points.len() - 1]) >= minimum,
                "{line}"
            );
        }
    }
    assert!(bent > 0);
}

/// What one solve answers for a graph: the drawing as it was written, and whether it was planned.
fn told(graph: &Value) -> (String, bool) {
    let answer =
        lay_out_picture(&graph.to_string(), &mut archboard_graphviz::InCore).expect("a drawing");
    let mut answer: Value = serde_json::from_str(&answer).expect("an answer");
    let options = answer["layoutOptions"]
        .as_object_mut()
        .expect("its options");
    let planned = options.contains_key("archboard.blocks.planned");
    let placed = options["archboard.blocks.placed"]
        .as_str()
        .expect("a drawing");
    (placed.to_owned(), planned)
}

/// What Lanes draws for a graph.
fn drawn_by_lanes(graph: &Value) -> Value {
    let mut graph = graph.clone();
    graph["layoutOptions"]["archboard.layout.engine"] = json!("lanes");
    let (placed, planned) = told(&graph);
    assert!(!planned, "Lanes never plans");
    serde_json::from_str(&placed).expect("a drawing")
}

/// Every point of a drawing's lines, by line.
fn lines_of(drawn: &Value) -> Vec<(String, Vec<(f64, f64)>)> {
    drawn["edges"]
        .as_array()
        .expect("its lines")
        .iter()
        .map(|line| {
            let points = line["points"]
                .as_array()
                .expect("its points")
                .iter()
                .map(|point| {
                    let at = |axis: &str| point[axis].as_f64().expect("a coordinate");
                    (at("x"), at("y"))
                })
                .collect();
            (line["id"].as_str().expect("an id").to_owned(), points)
        })
        .collect()
}

#[test]
fn lanes_draws_no_line_words_and_keeps_every_line_on_its_page() {
    for graph in [
        crowded_card(),
        include_str!("fixtures/readme-all.json").to_owned(),
    ] {
        let drawn = drawn_by_lanes(&serde_json::from_str(&graph).unwrap());
        let lines = drawn["edges"].as_array().expect("its lines");
        assert_ne!(lines.len(), 0);
        assert!(
            lines
                .iter()
                .all(|line| line.get("label").is_none_or(Value::is_null))
        );
        let (width, height) = (
            drawn["width"].as_f64().unwrap(),
            drawn["height"].as_f64().unwrap(),
        );
        for (id, points) in lines_of(&drawn) {
            assert!(
                points
                    .iter()
                    .all(|&(x, y)| (0.0..=width).contains(&x) && (0.0..=height).contains(&y)),
                "{id} stands on the page"
            );
        }
    }
}

#[test]
fn lanes_runs_the_lines_between_two_cards_as_one_bus_a_lane_apart() {
    let card = |id: &str| json!({"id":id,"width":200,"height":60});
    let lines = ["call", "http", "event"].iter().flat_map(|kind| {
        ["left", "right"].map(|to| {
            json!({"id":format!("{to} {kind}"),"sources":["caller"],"targets":[to],
                "layoutOptions":{"archboard.relationship.kind":kind,
                    "archboard.relationship.held-kind":kind}})
        })
    });
    let graph = json!({"id":"root","layoutOptions":{},
        "children":[card("caller"),card("left"),card("right")],
        "edges":lines.collect::<Vec<_>>()});
    let drawn = drawn_by_lanes(&graph);
    for to in ["left", "right"] {
        let mut heads: Vec<f64> = lines_of(&drawn)
            .into_iter()
            .filter(|(id, _)| id.starts_with(to))
            .map(|(_, points)| points.last().expect("a head").0)
            .collect();
        heads.sort_by(f64::total_cmp);
        assert_eq!(heads.len(), 3);
        assert!(
            heads
                .windows(2)
                .all(|pair| (pair[1] - pair[0] - LANE).abs() < 0.01),
            "the lines to {to} land a lane apart: {heads:?}"
        );
    }
}

#[test]
fn lanes_keeps_a_bundle_running_down_and_turns_the_one_line_against_it() {
    let card = |id: &str| json!({"id":id,"width":200,"height":60});
    let line = |id: &str, from: &str, to: &str, kind: &str| {
        json!({"id":id,"sources":[from],"targets":[to],
            "layoutOptions":{"archboard.relationship.kind":kind,
                "archboard.relationship.held-kind":kind}})
    };
    // The picture's order names the user first, so a walk from it turns the bundle.
    let graph = json!({"id":"root","layoutOptions":{},
    "children":[card("user"),card("caller")],
    "edges":[
        line("back","user","caller","event"),
        line("call","caller","user","call"),
        line("http","caller","user","http"),
        line("data","caller","user","data"),
    ]});
    let drawn = drawn_by_lanes(&graph);
    assert!(
        box_of(&drawn, "caller").1 <= box_of(&drawn, "user").0,
        "the three lines run down from the caller to the user"
    );
}

/// A container holding one card, a caller outside it and a card it calls outside it, drawn
/// with Lanes.
fn caller_and_callee_beside_a_container() -> Value {
    let card = |id: &str| json!({"id":id,"width":200,"height":60});
    let line = |id: &str, from: &str, to: &str| {
        json!({"id":id,"sources":[from],"targets":[to],
            "layoutOptions":{"archboard.relationship.kind":"call",
                "archboard.relationship.held-kind":"call"}})
    };
    json!({"id":"root","layoutOptions":{},
        "children":[
            card("caller"),
            {"id":"box","width":120,"height":36,
                "layoutOptions":{"archboard.header.size":"36"},
                "children":[card("inside")]},
            card("callee"),
        ],
        "edges":[line("in","caller","inside"),line("out","inside","callee")]})
}

/// The box a drawing gives an id: a card's or a container's.
fn box_of(drawn: &Value, id: &str) -> (f64, f64) {
    let held = drawn["cards"]
        .as_array()
        .into_iter()
        .chain(drawn["frames"].as_array())
        .flatten()
        .find(|item| item["id"] == id)
        .unwrap_or_else(|| panic!("{id} is drawn"));
    let top = held["box"]["y"].as_f64().expect("a top");
    (top, top + held["box"]["height"].as_f64().expect("a height"))
}

#[test]
fn lanes_stands_a_caller_above_a_container_and_what_it_calls_below() {
    let drawn = drawn_by_lanes(&caller_and_callee_beside_a_container());
    let (frame_top, frame_bottom) = box_of(&drawn, "box");
    assert!(
        box_of(&drawn, "caller").1 <= frame_top,
        "the caller stands above"
    );
    assert!(
        box_of(&drawn, "callee").0 >= frame_bottom,
        "the callee stands below"
    );
}

/// A card, as the tests draw it.
fn card(id: &str, width: u32) -> Value {
    json!({"id":id,"width":width,"height":60})
}

/// A line of one kind.
fn line(id: &str, from: &str, to: &str, kind: &str) -> Value {
    json!({"id":id,"sources":[from],"targets":[to],
        "layoutOptions":{"archboard.relationship.kind":kind,
            "archboard.relationship.held-kind":kind}})
}

#[test]
fn lanes_lands_the_lines_bound_for_one_card_together_a_lane_apart_centred_on_its_face() {
    let graph = json!({"id":"root","layoutOptions":{},
    "children":[card("left",200),card("middle",200),card("right",200),card("target",900)],
    "edges":[
        line("from left","left","target","call"),
        line("from middle","middle","target","http"),
        line("from right","right","target","event"),
    ]});
    let drawn = drawn_by_lanes(&graph);
    let mut heads: Vec<f64> = lines_of(&drawn)
        .into_iter()
        .map(|(_, points)| points.last().expect("a head").0)
        .collect();
    heads.sort_by(f64::total_cmp);
    assert!(
        heads
            .windows(2)
            .all(|pair| (pair[1] - pair[0] - LANE).abs() < 0.01),
        "the heads stand together a lane apart: {heads:?}"
    );
    let target = &drawn["cards"]
        .as_array()
        .expect("its cards")
        .iter()
        .find(|card| card["id"] == "target")
        .expect("the target is drawn")["box"];
    let middle =
        target["x"].as_f64().expect("an x") + target["width"].as_f64().expect("a width") / 2.0;
    assert!(
        (f64::midpoint(heads[0], heads[heads.len() - 1]) - middle).abs() < 0.01,
        "the heads stand round the middle of the target's face: {heads:?}, middle {middle}"
    );
}

#[test]
fn lanes_centres_ports_when_a_group_caption_leaves_the_middle_clear() {
    let mut target = card("target", 300);
    target["layoutOptions"]["archboard.group"] = json!("group");
    let graph = json!({
        "id": "root",
        "layoutOptions": {"archboard.group.captions": "[[\"group\",80,20]]"},
        "children": [card("caller", 200), target],
        "edges": [line("in", "caller", "target", "call")]
    });
    let drawn = drawn_by_lanes(&graph);
    let target = &drawn["cards"]
        .as_array()
        .expect("its cards")
        .iter()
        .find(|card| card["id"] == "target")
        .expect("the target is drawn")["box"];
    let middle =
        target["x"].as_f64().expect("an x") + target["width"].as_f64().expect("a width") / 2.0;
    let lines = lines_of(&drawn);
    let head = lines[0].1.last().expect("a head");
    assert!((head.0 - middle).abs() < 0.01, "{head:?}, middle {middle}");
}

#[test]
fn lanes_runs_no_line_round_the_outside_of_the_readme_reading() {
    let drawn =
        drawn_by_lanes(&serde_json::from_str(include_str!("fixtures/readme-all.json")).unwrap());
    let boxes: Vec<(f64, f64)> = drawn["cards"]
        .as_array()
        .expect("its cards")
        .iter()
        .map(|card| {
            let x = card["box"]["x"].as_f64().expect("an x");
            (x, x + card["box"]["width"].as_f64().expect("a width"))
        })
        .collect();
    let left = boxes.iter().map(|one| one.0).fold(f64::INFINITY, f64::min);
    let right = boxes
        .iter()
        .map(|one| one.1)
        .fold(f64::NEG_INFINITY, f64::max);
    for (id, points) in lines_of(&drawn) {
        assert!(
            points
                .iter()
                .all(|&(x, _)| x >= left - 1.0 && x <= right + 1.0),
            "{id} runs between the outermost cards"
        );
    }
}

#[test]
fn lanes_stands_the_doors_round_a_container_in_the_order_their_lines_enter_it() {
    let drawn = drawn_by_lanes(
        &serde_json::from_str(include_str!("fixtures/doors-round-a-container.json")).unwrap(),
    );
    let frame = &drawn["frames"][0]["box"];
    let at = |key: &str| frame[key].as_f64().expect("a frame's box");
    let (left, top, right) = (at("x"), at("y"), at("x") + at("width"));
    // Each line that comes down into the container: where its door stands, and where it enters.
    let mut entries: Vec<(f64, f64)> = lines_of(&drawn)
        .into_iter()
        .filter_map(|(_, points)| {
            let door = if points[0].1 < top {
                points[0]
            } else {
                *points.last().expect("an end")
            };
            points.windows(2).find_map(|pair| {
                let ((x, one), (other_x, other)) = (pair[0], pair[1]);
                (x == other_x
                    && one.min(other) < top
                    && top < one.max(other)
                    && left < x
                    && x < right)
                    .then_some((door.0, x))
            })
        })
        .collect();
    entries.sort_by(|one, other| one.0.total_cmp(&other.0));
    let (mut pairs, mut swapped) = (0, 0);
    for (at, one) in entries.iter().enumerate() {
        for other in &entries[at + 1..] {
            pairs += 1;
            if one.0 < other.0 - 1.0 && one.1 > other.1 + 1.0 {
                swapped += 1;
            }
        }
    }
    assert!(pairs > 10, "the reading has doors to order");
    assert!(
        4 * swapped <= pairs,
        "{swapped} of {pairs} pairs of doors stand the other way round from where they enter"
    );
}

#[test]
fn lanes_lays_a_wrapped_rank_inside_a_container_in_whole_rows() {
    // Painting: a container's stage calls five cards, dealt into two rows, and one of them
    // leaves the container by a port on its bottom.
    let drawn = drawn_by_lanes(
        &serde_json::from_str(include_str!("fixtures/wrapped-inside-a-container.json")).unwrap(),
    );
    let frame = &drawn["frames"][0]["box"];
    let at = |key: &str| frame[key].as_f64().expect("a frame's box");
    let mut rows: Vec<f64> = drawn["cards"]
        .as_array()
        .expect("its cards")
        .iter()
        .map(|card| &card["box"])
        .filter(|card| {
            let y = card["y"].as_f64().expect("a top");
            at("y") < y && y < at("y") + at("height")
        })
        .map(|card| card["y"].as_f64().expect("a top"))
        .collect();
    rows.sort_by(f64::total_cmp);
    rows.dedup();
    assert_eq!(rows.len(), 3, "the stage and two whole rows: {rows:?}");
}

#[test]
fn lanes_folds_no_ranks_so_no_line_laps_round_the_page() {
    // The Archboard server reading, which Blocks' placement folds into two columns side by side.
    let drawn =
        drawn_by_lanes(&serde_json::from_str(include_str!("fixtures/folded-ranks.json")).unwrap());
    let tops: Vec<(f64, f64)> = drawn["cards"]
        .as_array()
        .expect("its cards")
        .iter()
        .map(|card| {
            let y = card["box"]["y"].as_f64().expect("a top");
            (y, y + card["box"]["height"].as_f64().expect("a height"))
        })
        .collect();
    let top = tops.iter().map(|one| one.0).fold(f64::INFINITY, f64::min);
    let bottom = tops
        .iter()
        .map(|one| one.1)
        .fold(f64::NEG_INFINITY, f64::max);
    for (id, points) in lines_of(&drawn) {
        assert!(
            points
                .iter()
                .all(|&(_, y)| y >= top - 1.0 && y <= bottom + 1.0),
            "{id} runs between the highest and the lowest card"
        );
    }
}

#[test]
fn lanes_stands_the_ends_on_every_face_round_its_middle() {
    let drawn =
        drawn_by_lanes(&serde_json::from_str(include_str!("fixtures/readme-all.json")).unwrap());
    let lines = lines_of(&drawn);
    for card in drawn["cards"].as_array().expect("its cards") {
        let at = |key: &str| card["box"][key].as_f64().expect("a card's box");
        let (left, top, width, height) = (at("x"), at("y"), at("width"), at("height"));
        for face in [top, top + height] {
            let ends: Vec<f64> = lines
                .iter()
                .flat_map(|(_, points)| [points[0], *points.last().expect("an end")])
                .filter(|&(x, y)| (y - face).abs() < 0.01 && left <= x && x <= left + width)
                .map(|(x, _)| x)
                .collect();
            let (Some(low), Some(high)) = (
                ends.iter().copied().reduce(f64::min),
                ends.iter().copied().reduce(f64::max),
            ) else {
                continue;
            };
            assert!(
                (f64::midpoint(low, high) - (left + width / 2.0)).abs() < 0.5,
                "the ends on {} at {face} stand round its middle: {ends:?}",
                card["id"]
            );
        }
    }
}

#[test]
fn lanes_wraps_a_wide_rank_into_rows_with_its_ends_centred() {
    // The Archboard workbench host reading: six cards below the container are one wide rank,
    // dealt into rows, though every line end stands centred on its face.
    let drawn =
        drawn_by_lanes(&serde_json::from_str(include_str!("fixtures/wrapped-rank.json")).unwrap());
    let frame = &drawn["frames"][0]["box"];
    let below = frame["y"].as_f64().expect("a top") + frame["height"].as_f64().expect("a height");
    let mut rows: Vec<f64> = drawn["cards"]
        .as_array()
        .expect("its cards")
        .iter()
        .map(|card| card["box"]["y"].as_f64().expect("a top"))
        .filter(|&y| y > below)
        .collect();
    rows.sort_by(f64::total_cmp);
    rows.dedup();
    assert!(
        rows.len() >= 2,
        "the rank below the container wraps: {rows:?}"
    );
}

#[test]
fn lanes_lands_a_line_that_turns_past_a_card_on_its_side() {
    // Painting: the painter's line runs down beside the container and turns into a card inside
    // it, so it lands on that card's side; every line end still touches a card.
    let drawn =
        drawn_by_lanes(&serde_json::from_str(include_str!("fixtures/side-port.json")).unwrap());
    let boxes: Vec<(f64, f64, f64, f64)> = drawn["cards"]
        .as_array()
        .expect("its cards")
        .iter()
        .map(|card| {
            let at = |key: &str| card["box"][key].as_f64().expect("a card's box");
            (at("x"), at("y"), at("width"), at("height"))
        })
        .collect();
    let on_face = |(x, y): (f64, f64), side: bool| {
        boxes.iter().any(|&(left, top, width, height)| {
            let level = (y - top).abs() < 0.01 || (y - top - height).abs() < 0.01;
            let upright = (x - left).abs() < 0.01 || (x - left - width).abs() < 0.01;
            if side {
                upright && top < y && y < top + height
            } else {
                (level && left <= x && x <= left + width)
                    || (upright && top <= y && y <= top + height)
            }
        })
    };
    let ends: Vec<(f64, f64)> = lines_of(&drawn)
        .into_iter()
        .flat_map(|(_, points)| [points[0], *points.last().expect("an end")])
        .collect();
    assert!(
        ends.iter().all(|&end| on_face(end, false)),
        "every end touches a card: {ends:?}"
    );
    assert!(
        ends.iter().any(|&end| on_face(end, true)),
        "a line lands on a side: {ends:?}"
    );
}

#[test]
fn two_cables_with_the_same_strands_leave_a_card_from_separate_ports() {
    let mut graph = json!({
        "id": "root",
        "layoutOptions": { "archboard.layout.engine": "lanes" },
        "children": [
            { "id": "source", "width": 40, "height": 100 },
            { "id": "left", "width": 200, "height": 100 },
            { "id": "right", "width": 200, "height": 100 },
        ],
        "edges": [
            { "id": "one", "sources": ["source"], "targets": ["left"] },
            { "id": "two", "sources": ["source"], "targets": ["right"] },
        ],
    });
    for edge in graph["edges"].as_array_mut().expect("edges") {
        edge["layoutOptions"]["archboard.cable"] =
            json!("sync|mutation|unchanged|normal|off||;event|mutation|unchanged|normal|off||");
    }
    let (placed, planned) = told(&graph);
    assert!(!planned);
    let placed: Value = serde_json::from_str(&placed).expect("a placed drawing");
    let edges = placed["edges"].as_array().expect("placed edges");
    assert_ne!(edges[0]["points"][0], edges[1]["points"][0]);
}
