//! A board's parts and relationships as the layout reads them from the
//! board's own JSON (`@archboard/board/content`): what a layout places, and
//! what the painter is told about each of them.

use archboard_scene::drawing::{EdgeFacts, Emphasis, NodeFacts, Traffic};
use serde::{Deserialize, Deserializer, Serialize};

/// One part of a board: a card, or a container of other parts.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    /// The part's id.
    pub id: String,
    /// Where it stands among the board's parts, as the author ordered them.
    #[serde(default)]
    pub order: f64,
    /// What it is called.
    pub name: String,
    /// The key of the vault policy's node kind it is.
    pub kind: String,
    /// What it is responsible for, when the board says.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub responsibility: Option<String>,
    /// The container it stands in; absent on the board itself.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    /// The groups it says it is in, by id.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub groups: Vec<String>,
    /// Whether it opens another board.
    #[serde(
        default,
        rename(deserialize = "drillDown", serialize = "drills"),
        deserialize_with = "present"
    )]
    pub drills: bool,
}

/// Whether a field is there, whatever it holds.
fn present<'de, D: Deserializer<'de>>(deserializer: D) -> Result<bool, D::Error> {
    serde::de::IgnoredAny::deserialize(deserializer).map(|_| true)
}

impl Node {
    /// Whether it says it is in a group.
    pub fn is_member_of(&self, group: &str) -> bool {
        self.groups.iter().any(|held| held == group)
    }

    /// What the painter reads of it.
    pub fn facts(&self) -> NodeFacts {
        NodeFacts {
            id: self.id.clone(),
            order: self.order,
            name: self.name.clone(),
            responsibility: self.responsibility.clone(),
        }
    }
}

/// How loudly a relationship speaks when the board does not say.
fn normal() -> Emphasis {
    Emphasis::Normal
}

/// One directed relationship of a board.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Edge {
    /// The relationship's id.
    pub id: String,
    /// Where it stands among the board's relationships, as the author ordered them.
    pub order: f64,
    /// The id of the part it starts at.
    pub from: String,
    /// The id of the part it ends at.
    pub to: String,
    /// The key of the vault policy's relationship kind it is.
    pub kind: String,
    /// What it carries, when the board says.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// How loudly it speaks.
    #[serde(default = "normal")]
    pub emphasis: Emphasis,
    /// The traffic it illustrates, when it has any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub traffic: Option<Traffic>,
}

impl Edge {
    /// What the painter reads of it.
    pub fn facts(&self) -> EdgeFacts {
        EdgeFacts {
            id: self.id.clone(),
            from: self.from.clone(),
            to: self.to.clone(),
            kind: self.kind.clone(),
            emphasis: self.emphasis,
            traffic: self.traffic,
        }
    }
}

/// The parts and relationships a layout places.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Content {
    /// The parts, in the board's order.
    #[serde(default)]
    pub nodes: Vec<Node>,
    /// The relationships, in the board's order.
    #[serde(default)]
    pub edges: Vec<Edge>,
}
