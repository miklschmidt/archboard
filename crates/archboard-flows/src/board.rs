//! A board's flows and nodes, as the layout reads them from the board's own
//! JSON (`@archboard/board/flow`, `@archboard/board/content`). A flow is a tree
//! told in order: a decision holds its alternatives' steps, and a loop holds
//! the steps it repeats (ADR 0053).

use serde::{Deserialize, Deserializer};

/// One node of the variant: the part a participant or a message box stands for.
pub use archboard_layout::Node;
pub use archboard_scene::request::MessageKind;

/// One message: who sends it, who receives it, and what it is.
#[derive(Clone, Debug)]
pub struct Message {
    /// The step's id.
    pub id: String,
    /// What the message does.
    pub kind: MessageKind,
    /// The id of the node that sends it.
    pub from: String,
    /// The id of the node that receives it: the sender again for a message to itself.
    pub to: String,
    /// Its words, before a repeat is added.
    pub label: String,
    /// A note set under the message, when it has one.
    pub note: Option<String>,
    /// How many times it happens in one run; absent for once.
    pub repeat: Option<u64>,
}

impl Message {
    /// Its words as drawn: a repeated step says so rather than being drawn twice.
    pub fn drawn_label(&self) -> String {
        match self.repeat {
            None => self.label.clone(),
            Some(repeat) => format!("{} ×{repeat}", self.label),
        }
    }
}

/// One answer to a decision's question, and the steps that run on it.
#[derive(Clone, Debug, Deserialize)]
pub struct Alternative {
    /// The answer's words, which name its branch.
    pub label: String,
    /// The steps that run on this answer, in order.
    pub steps: Vec<Step>,
}

/// Where a flow branches.
#[derive(Clone, Debug)]
pub struct Decision {
    /// The step's id.
    pub id: String,
    /// What the decision asks.
    pub question: String,
    /// Its answers, in the order they are drawn.
    pub alternatives: Vec<Alternative>,
}

/// Steps that repeat while a condition holds.
#[derive(Clone, Debug)]
pub struct Loop {
    /// The step's id.
    pub id: String,
    /// The condition the steps repeat while it holds.
    pub condition: String,
    /// The steps the loop repeats, in order.
    pub steps: Vec<Step>,
}

/// One step of a flow.
#[derive(Clone, Debug)]
pub enum Step {
    /// A message between two nodes.
    Message(Message),
    /// A branch of the flow.
    Decision(Decision),
    /// Steps that repeat while a condition holds.
    Loop(Loop),
}

impl Step {
    /// The step's id.
    pub fn id(&self) -> &str {
        match self {
            Step::Message(message) => &message.id,
            Step::Decision(decision) => &decision.id,
            Step::Loop(repeat) => &repeat.id,
        }
    }
}

/// A step as its JSON spells it: a message leaves its kind to the default,
/// and the kinds of a message and the two control kinds never overlap.
#[derive(Deserialize)]
struct StepFields {
    id: String,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    from: Option<String>,
    #[serde(default)]
    to: Option<String>,
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    note: Option<String>,
    #[serde(default)]
    repeat: Option<u64>,
    #[serde(default)]
    question: Option<String>,
    #[serde(default)]
    condition: Option<String>,
    #[serde(default)]
    alternatives: Option<Vec<Alternative>>,
    #[serde(default)]
    steps: Option<Vec<Step>>,
}

/// A field a step of its kind must have.
fn required<T, E: serde::de::Error>(value: Option<T>, field: &'static str) -> Result<T, E> {
    value.ok_or_else(|| E::missing_field(field))
}

impl<'de> Deserialize<'de> for Step {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let fields = StepFields::deserialize(deserializer)?;
        let kind = fields.kind.as_deref().unwrap_or("sync");
        Ok(match kind {
            "decision" => Step::Decision(Decision {
                id: fields.id,
                question: required(fields.question, "question")?,
                alternatives: required(fields.alternatives, "alternatives")?,
            }),
            "loop" => Step::Loop(Loop {
                id: fields.id,
                condition: required(fields.condition, "condition")?,
                steps: required(fields.steps, "steps")?,
            }),
            other => Step::Message(Message {
                id: fields.id,
                kind: match other {
                    "sync" => MessageKind::Sync,
                    "async" => MessageKind::Async,
                    "return" => MessageKind::Return,
                    "self" => MessageKind::Myself,
                    _ => {
                        return Err(serde::de::Error::unknown_variant(
                            other,
                            &["sync", "async", "return", "self", "decision", "loop"],
                        ));
                    }
                },
                from: required(fields.from, "from")?,
                to: required(fields.to, "to")?,
                label: required(fields.label, "label")?,
                note: fields.note,
                repeat: fields.repeat,
            }),
        })
    }
}

/// An ordered exchange between nodes of the variant.
#[derive(Clone, Debug, Deserialize)]
pub struct Flow {
    /// The flow's id.
    pub id: String,
    /// What the flow is called.
    pub name: String,
    /// A line on what the flow explains, when the board has one.
    #[serde(default)]
    pub summary: Option<String>,
    /// The ids of the nodes whose columns the flow draws, left to right.
    pub participants: Vec<String>,
    /// The flow's steps, in the order they happen.
    pub steps: Vec<Step>,
}

/// Every step of a run of steps, in document order, the steps a decision or
/// a loop holds right after it.
pub fn every_step(steps: &[Step]) -> Vec<&Step> {
    let mut all = Vec::new();
    collect(steps, &mut all);
    all
}

/// Push each step and then the steps it holds, depth first.
fn collect<'a>(steps: &'a [Step], into: &mut Vec<&'a Step>) {
    for step in steps {
        into.push(step);
        match step {
            Step::Decision(decision) => {
                for alternative in &decision.alternatives {
                    collect(&alternative.steps, into);
                }
            }
            Step::Loop(repeat) => collect(&repeat.steps, into),
            Step::Message(_) => {}
        }
    }
}

/// Every message of a run of steps, in the order a run would meet them.
pub fn messages_of(steps: &[Step]) -> Vec<&Message> {
    every_step(steps)
        .into_iter()
        .filter_map(|step| match step {
            Step::Message(message) => Some(message),
            _ => None,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_each_kind_of_step_and_defaults_a_message_to_sync() {
        let flow: Flow = serde_json::from_str(
            r#"{"id":"f","name":"F","participants":["a","b"],"steps":[
                {"id":"m","from":"a","to":"b","label":"call"},
                {"id":"d","kind":"decision","question":"ok?","alternatives":[
                    {"label":"yes","steps":[{"id":"r","kind":"return","from":"b","to":"a","label":"done"}]},
                    {"label":"no","steps":[]}]},
                {"id":"l","kind":"loop","condition":"more","steps":[
                    {"id":"s","kind":"self","from":"a","to":"a","label":"again","repeat":3}]}]}"#,
        )
        .unwrap();
        let ids: Vec<&str> = every_step(&flow.steps)
            .iter()
            .map(|step| step.id())
            .collect();
        assert_eq!(ids, ["m", "d", "r", "l", "s"]);
        let kinds: Vec<MessageKind> = messages_of(&flow.steps).iter().map(|m| m.kind).collect();
        assert_eq!(
            kinds,
            [MessageKind::Sync, MessageKind::Return, MessageKind::Myself]
        );
    }
}
