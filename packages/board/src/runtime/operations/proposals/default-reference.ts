// What a state is read against when nobody names a base. The reader's comparison control asks the
// same question of the same catalogue (`hasBase` in the web app), so the answer here and there
// must stay one.

import type { ArchitectureModel, ArchitectureModelRead } from "#shared/schemas/model.ts";
import { followsCurrent } from "#shared/rules/compare/current-ancestry.ts";

/** A state or checkpoint to compare with, and why it was chosen. */
interface ComparisonReference {
	readonly selector: string;
	readonly reason: NonNullable<ArchitectureModel["comparison"]>["reason"];
}

/**
 * The current state as a comparison reference.
 * @param current The working reading or refusal.
 * @returns The reference, when the model has a current state.
 */
function currentReference(current: ArchitectureModelRead): ComparisonReference | undefined {
	if (!current.success || current.manifest.current === null) return undefined;
	return { selector: "current", reason: "current" };
}

/**
 * The retained base of a state that follows another.
 * @param state The selected state.
 * @returns Its reference, when it has a predecessor and a baseline.
 */
function retainedPredecessor(
	state: ArchitectureModel["selectedState"],
): ComparisonReference | undefined {
	if (state?.predecessor == null || state.baseline === undefined) return undefined;
	return { selector: state.baseline, reason: "predecessor" };
}

/**
 * Whether the selected draft follows the current state, through the drafts between them.
 * @param state The selected state.
 * @param current The working reading or refusal.
 * @returns True when current is on its chain of predecessors.
 */
function followsCurrentReading(
	state: ArchitectureModel["selectedState"],
	current: ArchitectureModelRead,
): boolean {
	return (
		state != null &&
		current.success &&
		followsCurrent(state, current.proposals, current.manifest.current?.id)
	);
}

/**
 * Open a proposal against the checkpoint its changes were written on, because it can hold
 * only a fragment of Current. Otherwise choose current when the draft follows it, and else the
 * retained predecessor, because a draft written on a planning root differs from Current in
 * everything the root adds. A draft with no predecessor falls back to current.
 * @param selected The complete selected state.
 * @param current The working reading or refusal.
 * @returns Its default reference, when one exists.
 */
function defaultComparisonReference(
	selected: ArchitectureModel,
	current: ArchitectureModelRead,
): ComparisonReference | undefined {
	const state = selected.selectedState;
	const pinned = selected.proposals.find(({ id }) => id === state?.id)?.predecessorCheckpoint;
	if (pinned !== undefined) return { selector: pinned, reason: "predecessor" };
	if (followsCurrentReading(state, current)) return currentReference(current);
	return retainedPredecessor(state) ?? currentReference(current);
}

export { type ComparisonReference, defaultComparisonReference };
