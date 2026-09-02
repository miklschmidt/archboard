import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseDynamicToolCallResponse } from "../../../src/runtime/codex-thread-tools/index.ts";
import { waitFor } from "../canvas-state/support/http.ts";
import { processExists } from "../support/owned-canvas.ts";
import { records, reverseResponses, snapshot } from "./support/codex-workbench-lifecycle.ts";
import { mutationCount, startLinkedWorkbench } from "./support/codex-workbench-process-harness.ts";
import { extendTerminalFixture } from "./support/codex-workbench-terminal-controls.ts";

function terminalSource(resources: AsyncDisposableStack): string {
	const root = mkdtempSync(join(tmpdir(), "archboard-normal-close-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	return extendTerminalFixture(root);
}

describe.serial("composed Codex normal-close lifecycle", () => {
	test("normal application close settles pending owners and held outgoing RPC", async () => {
		const resources = new AsyncDisposableStack();
		try {
			const { canvas, childPid, fixture, socket } = await startLinkedWorkbench(
				resources,
				"normal-close",
				terminalSource(resources),
			);
			const effectsBefore = mutationCount(fixture.logPath);
			writeFileSync(fixture.controlPath, JSON.stringify({ emit: "shutdown", holdClientRpc: true }));
			await waitFor(async () => {
				const state = snapshot(await socket.request("snapshot"));
				return (state.approvals as unknown[]).length === 1 &&
					(state.dynamicApprovals as unknown[]).length === 1
					? true
					: undefined;
			}, "pending normal-close batch");
			const held = socket.request("accountRead").catch((error: unknown) => String(error));
			await waitFor(
				() =>
					records(fixture.logPath).some((entry) => entry.kind === "held_client_rpc")
						? true
						: undefined,
				"held normal-close RPC",
			);
			await canvas.normalClose();
			await held;
			expect(processExists(canvas.pid)).toBeFalse();
			expect(processExists(childPid)).toBeFalse();
			expect(reverseResponses(fixture.logPath, "shutdown-ordinary")[0]?.frame).toEqual({
				id: "shutdown-ordinary",
				result: { decision: "cancel" },
			});
			const dynamic = parseDynamicToolCallResponse(
				"create_thread",
				reverseResponses(fixture.logPath, "shutdown-dynamic")[0]?.frame?.result,
			).envelope;
			expect(dynamic.tag).toBe("approval_required");
			expect(reverseResponses(fixture.logPath, "shutdown-wait")[0]?.frame).toEqual({
				id: "shutdown-wait",
				error: { code: -32603, message: "Codex transport is shutting down." },
			});
			expect(mutationCount(fixture.logPath)).toBe(effectsBefore);
		} finally {
			await resources.disposeAsync();
		}
	}, 40_000);
});
