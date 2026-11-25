import type { SemanticNode, VariantContent } from "#shared/schemas/content.ts";
import type { ModelFlow, projectModel } from "#shared/rules/model-projection.ts";

/** A transient participant synthesized for an unsaved ephemeral flow. */
interface SyntheticFlowParticipant {
	readonly id: string;
	readonly name: string;
}

/**
 * Behavioral diagrams retain the complete selected exchange and its comparison.
 * @param architecture The underlying architecture reading.
 * @param flow The explicit flow from the same model state, or an unsaved temporary flow.
 * @param syntheticParticipants Optional transient participants not present in the canonical model.
 * @returns All participants and steps without structural filters or invented messages.
 */
function projectFlow(
	architecture: ReturnType<typeof projectModel>,
	flow: ModelFlow,
	syntheticParticipants?: readonly SyntheticFlowParticipant[],
): ReturnType<typeof projectModel> {
	const depicted = architecture.depicted.flows.find((entry) => entry.id === flow.id) ?? flow;
	const byId = new Map<string, SemanticNode>(
		architecture.depicted.nodes.map((module) => [module.id, module]),
	);
	if (syntheticParticipants !== undefined && syntheticParticipants.length > 0) {
		const fallbackKind = architecture.depicted.nodes[0]?.kind ?? "service";
		syntheticParticipants.forEach((participant, index) => {
			if (!byId.has(participant.id)) {
				byId.set(participant.id, {
					id: participant.id,
					order: architecture.depicted.nodes.length + index,
					name: participant.name,
					kind: fallbackKind,
				});
			}
		});
	}
	const nodes = depicted.participants.flatMap((id) => byId.get(id) ?? []);
	return {
		...architecture,
		flow,
		focused: null,
		missingFocus: [],
		missing: false,
		expanded: [],
		unopened: 0,
		children: nodes,
		context: [],
		inspection: undefined,
		held:
			architecture.reference === undefined ? undefined : heldFlow(architecture.complete, flow.id),
		connections: [],
		allConnections: [],
		content: {
			nodes: nodes.map(({ parent: _parent, ...module }) => module),
			edges: [],
			flows: [depicted],
			walkthroughs: [],
		},
	};
}

/**
 * Removed flow subjects stay outside the content that the selected state actually holds.
 * @param complete Complete selected architecture.
 * @param id The depicted flow identity.
 * @returns Only its authored participants and steps, or an empty selected reading.
 */
function heldFlow(complete: VariantContent, id: string): VariantContent {
	const flow = complete.flows.find((entry) => entry.id === id);
	const participants = new Set(flow?.participants ?? []);
	return {
		nodes: complete.nodes.filter((node) => participants.has(node.id)),
		edges: [],
		flows: flow === undefined ? [] : [flow],
		walkthroughs: [],
	};
}

export { projectFlow };
