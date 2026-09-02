import { describe, expect, test } from "bun:test";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
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
			const { canvas, childPid, fixture, request, socket } = await startLinkedWorkbench(
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
			const seeded = await request("/api/elements?board=scratch", {
				method: "POST",
				body: { id: "before-close", type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
			});
			expect(seeded.status).toBe(200);
			const info = await request("/api/boards/info?board=scratch");
			const note = (info.body as { file?: unknown }).file;
			if (typeof note !== "string") throw new Error("Scratch did not report its note path.");
			appendFileSync(note, "\nforeign edit before shutdown\n");

			const blockerBody = JSON.stringify({ clientId: "drain-blocker", elementIds: [] });
			const blocker = httpRequest(`${canvas.base}/api/selection`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(blockerBody),
				},
			});
			resources.defer(() => {
				blocker.destroy();
			});
			const blockerResponse = new Promise<number>((resolve, reject) => {
				blocker.once("error", reject);
				blocker.once("response", (response) => {
					response.resume();
					response.once("end", () => resolve(response.statusCode ?? 0));
				});
			});
			blocker.write(blockerBody.slice(0, -1));
			await waitFor(async () => {
				const response = await fetch(`${canvas.base}/health`);
				const health = (await response.json()) as { application?: { activeWrites?: unknown } };
				return health.application?.activeWrites === 1 ? true : undefined;
			}, "admitted write awaiting its request body");

			// The partial admitted request holds the drain before browser cleanup.
			// The later request would conflict with the foreign note if it crossed
			// admission, so accepting it here could create a process-only hold.
			const closing = canvas.normalClose();
			await waitFor(async () => {
				try {
					const response = await fetch(`${canvas.base}/health`);
					if (!response.ok) return undefined;
					const health = (await response.json()) as {
						application?: { acceptingWrites?: unknown };
					};
					return health.application?.acceptingWrites === false ? true : undefined;
				} catch {
					return undefined;
				}
			}, "shutdown write quiesce");
			const raced = await fetch(`${canvas.base}/api/elements/changes?board=scratch`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					clientId: "process-normal-close",
					upserts: [{ id: "late", type: "rectangle", x: 1, y: 1, width: 10, height: 10 }],
					deletes: [],
					fullReport: true,
				}),
			});
			expect(raced.status).toBe(503);
			expect(await raced.json()).toMatchObject({ code: "CANVAS_STOPPING" });
			const afterRace = (await (await fetch(`${canvas.base}/health`)).json()) as {
				held_boards?: unknown[];
			};
			expect(afterRace.held_boards).toEqual([]);
			blocker.end(blockerBody.slice(-1));
			expect(await blockerResponse).toBe(200);
			await closing;
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
