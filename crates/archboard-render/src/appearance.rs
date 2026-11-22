//! How the vault's policy says each subject looks: the groups a part says on
//! its tags, its kind's chip, which way the picture it opens lies (ADR 0029), and
//! how each line is drawn.

use std::collections::{BTreeMap, HashSet};

use archboard_layout::{Edge, LineLook, Node};
use archboard_scene::paint::design::fallback_icon;
use archboard_scene::request::{
    Arrowhead, Dash, DrillDirection, Effect, GroupTag, LineAppearance, LineEffect, NodeAppearance,
};

use crate::request::Policy;

/// The tags of the groups a part is in, in the order the policy lists them.
pub(crate) fn tags_of(node: &Node, policy: &Policy) -> Vec<GroupTag> {
    policy
        .groups
        .iter()
        .filter(|(id, _)| node.groups.contains(id))
        .map(|(_, look)| GroupTag {
            name: look.name.clone(),
            color: look.color,
        })
        .collect()
}

/// Which way the picture a part opens lies, from the part's kind, which is the
/// level of that picture, against the level of the picture drawn.
pub(crate) fn drill_direction(kind: &str, here: Option<&str>, levels: &[String]) -> DrillDirection {
    let level = |name: &str| levels.iter().position(|level| level == name);
    match (level(kind), here.and_then(level)) {
        (Some(there), Some(at)) if there == at => DrillDirection::Across,
        (Some(there), Some(at)) if there < at => DrillDirection::Up,
        (Some(_), Some(_)) => DrillDirection::Down,
        _ => DrillDirection::Elsewhere,
    }
}

/// Each drawn part's look: a card says its groups on tags, a container none,
/// and every chip its kind's.
pub(crate) fn node_appearances(
    nodes: &[&Node],
    policy: &Policy,
    level: Option<&str>,
) -> BTreeMap<String, NodeAppearance> {
    let parents: HashSet<&str> = nodes
        .iter()
        .filter_map(|node| node.parent.as_deref())
        .collect();
    nodes
        .iter()
        .map(|node| {
            let container = parents.contains(node.id.as_str());
            let kind = policy.node_kinds.get(&node.kind);
            let appearance = NodeAppearance {
                container,
                tags: if container {
                    Vec::new()
                } else {
                    tags_of(node, policy)
                },
                type_color: kind.and_then(|kind| kind.color),
                icon: kind
                    .and_then(|kind| kind.icon.clone())
                    .unwrap_or_else(|| fallback_icon().to_owned()),
                type_name: kind
                    .and_then(|kind| kind.name.clone())
                    .unwrap_or_else(|| node.kind.clone()),
                type_kind: node.kind.clone(),
                drill: node
                    .drills
                    .then(|| drill_direction(&node.kind, level, &policy.levels)),
            };
            (node.id.clone(), appearance)
        })
        .collect()
}

/// The kind a joined line wears when its relationships differ
/// (`MIXED_KIND` in `@archboard/model/views`). No vocabulary name holds a space.
const MIXED_KIND: &str = "mixed kinds";

/// The one kind whose relationships may state no effect (`EFFECTLESS_KIND` in
/// `@archboard/model/policy`): a declared requirement.
const DEPENDENCY: &str = "dependency";

/// Whether the policy records how each kind is dashed: a reading from before
/// relationships stated their effect, which keeps its recorded look (ADR 0065).
fn recorded(policy: &Policy) -> bool {
    policy
        .relationship_kinds
        .values()
        .any(|look| look.dash.is_some())
}

/// How a line reads. A flow's step is dashed with an open head in the neutral
/// ink, never mistaken for a relationship of any kind. A relationship wears its
/// kind's ink, or two rails in the neutral ink when it joins several kinds, and
/// its effect's dash with a filled head: solid for a mutation, dashed for a
/// query, dotted for a compute, and a dash and a dot for a dependency that
/// states none. A reading from before effects draws each kind as its policy
/// recorded it.
pub(crate) fn line_appearance(
    kind: &str,
    effect: Option<Effect>,
    policy: &Policy,
    step: bool,
) -> LineAppearance {
    if step {
        return LineAppearance {
            name: "Step".to_owned(),
            color: None,
            rails: false,
            dash: Dash::Dashed,
            arrowhead: Arrowhead::Open,
            effect: None,
        };
    }
    let rails = kind == MIXED_KIND;
    let look = policy.relationship_kinds.get(kind);
    let name = match look {
        _ if rails => "Mixed kinds".to_owned(),
        Some(look) => look.name.clone(),
        None => kind.to_owned(),
    };
    let color = look.and_then(|look| look.color);
    if recorded(policy) {
        return LineAppearance {
            name,
            color,
            rails,
            dash: look.and_then(|look| look.dash).unwrap_or(Dash::Solid),
            arrowhead: look.map_or(Arrowhead::Filled, |look| look.arrowhead),
            effect: None,
        };
    }
    let effect = effect
        .map(LineEffect::from)
        .or_else(|| (kind == DEPENDENCY).then_some(LineEffect::Declared));
    LineAppearance {
        name,
        color,
        rails,
        dash: effect.map_or(Dash::Solid, LineEffect::dash),
        arrowhead: Arrowhead::Filled,
        effect,
    }
}

/// How a line is drawn, as its appearance says.
pub(crate) fn line_look(edge: &Edge, policy: &Policy, step: bool) -> LineLook {
    let LineAppearance {
        dash, arrowhead, ..
    } = line_appearance(&edge.kind, edge.effect, policy, step);
    LineLook { dash, arrowhead }
}

/// The words a line's label carries: a coloured line names its kind before
/// what its relationship carries, so its kind never rests on colour alone. A
/// neutral line, a step and a reading from before effects say only their own.
pub(crate) fn label_words(edge: &Edge, policy: &Policy, step: bool) -> Option<String> {
    let own = edge.label.as_deref().filter(|words| !words.is_empty());
    let kind = policy
        .relationship_kinds
        .get(&edge.kind)
        .filter(|look| !step && look.color.is_some() && !recorded(policy))
        .map(|look| look.name.as_str());
    match (kind, own) {
        (Some(kind), Some(own)) => Some(format!("{kind} · {own}")),
        (Some(kind), None) => Some(kind.to_owned()),
        (None, own) => own.map(str::to_owned),
    }
}

#[cfg(test)]
mod tests {
    use super::drill_direction;
    use archboard_scene::request::DrillDirection;

    #[test]
    fn says_which_way_the_picture_a_part_opens_lies() {
        let levels = [
            "system".to_owned(),
            "container".to_owned(),
            "component".to_owned(),
        ];
        let way = |kind, here| drill_direction(kind, here, &levels);
        assert_eq!(way("system", Some("container")), DrillDirection::Up);
        assert_eq!(way("component", Some("container")), DrillDirection::Down);
        assert_eq!(way("container", Some("container")), DrillDirection::Across);
        assert_eq!(way("service", Some("container")), DrillDirection::Elsewhere);
        assert_eq!(way("system", None), DrillDirection::Elsewhere);
    }
}
