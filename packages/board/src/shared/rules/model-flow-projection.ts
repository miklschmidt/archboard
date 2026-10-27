import type { VariantContent } from "#shared/schemas/content.ts";
import type { ModelFlow, projectModel } from "#shared/rules/model-projection.ts";

/**
 * Behavioral diagrams always include the complete selected exchange.
 * @param architecture The underlying architecture reading.
 * @param flow The explicit flow from the same model state.
 * @returns All participants and steps without structural filters or invented messages.
 */
function projectFlow(
	architecture: ReturnType<typeof projectModel>,
	flow: ModelFlow,
): ReturnType<typeof projectModel> {
	const byId = new Map(architecture.depicted.nodes.map((module) => [module.id, module]));
	const nodes = flow.participants.flatMap((id) => byId.get(id) ?? []);
	return {
		...architecture,
		flow,
		focused: null,
		missingFocus: [],
		missing: false,
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
			flows: [flow],
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
