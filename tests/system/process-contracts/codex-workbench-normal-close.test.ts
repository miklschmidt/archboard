import { seedCanonicalFixture } from "../support/canonical-fixture.ts";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseDynamicToolCallResponse } from "@archboard/workbench/runtime";
import { waitFor } from "../server-state/support/http.ts";
import { processExists } from "../support/owned-server.ts";
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
			const { server, childPid, fixture, request, socket } = await startLinkedWorkbench(
				resources,
				"normal-close",
				terminalSource(resources),
			);
			const effectsBefore = mutationCount(fixture.logPath);
			writeFileSync(fixture.controlPath, JSON.stringify({ emit: "shutdown", holdClientRpc: true }));
			await waitFor(async () => {
				const state = snapshot(await socket.request("snapshot"));
				return (state["approvals"] as unknown[]).length === 1 &&
					(state["dynamicApprovals"] as unknown[]).length === 1
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
			const seeded = seedCanonicalFixture(server.vault);

			const blockerBody = JSON.stringify({ version: 1, kind: "platform" });
			const blocker = httpRequest(`${server.base}/api/settings/opener`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(blockerBody),
					Origin: server.base,
					"Sec-Fetch-Site": "same-origin",
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
				const response = await fetch(`${server.base}/health`);
				const health = (await response.json()) as { application?: { activeWrites?: unknown } };
				return health.application?.activeWrites === 1 ? true : undefined;
			}, "admitted opener write awaiting its request body");

			// The partial admitted request holds the drain before browser cleanup.
			// The later request would conflict with the foreign note if it crossed
			// admission, so accepting it here could create a process-only hold.
			const closing = server.normalClose();
			await waitFor(async () => {
				try {
					const response = await fetch(`${server.base}/health`);
					if (!response.ok) {
						return undefined;
					}
					const health = (await response.json()) as {
						application?: { acceptingWrites?: unknown };
					};
					return health.application?.acceptingWrites === false ? true : undefined;
				} catch {
					return undefined;
				}
			}, "shutdown write quiesce");
			// A write arriving after admission closed is refused rather than queued,
			// and it is told why: the server is on its way down.
			const raced = await fetch(
				`${server.base}/api/architecture/module?vault=${encodeURIComponent(server.vault)}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						target: { model: "Fixture", state: "Now" },
						expectedRevision: seeded.revision,
						operationId: "late",
						writer: "agent",
						doing: "A late architecture write",
						claim: "NoClaim",
						changes: [{ type: "add-module", module: { name: "Late", kind: "service", order: 0 } }],
					}),
				},
			);
			expect(raced.status).toBe(503);
			expect(await raced.json()).toMatchObject({ code: "SERVER_STOPPING" });
			await waitFor(async () => {
				const response = await fetch(`${server.base}/health`);
				if (!response.ok) {
					return undefined;
				}
				const health = (await response.json()) as {
					application?: {
						phase?: unknown;
						acceptingWrites?: unknown;
						activeMutations?: Array<{ name?: unknown; kind?: unknown }>;
					};
				};
				return health.application?.phase === "running" &&
					health.application.acceptingWrites === true &&
					health.application.activeMutations?.some(
						(entry) => entry.name === "PUT /api/settings/opener" && entry.kind === "request",
					)
					? true
					: undefined;
			}, "bounded opener-body refusal restored the live server");
			blocker.end(blockerBody.slice(-1));
			expect(await blockerResponse).toBe(200);

			// The board came through the whole close untouched: the writes that
			// landed stand, and the one that arrived too late changed nothing.
			const afterRace = await request("/api/architecture/model");
			expect(afterRace.body).toMatchObject({ success: true, revision: seeded.revision });

			const retryClose = server.normalClose();
			await Promise.all([closing, retryClose]);
			await held;
			expect(processExists(server.pid)).toBeFalse();
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
