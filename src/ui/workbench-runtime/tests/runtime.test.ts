import { describe, expect, test } from "bun:test";

import type { BrowserTimeline } from "@/shared/codex-browser-model";
import {
	approvalResponse,
	createReadonlyWorkbenchView,
	projectWorkbenchRuntime,
	sessionView,
	workbenchRuntimeMessageId,
} from "@/ui/workbench-runtime";
import type { BrowserWorkbenchState } from "@/ui/workbench-transport";
import {
	approval,
	connected,
	ids,
	snapshot,
	timeline,
} from "@/ui/workbench-runtime/tests/fixtures";

describe("workbench runtime projection", () => {
	test("creates one non-optimistic turn projection from each authoritative turn identity", () => {
		const view = projectWorkbenchRuntime(connected());
		expect(view.mode).toBe("executable");
		expect(view.turns).toHaveLength(1);
		expect(view.turns[0]?.id).toBe(workbenchRuntimeMessageId(ids.threadId, ids.turnId));
		expect(view.turns[0]?.metadata.turnId).toBe(ids.turnId);
		expect(view.turns[0]?.parts).toEqual([{ kind: "text", text: "Authoritative response" }]);
		expect(view.turns[0]?.metadata.items).toEqual([
			{
				itemId: ids.itemId,
				kind: "text",
				supported: true,
				value: { media: "text", itemId: ids.itemId, text: "Authoritative response" },
			},
		]);
	});

	test("turn identity conflicts become a visible read-only runtime failure", () => {
		const duplicate = timeline();
		const invalid: BrowserTimeline = {
			...duplicate,
			turns: [...duplicate.turns, ...duplicate.turns],
		};
		const view = projectWorkbenchRuntime(connected(snapshot({ timeline: invalid })));
		expect(view.mode).toBe("readonly");
		expect(view.state).toBe("runtime_failure");
		expect(view.reason).toContain("Duplicate Codex turn identity");
		expect(view.turns[0]?.parts[0]).toMatchObject({ kind: "text" });
		expect(view.turns[0]?.outcome).toBe("failed");
	});

	test("stale and reconnecting snapshots retain history without executable controls", () => {
		const stale = projectWorkbenchRuntime({
			kind: "stream",
			state: "stale_snapshot",
			connection: "connected",
			snapshot: snapshot(),
			sequence: 3,
			expectedSequence: 4,
			receivedSequence: 5,
			reason: "A timeline delta was missed.",
		});
		expect(stale).toMatchObject({ mode: "readonly", state: "stale" });
		expect(stale.turns[0]?.id).toBe(workbenchRuntimeMessageId(ids.threadId, ids.turnId));

		const reconnecting = projectWorkbenchRuntime({
			kind: "connection",
			state: "reconnecting",
			connection: "reconnecting",
			snapshot: snapshot(),
			sequence: 3,
			reason: "The app-server connection is recovering.",
		});
		expect(reconnecting).toMatchObject({ mode: "readonly", state: "reconnecting" });
		expect(reconnecting.turns).toHaveLength(1);
	});

	test("a linked workhorse remains read-only until Codex is thread-capable", () => {
		const view = projectWorkbenchRuntime({
			kind: "readiness",
			state: "account_ready",
			connection: "connected",
			snapshot: snapshot({ readiness: { kind: "readiness", state: "account_ready" } }),
			sequence: 1,
		});
		expect(view).toMatchObject({
			mode: "readonly",
			state: "account_ready",
			reason: "Codex is account ready; direct workhorse input is unavailable.",
		});
	});

	test("inspect-only and coordinator histories are read-only with their own source", () => {
		const inspectView = projectWorkbenchRuntime(
			connected(
				snapshot({
					threadLink: {
						kind: "thread_link",
						state: "inspect_only",
						childId: null,
						epoch: null,
						threadId: ids.threadId,
						sourcePresentation: "unknown",
						status: "idle",
						loaded: true,
						canAcceptDirectInput: false,
						reason: "The history belongs to a prior process.",
					},
				}),
			),
		);
		expect(inspectView).toMatchObject({
			mode: "readonly",
			state: "inspect_only",
			reason: "The history belongs to a prior process.",
		});
		expect(
			createReadonlyWorkbenchView(
				timeline(),
				"coordinator",
				"Coordinator history is inspect-only.",
			),
		).toMatchObject({ mode: "readonly", state: "coordinator" });
		expect(createReadonlyWorkbenchView(null, "prior_epoch", "Earlier process.").turns).toEqual([]);
	});

	test("missing history does not revoke a ready executable link", () => {
		expect(projectWorkbenchRuntime(connected(snapshot({ timeline: null })))).toEqual({
			mode: "executable",
			state: "ready",
			reason: null,
			turns: [],
		});
	});
});

describe("workbench session view", () => {
	test("maps every transport state to loading, empty, error or ready", () => {
		const stopped: BrowserWorkbenchState = {
			kind: "connection",
			state: "stopped",
			connection: "stopped",
			snapshot: null,
			sequence: null,
			reason: "No Codex workbench socket is attached.",
		};
		expect(sessionView(stopped)).toEqual({
			kind: "empty",
			message: "No Codex workbench socket is attached.",
		});
		expect(
			sessionView({ ...stopped, state: "incompatible_contract", reason: "protocol 7" }),
		).toMatchObject({ kind: "error", message: "protocol 7" });
		expect(
			sessionView({
				kind: "connection",
				state: "reconnecting",
				connection: "reconnecting",
				snapshot: null,
				sequence: null,
				reason: "Connecting.",
			}),
		).toEqual({ kind: "loading" });
		expect(sessionView(connected())).toMatchObject({ kind: "ready" });
	});
});

describe("approval responses", () => {
	test("spells each family's decision in its own method shape, and refuses a misfit", () => {
		const command = approval();
		expect(approvalResponse(command, { kind: "command_decision", decision: "decline" })).toEqual({
			approvalKind: "command_execution",
			decision: "decline",
		});
		expect(approvalResponse(command, { kind: "approve" })).toBeNull();
		const question = { ...command, approvalKind: "user_input" as const, questions: [] };
		expect(approvalResponse(question, { kind: "answer", questionId: "q1", answer: "yes" })).toEqual(
			{ approvalKind: "user_input", answers: { q1: { answers: ["yes"] } } },
		);
		expect(approvalResponse(question, { kind: "decline" })).toEqual({
			approvalKind: "user_input",
			answers: {},
		});
		const patch = { ...command, approvalKind: "apply_patch" as const, fileCount: 2 };
		expect(approvalResponse(patch, { kind: "approve" })).toEqual({
			approvalKind: "apply_patch",
			decision: "approved",
		});
		expect(approvalResponse(patch, { kind: "decline" })).toMatchObject({
			approvalKind: "apply_patch",
			decision: { denied: { rejection: "Declined at the Archboard workbench." } },
		});
	});
});
