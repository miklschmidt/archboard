//! A flow read as a flowchart (ADR 0053): the graph the track engine lays out.
//!
//! Each flow becomes a frame that holds its steps, from a start terminal to an
//! end terminal. A message is a box: what happens, done by the part that
//! receives it, and who sends it to whom under its words. A decision is a
//! diamond with one line out for each alternative, labelled with the answer;
//! the steps of each alternative run below it, and the last of every
//! alternative joins the step after the decision, which is how a flowchart
//! says that the alternatives rejoin. An alternative with no step joins it
//! straight from the diamond. A loop is a hexagon holding its condition: a
//! line labelled "repeat" runs into the steps it repeats, the last of them
//! runs back up to it, and a line labelled "done" leaves it for the step after.
//!
//! Nothing here is written anywhere: the graph is built for one picture, from
//! the flow as the board holds it. Its boxes carry the steps' own ids, so a
//! reader who picks one has picked the step; its lines and terminals carry ids
//! of the picture's own, which name no subject.

use std::collections::{BTreeMap, HashMap};

use archboard_layout::{Content, Edge, Node as GraphNode};
use archboard_scene::drawing::Emphasis;
use archboard_scene::request::FlowchartShape;

use crate::board::{Flow, Message, Node, Step};

/// The kind of a flow's frame.
pub(super) const FLOW_KIND: &str = "flow";
/// The kind of a decision, a loop or a terminal, which is drawn by its shape
/// and never by its kind.
pub(super) const SHAPE_KIND: &str = "flowchart-shape";
/// The kind of every line: one step leads to the next.
pub(super) const NEXT_KIND: &str = "next";
/// The line into the steps a loop repeats.
const REPEAT: &str = "repeat";
/// The line out of a loop once it is done.
const DONE: &str = "done";

/// Every flow of a reading as one flowchart graph.
#[derive(Clone, Debug)]
pub(super) struct Graph {
    /// The flows as frames, their steps and terminals as nodes, and every line between.
    pub content: Content,
    /// The nodes drawn as shapes of their own, by id.
    pub shapes: BTreeMap<String, FlowchartShape>,
    /// What a reader can pick: every flow and every step drawn, in the order drawn.
    pub subjects: Vec<String>,
}

impl Graph {
    /// The shape a node is drawn as, when it is drawn as one.
    pub(super) fn shape(&self, id: &str) -> Option<FlowchartShape> {
        self.shapes.get(id).copied()
    }
}

/// A loose end the next step joins: the node it leaves, and what its line says.
struct Exit<'a> {
    from: String,
    label: Option<&'a str>,
}

/// The graph as it is built, and the frame the steps being built stand in.
struct Building<'a> {
    nodes: Vec<GraphNode>,
    edges: Vec<Edge>,
    shapes: BTreeMap<String, FlowchartShape>,
    subjects: Vec<String>,
    /// The variant's nodes, by id, for the parts a message runs between.
    parts: HashMap<&'a str, &'a Node>,
    flow: String,
}

impl<'a> Building<'a> {
    /// Add one node to the frame being built.
    fn add_node(&mut self, id: String, name: String, kind: String, responsibility: Option<String>) {
        self.nodes.push(GraphNode {
            id,
            order: self.nodes.len() as f64,
            name,
            kind,
            parent: Some(self.flow.clone()),
            responsibility,
            groups: Vec::new(),
            drills: false,
        });
    }

