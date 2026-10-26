import type { Model, ModelFlow, projectModel } from "#ui/rules/architecture-model/projection.ts";

/**
 * Offer flows that touch selected subjects or the current scope, including hidden descendants.
 * @param model The complete architecture state.
 * @param subjects Explicit subjects, or an empty set for the repository reading.
 * @returns Relevant authored flows without inventing execution order.
 */
function relevantFlows(model: Model, subjects: ReadonlySet<string>): ModelFlow[] {
	const flows = model.collections.flatMap((collection) => collection.flows);
	if (subjects.size === 0) return flows;
	const seeds = new Set(subjects);
	for (const edge of model.relationships.filter((entry) => subjects.has(entry.id))) {
		seeds.add(edge.from);
		seeds.add(edge.to);
	}
	const parents = new Map(model.modules.map((module) => [module.id, module.parent]));
	return flows.filter((flow) => flow.participants.some((id) => touchesScope(id, parents, seeds)));
}

/**
 * Participant containment connects a flow to an enclosing selected module.
 * @param id The participant identity.
 * @param parents The validated containment tree.
 * @param selected The subjects that the reader is examining.
 * @returns Whether this participant belongs to a selected module.
 */
function touchesScope(
	id: string,
	parents: ReadonlyMap<string, string | undefined>,
	selected: ReadonlySet<string>,
): boolean {
	for (let at: string | undefined = id; at !== undefined; at = parents.get(at)) {
		if (selected.has(at)) return true;
	}
	return false;
}

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
	const participants = new Set(flow.participants);
	const nodes = architecture.complete.nodes.filter((module) => participants.has(module.id));
	return {
		...architecture,
		flow,
		focused: null,
		missingFocus: [],
		missing: false,
		children: nodes,
		context: [],
		inspection: undefined,
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

export { relevantFlows, projectFlow };
