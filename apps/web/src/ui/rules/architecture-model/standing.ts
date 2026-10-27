import type { Model } from "#ui/rules/architecture-model/projection.ts";

/**
 * Proposal standing comes from the coherent read, independently of comparison changes.
 * @param state The selected or listed state metadata.
 * @returns Its unresolved, blocked, settled, or unavailable status.
 */
function proposalStanding(state: Model["selectedState"] | undefined) {
	if (state == null) return "unavailable";
	const standing = state.standing;
	if (standing === undefined) return "settled";
	return standing.blockedBy === undefined ? "conflicted" : "blocked";
}

/**
 * A state choice identifies unresolved work before the reader opens it.
 * @param state The selected or listed state metadata.
 * @returns A short status suffix, or no extra label for settled states.
 */
function standingSuffix(state: Model["selectedState"] | undefined): string {
	const status = proposalStanding(state);
	if (status === "conflicted") return " · unresolved";
	return status === "blocked" ? " · blocked" : "";
}

export { proposalStanding, standingSuffix };
