// A claim is status: an agent holds some subjects of a model while it works on them. The shell
// marks the claimed model and says what each agent is doing, never who the agent is, because the
// writer is an identity such as a thread's.

import type { ShellRepository } from "#ui/shell/rules/contracts.ts";

/**
 * What a claim mark says: that an agent holds the subject, and what for.
 * @param purposes The purposes of the claims that hold the subject, each once.
 * @returns The words.
 */
function claimWords(purposes: readonly string[]): string {
	if (purposes.length > 1) return `Claimed by agents: ${purposes.join(". ")}`;
	const [purpose] = purposes;
	return purpose === undefined ? "Claimed by an agent" : `Claimed by an agent: ${purpose}`;
}

/**
 * What the agents that claim a repository's model are doing.
 * @param shell The repository.
 * @returns The purpose of each claim, each once, or none while nothing is claimed.
 */
function claimPurposes(shell: ShellRepository): readonly string[] {
	const claims = Object.values(shell.activity).flatMap((entry) => entry.claims);
	return [...new Set(claims.map((claim) => claim.reason))];
}

export { claimPurposes, claimWords };
