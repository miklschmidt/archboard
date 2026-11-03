//! A flow read as a flowchart (ADR 0053): the boxes and shapes it draws, and
//! the blocks the layout sets them out in (ADR 0073).
//!
//! Each flow becomes a frame that holds its steps, from a start terminal to an
//! end terminal. A message is a box: what happens, done by the part that
//! receives it, and who sends it to whom under its words. A decision is a
//! diamond with one answer for each alternative, each answer a run of blocks of
//! its own below it; the last of every answer joins the step after the
//! decision, which is how a flowchart says that the alternatives rejoin. A loop
//! is a hexagon holding its condition, with the blocks it repeats below it.
//!
//! Nothing here is written anywhere: the blocks are built for one picture, from
//! the flow as the picture holds it. Its boxes carry the steps' own ids, so a
//! reader who picks one has picked the step; its terminals carry ids of the
//! picture's own, which name no subject.

use std::collections::{BTreeMap, HashMap};

use archboard_layout::Node as GraphNode;
use archboard_scene::paint::design::FLOW_KIND;
use archboard_scene::request::FlowchartShape;

use crate::content::{Flow, Message, Node, Step};

/// The kind of a decision, a loop or a terminal, which is drawn by its shape
/// and never by its kind.
pub(super) const SHAPE_KIND: &str = "flowchart-shape";

/// One block of a run of steps: what the layout stacks, and sets side by side.
#[derive(Clone, Debug)]
pub(super) enum Block {
    /// A message's box.
    Step(String),
    /// A flow's start or end, which a run of steps never breaks away from.
    Terminal(String),
    /// A decision's diamond, with its answers side by side below it.
    Decision {
        /// The decision's step.
        id: String,
        /// Its answers, in the order the flow tells them.
        answers: Vec<Answer>,
    },
    /// A loop's hexagon, with the blocks it repeats below it.
    Loop {
        /// The loop's step.
        id: String,
        /// The blocks it repeats.
        body: Vec<Block>,
    },
}

/// One answer of a decision: its words, and the blocks it runs through.
#[derive(Clone, Debug)]
pub(super) struct Answer {
    /// The alternative's label, which its line out of the diamond carries.
    pub label: String,
    /// Its steps as blocks; none where the answer joins the next step at once.
    pub blocks: Vec<Block>,
}

/// One flow's frame and the blocks it holds, from its start to its end.
#[derive(Clone, Debug)]
pub(super) struct Chart {
    /// The flow, whose frame holds the blocks.
    pub flow: String,
    /// Its start, its steps and its end.
    pub blocks: Vec<Block>,
}

/// Every flow of a reading as one flowchart.
#[derive(Clone, Debug)]
pub(super) struct Graph {
    /// The flows as frames, and their steps and terminals, in the order drawn.
    pub nodes: Vec<GraphNode>,
    /// The nodes drawn as shapes of their own, by id.
    pub shapes: BTreeMap<String, FlowchartShape>,
    /// What a reader can pick: every flow and every step drawn, in the order drawn.
    pub subjects: Vec<String>,
    /// Each flow's blocks.
    pub charts: Vec<Chart>,
}

impl Graph {
    /// The shape a node is drawn as, when it is drawn as one.
    pub(super) fn shape(&self, id: &str) -> Option<FlowchartShape> {
        self.shapes.get(id).copied()
    }
}

/// The graph as it is built, and the frame the steps being built stand in.
struct Building<'a> {
    nodes: Vec<GraphNode>,
    shapes: BTreeMap<String, FlowchartShape>,
    subjects: Vec<String>,
    /// The variant's nodes, by id, for the parts a message runs between.
    parts: HashMap<&'a str, &'a Node>,
    flow: String,
}

impl Building<'_> {
    /// Add one node to the frame being built.
    fn add_node(&mut self, id: String, name: String, kind: String, responsibility: Option<String>) {
        self.nodes.push(GraphNode {
            id,
            order: self.nodes.len() as f64,
            name,
            kind,
            parent: Some(self.flow.clone()),
            responsibility,
            code_path: None,
            door: None,
            toggle: None,
            groups: Vec::new(),
            drills: false,
        });
    }

    /// Add one node drawn as a shape of its own.
    fn add_shape(&mut self, id: &str, shape: FlowchartShape, name: &str) {
        self.shapes.insert(id.to_owned(), shape);
        self.add_node(id.to_owned(), name.to_owned(), SHAPE_KIND.to_owned(), None);
    }

    /// What one part is called in a message box's line of who sends to whom.
    fn part_name(&self, id: &str) -> String {
        self.parts
            .get(id)
            .map_or_else(|| id.to_owned(), |part| part.name.clone())
    }

    /// A subject a reader can pick, once.
    fn subject(&mut self, id: &str) {
        if !self.subjects.iter().any(|known| known == id) {
            self.subjects.push(id.to_owned());
        }
    }

    /// One step's block, its own steps built in first: a box for a message,
    /// a diamond for a decision, a hexagon for a loop.
    fn block(&mut self, step: &Step) -> Block {
        self.subject(step.id());
        match step {
            Step::Message(message) => {
                self.add_message(message);
                Block::Step(message.id.clone())
            }
            Step::Decision(decision) => {
                self.add_shape(&decision.id, FlowchartShape::Decision, &decision.question);
                let answers = decision
                    .alternatives
                    .iter()
                    .map(|alternative| Answer {
                        label: alternative.label.clone(),
                        blocks: self.blocks(&alternative.steps),
                    })
                    .collect();
                Block::Decision {
                    id: decision.id.clone(),
                    answers,
                }
            }
            Step::Loop(repeat) => {
                self.add_shape(&repeat.id, FlowchartShape::Loop, &repeat.condition);
                Block::Loop {
                    id: repeat.id.clone(),
                    body: self.blocks(&repeat.steps),
                }
            }
        }
    }

    /// A run of steps' blocks, in order.
    fn blocks(&mut self, steps: &[Step]) -> Vec<Block> {
        steps.iter().map(|step| self.block(step)).collect()
    }

    /// A message's box: what happens, set as a card of the part that receives
    /// the message, which is the part that does what it asks, with who sends it
    /// to whom under its words.
    fn add_message(&mut self, step: &Message) {
        let from = self.part_name(&step.from);
        let name = step.drawn_label();
        let kind = self
            .parts
            .get(step.to.as_str())
            .map_or_else(|| "other".to_owned(), |part| part.kind.clone());
        let responsibility = if step.from == step.to {
            from
        } else {
            format!("{from} → {}", self.part_name(&step.to))
        };
        self.add_node(step.id.clone(), name, kind, Some(responsibility));
    }

    /// Add one flow: its frame, its terminals and its steps.
    fn add_flow(&mut self, flow: &Flow) -> Chart {
        self.nodes.push(GraphNode {
            id: flow.id.clone(),
            order: self.nodes.len() as f64,
            name: flow.name.clone(),
            kind: FLOW_KIND.to_owned(),
            parent: None,
            responsibility: flow.summary.clone(),
            code_path: None,
            door: None,
            toggle: None,
            groups: Vec::new(),
            drills: false,
        });
        self.subject(&flow.id);
        self.flow.clone_from(&flow.id);
        let start = format!("{}~start", flow.id);
        self.add_shape(&start, FlowchartShape::Start, "Start");
        let mut blocks = vec![Block::Terminal(start)];
        blocks.extend(self.blocks(&flow.steps));
        let end = format!("{}~end", flow.id);
        self.add_shape(&end, FlowchartShape::End, "End");
        blocks.push(Block::Terminal(end));
        Chart {
            flow: flow.id.clone(),
            blocks,
        }
    }
}

