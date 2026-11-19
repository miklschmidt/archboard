//! What a render asks for, as the host writes it: the reading to draw, the
//! vault's policy, and the choices of the render (TypeScript
//! `SemanticViewRenderRequest`), with the durations and the theme colours only
//! the host holds.

use std::collections::BTreeMap;

use archboard_flows::Flow;
use archboard_flows::flowchart::KindLook;
use archboard_layout::{Content, Edge, Engine, Node};
use archboard_scene::request::{
    Arrowhead, Dash, ExportFrame, PaletteColor, Relief, StandaloneTheme, Standing, ThemeColors,
};
use indexmap::IndexMap;
use serde::Deserialize;

/// Which picture a view asks for.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Grammar {
    /// The parts and the relationships between them.
    Architecture,
    /// The flows, as a stack of message sequences.
    Sequence,
    /// The flows' logic, as one flowchart.
    Flowchart,
}

/// One reading of a variant: its parts, its relationships and its flows.
#[derive(Clone, Debug, Default, Deserialize)]
pub(crate) struct Reading {
    /// The parts, in the picture's order.
    #[serde(default)]
    pub(crate) nodes: Vec<Node>,
    /// The relationships, in the picture's order.
    #[serde(default)]
    pub(crate) edges: Vec<Edge>,
    /// The flows, in the picture's order.
    #[serde(default)]
    pub(crate) flows: Vec<Flow>,
}

impl Reading {
    /// The parts and relationships a layout places.
    pub(crate) fn content(&self) -> Content {
        Content {
            nodes: self.nodes.clone(),
            edges: self.edges.clone(),
        }
    }
}

/// One group of the vault's policy.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct GroupLook {
    /// What a reader sees it called.
    pub(crate) name: String,
    /// The colour of its tag.
    pub(crate) color: PaletteColor,
}

/// One relationship kind of the vault's policy.
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct RelationshipLook {
    /// What a reader sees it called.
    pub(crate) name: String,
    /// Its line's colour, when it has one.
    #[serde(default)]
    pub(crate) color: Option<PaletteColor>,
    /// How its line is dashed.
    pub(crate) dash: Dash,
    /// Which arrowhead its line ends in.
    pub(crate) arrowhead: Arrowhead,
}

/// The vault's presentation policy, shared by every variant.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Policy {
    /// The vault's levels, coarsest first.
    pub(crate) levels: Vec<String>,
    /// Each node kind's look, by key.
    pub(crate) node_kinds: BTreeMap<String, KindLook>,
    /// Each relationship kind's look, by key.
    pub(crate) relationship_kinds: BTreeMap<String, RelationshipLook>,
    /// The groups a part may be in, by id, in the order the policy lists them.
    #[serde(default)]
    pub(crate) groups: IndexMap<String, GroupLook>,
}

/// The durations and speeds a picture is drawn with, which the host holds
/// (`@archboard/timing`).
#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Clock {
    /// How long a card takes to swap between its near and far views.
    pub(crate) far_view_swap_ms: f64,
    /// The speed of a relationship's default traffic, in diagram units a second.
    pub(crate) traffic_speed: f64,
    /// The longest one turn of a sequence's clock may take.
    pub(crate) cycle_cap_ms: f64,
}

/// What to draw, in which grammar, and for where.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderRequest {
    /// Which picture the view asked for.
    pub(crate) grammar: Grammar,
    /// The reading laid out: with a comparison, what the variant lacks of the
    /// one it is read against put back.
    pub(crate) content: Reading,
    /// The vault's presentation policy.
    pub(crate) policy: Policy,
    /// The theme a document that stands alone is drawn in; absent, it is for a page.
    #[serde(default)]
    pub(crate) theme: Option<StandaloneTheme>,
    /// The value of every colour token in each theme, where the host can draw
    /// a document that stands alone.
    #[serde(default)]
    pub(crate) theme_colors: Option<ThemeColors>,
    /// How each subject stands against the variant the picture is read against.
    #[serde(default)]
    pub(crate) standing: Option<BTreeMap<String, Standing>>,
    /// Whether the picture marks how each subject stands; true when absent.
    #[serde(default)]
    pub(crate) paint_standing: Option<bool>,
    /// The variant's own reading of the view, when the content is more than that.
    #[serde(default)]
    pub(crate) held: Option<Reading>,
    /// The whole variant, before a view narrows it, which a container's
    /// interface is read from (ADR 0044).
    #[serde(default)]
    pub(crate) variant: Option<Reading>,
    /// The subjects nobody has decided yet.
    #[serde(default)]
    pub(crate) unsettled: Vec<String>,
    /// Whether the picture says nothing it describes is built (ADR 0031).
    #[serde(default)]
    pub(crate) unbuilt: bool,
    /// How the picture's blocks are drawn; raised when absent.
    #[serde(default)]
    pub(crate) relief: Relief,
    /// The level of the picture drawn (ADR 0029).
    #[serde(default)]
    pub(crate) level: Option<String>,
    /// Which engine lays an architecture out, resolved by the host from its shared default.
    pub(crate) layout: Engine,
    /// A title and a legend an exported picture carries beside its drawing.
    #[serde(default)]
    pub(crate) frame: Option<ExportFrame>,
    /// The durations and speeds the picture is drawn with.
    pub(crate) clock: Clock,
}

impl RenderRequest {
    /// The variant's own reading of the view.
    pub(crate) fn held(&self) -> &Reading {
        self.held.as_ref().unwrap_or(&self.content)
    }

    /// Whether the picture leaves out its comparison's marks.
    pub(crate) fn plain(&self) -> bool {
        self.paint_standing == Some(false)
    }

    /// What the picture draws: without its comparison, the variant's own
    /// reading; with it, the content laid out.
    pub(crate) fn told(&self) -> &Reading {
        if self.plain() {
            self.held()
        } else {
            &self.content
        }
    }

    /// The whole variant the picture reads.
    pub(crate) fn variant(&self) -> &Reading {
        self.variant.as_ref().unwrap_or_else(|| self.held())
    }
}
