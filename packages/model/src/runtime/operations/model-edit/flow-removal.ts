import type { FlowCandidate } from "#runtime/operations/model-edit/flows.ts";
import {
	conflict,
	includeAffected,
	type Entry,
} from "#runtime/operations/model-edit/flow-state.ts";

/**
 * Retire only the flows left in a removed collection after explicit transfers.
 * @param state The complete candidate.
 */
function removeCollections(state: FlowCandidate): void {
	for (const collection of state.collections.filter((value) =>
		state.removedCollections.has(value.id),
	))
		for (const flow of collection.flows) state.removals.add(flow.id);
	state.collections = state.collections.filter((value) => !state.removedCollections.has(value.id));
}
/**
 * Find surviving messages whose endpoints were explicitly removed.
 * @param state The complete candidate.
 * @param entry The continuing step and placement.
 * @returns Whether module deletion affects this message.
 */
function incidentMessage(state: FlowCandidate, entry: Entry): boolean {
	if (!("from" in entry.value) || state.removals.has(entry.value.id)) return false;
	return state.removedModules.has(entry.value.from) || state.removedModules.has(entry.value.to);
}
/**
 * Repair flow participants and messages inside the same architecture intent.
 * @param state The complete candidate.
 * @returns The identities removed specifically by reference repair.
 */
function repairReferences(state: FlowCandidate): Set<string> {
	for (const flow of state.flows.filter((value) =>
		value.participants.some((id) => state.removedModules.has(id)),
	)) {
		includeAffected(state.entries, state.flows, flow.id, state.subjects);
		flow.participants = flow.participants.filter((id) => !state.removedModules.has(id));
	}
	const repairs = new Set<string>();
	for (const [id, entry] of state.entries)
		if (incidentMessage(state, entry)) {
			if (state.edited.has(id) || state.moves.has(id))
				conflict("An edited or moved message still names a removed endpoint.", [id]);
			state.removals.add(id);
			repairs.add(id);
		}
	return repairs;
}
/**
 * Identify a holder emptied specifically by reference repair.
 * @param children The immediate child identities.
 * @param state The complete candidate.
 * @param repairs The reference repair identities.
 * @returns Whether every child disappears and a reference repair caused it.
 */
function emptiedByRepair(children: string[], state: FlowCandidate, repairs: Set<string>): boolean {
	return children.some((id) => repairs.has(id)) && children.every((id) => state.removals.has(id));
}
/**
 * Propagate removals and prune only controls emptied by reference repair.
 * @param state The complete candidate.
 * @param repairs The reference repair identities.
 * @returns Whether another sweep is necessary.
 */
function discardChildren(state: FlowCandidate, repairs: Set<string>): boolean {
	let changed = false;
	for (const [id, entry] of state.entries) {
		if (state.removals.has(id)) continue;
		const children = [...state.entries]
			.filter(([, child]) => child.place.holder === id)
			.map(([child]) => child);
		const emptied = emptiedByRepair(children, state, repairs);
		if (emptied) repairs.add(id);
		if (state.removals.has(entry.place.holder) || emptied) {
			state.removals.add(id);
			changed = true;
		}
	}
	return changed;
}
/**
 * Prune flows with no remaining behavior after module reference repair.
 * @param state The complete candidate.
 * @param repairs The reference repair identities.
 * @returns Whether another sweep is necessary.
 */
function discardFlows(state: FlowCandidate, repairs: Set<string>): boolean {
	let changed = false;
	for (const flow of state.flows) {
		if (state.removals.has(flow.id)) continue;
		const roots = [...state.entries]
			.filter(([, entry]) => entry.place.holder === flow.id)
			.map(([id]) => id);
		if (!emptiedByRepair(roots, state, repairs)) continue;
		repairs.add(flow.id);
		state.removals.add(flow.id);
		changed = true;
	}
	return changed;
}
/**
 * Apply explicit removals and complete same-operation reference repair.
 * @param state The complete candidate.
 */
function finishFlowRemovals(state: FlowCandidate): void {
	removeCollections(state);
	const repairs = repairReferences(state);
	let changed = true;
	while (changed) {
		const children = discardChildren(state, repairs);
		const flows = discardFlows(state, repairs);
		changed = children || flows;
	}
	for (const id of state.removals) {
		includeAffected(
			state.originalEntries,
			state.model.collections.flatMap((collection) => collection.flows),
			id,
			state.subjects,
		);
		state.retired.add(id);
		state.entries.delete(id);
		state.moves.delete(id);
	}
	for (const collection of state.collections)
		collection.flows = collection.flows.filter((value) => !state.removals.has(value.id));
}
export { finishFlowRemovals };
