import type { ArchitectureModel } from "#shared/schemas/model.ts";
import type { ArchitectureModuleEdit } from "#shared/schemas/model-operations.ts";
import { FlowChangeSchema } from "#shared/schemas/model-flows.ts";
import { assignFields } from "#runtime/operations/model-edit/fields.ts";
import { materialize } from "#runtime/operations/model-edit/flow-placement.ts";
import { finishFlowRemovals } from "#runtime/operations/model-edit/flow-removal.ts";
import {
	collectionOf,
	flowOf,
	entryOf,
	readEntries,
	newStep,
	includeAffected,
	moduleSelector,
	conflict,
	type Change,
	type Flow,
	type Placement,
} from "#runtime/operations/model-edit/flow-state.ts";

/**
 * Open one transient flow candidate inside the existing model candidate.
 * @param model The coherent starting model.
 * @param fresh The shared identity allocator.
 * @param subjects The shared affected subject set.
 * @param retired The shared identity reservations.
 * @param removedModules The explicit module removals.
 * @param modules The candidate module definitions.
 * @returns The private flow candidate.
 */
function openFlows(
	model: ArchitectureModel,
	fresh: () => string,
	subjects: Set<string>,
	retired: Set<string>,
	removedModules: Set<string>,
	modules: ArchitectureModel["modules"],
) {
	return {
		model,
		fresh,
		subjects,
		retired,
		removedModules,
		moduleId: moduleSelector(model, modules),
		collections: structuredClone(model.collections),
		flows: [] as Flow[],
		entries: readEntries([]),
		originalEntries: readEntries(model.collections.flatMap((collection) => collection.flows)),
		moves: new Map<string, Placement>(),
		edited: new Set<string>(),
		removals: new Set<string>(),
		removedCollections: new Set<string>(),
	};
}
type FlowCandidate = ReturnType<typeof openFlows>;
/**
 * Refuse competing field edits or removals on one continuing subject.
 * @param state The complete candidate.
 * @param id The affected subject identity.
 */
function once(state: FlowCandidate, id: string): void {
	if (state.edited.has(id)) conflict("State one edit or removal per subject.", [id]);
	state.edited.add(id);
}
/**
 * Add all containers before references to them are resolved.
 * @param state The complete candidate.
 * @param changes The schema-checked flow statements.
 */
function addDefinitions(state: FlowCandidate, changes: Change[]): void {
	for (const change of changes.filter((statement) => statement.type === "add-collection")) {
		const id = state.fresh().split("#")[1]!;
		state.collections.push({
			schemaVersion: 1,
			id,
			name: change.name,
			file: `${id}.flows.json`,
			flows: [],
		});
	}
	for (const change of changes.filter((statement) => statement.type === "add-flow"))
		collectionOf(state.collections, change.collection).flows.push({
			...change.flow,
			participants: change.flow.participants.map(state.moduleId),
			id: state.fresh(),
			steps: change.flow.steps.map((step) => newStep(step, state.fresh)),
		});
	state.flows = state.collections.flatMap((collection) => collection.flows);
	state.entries = readEntries(state.flows);
}
/**
 * Edit flow metadata and optional collection ownership without changing identity.
 * @param state The complete candidate.
 * @param change The flow field assignment.
 */
function editFlow(state: FlowCandidate, change: Extract<Change, { type: "edit-flow" }>): void {
	const flow = flowOf(state.collections, change.subject);
	once(state, flow.id);
	includeAffected(state.entries, state.flows, flow.id, state.subjects);
	const previous = flow.name;
	assignFields(flow, change.set, change.clear);
	flow.participants = flow.participants.map(state.moduleId);
	if (previous !== flow.name)
		flow.formerNames = [...new Set([...(flow.formerNames ?? []), previous])];
	if (change.collection === undefined) return;
	const destination = collectionOf(state.collections, change.collection);
	for (const collection of state.collections)
		collection.flows = collection.flows.filter((value) => value.id !== flow.id);
	destination.flows.push(flow);
}
/**
 * Include every subject in one collection metadata change.
 * @param state The complete candidate.
 * @param collection The affected collection.
 */
function includeCollection(
	state: FlowCandidate,
	collection: FlowCandidate["collections"][number],
): void {
	for (const flow of collection.flows)
		includeAffected(state.entries, state.flows, flow.id, state.subjects);
}
/**
 * Apply collection and flow metadata changes, with removals deferred until transfers settle.
 * @param state The complete candidate.
 * @param change One schema-checked flow statement.
 */