    /// Join every loose end to one node.
    fn link(&mut self, exits: &[Exit<'_>], to: &str) {
        for exit in exits {
            let order = self.edges.len();
            self.edges.push(Edge {
                id: format!("{}>{to}#{order}", exit.from),
                order: order as f64,
                from: exit.from.clone(),
                to: to.to_owned(),
                kind: NEXT_KIND.to_owned(),
                emphasis: Emphasis::Normal,
                label: exit.label.map(str::to_owned),
                traffic: None,
            });
        }
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

    /// Add one step's node: a box for a message, a diamond for a decision, a
    /// hexagon for a loop.
    fn add_step(&mut self, step: &Step) {
        self.subject(step.id());
        let (shape, name) = match step {
            Step::Message(message) => return self.add_message(message),
            Step::Decision(decision) => (FlowchartShape::Decision, &decision.question),
            Step::Loop(repeat) => (FlowchartShape::Loop, &repeat.condition),
        };
        self.shapes.insert(step.id().to_owned(), shape);
        self.add_node(
            step.id().to_owned(),
            name.clone(),
            SHAPE_KIND.to_owned(),
            None,
        );
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

    /// Chain a run of steps after some loose ends: the loose ends the step
    /// after the run joins.
    fn chain(&mut self, steps: &'a [Step], exits: Vec<Exit<'a>>) -> Vec<Exit<'a>> {
        let mut open = exits;
        for step in steps {
            self.add_step(step);
            self.link(&open, step.id());
            open = self.exits_of(step);
        }
        open
    }

    /// The loose ends one step leaves, its own steps chained in first.
    fn exits_of(&mut self, step: &'a Step) -> Vec<Exit<'a>> {
        match step {
            Step::Decision(decision) => decision
                .alternatives
                .iter()
                .flat_map(|alternative| {
                    self.chain(
                        &alternative.steps,
                        vec![Exit {
                            from: decision.id.clone(),
                            label: Some(&alternative.label),
                        }],
                    )
                })
                .collect(),
            Step::Loop(repeat) => {
                let last = self.chain(
                    &repeat.steps,
                    vec![Exit {
                        from: repeat.id.clone(),
                        label: Some(REPEAT),
                    }],
                );
                self.link(&last, &repeat.id);
                vec![Exit {
                    from: repeat.id.clone(),
                    label: Some(DONE),
                }]
            }
            Step::Message(message) => vec![Exit {
                from: message.id.clone(),
                label: None,
            }],
        }
    }

    /// Add one flow: its frame, its terminals and its steps.
    fn add_flow(&mut self, flow: &'a Flow) {
        self.nodes.push(GraphNode {
            id: flow.id.clone(),
            order: self.nodes.len() as f64,
            name: flow.name.clone(),
            kind: FLOW_KIND.to_owned(),
            parent: None,
            responsibility: flow.summary.clone(),
            groups: Vec::new(),
            drills: false,
        });
        self.subject(&flow.id);
        self.flow.clone_from(&flow.id);
        let start = format!("{}~start", flow.id);
        self.add_node(
            start.clone(),
            "Start".to_owned(),
            SHAPE_KIND.to_owned(),
            None,
        );
        self.shapes.insert(start.clone(), FlowchartShape::Start);
        let exits = self.chain(
            &flow.steps,
            vec![Exit {
                from: start,
                label: None,
            }],
        );
        let end = format!("{}~end", flow.id);
        self.add_node(end.clone(), "End".to_owned(), SHAPE_KIND.to_owned(), None);
        self.shapes.insert(end.clone(), FlowchartShape::End);
        self.link(&exits, &end);
    }
}

/// Every flow of a reading as one flowchart graph.
pub(super) fn flowchart_of(flows: &[Flow], parts: &[Node]) -> Graph {
    let mut building = Building {
        nodes: Vec::new(),
        edges: Vec::new(),
        shapes: BTreeMap::new(),
        subjects: Vec::new(),
        parts: parts.iter().map(|part| (part.id.as_str(), part)).collect(),
        flow: String::new(),
    };
    for flow in flows {
        building.add_flow(flow);
    }
    Graph {
        content: Content {
            nodes: building.nodes,
            edges: building.edges,
        },
        shapes: building.shapes,
        subjects: building.subjects,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flow() -> Vec<Flow> {
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

    fn parts() -> Vec<Node> {
        serde_json::from_str(
            r#"[{"id":"a","order":0,"name":"Shop","kind":"service"},
                {"id":"b","order":1,"name":"Billing","kind":"database"}]"#,
        )
        .unwrap()
    }

    #[test]
    fn a_flow_runs_from_its_start_through_its_steps_to_its_end() {
        let graph = flowchart_of(&flow(), &parts());
        let lines: Vec<(&str, &str, Option<&str>)> = graph
            .content
            .edges
            .iter()
            .map(|edge| (edge.from.as_str(), edge.to.as_str(), edge.label.as_deref()))
            .collect();
        assert_eq!(
            lines,
            [
                ("f~start", "m", None),
                ("m", "d", None),
                ("d", "s", Some("yes")),
                ("s", "l", None),
                ("d", "l", Some("no")),
                ("l", "r", Some("repeat")),
                ("r", "l", None),
                ("l", "f~end", Some("done")),
            ]
        );
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
        let node = |id: &str| {
            graph
                .content
                .nodes
                .iter()
                .find(|node| node.id == id)
                .unwrap()
        };
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
