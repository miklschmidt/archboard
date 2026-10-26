import { everyStep, type SemanticFlow } from "@archboard/board/flow";
import type { VariantContent } from "@archboard/board/content";
import type { Model, ModelFlow, projectModel } from "#ui/rules/architecture-model/projection.ts";

/**
 * Offer flows that touch selected subjects or the current scope, including hidden descendants.
 * @param content The complete depicted architecture.
 * @param subjects Explicit subjects, or an empty set for the repository reading.
 * @returns Relevant authored flows without inventing execution order.
 */
function relevantFlows(content: VariantContent, subjects: ReadonlySet<string>): ModelFlow[] {
	const { flows } = content;
	if (subjects.size === 0) return flows;
	const seeds = new Set(subjects);
	for (const edge of content.edges.filter((entry) => subjects.has(entry.id))) {
		seeds.add(edge.from);
		seeds.add(edge.to);
	}
	for (const flow of flows) {
		if (flowSubjects([flow]).some((subject) => subjects.has(subject.id)))
			for (const id of flow.participants) seeds.add(id);
	}
	const parents = new Map(content.nodes.map((module) => [module.id, module.parent]));
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

/**
 * Flows and their nested steps share stable subject identity with modules.
 * @param flows Authored flows from one coherent state.
 * @returns Every behavioral subject without copying its meaning.
 */
function flowSubjects(flows: readonly SemanticFlow[]) {
	return [...flows, ...flows.flatMap((flow) => everyStep(flow.steps))];
}

/**
 * Inspection can resolve subjects that another diagram mode currently hides.
 * @param model The complete model state.
 * @returns Structural and behavioral subjects with their original identities.
 */
function modelSubjects(model: Model) {
	return [
		...model.modules,
		...model.relationships,
		...flowSubjects(model.collections.flatMap((collection) => collection.flows)),
	];
}

/**
 * Keep each subject's authored name or explanatory words in selection details.
 * @param subject A canonical structural or behavioral subject.
 * @returns Its readable label, with identity as the relationship fallback.
 */
function subjectName(subject: ReturnType<typeof modelSubjects>[number]): string {
	if ("name" in subject) return subject.name;
	if ("question" in subject) return subject.question;
	if ("condition" in subject) return subject.condition;
	return subject.label ?? subject.id;
}

export { relevantFlows, projectFlow, flowSubjects, modelSubjects, subjectName };
