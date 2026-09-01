import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseDynamicToolCallResponse } from "../../../src/runtime/codex-thread-tools/index.ts";
import { waitFor } from "../canvas-state/support/http.ts";
import { processExists } from "../support/owned-canvas.ts";
import { records, reverseResponses, snapshot } from "./support/codex-workbench-lifecycle.ts";
import { mutationCount, startLinkedWorkbench } from "./support/codex-workbench-process-harness.ts";
import { extendTerminalFixture } from "./support/codex-workbench-terminal-controls.ts";

function terminalSource(resources: AsyncDisposableStack, label: string): string {
	const root = mkdtempSync(join(tmpdir(), `archboard-normal-close-${label}-`));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	return extendTerminalFixture(root);
}

async function waitForShutdownBatch(
	logPath: string,
	requestSnapshot: () => Promise<ReturnType<typeof snapshot>>,
): Promise<void> {
	await waitFor(async () => {
		const state = await requestSnapshot();
		return (state.approvals as unknown[]).length === 1 &&
			(state.dynamicApprovals as unknown[]).length === 1
			? true
			: undefined;
	}, "pending normal-close batch");
	await waitFor(
		() =>
			records(logPath).some((entry) => entry.kind === "frame" && entry.method === "thread/read")
				? true
				: undefined,
		"pending normal-close wait",
	);
}

function expectTerminalBatch(logPath: string): void {
	expect(reverseResponses(logPath, "reload-ordinary")[0]?.frame).toEqual({
		id: "reload-ordinary",
		result: { decision: "cancel" },
	});
	const dynamic = parseDynamicToolCallResponse(
		"create_thread",
		reverseResponses(logPath, "reload-dynamic")[0]?.frame?.result,
	).envelope;
	expect(dynamic.tag).toBe("approval_required");
	expect(reverseResponses(logPath, "reload-wait")[0]?.frame).toEqual({
		id: "reload-wait",
		error: { code: -32603, message: "Codex transport is shutting down." },
	});
	for (const id of ["reload-ordinary", "reload-dynamic", "reload-wait"])
		expect(reverseResponses(logPath, id), id).toHaveLength(1);
}

describe.serial("composed Codex normal-close lifecycle", () => {
	test("normal application close settles every pending owner and held outgoing RPC", async () => {
		const resources = new AsyncDisposableStack();
		try {
			const { canvas, childPid, fixture, socket } = await startLinkedWorkbench(
				resources,
				"normal-close",
				terminalSource(resources, "normal-close"),
			);
			const effectsBefore = mutationCount(fixture.logPath);
			writeFileSync(fixture.controlPath, JSON.stringify({ emit: "reload", holdClientRpc: true }));
			await waitForShutdownBatch(fixture.logPath, async () =>
				snapshot(await socket.request("snapshot")),
			);
			const held = socket.request("accountRead").then(
				(value) => ({ kind: "result" as const, value }),
				(error: unknown) => ({ kind: "closed" as const, message: String(error) }),
			);
			await waitFor(
				() =>
					records(fixture.logPath).some(
						(entry) =>
							entry.kind === "held_client_rpc" &&
							(entry as { readonly state?: unknown }).state === "pending",
					)
						? true
						: undefined,
				"held normal-close RPC",
			);
			await canvas.normalClose();
			expect(processExists(canvas.pid)).toBeFalse();
			expect(processExists(childPid)).toBeFalse();
			expect(await held).toMatchObject({
				kind: "result",
				value: {
					ok: true,
					value: {
						kind: "account_read",
						outcome: "outcome_unknown",
						code: "outcome_unknown",
						message:
							"The command may have taken effect; inspect authoritative state before another mutation.",
					},
				},
			});
			expectTerminalBatch(fixture.logPath);
			expect(mutationCount(fixture.logPath)).toBe(effectsBefore);
			expect(
				records(fixture.logPath).filter((entry) => entry.kind === "host_normal_close"),
			).toEqual([
				expect.objectContaining({ state: "started" }),
				expect.objectContaining({ state: "completed" }),
			]);
			const terminalLog = readFileSync(fixture.logPath, "utf8");
			await canvas.normalClose();
			expect(readFileSync(fixture.logPath, "utf8")).toBe(terminalLog);
		} finally {
			await resources.disposeAsync();
		}
	}, 40_000);

	test("normal close invalidates an in-flight reload before either graph can publish", async () => {
		const resources = new AsyncDisposableStack();
		try {
			const { canvas, childPid, fixture, request, socket } = await startLinkedWorkbench(
				resources,
				"reload-close-overlap",
				terminalSource(resources, "reload-close-overlap"),
			);
			const effectsBefore = mutationCount(fixture.logPath);
			writeFileSync(fixture.controlPath, JSON.stringify({ emit: "reload", holdClientRpc: true }));
			await waitForShutdownBatch(fixture.logPath, async () =>
				snapshot(await socket.request("snapshot")),
			);
			const held = socket.request("accountRead").catch(() => undefined);
			await waitFor(
				() =>
					records(fixture.logPath).some((entry) => entry.kind === "held_client_rpc")
						? true
						: undefined,
				"held reload-overlap RPC",
			);
			expect((await request("/api/reload", { method: "POST", doing: false })).status).toBe(200);
			await waitFor(
				() =>
					records(fixture.logPath).filter((entry) => entry.kind === "held_client_rpc").length >= 2
						? true
						: undefined,
				"held replacement initialization",
			);
			await canvas.normalClose();
			await held;
			expect(processExists(canvas.pid)).toBeFalse();
			expect(processExists(childPid)).toBeFalse();
			expectTerminalBatch(fixture.logPath);
			expect(mutationCount(fixture.logPath)).toBe(effectsBefore);
			expect(
				records(fixture.logPath).filter((entry) => entry.kind === "host_normal_close"),
			).toEqual([
				expect.objectContaining({ state: "started" }),
				expect.objectContaining({ state: "completed" }),
			]);
			const terminalLog = readFileSync(fixture.logPath, "utf8");
			await canvas.normalClose();
			expect(readFileSync(fixture.logPath, "utf8")).toBe(terminalLog);
		} finally {
			await resources.disposeAsync();
		}
	}, 40_000);
});
