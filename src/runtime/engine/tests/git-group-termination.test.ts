import { expect, test } from "bun:test";

import type { GitGroupTerminationOperations } from "../testing.js";
import { stopAndKillOwnedGroup } from "../testing.js";
import type { ProcessGroupIdentity } from "../process-group.js";
import type { ProcessObservation } from "../../../shared/process-observation/index.js";

const group: ProcessGroupIdentity = {
	group: 41,
	leader: { pid: 41, startTime: "darwin:leader" },
};

function observed(
	pid: number,
	startTime: string,
	state: ProcessObservation["state"],
): ProcessObservation {
	return { pid, parentPid: 41, pgid: 41, state, startTime };
}

test("a failed stop barrier resumes only exact captured members and refuses group cleanup", async () => {
	const observerFailure = new Error("injected group observation failure");
	const effects: string[] = [];
	let census = 0;
	let exactMemberStopped = true;
	const capturedMember = observed(42, "darwin:member", "stopped");
	const capturedStaleMember = observed(43, "darwin:stale", "stopped");
	const operations: GitGroupTerminationOperations = {
		now: () => 0,
		wait: async () => undefined,
		members: () => {
			census += 1;
			if (census > 1) {
				throw observerFailure;
			}
			return [observed(41, "darwin:leader", "live"), capturedMember, capturedStaleMember];
		},
		signalGroup: (_identity, signal) => {
			effects.push(`group:${signal}`);
			if (signal !== "SIGSTOP") {
				throw new Error("exact leader proof unavailable");
			}
			return true;
		},
		readProcess: (pid) => {
			if (pid === capturedMember.pid) {
				return { ...capturedMember, state: exactMemberStopped ? "stopped" : "live" };
			}
			if (pid === capturedStaleMember.pid) {
				return observed(pid, "darwin:replacement", "stopped");
			}
			return undefined;
		},
		signalPid: (pid, signal) => {
			effects.push(`pid:${pid}:${signal}`);
			exactMemberStopped = false;
		},
	};
	const child = {
		kill: (signal?: number | NodeJS.Signals) => {
			effects.push(`child:${String(signal)}`);
		},
	};

	await expect(stopAndKillOwnedGroup(group, child, operations)).rejects.toBe(observerFailure);
	expect(effects).toEqual([
		"group:SIGSTOP",
		"group:SIGKILL",
		"group:SIGCONT",
		"pid:42:SIGCONT",
		"child:SIGKILL",
	]);
	expect(effects.some((effect) => effect.startsWith("pid:43:"))).toBeFalse();
});

test("an already quiescent group completes without requiring a leader", async () => {
	let signalCalls = 0;
	const operations: GitGroupTerminationOperations = {
		now: () => 0,
		wait: async () => undefined,
		members: () => [],
		signalGroup: () => {
			signalCalls += 1;
			return false;
		},
		readProcess: () => undefined,
		signalPid: () => undefined,
	};
	let childKills = 0;
	const child = {
		kill: () => {
			childKills += 1;
		},
	};

	await expect(stopAndKillOwnedGroup(group, child, operations)).resolves.toBeUndefined();
	expect(signalCalls).toBe(1);
	expect(childKills).toBe(0);
});
