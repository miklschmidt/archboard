import type { Model } from "@archboard/model/content";

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
 * @returns A short status, or null for settled states.
 */
function standingLabel(state: Model["selectedState"] | undefined): string | null {
	const status = proposalStanding(state);
	if (status === "conflicted") return "unresolved";
	return status === "blocked" ? "blocked" : null;
}

/**
 * The status of a state, to follow its name or lifecycle.
 * @param state The selected or listed state metadata.
 * @returns A short status suffix, or no extra label for settled states.
 */
function standingSuffix(state: Model["selectedState"] | undefined): string {
	const label = standingLabel(state);
	return label === null ? "" : ` · ${label}`;
}

export { proposalStanding, standingLabel, standingSuffix };
