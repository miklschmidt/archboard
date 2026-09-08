import { expect, test } from "bun:test";

import type {
	CodexProcessGroupInspection,
	CodexProcessGroupOperations,
} from "@/runtime/codex-process/process-group";
import { endGroup, waitForGroupAbsence } from "../testing.ts";

test("renderer cleanup observes through a transient unreadable process-group census", async () => {
	const inspections: CodexProcessGroupInspection[] = ["unproven", "owned", "quiescent"];
	let inspectionCount = 0;
	const groups: CodexProcessGroupOperations = {
		capture: () => {
			throw new Error("capture is outside this absence observation");
		},
		inspect: () => inspections[inspectionCount++] ?? "quiescent",
		signal: () => {
			throw new Error("absence observation must not signal");
		},
	};
	const absent = await waitForGroupAbsence(
		{ leaderPid: 71, pgid: 71, leaderStartTime: "darwin:1:2" },
		Date.now() + 250,
		groups,
	);

	expect(absent).toBeTrue();
	expect(inspectionCount).toBe(3);
});

test("renderer teardown waits for ownership before beginning graceful termination", async () => {
	const inspections: CodexProcessGroupInspection[] = ["unproven", "owned", "quiescent"];
	let inspectionCount = 0;
	const signals: string[] = [];
	const groups: CodexProcessGroupOperations = {
		capture: () => {
			throw new Error("capture is outside this teardown sequence");
		},
		inspect: () => inspections[inspectionCount++] ?? "quiescent",
		signal: (_identity, signal) => signals.push(signal),
	};
	const errors: string[] = [];
	const ended = await endGroup(
		{ leaderPid: 83, pgid: 83, leaderStartTime: "darwin:2:3" },
		250,
		Date.now() + 250,
		errors,
		groups,
	);

	expect(ended).toBeTrue();
	expect(signals).toEqual(["SIGTERM"]);
	expect(errors).toEqual([]);
});
