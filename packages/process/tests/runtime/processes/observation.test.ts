import { describe, expect, test } from "bun:test";

import {
	listProcessGroupObservations,
	listProcessObservations,
	readProcessObservation,
} from "#runtime/processes/observation.ts";
import { parseLinuxProcessStat } from "#runtime/processes/linux-stat.ts";

function linuxStat(state: string, parentPid = "11", pgid = "29"): string {
	const fields = [state, parentPid, pgid, ...Array.from({ length: 16 }, () => "0"), "424242"];
	return `83 (command with ) parenthesis) ${fields.join(" ")}`;
}

describe("process observation", () => {
	test("reads a process, the census and an owned group through the native platform boundary", async () => {
		const current = readProcessObservation(process.pid);
		expect(current).toMatchObject({ pid: process.pid, state: "live" });
		expect(current?.startTime).toMatch(/^(?:darwin|linux):/);
		expect(listProcessObservations().some((record) => record.pid === process.pid)).toBeTrue();
		// The product observes only groups it started, never the one it was
		// started in: on GitHub's macOS runner that group holds a process libproc
		// will not describe (TASK-361).
		const leader = Bun.spawn(
			[process.execPath, "-e", "process.stdout.write('ready'); setInterval(() => {}, 1000);"],
			{ detached: true, stdin: "ignore", stdout: "pipe", stderr: "ignore" },
		);
		try {
			await leader.stdout.getReader().read();
			expect(listProcessGroupObservations(leader.pid)).toEqual([
				expect.objectContaining({ pid: leader.pid, pgid: leader.pid, state: "live" }),
			]);
		} finally {
			leader.kill("SIGKILL");
			await leader.exited;
		}
	});

	test("decodes Linux birth, group, parent, and liveness semantics", () => {
		expect(parseLinuxProcessStat(83, linuxStat("S"))).toEqual({
			pid: 83,
			parentPid: 11,
			pgid: 29,
			state: "live",
			startTime: "linux:424242",
		});
		expect(parseLinuxProcessStat(83, linuxStat("T"))?.state).toBe("stopped");
		expect(parseLinuxProcessStat(83, linuxStat("Z"))?.state).toBe("zombie");
	});

	test("observes Linux kernel threads without making group zero an ownership target", () => {
		expect(parseLinuxProcessStat(83, linuxStat("S", "0", "0"))).toMatchObject({
			parentPid: 0,
			pgid: 0,
			state: "live",
			startTime: "linux:424242",
		});
		expect(() => listProcessGroupObservations(0)).toThrow("Invalid process group id 0.");
	});

	test("reads a process the kernel is releasing as one that has vanished", () => {
		// A dead task release_task has already detached prints no parent and group
		// and session -1, and its /proc entry is gone a moment later. A census that
		// read one mid-release failed whole (TASK-252).
		expect(parseLinuxProcessStat(83, linuxStat("X", "0", "-1"))).toBeUndefined();
		expect(() => parseLinuxProcessStat(83, linuxStat("S", "0", "-1"))).toThrow(
			"Incomplete process stat",
		);
		expect(() => parseLinuxProcessStat(83, linuxStat("Z", "0", "-1"))).toThrow(
			"Incomplete process stat",
		);
	});

	test("refuses malformed Linux process relationship identifiers", () => {
		for (const invalid of ["-1", "1.5", "NaN", "9007199254740992"]) {
			expect(() => parseLinuxProcessStat(83, linuxStat("S", invalid))).toThrow(
				"Incomplete process stat",
			);
			expect(() => parseLinuxProcessStat(83, linuxStat("S", "0", invalid))).toThrow(
				"Incomplete process stat",
			);
		}
	});
});
