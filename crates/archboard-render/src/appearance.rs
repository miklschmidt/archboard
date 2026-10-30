//! How the vault's policy says each subject looks: the group that places a
//! part (ADR 0038), its kind's chip, which way the board it opens lies
//! (ADR 0029), and how each line is drawn.

use std::collections::{BTreeMap, HashSet};

use archboard_layout::{LineLook, Node};
use archboard_scene::paint::design::FALLBACK_ICON;
use archboard_scene::request::{Arrowhead, Dash, DrillDirection, LineAppearance, NodeAppearance};
use indexmap::IndexMap;

use crate::request::Policy;

/// The group each part is placed with: the first group, in the order the
/// policy lists them, that it is in. A part in none is left out.
pub(crate) fn placing_groups<'a>(
    nodes: impl IntoIterator<Item = &'a Node>,
    policy: &Policy,
) -> IndexMap<String, String> {
    nodes
        .into_iter()
        .filter_map(|node| {
            let group = policy.groups.keys().find(|id| node.is_member_of(id))?;
            Some((node.id.clone(), group.clone()))
        })
        .collect()
}

/// The group each part is gathered into a region with: the group it is
/// placed with, unless a container round it is placed with that group too,
/// whose region it already stands in.
pub(crate) fn gathering_groups(nodes: &[Node], policy: &Policy) -> IndexMap<String, String> {
    let placing = placing_groups(nodes, policy);
    let parents: BTreeMap<&str, Option<&str>> = nodes
        .iter()
        .map(|node| (node.id.as_str(), node.parent.as_deref()))
        .collect();
    let inside = |id: &str, group: &str| {
        let mut at = parents.get(id).copied().flatten();
        while let Some(here) = at {
            if placing.get(here).is_some_and(|placed| placed == group) {
                return true;
            }
            at = parents.get(here).copied().flatten();
        }
        false
    };
    placing
        .iter()
        .filter(|(id, group)| !inside(id, group))
        .map(|(id, group)| (id.clone(), group.clone()))
        .collect()
}

/// Which way the board a part opens lies, from the part's kind, which is the
/// level of that board, against the level of the board drawn.
pub fn drill_direction(kind: &str, here: Option<&str>, levels: &[String]) -> DrillDirection {
    let level = |name: &str| levels.iter().position(|level| level == name);
    match (level(kind), here.and_then(level)) {
        (Some(there), Some(at)) if there == at => DrillDirection::Across,
        (Some(there), Some(at)) if there < at => DrillDirection::Up,
        (Some(_), Some(_)) => DrillDirection::Down,
        _ => DrillDirection::Elsewhere,
    }
}

/// Each drawn part's look: a card's body takes its placing group's colour,
/// a container none (TASK-474), and every chip its kind's.
pub(crate) fn node_appearances(
    nodes: &[&Node],
    policy: &Policy,
    level: Option<&str>,
) -> BTreeMap<String, NodeAppearance> {
    let parents: HashSet<&str> = nodes
        .iter()
        .filter_map(|node| node.parent.as_deref())
        .collect();
    let placing = placing_groups(nodes.iter().copied(), policy);
    nodes
        .iter()
        .map(|node| {
            let container = parents.contains(node.id.as_str());
            let group = placing.get(&node.id).cloned();
            let body_color = group
                .as_ref()
                .filter(|_| !container)
                .and_then(|group| policy.groups.get(group))
                .map(|look| look.color);
            let kind = policy.node_kinds.get(&node.kind);
            let appearance = NodeAppearance {
                container,
                body_color,
                group,
                type_color: kind.and_then(|kind| kind.color),
                icon: kind
                    .and_then(|kind| kind.icon.clone())
                    .unwrap_or_else(|| FALLBACK_ICON.to_owned()),
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

/// How a line reads: a flow's step dashed with an open head in the neutral
/// ink, never mistaken for a relationship of any kind; a relationship in its
/// kind's look, or solid with a filled head for a kind the policy lacks.
pub(crate) fn line_appearance(kind: &str, policy: &Policy, step: bool) -> LineAppearance {
    if step {
        return LineAppearance {
            name: "Step".to_owned(),
            color: None,
            dash: Dash::Dashed,
            arrowhead: Arrowhead::Open,
        };
    }
    policy.relationship_kinds.get(kind).map_or_else(
        || LineAppearance {
            name: kind.to_owned(),
            color: None,
            dash: Dash::Solid,
            arrowhead: Arrowhead::Filled,
        },
        |look| LineAppearance {
            name: look.name.clone(),
            color: look.color,
            dash: look.dash,
            arrowhead: look.arrowhead,
        },
    )
}

/// How a line is drawn, as its appearance says.
pub(crate) fn line_look(kind: &str, policy: &Policy, step: bool) -> LineLook {
    let LineAppearance {
        dash, arrowhead, ..
    } = line_appearance(kind, policy, step);
    LineLook { dash, arrowhead }
}

#[cfg(test)]
mod tests {
    use super::drill_direction;
    use archboard_scene::request::DrillDirection;

    #[test]
    fn says_which_way_the_board_a_part_opens_lies() {
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
