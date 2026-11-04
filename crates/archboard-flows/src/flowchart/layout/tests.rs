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
                Block::Loop { id, body, .. } => {
                    sizes.insert(id.clone(), (160.0, 40.0));
                    words.extend([REPEAT.to_owned(), DONE.to_owned()]);
                    walk(body, sizes, words);
                }
                Block::Guard { id, side, main, .. } => {
                    sizes.insert(id.clone(), (160.0, 80.0));
                    words.extend([side.label.clone(), main.clone()]);
                    walk(&side.blocks, sizes, words);
                }
                Block::Land(_) => {}
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
    graph::flow_of(&graph::messages("m", count))
}

/// Every line laid out, as the nodes it runs between.
fn lines(laid: &Laid) -> Vec<(&str, &str)> {
    let mut lines: Vec<(&str, &str)> = laid
        .runs
        .iter()
        .map(|run| (run.from.as_str(), run.to.as_str()))
        .collect();
    lines.sort_unstable();
    lines
}

/// Every end of a jump laid out: its id, which end it is, and the jump's in.
fn markers(laid: &Laid) -> Vec<(&str, JumpEnd, &str)> {
    laid.markers
        .iter()
        .map(|marker| (marker.id.as_str(), marker.end, marker.jump.as_str()))
        .collect()
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
fn a_run_that_fits_its_column_height_stands_in_one_column_its_steps_stacked() {
    let laid = laid(&messages(12), f64::INFINITY);
    let xs: Vec<f64> = middles(&laid).values().map(|(x, _)| *x).collect();
    assert_eq!(laid.breaks, 0);
    assert!(xs.iter().all(|x| (x - xs[0]).abs() < 0.01), "one axis");
    // Steps that follow each other stack close, with no line between them.
    assert_eq!(lines(&laid), [("f~start", "m0"), ("m11", "f~end")]);
    let at = middles(&laid);
    assert_eq!(at["m1"].1 - at["m0"].1, 60.0 + STACK_GAP);
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
fn a_taller_run_breaks_into_even_columns_that_jump_from_one_to_the_next() {
    let laid = laid(&messages(12), 500.0);
    let columns = columns_of(&laid);
    let sizes: Vec<usize> = columns.iter().map(Vec::len).collect();
    let uneven = sizes.iter().max().unwrap() - sizes.iter().min().unwrap();
    let alone = (columns.iter())
        .filter(|ids| ids.len() == 1 && ids[0].contains('~'))
        .count();
    assert!(laid.breaks > 0);
    assert_eq!(
        (sizes.len(), uneven <= 1, alone),
        (laid.breaks + 1, true, 0),
        "the columns {sizes:?} are even and keep their terminals company"
    );
    assert!(
        laid.height <= 500.0 + STEP_GAP + JUMP_OUT.1,
        "no column is taller than the height, but for the jump out below it"
    );
    assert_eq!(
        (column_jumps(&laid, &columns), laid.markers.len()),
        (laid.breaks, 2 * laid.breaks),
        "each column but the last jumps to the next"
    );
    assert_eq!(strays(&laid), Vec::<(&str, &str)>::new());
}

/// The lines that run from one column to another, as the nodes they run
/// between, when every column is a step wide.
fn strays(laid: &Laid) -> Vec<(&str, &str)> {
    let column = |point: &Point| (point.x / (200.0 + COLUMN_GAP)).floor();
    (laid.runs.iter())
        .filter(|run| (run.points.iter()).any(|point| column(point) != column(&run.points[0])))
        .map(|run| (run.from.as_str(), run.to.as_str()))
        .collect()
}

/// How many columns end at a jump out whose jump in starts the next column,
/// both named by the last block of the column.
fn column_jumps(laid: &Laid, columns: &[Vec<&str>]) -> usize {
    let marker = |id: String| laid.markers.iter().find(|marker| marker.id == id);
    let jumps = |before: &str| {
        let out = marker(format!("{before}~out"))?;
        let into = marker(format!("{before}~in"))?;
        let paired = out.end == JumpEnd::OutDown && into.end == JumpEnd::In && out.jump == into.id;
        (paired && out.bounds.x < into.bounds.x).then_some(())
    };
    (columns.windows(2))
        .filter_map(|pair| jumps(pair[0].last()?))
        .count()
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

#[test]
fn a_guard_stands_its_short_answer_clear_beside_the_run_and_jumps_to_its_landing() {
    let steps = [
        graph::decision("d", &graph::messages("s", 1), &graph::messages("l", 5)),
        graph::messages("after", 1),
    ];
    let laid = laid(&graph::flow_of(&steps.join(",")), f64::INFINITY);
    assert_eq!(
        markers(&laid),
        [
            ("d~jump", JumpEnd::OutDown, "d~land"),
            ("d~land", JumpEnd::In, "d~land")
        ]
    );
    let boxes: HashMap<&str, Rect> = laid
        .boxes
        .iter()
        .map(|(id, bounds)| (id.as_str(), *bounds))
        .collect();
    // The long answer runs straight on below the diamond, and the short one
    // stands clear of the steps beside it by the room between two answers,
    // and no further: half the steps beside it, that room and half its own step.
    let at = middles(&laid);
    assert_eq!(
        (at["l0"].0 - at["d"].0, at["d"].0 - at["s0"].0),
        (0.0, 100.0 + 32.0 + 100.0)
    );
    // The short answer's line ends at its jump out, and the landing's line
    // joins the run's line into the step after the long answer.
    let landing = laid.runs.iter().find(|run| run.from == "d~land").unwrap();
    assert_eq!(
        (landing.joins, landing.to.as_str()),
        (true, "after0"),
        "the landing's line joins the run's line into the step after"
    );
    let lines = lines(&laid);
    assert!(lines.contains(&("s0", "d~jump")) && lines.contains(&("l4", "after0")));
    assert!(
        laid.markers[1].bounds.y > boxes["l4"].y,
        "it lands after the long answer"
    );
}

#[test]
fn a_long_loop_jumps_back_to_its_hexagon_and_on_from_beside_it() {
    let steps = [
        format!(
            r#"{{"id":"l","kind":"loop","condition":"each","steps":[{}]}}"#,
            graph::messages("m", 4)
        ),
        graph::messages("after", 1),
    ];
    let laid = laid(&graph::flow_of(&steps.join(",")), f64::INFINITY);
    assert_eq!(
        markers(&laid),
        [
            ("l~back", JumpEnd::OutDown, "l~again"),
            ("l~again", JumpEnd::In, "l~again"),
            ("l~out", JumpEnd::OutRight, "l~in"),
            ("l~in", JumpEnd::In, "l~in"),
        ]
    );
    let lines = lines(&laid);
    for line in [
        ("l", "m0"),
        ("m3", "l~back"),
        ("l~again", "l"),
        ("l", "l~out"),
        ("l~in", "after0"),
    ] {
        assert!(lines.contains(&line), "{line:?} in {lines:?}");
    }
    // The jump back stands beside the hexagon, and the jump on from it below the body.
    let hexagon = laid.boxes.iter().find(|(id, _)| id == "l").unwrap().1;
    let [back, again, out, on] = [0, 1, 2, 3].map(|index| laid.markers[index].bounds);
    assert!(again.x + again.width < hexagon.x && out.x > hexagon.x + hexagon.width);
    assert!(
        on.y > back.y + back.height,
        "the run goes on below the jump back"
    );
}

#[test]
fn nested_landings_do_not_change_which_decisions_jump() {
    let inner = graph::decision("inner", "", &graph::messages("i", 4));
    for (first, second, jumps) in [
        (inner.clone(), graph::messages("m", 9), true),
        (graph::messages("m", 2), inner, false),
    ] {
        let outer = graph::decision("outer", &first, &second);
        let laid = laid(&graph::flow_of(&outer), f64::INFINITY);
        assert_eq!(
            laid.markers.iter().any(|marker| marker.id == "outer~jump"),
            jumps,
            "only authored blocks count toward the four-block difference"
        );
    }
}

#[test]
fn a_long_loop_body_in_columns_jumps_back_from_below_its_last_column() {
    let steps = format!(
        r#"{{"id":"l","kind":"loop","condition":"each","steps":[{}]}}"#,
        graph::messages("m", 8)
    );
    let laid = laid(&graph::flow_of(&steps), 400.0);
    let back = laid
        .markers
        .iter()
        .find(|marker| marker.id == "l~back")
        .unwrap();
    let at = middles(&laid);
    assert!(at["m7"].0 > at["m0"].0, "the body breaks into columns");
    // It stands right below the body's last step, not below its tallest column.
    assert_eq!(
        (back.bounds.x + back.bounds.width / 2.0, back.bounds.y),
        (at["m7"].0, at["m7"].1 + 60.0 + STEP_GAP)
    );
    assert_eq!(slanted(&laid), Vec::<(&str, &str)>::new());
}

/// The lines that run aslant anywhere, as the nodes they run between.
fn slanted(laid: &Laid) -> Vec<(&str, &str)> {
    let straight = |pair: &[Point]| pair[0].x == pair[1].x || pair[0].y == pair[1].y;
    (laid.runs.iter())
        .filter(|run| !run.points.windows(2).all(straight))
        .map(|run| (run.from.as_str(), run.to.as_str()))
        .collect()
}

#[test]
fn every_jump_out_names_a_jump_in_that_the_layout_placed() {
    let inner = graph::decision("inner", "", &graph::messages("i", 6));
    let looped = format!(
        r#"{{"id":"l","kind":"loop","condition":"each","steps":[{}]}}"#,
        graph::decision("d", &graph::messages("s", 1), &inner)
    );
    let steps = [graph::messages("m", 8), looped, graph::messages("n", 8)];
    let laid = laid(&graph::flow_of(&steps.join(",")), 400.0);
    assert!(laid.breaks > 0);
    let ins: Vec<&str> = laid
        .markers
        .iter()
        .filter(|marker| marker.end == JumpEnd::In)
        .map(|marker| marker.id.as_str())
        .collect();
    for marker in &laid.markers {
        assert!(ins.contains(&marker.jump.as_str()), "{} lands", marker.id);
    }
    let mut ids: Vec<&str> = laid
        .markers
        .iter()
        .map(|marker| marker.id.as_str())
        .collect();
    ids.sort_unstable();
    ids.dedup();
    assert_eq!(
        ids.len(),
        laid.markers.len(),
        "every marker has an id of its own"
    );
}
