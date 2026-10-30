import { everyStep, type SemanticFlow } from "@archboard/board/flow";
import type { VariantContent } from "@archboard/board/content";
import { projectFlow, type Model, type ModelFlow } from "@archboard/board/content";

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
		...collectionSubjects(model),
		...flowSubjects(model.collections.flatMap((collection) => collection.flows)),
	];
}

/**
 * Collection references name a qualified holder without creating a diagram node.
 * @param model The coherent canonical reading.
 * @returns Its collection identities and authored names.
 */
function collectionSubjects(model: Model) {
	return model.collections.map((collection) => ({
		id: `${model.manifest.id}#${collection.id}`,
		name: collection.name,
	}));
}

/**
 * A selected collection makes its authored flow members relevant to the mode selector.
 * @param model The complete state that owns the collection.
 * @param selected The requested reading subjects.
 * @returns The same identities plus their explicit collection members.
 */
function withCollectionFlows(model: Model, selected: ReadonlySet<string>): Set<string> {
	const subjects = new Set(selected);
	for (const collection of model.collections) {
		if (!selected.has(`${model.manifest.id}#${collection.id}`)) continue;
		for (const flow of collection.flows) subjects.add(flow.id);
	}
	return subjects;
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

export {
	relevantFlows,
	projectFlow,
	flowSubjects,
	modelSubjects,
	subjectName,
	collectionSubjects,
	withCollectionFlows,
};
