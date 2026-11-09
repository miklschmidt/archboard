// Which subjects of a reading the agents claim, and what for. A claim holds exact subjects in the
// state it names, so a reading of another state, or of a retained checkpoint, shows none of them.

import type { ArchitectureClaim } from "@archboard/model/contract";

/** The purpose of the claim that holds each subject, by the subject. */
type ClaimedSubjects = ReadonlyMap<string, string>;

/** No subject is claimed. */
const NOTHING_CLAIMED: ClaimedSubjects = new Map();

/**
 * The subjects that the claims hold in one state.
 * @param claims The live claims of the vault.
 * @param state The state that the reading shows, or null for a model with no current state.
 * @returns The purpose of each claimed subject.
 */
function claimedSubjects(
	claims: readonly ArchitectureClaim[],
	state: string | null,
): ClaimedSubjects {
	const held = claims.filter((claim) => claim.target.state === state);
	if (held.length === 0) return NOTHING_CLAIMED;
	return new Map(
		held.flatMap((claim) => claim.subjects.map((subject) => [subject, claim.reason] as const)),
	);
}

/**
 * The purposes of the claims that hold any of some subjects.
 * @param claimed The claimed subjects of the reading.
 * @param ids The subjects.
 * @returns Each purpose once, or none while no claim holds them.
 */
function claimsOn(claimed: ClaimedSubjects, ids: Iterable<string>): readonly string[] {
	const purposes = new Set<string>();
	for (const id of ids) {
		const purpose = claimed.get(id);
		if (purpose !== undefined) purposes.add(purpose);
	}
	return [...purposes];
}

export { claimedSubjects, claimsOn, NOTHING_CLAIMED, type ClaimedSubjects };
