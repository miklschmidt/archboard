import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseDynamicToolCallResponse } from "../../../src/runtime/codex-thread-tools/index.ts";
import { waitFor } from "../canvas-state/support/http.ts";
import { processExists } from "../support/owned-canvas.ts";
import {
	approveOrdinary,
	records,
	resolveDynamic,
	reverseResponses,
	snapshot,
	target,
} from "./support/codex-workbench-lifecycle.ts";
import { mutationCount, startLinkedWorkbench } from "./support/codex-workbench-process-harness.ts";
import { extendTerminalFixture } from "./support/codex-workbench-terminal-controls.ts";

function terminalSource(resources: AsyncDisposableStack): string {
	const root = mkdtempSync(join(tmpdir(), "archboard-reload-ownership-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	return extendTerminalFixture(root);
}

describe.serial("composed Codex reload ownership", () => {
	test("keeps one owner set while a client RPC and every reverse owner cross a true reload", async () => {
		const resources = new AsyncDisposableStack();
		try {
			const { canvas, childPid, fixture, link, request, socket } = await startLinkedWorkbench(
				resources,
				"reload-ownership",
				terminalSource(resources),
			);
			const queueBeforeLease = await socket.request("claimLease");
			expect(
				await socket.request("command", {
					command: {
						kind: "browser_command",
						command: "queueAdd",
						...target(queueBeforeLease),
						prompt: "Queue before reload",
					},
				}),
			).toMatchObject({ ok: true, value: { outcome: "delivered" } });

			writeFileSync(fixture.controlPath, JSON.stringify({ emit: "ownership_before" }));
			const before = await waitFor(async () => {
				const state = snapshot(await socket.request("snapshot"));
				const ordinary = state.approvals as Record<string, unknown>[];
				const dynamic = state.dynamicApprovals as Record<string, unknown>[];
				return ordinary.length === 1 && dynamic.length === 1
					? { dynamic: dynamic[0]!, state }
					: undefined;
			}, "pre-reload broker and gate ownership");
			if (before === undefined) throw new Error("The pre-reload authorities disappeared.");
			await waitFor(
				() =>
					reverseResponses(fixture.logPath, "ownership-before-coordinator").length === 1
						? true
						: undefined,
				"pre-reload coordinator owner",
			);
			expect((before.state.queue as { readonly entries?: unknown[] }).entries).toHaveLength(1);

			writeFileSync(fixture.controlPath, JSON.stringify({ holdClientRpc: true }));
			const heldAccountRead = socket.request("accountRead");
			await waitFor(
				() =>
					records(fixture.logPath).some(
						(entry) =>
							entry.kind === "held_client_rpc" &&
							(entry as { readonly state?: unknown }).state === "pending",
					)
						? true
						: undefined,
				"held outgoing client RPC",
			);
			const spawnCount = records(fixture.logPath).filter(
				(entry) => entry.kind === "app_server_spawn",
			).length;
			const effectsBeforeReload = mutationCount(fixture.logPath);
			const reload = await request("/api/reload", { method: "POST", doing: false });
			expect(reload.status).toBe(200);
			const generation = (reload.body as { readonly generation?: unknown }).generation;
			writeFileSync(fixture.controlPath, JSON.stringify({ emit: "release_client_rpc" }));
			await waitFor(
				() =>
					canvas.output().includes(`canvas reload ${String(generation)} cost nothing`)
						? true
						: undefined,
				"true reload completion",
			);
			expect(await heldAccountRead).toMatchObject({
				ok: true,
				value: {
					kind: "account_read",
					outcome: "delivered",
					code: null,
					message: null,
				},
			});
			let replacementResult: Awaited<ReturnType<typeof socket.request>> | undefined;
			await waitFor(async () => {
				replacementResult = await socket.request("connect");
				return replacementResult.ok ? replacementResult : undefined;
			}, "replacement browser listener").catch((error: unknown) => {
				throw new Error(
					`Replacement failed: ${JSON.stringify(replacementResult)}\n${canvas.output()}`,
					{ cause: error },
				);
			});
			expect(await socket.request("snapshot")).toMatchObject({ ok: true });
			const attachLease = await socket.request("claimLease");
			expect(
				await socket.request("command", {
					command: {
						kind: "browser_command",
						command: "threadLinkAttach",
						...target(attachLease),
						threadId: link.threadId,
					},
				}),
			).toMatchObject({ ok: true, value: { outcome: "delivered" } });
			expect(
				records(fixture.logPath).filter((entry) => entry.kind === "app_server_spawn"),
			).toHaveLength(spawnCount);
			expect(processExists(childPid)).toBeTrue();

			for (const id of ["ownership-before-ordinary", "ownership-before-dynamic"])
				await waitFor(
					() => (reverseResponses(fixture.logPath, id).length === 1 ? true : undefined),
					`${id} reload settlement`,
				);
			expect(reverseResponses(fixture.logPath, "ownership-before-ordinary")[0]?.frame).toEqual({
				id: "ownership-before-ordinary",
				result: { decision: "cancel" },
			});
			const terminalDynamic = parseDynamicToolCallResponse(
				"create_thread",
				reverseResponses(fixture.logPath, "ownership-before-dynamic")[0]?.frame?.result,
			).envelope;
			expect(terminalDynamic.tag).toBe("approval_required");
			expect(await resolveDynamic(socket, before.dynamic)).toMatchObject({
				ok: true,
				value: { outcome: "not_delivered", code: "dynamic_approval_not_pending" },
			});
			expect(reverseResponses(fixture.logPath, "ownership-before-wait")).toHaveLength(0);
			writeFileSync(fixture.controlPath, JSON.stringify({ emit: "complete_target" }));
			await waitFor(
				() =>
					reverseResponses(fixture.logPath, "ownership-before-wait").length === 1
						? true
						: undefined,
				"retained wait owner",
			);
			expect(
				parseDynamicToolCallResponse(
					"wait_threads",
					reverseResponses(fixture.logPath, "ownership-before-wait")[0]?.frame?.result,
				).envelope.tag,
			).toBe("ok");
			expect(mutationCount(fixture.logPath)).toBe(effectsBeforeReload);

			writeFileSync(fixture.controlPath, JSON.stringify({ emit: "ownership_after" }));
			const after = await waitFor(async () => {
				const state = snapshot(await socket.request("snapshot"));
				const ordinary = state.approvals as Record<string, unknown>[];
				const dynamic = state.dynamicApprovals as Record<string, unknown>[];
				return ordinary.length === 1 && dynamic.length === 1
					? { ordinary: ordinary[0]!, dynamic: dynamic[0]!, state }
					: undefined;
			}, "post-reload broker and gate ownership");
			if (after === undefined) throw new Error("The post-reload authorities disappeared.");
			expect(await approveOrdinary(socket, after.ordinary)).toMatchObject({
				ok: true,
				value: { outcome: "delivered" },
			});
			expect(await resolveDynamic(socket, after.dynamic)).toMatchObject({
				ok: true,
				value: { outcome: "delivered" },
			});
			writeFileSync(fixture.controlPath, JSON.stringify({ emit: "complete_target" }));
			for (const id of [
				"ownership-after-ordinary",
				"ownership-after-dynamic",
				"ownership-after-wait",
				"ownership-after-coordinator",
			])
				await waitFor(
					() => (reverseResponses(fixture.logPath, id).length === 1 ? true : undefined),
					`${id} single owner response`,
				);
			for (const id of [
				"ownership-before-ordinary",
				"ownership-before-dynamic",
				"ownership-before-wait",
				"ownership-before-coordinator",
				"ownership-after-ordinary",
				"ownership-after-dynamic",
				"ownership-after-wait",
				"ownership-after-coordinator",
			])
				expect(reverseResponses(fixture.logPath, id), id).toHaveLength(1);
			expect(
				records(fixture.logPath).filter((entry) => entry.kind === "queue_effect"),
			).toHaveLength(1);
			expect(mutationCount(fixture.logPath)).toBe(effectsBeforeReload + 1);
		} finally {
			await resources.disposeAsync();
		}
	}, 50_000);
});
