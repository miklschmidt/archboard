// What a state is read against when nobody names a base. The reader's comparison control asks the
// same question through this shared rule, so the runtime and the control give one answer.

import type {
	ArchitectureModel,
	ArchitectureModelRead,
} from "#shared/canonical-contracts/schemas/model.ts";
import { followsCurrent } from "#shared/compare/rules/current-ancestry.ts";

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
 * Whether the selected state compares with Current: a completed state, or a draft that follows it.
 * @param state The selected state.
 * @param current The working reading or refusal.
 * @returns True when the current state is its default comparison.
 */
function comparesWithCurrent(
	state: ArchitectureModel["selectedState"],
	current: ArchitectureModelRead,
): boolean {
	if (state == null || !current.success) return false;
	if (state.lifecycle !== "draft") return current.manifest.current !== null;
	return followsCurrent(state, current.proposals, current.manifest.current?.id);
}

/**
 * Read a draft's explicit retained predecessor without applying it to completed states.
 * @param reading The selected architecture.
 * @returns Its pinned predecessor checkpoint, if it is a draft.
 */
function pinnedPredecessor(reading: ArchitectureModel): string | undefined {
	const state = reading.selectedState;
	if (state?.lifecycle !== "draft") return undefined;
	return reading.proposals.find(({ id }) => id === state.id)?.predecessorCheckpoint;
}

/**
 * Open a proposal against the checkpoint its changes were written on, because it can hold
 * only a fragment of Current. Completed states compare with Current. A draft compares with
 * Current when it follows it, and otherwise with its retained predecessor. A draft with no
 * predecessor falls back to Current.
 * @param selected The complete selected state.
 * @param current The working reading or refusal.
 * @returns Its default reference, when one exists.
 */
function defaultComparisonReference(
	selected: ArchitectureModel,
	current: ArchitectureModelRead,
): ComparisonReference | undefined {
	const state = selected.selectedState;
	if (state?.lifecycle === "current") return undefined;
	const pinned = pinnedPredecessor(selected);
	if (pinned !== undefined) return { selector: pinned, reason: "predecessor" };
	if (comparesWithCurrent(state, current)) return currentReference(current);
	return retainedPredecessor(state) ?? currentReference(current);
}

export { type ComparisonReference, defaultComparisonReference };
