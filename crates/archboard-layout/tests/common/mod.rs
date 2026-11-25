//! Graphs that several layout test files draw.

use serde_json::json;

/// A card too small to space the ends of its eight lines of six kinds: no placement gives
/// every line a clear planned channel.
pub(crate) fn crowded_card() -> String {
    let kinds = ["call", "http", "event", "data", "config", "mixed kinds"];
    let cards = std::iter::once(json!({"id":"hub","width":16,"height":16}))
        .chain((0..8).map(|at| json!({"id":format!("c{at}"),"width":160,"height":60})));
    let edges = (0..8).map(|at| {
        let kind = kinds[at % kinds.len()];
        let card = format!("c{at}");
        let (from, to) = if at < kinds.len() {
            ("hub", card.as_str())
        } else {
            (card.as_str(), "hub")
        };
        json!({"id":format!("e{at}"),"sources":[from],"targets":[to],
            "layoutOptions":{"archboard.relationship.kind":kind,
                "archboard.relationship.held-kind":kind},
            "labels":[{"id":format!("l{at}"),"text":"calls","width":40,"height":16}]})
    });
    json!({"id":"root","layoutOptions":{},
        "children":cards.collect::<Vec<_>>(),"edges":edges.collect::<Vec<_>>()})
    .to_string()
}
