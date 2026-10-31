//! How the vault's policy says each subject looks: the groups a part says on
//! its tags, its kind's chip, which way the board it opens lies (ADR 0029), and
//! how each line is drawn.

use std::collections::{BTreeMap, HashSet};

use archboard_layout::{LineLook, Node};
use archboard_scene::paint::design::FALLBACK_ICON;
use archboard_scene::request::{
    Arrowhead, Dash, DrillDirection, GroupTag, LineAppearance, NodeAppearance,
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

/// The kind a joined line wears when its relationships differ
/// (`MIXED_KIND` in `@archboard/board/views`). No vocabulary name holds a space.
const MIXED_KIND: &str = "mixed kinds";

/// How a line reads: a flow's step dashed with an open head in the neutral
/// ink, never mistaken for a relationship of any kind; a line of mixed kinds in
/// the neutral ink, in a dash no kind can wear; a relationship in its kind's
/// look, or solid with a filled head for a kind the policy lacks.
pub(crate) fn line_appearance(kind: &str, policy: &Policy, step: bool) -> LineAppearance {
    if step {
        return LineAppearance {
            name: "Step".to_owned(),
            color: None,
            dash: Dash::Dashed,
            arrowhead: Arrowhead::Open,
        };
    }
    if kind == MIXED_KIND {
        return LineAppearance {
            name: "Mixed kinds".to_owned(),
            color: None,
            dash: Dash::Mixed,
            arrowhead: Arrowhead::Filled,
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
    use super::{MIXED_KIND, drill_direction, line_appearance};
    use crate::request::Policy;
    use archboard_scene::request::{Dash, DrillDirection};

    #[test]
    fn a_line_of_mixed_kinds_wears_a_dash_no_kind_can_choose_in_the_neutral_ink() {
        let policy: Policy = serde_json::from_value(serde_json::json!({
            "levels": [],
            "nodeKinds": {},
            "relationshipKinds": {},
        }))
        .expect("a policy");
        let line = line_appearance(MIXED_KIND, &policy, false);
        assert_eq!(line.dash, Dash::Mixed);
        assert_eq!(line.color, None);
    }

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