/// Every flow of a reading as one flowchart.
pub(super) fn flowchart_of(flows: &[Flow], parts: &[Node]) -> Graph {
    let mut building = Building {
        nodes: Vec::new(),
        shapes: BTreeMap::new(),
        subjects: Vec::new(),
        parts: parts.iter().map(|part| (part.id.as_str(), part)).collect(),
        flow: String::new(),
    };
    let charts = flows.iter().map(|flow| building.add_flow(flow)).collect();
    Graph {
        nodes: building.nodes,
        shapes: building.shapes,
        subjects: building.subjects,
        charts,
    }
}

#[cfg(test)]
pub(super) mod tests {
    use super::*;

    /// A flow with a message, a decision with an empty answer, and a loop.
    pub(crate) fn flow() -> Vec<Flow> {
        serde_json::from_str(
            r#"[{"id":"f","name":"Order","participants":["a","b"],"steps":[
                {"id":"m","from":"a","to":"b","label":"place"},
                {"id":"d","kind":"decision","question":"paid?","alternatives":[
                    {"label":"yes","steps":[{"id":"s","kind":"self","from":"b","to":"b","label":"ship"}]},
                    {"label":"no","steps":[]}]},
                {"id":"l","kind":"loop","condition":"retry","steps":[
                    {"id":"r","kind":"async","from":"b","to":"a","label":"remind","repeat":2}]}]}]"#,
        )
        .unwrap()
    }

    /// The parts the flow runs between.
    pub(crate) fn parts() -> Vec<Node> {
        serde_json::from_str(
            r#"[{"id":"a","order":0,"name":"Shop","kind":"service"},
                {"id":"b","order":1,"name":"Billing","kind":"database"}]"#,
        )
        .unwrap()
    }

    #[test]
    fn a_flow_runs_from_its_start_through_its_blocks_to_its_end() {
        let graph = flowchart_of(&flow(), &parts());
        let [chart] = graph.charts.as_slice() else {
            panic!("one flow, one chart");
        };
        let ids: Vec<&str> = chart
            .blocks
            .iter()
            .map(|block| match block {
                Block::Step(id)
                | Block::Terminal(id)
                | Block::Decision { id, .. }
                | Block::Loop { id, .. } => id.as_str(),
            })
            .collect();
        assert_eq!(ids, ["f~start", "m", "d", "l", "f~end"]);
        let Block::Decision { answers, .. } = &chart.blocks[2] else {
            panic!("the decision");
        };
        let shape: Vec<(&str, usize)> = answers
            .iter()
            .map(|answer| (answer.label.as_str(), answer.blocks.len()))
            .collect();
        assert_eq!(shape, [("yes", 1), ("no", 0)]);
        assert_eq!(graph.subjects, ["f", "m", "d", "s", "l", "r"]);
        assert_eq!(
            ["d", "l", "f~end", "m"].map(|id| graph.shape(id)),
            [
                Some(FlowchartShape::Decision),
                Some(FlowchartShape::Loop),
                Some(FlowchartShape::End),
                None,
            ]
        );
    }

    #[test]
    fn a_message_box_is_a_card_of_its_receiver_saying_who_sends_to_whom() {
        let graph = flowchart_of(&flow(), &parts());
        let node = |id: &str| graph.nodes.iter().find(|node| node.id == id).unwrap();
        assert_eq!(
            (
                node("m").kind.as_str(),
                node("m").responsibility.as_deref(),
                node("s").responsibility.as_deref(),
            ),
            ("database", Some("Shop → Billing"), Some("Billing"))
        );
        assert_eq!(
            (
                node("r").name.as_str(),
                node("r").parent.as_deref(),
                node("f").parent.as_deref(),
            ),
            ("remind ×2", Some("f"), None)
        );
    }
}
