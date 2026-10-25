//! What a render asks for, as the host writes it: the reading to draw, the
//! vault's policy, and the choices of the render (TypeScript
//! `SemanticViewRenderRequest`), with the durations and the theme colours only
//! the host holds.

use std::collections::BTreeMap;

use archboard_flows::board::Flow;
use archboard_flows::flowchart::KindLook;
use archboard_layout::{Content, Edge, Engine, Node};
use archboard_scene::request::{
    Arrowhead, Dash, ExportFrame, PaletteColor, StandaloneTheme, Standing, ThemeColors,
};
use indexmap::IndexMap;
use serde::Deserialize;

/// Which picture a view asks for.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Grammar {
    /// The parts and the relationships between them.
    Architecture,
    /// The flows, as a stack of message sequences.
    Sequence,
    /// The flows' logic, as one flowchart.
    Flowchart,
}

/// One reading of a variant: its parts, its relationships and its flows.
#[derive(Clone, Debug, Default, Deserialize)]
pub struct Reading {
    /// The parts, in the board's order.
    #[serde(default)]
    pub nodes: Vec<Node>,
    /// The relationships, in the board's order.
    #[serde(default)]
    pub edges: Vec<Edge>,
    /// The flows, in the board's order.
    #[serde(default)]
    pub flows: Vec<Flow>,
}

impl Reading {
    /// The parts and relationships a layout places.
    pub fn content(&self) -> Content {
        Content {
            nodes: self.nodes.clone(),
            edges: self.edges.clone(),
        }
    }
}

/// One group of the vault's policy.
#[derive(Clone, Debug, Deserialize)]
pub struct GroupLook {
    /// What a reader sees it called.
    pub name: String,
    /// The colour of what it places and of its regions.
    pub color: PaletteColor,
}

/// One relationship kind of the vault's policy.
#[derive(Clone, Debug, Deserialize)]
pub struct RelationshipLook {
    /// What a reader sees it called.
    pub name: String,
    /// Its line's colour, when it has one.
    #[serde(default)]
    pub color: Option<PaletteColor>,
    /// How its line is dashed.
    pub dash: Dash,
    /// Which arrowhead its line ends in.
    pub arrowhead: Arrowhead,
}

/// The vault's presentation policy, shared by every variant.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Policy {
    /// The vault's levels, coarsest first.
    pub levels: Vec<String>,
    /// Each node kind's look, by key.
    pub node_kinds: BTreeMap<String, KindLook>,
    /// Each relationship kind's look, by key.
    pub relationship_kinds: BTreeMap<String, RelationshipLook>,
    /// The groups a part may be in, by id, in the order the policy lists them:
    /// the first that holds a part places it.
    #[serde(default)]
    pub groups: IndexMap<String, GroupLook>,
}

impl Policy {
    /// Each group's colour, by group id.
    pub fn group_colours(&self) -> BTreeMap<String, PaletteColor> {
        self.groups
            .iter()
            .map(|(id, look)| (id.clone(), look.color))
            .collect()
    }
}

/// The durations and speeds a picture is drawn with, which the host holds
/// (`@archboard/timing`).
#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Clock {
    /// How long a card takes to swap between its near and far views.
    pub far_view_swap_ms: f64,
    /// The speed of a relationship's default traffic, in diagram units a second.
    pub traffic_speed: f64,
    /// The longest one turn of a sequence's clock may take.
    pub cycle_cap_ms: f64,
}

/// What to draw, in which grammar, and for where.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderRequest {
    /// Which picture the view asked for.
    pub grammar: Grammar,
    /// The reading laid out: with a comparison, what the variant lacks of the
    /// one it is read against put back.
    pub content: Reading,
    /// The vault's presentation policy.
    pub policy: Policy,
    /// The theme a document that stands alone is drawn in; absent, it is for a page.
    #[serde(default)]
    pub theme: Option<StandaloneTheme>,
    /// The value of every colour token in each theme, where the host can draw
    /// a document that stands alone.
    #[serde(default)]
    pub theme_colors: Option<ThemeColors>,
    /// How each subject stands against the variant the picture is read against.
    #[serde(default)]
    pub standing: Option<BTreeMap<String, Standing>>,
    /// Whether the picture marks how each subject stands; true when absent.
    #[serde(default)]
    pub paint_standing: Option<bool>,
    /// The variant's own reading of the view, when the content is more than that.
    #[serde(default)]
    pub held: Option<Reading>,
    /// The whole variant, before a view narrows it, which a container's
    /// interface is read from (ADR 0044).
    #[serde(default)]
    pub variant: Option<Reading>,
    /// The subjects nobody has decided yet.
    #[serde(default)]
    pub unsettled: Vec<String>,
    /// Whether the board says nothing it describes is built (ADR 0031).
    #[serde(default)]
    pub unbuilt: bool,
    /// The level of the board drawn (ADR 0029).
    #[serde(default)]
    pub level: Option<String>,
    /// Which engine lays an architecture out.
    #[serde(default)]
    pub layout: Engine,
    /// A title and a legend an exported picture carries beside its drawing.
    #[serde(default)]
    pub frame: Option<ExportFrame>,
    /// The durations and speeds the picture is drawn with.
    pub clock: Clock,
}

impl RenderRequest {
    /// The variant's own reading of the view.
    pub fn held(&self) -> &Reading {
        self.held.as_ref().unwrap_or(&self.content)
    }

    /// Whether the picture leaves out its comparison's marks.
    pub fn plain(&self) -> bool {
        self.paint_standing == Some(false)
    }

    /// What the picture draws: without its comparison, the variant's own
    /// reading; with it, the content laid out.
    pub fn told(&self) -> &Reading {
        if self.plain() {
            self.held()
        } else {
            &self.content
        }
    }

    /// The whole variant the picture reads.
    pub fn variant(&self) -> &Reading {
        self.variant.as_ref().unwrap_or_else(|| self.held())
    }
}
