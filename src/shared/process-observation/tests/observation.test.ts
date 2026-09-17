import { describe, expect, test } from "bun:test";

import {
	listProcessGroupObservations,
	listProcessObservations,
	readProcessObservation,
} from "../index.js";
import { parseLinuxProcessStat } from "../testing.js";

function linuxStat(state: string, parentPid = "11", pgid = "29"): string {
	const fields = [state, parentPid, pgid, ...Array.from({ length: 16 }, () => "0"), "424242"];
	return `83 (command with ) parenthesis) ${fields.join(" ")}`;
}

describe("process observation", () => {
	test("reads the current process through the native platform boundary", () => {
		const current = readProcessObservation(process.pid);
		expect(current).toMatchObject({ pid: process.pid, state: "live" });
		expect(current?.startTime).toMatch(/^(?:darwin|linux):/);
		expect(listProcessObservations().some((record) => record.pid === process.pid)).toBeTrue();
		expect(
			listProcessGroupObservations(current!.pgid).some((record) => record.pid === process.pid),
		).toBeTrue();
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
