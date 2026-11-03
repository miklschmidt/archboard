use super::*;
use crate::content::Flow;
use crate::flowchart::graph::{flowchart_of, tests as graph};
use archboard_scene::measure;

/// Every node of a flowchart as a box of one size, and every line's words measured.
fn measures(blocks: &[Block]) -> (HashMap<String, (f64, f64)>, HashMap<String, MeasuredLabel>) {
    fn walk(blocks: &[Block], sizes: &mut HashMap<String, (f64, f64)>, words: &mut Vec<String>) {
        for block in blocks {
            match block {
                Block::Step(id) | Block::Terminal(id) => {
                    sizes.insert(id.clone(), (200.0, 60.0));
                }
                Block::Decision { id, answers } => {
                    sizes.insert(id.clone(), (160.0, 80.0));
                    for answer in answers {
                        words.push(answer.label.clone());
                        walk(&answer.blocks, sizes, words);
                    }
                }
                Block::Loop { id, body } => {
                    sizes.insert(id.clone(), (160.0, 40.0));
                    words.extend([REPEAT.to_owned(), DONE.to_owned()]);
                    walk(body, sizes, words);
                }
            }
        }
    }
    let (mut sizes, mut words) = (HashMap::new(), Vec::new());
    walk(blocks, &mut sizes, &mut words);
    let words = words
        .into_iter()
        .map(|text| {
            let measured = measure::measure_label(&text);
            (text, measured)
        })
        .collect();
    (sizes, words)
}

/// A flow's blocks laid out in columns no taller than a height.
fn laid(flows: &[Flow], column: f64) -> Laid {
    let graph = flowchart_of(flows, &graph::parts());
    let blocks = &graph.charts[0].blocks;
    let (sizes, words) = measures(blocks);
    let layout = Layout {
        sizes: &sizes,
        words: &words,
        column,
    };
    layout.chain(blocks)
}

/// A flow of nothing but messages.
fn messages(count: usize) -> Vec<Flow> {
    let steps: Vec<String> = (0..count)
        .map(|index| format!(r#"{{"id":"m{index}","from":"a","to":"b","label":"step {index}"}}"#))
        .collect();
    serde_json::from_str(&format!(
        r#"[{{"id":"f","name":"Long","participants":["a","b"],"steps":[{}]}}]"#,
        steps.join(",")
    ))
    .unwrap()
}

/// Where each box's middle and top stand, by node.
fn middles(laid: &Laid) -> HashMap<&str, (f64, f64)> {
    laid.boxes
        .iter()
        .map(|(id, bounds)| (id.as_str(), (bounds.x + bounds.width / 2.0, bounds.y)))
        .collect()
}

#[test]
fn every_step_leads_to_the_next_and_every_answer_and_loop_line_says_its_words() {
    let laid = laid(&graph::flow(), f64::INFINITY);
    let mut lines: Vec<(&str, &str, Option<&str>)> = laid
        .runs
        .iter()
        .map(|run| {
            let words = run
                .words
                .as_ref()
                .map(|(words, _)| words.runs[0].text.as_str());
            (run.from.as_str(), run.to.as_str(), words)
        })
        .collect();
    lines.sort_unstable();
    assert_eq!(
        lines,
        [
            ("d", "l", Some("no")),
            ("d", "s", Some("yes")),
            ("f~start", "m", None),
            ("l", "f~end", Some("done")),
            ("l", "r", Some("repeat")),
            ("m", "d", None),
            ("r", "l", None),
            ("s", "l", None),
        ]
    );
}

#[test]
fn a_run_that_fits_its_column_height_stands_in_one_column() {
    let laid = laid(&messages(12), f64::INFINITY);
    let xs: Vec<f64> = middles(&laid).values().map(|(x, _)| *x).collect();
    assert_eq!(laid.breaks, 0);
    assert!(xs.iter().all(|x| (x - xs[0]).abs() < 0.01), "one axis");
}

/// The boxes of each column, left to right: the boxes whose middles stand on one axis.
fn columns_of(laid: &Laid) -> Vec<Vec<&str>> {
    let mut columns: Vec<(f64, Vec<&str>)> = Vec::new();
    for (id, bounds) in &laid.boxes {
        let x = bounds.x + bounds.width / 2.0;
        match columns.iter_mut().find(|(at, _)| (at - x).abs() < 0.01) {
            Some((_, ids)) => ids.push(id),
            None => columns.push((x, vec![id])),
        }
    }
    columns.into_iter().map(|(_, ids)| ids).collect()
}

#[test]
fn a_taller_run_breaks_into_even_columns_and_keeps_its_terminals_company() {
    let laid = laid(&messages(12), 500.0);
    let columns = columns_of(&laid);
    let sizes: Vec<usize> = columns.iter().map(Vec::len).collect();
    assert!(laid.breaks > 0 && sizes.len() == laid.breaks + 1);
    let (fewest, most) = (sizes.iter().min().unwrap(), sizes.iter().max().unwrap());
    assert!(most - fewest <= 1, "columns {sizes:?} are even");
    assert!(
        laid.height <= 500.0 + RISE,
        "no column is taller than the height"
    );
    let alone = |ids: &Vec<&str>| ids.len() == 1 && ids[0].contains('~');
    assert!(!columns.iter().any(alone), "a terminal stands with a step");
    // Each column but the first is entered from above, by the line from the foot of the one before.
    let over_the_top = |run: &&Run| run.points.iter().any(|point| point.y < RISE / 2.0);
    assert_eq!(laid.runs.iter().filter(over_the_top).count(), laid.breaks);
}

#[test]
fn a_short_answer_stands_at_the_top_and_its_line_runs_on_to_the_join() {
    let flows: Vec<Flow> = serde_json::from_str(
        r#"[{"id":"f","name":"Branch","participants":["a","b"],"steps":[
            {"id":"d","kind":"decision","question":"long or short?","alternatives":[
                {"label":"short","steps":[{"id":"s1","from":"a","to":"b","label":"one"}]},
                {"label":"long","steps":[
                    {"id":"l1","from":"a","to":"b","label":"one"},
                    {"id":"l2","from":"a","to":"b","label":"two"},
                    {"id":"l3","from":"a","to":"b","label":"three"}]}]},
            {"id":"after","from":"b","to":"a","label":"after"}]}]"#,
    )
    .unwrap();
    let laid = laid(&flows, f64::INFINITY);
    let at = middles(&laid);
    assert_eq!(at["s1"].1, at["l1"].1, "both answers start on one row");
    let short = laid.runs.iter().find(|run| run.from == "s1").unwrap();
    let long = laid.runs.iter().find(|run| run.from == "l3").unwrap();
    assert_eq!((short.to.as_str(), long.to.as_str()), ("after", "after"));
    // The short answer's line drops past the long answer before it joins.
    let lowest = |run: &Run| run.points.iter().map(|point| point.y).fold(0.0, f64::max);
    assert!(at["l3"].1 < lowest(short));
}
