/** The part of a process observation that decides whether a group is frozen. */
interface GroupMember {
	readonly pid: number;
	readonly startTime: string;
	readonly state: "live" | "stopped" | "zombie";
}

/** What freezing a process group needs from its host, injectable so tests drive it without a kernel. */
interface FrozenGroupSeam {
	/** One complete census of the group's non-zombie members. */
	readonly census: () => readonly GroupMember[];
	/** Send SIGSTOP to the whole group. */
	readonly stop: () => void;
	readonly now: () => number;
	readonly wait: (ms: number) => Promise<void>;
	/** The gap between two censuses. */
	readonly pollMs: number;
}

/**
 * The exact identities of a census whose members are all stopped, in a form two
 * censuses can be compared by.
 * @param members One complete group census.
 * @returns Its members' pids and births in order, or undefined while any member runs.
 */
function stoppedMembership(members: readonly GroupMember[]): string | undefined {
	if (!members.every((process) => process.state === "stopped")) {
		return undefined;
	}
	return members
		.map((member) => `${member.pid}:${member.startTime}`)
		.toSorted()
		.join(",");
}

/**
 * Wait until every non-zombie group member is stopped and unable to fork.
 *
 * One census in which every member reads as stopped is not enough. On macOS a
 * process can read as stopped while a fork it began is still completing, and
 * the child joins the group after that census, outside the SIGSTOP and the
 * SIGKILL sent to the group. So the group counts as frozen only when
 * two censuses one poll apart find the same members, all of them stopped. A
 * kill sent after this returns reaches every member there can be.
 * @param seam The census, stop signal, clock and wait.
 * @param deadlineAtMs The instant after which the group is given up as unfrozen.
 * @returns True once the group is frozen, false when the deadline passed first.
 * @throws {Error} When a census or signal fails.
 */
async function awaitFrozenGroup(seam: FrozenGroupSeam, deadlineAtMs: number): Promise<boolean> {
	let frozen: string | undefined;
	for (;;) {
		const census = stoppedMembership(seam.census());
		if (census !== undefined && census === frozen) {
			return true;
		}
		frozen = census;
		if (seam.now() >= deadlineAtMs) {
			return false;
		}
		if (census === undefined) seam.stop();
		// oxlint-disable-next-line no-await-in-loop -- a process group is sampled until the bounded barrier
		await seam.wait(seam.pollMs);
	}
}

export { awaitFrozenGroup, type FrozenGroupSeam };
