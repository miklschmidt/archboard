//! A reading's flows drawn as a stack of message sequences or as one
//! flowchart, as the painter's request.

use archboard_flows::flowchart::{self, FlowchartRequest};
use archboard_flows::sequence::{self, SequenceRequest};
use archboard_layout::Node;
use archboard_scene::request::SequenceClock;

use crate::appearance::node_appearances;
use crate::request::RenderRequest;
use crate::{Host, Outline, document_request, icons_of, page_request};

/// Every flow the content holds drawn as a stack of message sequences.
///
/// Every flow is laid out, because the caller already said what it wants
/// seen: a view scoped to one exchange holds that one. A picture without its
/// comparison draws of it only the flows, participants and messages the
/// variant's own reading holds, where they stand with the comparison.
pub(crate) fn sequence<H: Host>(request: &RenderRequest, host: &H) -> Result<Outline, String> {
    let told = request.told();
    if told.flows.is_empty() {
        return Ok(Outline::Nothing);
    }
    let content = &request.content;
    // A participant is a card: containment is not drawn in this grammar.
    let participants: Vec<Node> = content
        .nodes
        .iter()
        .map(|node| Node {
            parent: None,
            ..node.clone()
        })
        .collect();
    let parts: Vec<&Node> = participants.iter().collect();
    let appearances = node_appearances(&parts, &request.policy, request.level.as_deref());
    let steps: usize = told.flows.iter().map(|flow| flow.steps.len()).sum();
    let names: Vec<&str> = told.flows.iter().map(|flow| flow.name.as_str()).collect();
    let name = format!(
        "Message-sequence diagram: {}, {}",
        counted(told.flows.len(), "flow", "flows"),
        counted(steps, "step", "steps")
    );
    let document = document_request(
        request,
        name,
        Some(format!("Showing {}.", names.join(", "))),
    );
    let icons: Vec<&str> = appearances
        .values()
        .map(|look| look.icon.as_str())
        .collect();
    let icons = icons_of(host, &icons)?;
    Ok(Outline::Paint(Box::new(sequence::picture(
        SequenceRequest {
            flows: content.flows.clone(),
            nodes: content.nodes.clone(),
            held: request.plain().then(|| told.flows.clone()),
            appearances,
            clock: SequenceClock {
                traffic_speed: request.clock.traffic_speed,
                cycle_cap_ms: request.clock.cycle_cap_ms,
            },
            page: page_request(request),
            document,
            icons,
        },
    ))))
}

/// Every flow of a reading drawn as one flowchart, laid out from what the
/// picture draws: with its comparison, the reading with what the variant lost
/// put back; without it, the variant's own reading.
///
/// # Errors
///
/// A solve the host failed or answered unreadably.
pub(crate) async fn flowchart<H: Host>(
    request: &RenderRequest,
    host: &H,
) -> Result<Outline, String> {
    let told = request.told();
    if told.flows.is_empty() {
        return Ok(Outline::Nothing);
    }
    let policy = &request.policy;
    let names: Vec<&str> = told.flows.iter().map(|flow| flow.name.as_str()).collect();
    let names = names.join(", ");
    let document = document_request(
        request,
        format!("Flowchart: {names}"),
        Some(format!("Showing the logic of {names}.")),
    );
    // Every icon a step's box can be drawn with: the kind of any part.
    let icons: Vec<&str> = policy
        .node_kinds
        .values()
        .filter_map(|kind| kind.icon.as_deref())
        .collect();
    let chart = FlowchartRequest {
        flows: told.flows.clone(),
        parts: told.nodes.clone(),
        node_kinds: policy.node_kinds.clone(),
        groups: policy.group_colours(),
        page: page_request(request),
        document,
        icons: icons_of(host, &icons)?,
    };
    Ok(Outline::Paint(Box::new(
        flowchart::picture(chart, host).await?,
    )))
}

/// How many of a thing there are, in words a screen reader can say.
fn counted(count: usize, one: &str, many: &str) -> String {
    format!("{count} {}", if count == 1 { one } else { many })
}
