import { describe, expect, test } from "bun:test";

import { CodexSessionMutationError } from "../../codex-session/index.js";
import {
	WORKHORSE_CLEANUP_OPERATION_KIND,
	WORKHORSE_OPERATION_KIND,
	WORKHORSE_RPC,
} from "../index.js";
import { CHECKOUT_ROOT, inspectOnlyBinding, makeFixture, turnFixture } from "./support.js";

describe("codex workhorse start transaction", () => {
	test("rejects a wrong origin or checkout without binding or guessing a cleanup target", async () => {
		for (const field of ["thread.source", "cwd"] as const) {
			const fixture = makeFixture();
			try {
				const response = fixture.session.startResult;
				if (response instanceof Error) throw response;
				if (field === "thread.source") Object.assign(response.thread, { source: "cli" });
				if (field === "cwd") Object.assign(response, { cwd: "/other-checkout" });
				const result = await fixture.starter.start({ paneId: "pane-1", expected: null });
				expect(result.state).toBe("inspect_only");
				expect(result.reason).toContain(`authored profile: ${field}.`);
				expect(fixture.link.targets).toHaveLength(0);
				expect(fixture.session.deleteParams).toHaveLength(0);
			} finally {
				fixture.dispose();
			}
		}
	});

	test("stages, confirms, and binds with one canonical operation correlation", async () => {
		const fixture = makeFixture();
		try {
			const result = await fixture.starter.start({ paneId: "pane-1", expected: null });

			expect(result.state).toBe("ready");
			expect(result.outcome).toBe("delivered");
			expect(result.start).toMatchObject({
				threadId: fixture.thread.id,
				cwd: CHECKOUT_ROOT,
				runtimeWorkspaceRoots: [CHECKOUT_ROOT],
				historyMode: "paginated",
				source: "vscode",
				threadSource: "archboard",
				model: "gpt-5.6-luna",
				modelProvider: "openai",
				serviceTier: "priority",
				approvalPolicy: "on-request",
				approvalsReviewer: "user",
				sandbox: { type: "dangerFullAccess" },
				activePermissionProfile: { id: "archboard-default", extends: null },
				instructionHash: "257b4ab944737418ee0713b4a748405446f8bc009d0dfc4557b099cd2c1038e6",
				manifestHash: "df0fc2b1b33d985a7b84e54431162d6c00a3da0f8cecd98a18730e55bc7b272e",
			});
			expect(fixture.session.startParams).toHaveLength(1);
			expect(fixture.link.targets).toHaveLength(1);
			expect(fixture.session.readParams).toHaveLength(0);
			expect(fixture.session.deleteParams).toHaveLength(0);

			const target = fixture.link.targets[0];
			expect(target).toBeDefined();
			if (target === undefined || result.operationId === null) return;
			expect(target.target.operationId).toBe(result.operationId);
			expect(target.target.provenance).toMatchObject({
				record: { correlation: { operationId: result.operationId } },
			});

			const records = fixture.epoch.snapshot().manifest.records;
			const startRecord = records.find(
				(record) => record.operation.kind === WORKHORSE_OPERATION_KIND,
			);
			expect(startRecord).toMatchObject({
				status: "committed",
				outcome: "delivered",
				operation: { kind: WORKHORSE_OPERATION_KIND, rpc: WORKHORSE_RPC },
				provenance: {
					threadId: fixture.thread.id,
					threadSource: "vscode",
					workspaceRoot: CHECKOUT_ROOT,
				},
			});
		} finally {
			fixture.dispose();
		}
	});

	test("serializes concurrent starts so the second RPC waits for the first transaction", async () => {
		const fixture = makeFixture();
		try {
			let release!: () => void;
			fixture.session.startGate = new Promise<void>((resolve) => {
				release = resolve;
			});
			const first = fixture.starter.start({ paneId: "pane-1", expected: null });
			await Promise.resolve();
			const second = fixture.starter.start({ paneId: "pane-1", expected: null });
			await Promise.resolve();
			expect(fixture.session.startParams).toHaveLength(1);
			expect(fixture.session.activeStarts).toBe(1);
			release();
			const results = await Promise.all([first, second]);
			expect(results.every((result) => result.state === "ready")).toBe(true);
			expect(fixture.session.startParams).toHaveLength(2);
			expect(fixture.session.maxActiveStarts).toBe(1);
		} finally {
			fixture.dispose();
		}
	});

	test("rolls back locally when thread/start was not delivered", async () => {
		const fixture = makeFixture();
		try {
			fixture.session.startResult = new CodexSessionMutationError(
				"thread/start",
				"not_delivered",
				"transport rejected the request before delivery",
			);
			const result = await fixture.starter.start({ paneId: "pane-1", expected: null });

			expect(result.state).toBe("failed");
			expect(result.outcome).toBe("not_delivered");
			expect(fixture.link.targets).toHaveLength(0);
			expect(fixture.session.readParams).toHaveLength(0);
			expect(fixture.session.deleteParams).toHaveLength(0);
			expect(fixture.epoch.snapshot().manifest.records.at(-1)).toMatchObject({
				status: "rolled_back",
				outcome: "not_delivered",
			});
		} finally {
			fixture.dispose();
		}
	});

	test("tombstones a lost thread/start settlement without retry or cleanup", async () => {
		const fixture = makeFixture();
		try {
			fixture.session.startResult = new CodexSessionMutationError(
				"thread/start",
				"outcome_unknown",
				"the start response was lost",
			);
			const result = await fixture.starter.start({ paneId: "pane-1", expected: null });

			expect(result.state).toBe("inspect_only");
			expect(result.outcome).toBe("outcome_unknown");
			expect(result.threadId).toBeNull();
			expect(fixture.session.startParams).toHaveLength(1);
			expect(fixture.link.targets).toHaveLength(0);
			expect(fixture.session.readParams).toHaveLength(0);
			expect(fixture.session.deleteParams).toHaveLength(0);
			expect(fixture.epoch.snapshot().manifest.records.at(-1)).toMatchObject({
				status: "inspect_only",
				outcome: "outcome_unknown",
				operation: { rpc: WORKHORSE_RPC },
			});
		} finally {
			fixture.dispose();
		}
	});

	test("treats a malformed confirmed response as unknown without guessing a cleanup target", async () => {
		const fixture = makeFixture();
		try {
			fixture.session.startResult = {
				...fixture.response,
				cwd: "/foreign/root",
			};
			const result = await fixture.starter.start({ paneId: "pane-1", expected: null });

			expect(result.state).toBe("inspect_only");
			expect(result.outcome).toBe("outcome_unknown");
			expect(fixture.link.targets).toHaveLength(0);
			expect(fixture.session.readParams).toHaveLength(0);
			expect(fixture.session.deleteParams).toHaveLength(0);
			expect(fixture.epoch.snapshot().manifest.records.at(-1)).toMatchObject({
				status: "inspect_only",
				outcome: "outcome_unknown",
			});
		} finally {
			fixture.dispose();
		}
	});

	test("cleans up only after a failed bind rereads the exact new idle root", async () => {
		const fixture = makeFixture();
		try {
			fixture.link.outcome = inspectOnlyBinding("pane-1", 2, fixture.thread.id);
			const result = await fixture.starter.start({ paneId: "pane-1", expected: null });

			expect(result.state).toBe("inspect_only");
			expect(result.binding?.link.state).toBe("inspect_only");
			expect(result.cleanup).toMatchObject({
				threadId: fixture.thread.id,
				outcome: "delivered",
			});
			expect(fixture.session.readParams).toEqual([
				{ threadId: fixture.thread.id, includeTurns: true },
			]);
			expect(fixture.session.deleteParams).toEqual([{ threadId: fixture.thread.id }]);
			const cleanupRecord = fixture.epoch
				.snapshot()
				.manifest.records.find(
					(record) => record.operation.kind === WORKHORSE_CLEANUP_OPERATION_KIND,
				);
			expect(cleanupRecord).toMatchObject({
				status: "committed",
				outcome: "delivered",
				provenance: { threadId: fixture.thread.id, threadSource: "vscode" },
			});
			expect(result.cleanup?.operationId).not.toBe(result.operationId);
		} finally {
			fixture.dispose();
		}
	});

	test("refuses cleanup when an idle reread contains a turn", async () => {
		const fixture = makeFixture();
		try {
			fixture.link.outcome = new Error("bind failed");
			fixture.session.readResult = {
				thread: { ...fixture.thread, turns: [turnFixture(fixture.authorities)] },
			};
			const result = await fixture.starter.start({ paneId: "pane-1", expected: null });

			expect(result.state).toBe("inspect_only");
			expect(result.cleanup).toBeNull();
			expect(fixture.session.readParams).toEqual([
				{ threadId: fixture.thread.id, includeTurns: true },
			]);
			expect(fixture.session.deleteParams).toHaveLength(0);
			expect(
				fixture.epoch
					.snapshot()
					.manifest.records.some(
						(record) => record.operation.kind === WORKHORSE_CLEANUP_OPERATION_KIND,
					),
			).toBe(false);
		} finally {
			fixture.dispose();
		}
	});

	test("refuses cleanup when the reread is not the exact idle root", async () => {
		const fixture = makeFixture();
		try {
			fixture.link.outcome = new Error("bind failed");
			fixture.session.readResult = { thread: { ...fixture.thread, cwd: "/other/root" } };
			const result = await fixture.starter.start({ paneId: "pane-1", expected: null });

			expect(result.state).toBe("inspect_only");
			expect(result.cleanup).toBeNull();
			expect(fixture.session.readParams).toHaveLength(1);
			expect(fixture.session.deleteParams).toHaveLength(0);
			expect(
				fixture.epoch
					.snapshot()
					.manifest.records.some(
						(record) => record.operation.kind === WORKHORSE_CLEANUP_OPERATION_KIND,
					),
			).toBe(false);
		} finally {
			fixture.dispose();
		}
	});

	test("records cleanup uncertainty and never retries deletion", async () => {
		const fixture = makeFixture();
		try {
			fixture.link.outcome = new Error("bind failed");
			fixture.session.deleteResult = new CodexSessionMutationError(
				"thread/delete",
				"outcome_unknown",
				"delete response was lost",
			);
			const result = await fixture.starter.start({ paneId: "pane-1", expected: null });

			expect(result.state).toBe("inspect_only");
			expect(result.cleanup?.outcome).toBe("outcome_unknown");
			expect(fixture.session.deleteParams).toHaveLength(1);
			expect(fixture.epoch.snapshot().manifest.records.at(-1)).toMatchObject({
				status: "inspect_only",
				outcome: "outcome_unknown",
				operation: { kind: WORKHORSE_CLEANUP_OPERATION_KIND, rpc: "thread/delete" },
			});
		} finally {
			fixture.dispose();
		}
	});

	test("rolls back a cleanup delete rejected before delivery", async () => {
		const fixture = makeFixture();
		try {
			fixture.link.outcome = new Error("bind failed");
			fixture.session.deleteResult = new CodexSessionMutationError(
				"thread/delete",
				"not_delivered",
				"delete rejected before delivery",
			);
			const result = await fixture.starter.start({ paneId: "pane-1", expected: null });

			expect(result.state).toBe("inspect_only");
			expect(result.cleanup?.outcome).toBe("not_delivered");
			expect(fixture.session.deleteParams).toHaveLength(1);
			expect(fixture.epoch.snapshot().manifest.records.at(-1)).toMatchObject({
				status: "rolled_back",
				outcome: "not_delivered",
			});
		} finally {
			fixture.dispose();
		}
	});
});
