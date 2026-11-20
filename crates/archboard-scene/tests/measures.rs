//! What a layout learns of a part before it places it: a relationship's words
//! on the plates a route can take, and a node's box and words as the part it
//! is drawn as.

use archboard_scene::drawing::{MeasuredNode, TextRole};
use archboard_scene::{CardWords, Part, measure_label, measure_node};

/// A part's words, with a responsibility and a code path.
fn words() -> CardWords<'static> {
    CardWords {
        name: "Command startup",
        responsibility: Some("Takes argv from the process to one selected command."),
        path: Some("apps/cli/src"),
        tags: &[],
        drills: false,
        door: false,
        toggle: None,
    }
}

/// The words of a measured node with some role, in order.
fn said(node: &MeasuredNode<()>, role: TextRole) -> Vec<&str> {
    node.runs
        .iter()
        .filter(|run| run.role == role)
        .map(|run| run.text.as_str())
        .collect()
}

#[test]
fn a_label_that_wraps_narrower_gets_a_narrow_plate_holding_each_word_whole() {
    let text = "repositories_changed to every tab";
    let plates = measure_label(text);
    let narrow = plates.narrow.expect("the words wrap narrower");
    let lines: Vec<&str> = narrow.runs.iter().map(|run| run.text.as_str()).collect();
    assert!(lines.len() > 1);
    assert_eq!(lines.join(" "), text);
    assert!(narrow.width < plates.wide.width);
    for plate in [&plates.wide, &narrow] {
        assert!(
            plate
                .runs
                .iter()
                .all(|run| run.x >= 0.0 && run.x + run.width <= plate.width)
        );
    }
}

#[test]
fn a_short_label_has_only_its_wide_plate() {
    let plates = measure_label("calls");
    assert!(plates.narrow.is_none());
    assert_eq!(plates.wide.runs.len(), 1);
    assert_eq!(plates.wide.runs[0].text, "calls");
}

#[test]
fn a_card_stacks_its_name_over_its_responsibility_below_no_header() {
    let card = measure_node((), &words(), Part::Card);
    assert_eq!(card.header_height, 0.0);
    assert_eq!(said(&card, TextRole::Title), ["Command startup"]);
    let title = &card.runs[0];
    let note = card.runs.iter().find(|run| run.role == TextRole::Note);
    assert!(note.is_some_and(|note| note.y > title.y));
}

#[test]
fn a_container_is_one_header_line_that_leaves_out_its_responsibility() {
    let tab = measure_node((), &words(), Part::Container);
    assert_eq!(tab.header_height, tab.height);
    assert!(tab.runs.iter().all(|run| run.y == tab.runs[0].y));
    assert!(tab.runs.iter().all(|run| !run.text.contains("argv")));
    assert!(tab.height < measure_node((), &words(), Part::Card).height);
}

#[test]
fn a_flow_frame_is_a_header_of_its_name_over_its_summary() {
    let flow = measure_node((), &words(), Part::FlowFrame);
    assert_eq!(flow.header_height, flow.height);
    assert_eq!(said(&flow, TextRole::Title), ["Command startup"]);
    assert_eq!(
        said(&flow, TextRole::Note),
        ["Takes argv from the process to one selected command."]
    );
    assert!(flow.runs[1].y > flow.runs[0].y);
}