function changeDefinitions(state: FlowCandidate, change: Change): void {
	switch (change.type) {
		case "edit-flow":
			editFlow(state, change);
			break;
		case "remove-flow": {
			const flow = flowOf(state.collections, change.subject);
			once(state, flow.id);
			includeAffected(state.entries, state.flows, flow.id, state.subjects);
			state.removals.add(flow.id);
			break;
		}
		case "edit-collection": {
			const collection = collectionOf(state.collections, change.collection);
			once(state, `collection:${collection.id}`);
			includeCollection(state, collection);
			collection.name = change.name;
			break;
		}
		case "remove-collection": {
			const collection = collectionOf(state.collections, change.collection);
			once(state, `collection:${collection.id}`);
			includeCollection(state, collection);
			state.removedCollections.add(collection.id);
			break;
		}
		default:
			break;
	}
}
/**
 * Retain explicit subtree placements independently of field assignment order.
 * @param state The complete candidate.
 * @param id The continuing step identity.
 * @param place The requested exact holder and order.
 */
function moveStep(state: FlowCandidate, id: string, place: Placement): void {
	entryOf(state.entries, id);
	if (state.moves.has(id) || state.removals.has(id))
		conflict("A step has conflicting placements.", [id]);
	includeAffected(state.entries, state.flows, id, state.subjects);
	state.moves.set(id, place);
}
/**
 * Remove one subtree without accepting a competing placement.
 * @param state The complete candidate.
 * @param id The continuing step identity.
 */
function removeStep(state: FlowCandidate, id: string): void {
	once(state, id);
	entryOf(state.entries, id);
	if (state.moves.has(id)) conflict("A removed step cannot also move.", [id]);
	includeAffected(state.entries, state.flows, id, state.subjects);
	state.removals.add(id);
}
/**
 * Apply step additions, fields, removals, and placements.
 * @param state The complete candidate.
 * @param change One schema-checked flow statement.
 */
function changeSteps(state: FlowCandidate, change: Change): void {
	switch (change.type) {
		case "add-step": {
			const step = newStep(change.step, state.fresh);
			const added = readEntries([{ id: change.placement.holder, steps: [step] }]);
			for (const [id, entry] of added) state.entries.set(id, entry);
			moveStep(state, step.id, change.placement);
			break;
		}
		case "edit-step": {
			const entry = entryOf(state.entries, change.subject);
			once(state, change.subject);
			includeAffected(state.entries, state.flows, change.subject, state.subjects);
			assignFields(entry.value, change.set, change.clear);
			break;
		}
		case "remove-step":
			removeStep(state, change.subject);
			break;
		case "move-step":
			moveStep(state, change.subject, change.placement);
			break;
		default:
			break;
	}
}
/**
 * Resolve final placements and message endpoints before reference repair.
 * @param state The complete candidate.
 */
function resolveChanges(state: FlowCandidate): void {
	for (const [id, place] of state.moves) entryOf(state.entries, id).place = place;
	for (const place of state.moves.values())
		if (place.before !== undefined)
			includeAffected(state.entries, state.flows, place.before, state.subjects);
	for (const entry of state.entries.values())
		if ("from" in entry.value) {
			entry.value.from = state.moduleId(entry.value.from);
			entry.value.to = state.moduleId(entry.value.to);
		}
}
/**
 * Include new participant scopes after field changes and subtree moves settle.
 * @param state The complete candidate.
 * @param flows The surviving candidate flows.
 */
function includeFinalScopes(state: FlowCandidate, flows: Flow[]): void {
	const originalIds = new Set(
		state.model.collections.flatMap((collection) => collection.flows.map((flow) => flow.id)),
	);
	for (const id of state.moves.keys()) includeAffected(state.entries, flows, id, state.subjects);
	for (const flow of flows)
		if (state.edited.has(flow.id) || !originalIds.has(flow.id))
			includeAffected(state.entries, flows, flow.id, state.subjects);
}
/**
 * Extend the complete graph behind the existing durable write operation.
 * @param model The coherent starting model.
 * @param statements The complete architecture batch.
 * @param fresh The shared identity allocator.
 * @param subjects The shared affected claim and event set.
 * @param retired The shared identity reservations.
 * @param removedModules The explicit module removals.
 * @param modules The candidate module definitions.
 * @returns The complete candidate collections.
 */
function applyFlowChanges(
	model: ArchitectureModel,
	statements: Extract<ArchitectureModuleEdit, { changes: unknown }>["changes"],
	fresh: () => string,
	subjects: Set<string>,
	retired: Set<string>,
	removedModules: Set<string>,
	modules: ArchitectureModel["modules"],
) {
	const state = openFlows(model, fresh, subjects, retired, removedModules, modules);
	const changes = statements.flatMap((change) => {
		const parsed = FlowChangeSchema.safeParse(change);
		return parsed.success ? [parsed.data] : [];
	});
	addDefinitions(state, changes);
	for (const change of changes) {
		changeDefinitions(state, change);
		changeSteps(state, change);
	}
	resolveChanges(state);
	finishFlowRemovals(state);
	const flows = state.collections.flatMap((collection) => collection.flows);
	includeFinalScopes(state, flows);
	materialize(flows, state.entries, state.moves);
	return state.collections;
}
export { applyFlowChanges, type FlowCandidate };
