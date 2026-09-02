import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parseDynamicToolCallResponse } from "../../../src/runtime/codex-thread-tools/index.ts";
import {
	openApplicationSocket,
	prepareProductionFixture,
} from "../canvas-state/support/codex-production.ts";
import { createRequester, waitFor } from "../canvas-state/support/http.ts";
import { processExists } from "../support/owned-canvas.ts";
import {
	approveOrdinary,
	extendFixture,
	pane,
	records,
	resolveDynamic,
	reverseResponses,
	snapshot,
	startCanvas,
	target,
} from "./support/codex-workbench-lifecycle.ts";

async function pendingShutdownBatch(
	resources: AsyncDisposableStack,
	label: string,
	emitShutdownBatch = true,
) {
	const staging = join(
		process.env.TMPDIR ?? "/tmp",
		`archboard-process-termination-${process.pid}-${label}`,
	);
	rmSync(staging, { recursive: true, force: true });
	mkdirSync(staging, { recursive: true });
	resources.defer(() => rmSync(staging, { recursive: true, force: true }));
	const fixture = prepareProductionFixture(resources, extendFixture(staging));
	const canvas = await startCanvas(fixture);
	resources.defer(() => canvas.dispose());
	const clientId = `termination-${label}`;
	const socket = await openApplicationSocket(canvas.base, clientId);
	resources.defer(() => socket.close());
	const request = createRequester({ base: canvas.base, assertRunning: async () => undefined });
	expect(
		(
			await request("/api/panes", {
				method: "POST",
				doing: false,
				body: { ...pane(clientId), paneId: `${clientId}-pane` },
			})
		).status,
	).toBe(200);
	await waitFor(async () => {
		const result = await socket.request("connect");
		return result.ok ? result : undefined;
	}, `${label} workbench connection`);
	const createLease = await socket.request("claimLease");
	expect(
		await socket.request("command", {
			command: { kind: "browser_command", command: "threadLinkCreate", ...target(createLease) },
		}),
	).toMatchObject({ ok: true, value: { outcome: "delivered" } });
	const link = snapshot(await socket.request("snapshot")).threadLink as Record<string, unknown>;
	const startLease = await socket.request("claimLease");
	expect(
		await socket.request("command", {
			command: {
				kind: "browser_command",
				command: "start",
				...target(startLease),
				threadId: link.threadId,
				prompt: "Prepare pending shutdown work.",
			},
		}),
	).toMatchObject({ ok: true, value: { outcome: "delivered" } });
	const initial = await waitFor(async () => {
		const state = snapshot(await socket.request("snapshot"));
		const approvals = state.approvals as Record<string, unknown>[];
		const dynamic = state.dynamicApprovals as Record<string, unknown>[];
		return approvals.length === 7 && dynamic.length === 1 ? { approvals, dynamic } : undefined;
	}, `${label} initial approvals`);
	if (initial === undefined) throw new Error(`${label} initial approvals did not remain pending.`);
	for (const approval of initial.approvals) await approveOrdinary(socket, approval);
	await resolveDynamic(socket, initial.dynamic[0]!);
	await waitFor(
		() => (reverseResponses(fixture.logPath, "dynamic-request-1").length === 1 ? true : undefined),
		`${label} initial mutation`,
	);
	if (emitShutdownBatch) {
		writeFileSync(fixture.controlPath, JSON.stringify({ emit: "shutdown" }));
		await waitFor(async () => {
			const state = snapshot(await socket.request("snapshot"));
			return (state.approvals as unknown[]).length === 1 &&
				(state.dynamicApprovals as unknown[]).length === 1
				? state
				: undefined;
		}, `${label} pending shutdown batch`);
	}
	const childPid = records(fixture.logPath).find((entry) => entry.kind === "app_server_spawn")?.pid;
	if (childPid === undefined) throw new Error("The pending-shutdown child did not start.");
	return { canvas, childPid, fixture, socket };
}

describe.serial("composed Codex terminal process lifecycle", () => {
	test("SIGINT and SIGTERM settle pending request classes before child teardown", async () => {
		for (const signal of ["SIGINT", "SIGTERM"] as const) {
			const resources = new AsyncDisposableStack();
			try {
				const { canvas, childPid, fixture } = await pendingShutdownBatch(resources, signal);
				const mutationCount = records(fixture.logPath).filter(
					(entry) => entry.kind === "frame" && entry.method === "thread/start",
				).length;
				await canvas.dispose(signal);
				expect(processExists(canvas.pid), signal).toBeFalse();
				expect(processExists(childPid), signal).toBeFalse();
				for (const id of ["shutdown-ordinary", "shutdown-dynamic", "shutdown-wait"])
					expect(reverseResponses(fixture.logPath, id), `${signal}:${id}`).toHaveLength(1);
				expect(reverseResponses(fixture.logPath, "shutdown-ordinary")[0]?.frame).toEqual({
					id: "shutdown-ordinary",
					result: { decision: "cancel" },
				});
				const dynamic = parseDynamicToolCallResponse(
					"create_thread",
					reverseResponses(fixture.logPath, "shutdown-dynamic")[0]?.frame?.result,
				).envelope;
				if (dynamic.tag !== "approval_required")
					throw new Error(`${signal} did not terminalize the dynamic approval safely.`);
				expect(dynamic.summary).toBe("Create thread: This authority must end at shutdown.");
				expect(reverseResponses(fixture.logPath, "shutdown-wait")[0]?.frame).toEqual({
					id: "shutdown-wait",
					error: { code: -32603, message: "Codex transport is shutting down." },
				});
				expect(
					records(fixture.logPath).filter(
						(entry) => entry.kind === "frame" && entry.method === "thread/start",
					).length,
				).toBe(mutationCount);
				const terminalLog = readFileSync(fixture.logPath, "utf8");
				await canvas.dispose(signal);
				expect(readFileSync(fixture.logPath, "utf8")).toBe(terminalLog);
			} finally {
				await resources.disposeAsync();
			}
		}
	}, 40_000);

	test("expires one pending visual mutation at the authored process deadline", async () => {
		const resources = new AsyncDisposableStack();
		try {
			const { fixture, socket } = await pendingShutdownBatch(resources, "expiry", false);
			const mutationCount = records(fixture.logPath).filter(
				(entry) => entry.kind === "frame" && entry.method === "thread/start",
			).length;
			writeFileSync(fixture.controlPath, JSON.stringify({ emit: "decline" }));
			const approval = await waitFor(async () => {
				const dynamic = snapshot(await socket.request("snapshot")).dynamicApprovals as Record<
					string,
					unknown
				>[];
				return dynamic.length === 1 ? dynamic[0] : undefined;
			}, "expiring process approval");
			if (approval === undefined) throw new Error("The expiring approval did not remain pending.");
			expect(Number(approval.expiresAtMs) - Number(approval.createdAtMs)).toBe(90_000);
			await waitFor(
				() =>
					reverseResponses(fixture.logPath, "general-decline").length === 1 ? true : undefined,
				"the authored visual approval deadline",
				{ timeoutMs: 95_000 },
			);
			expect(
				parseDynamicToolCallResponse(
					"create_thread",
					reverseResponses(fixture.logPath, "general-decline")[0]?.frame?.result,
				).envelope,
			).toEqual({
				tag: "refused",
				reason: "expired",
				message: "The visual approval expired before the effect could run.",
			});
			expect(reverseResponses(fixture.logPath, "general-decline")).toHaveLength(1);
			expect(
				records(fixture.logPath).filter(
					(entry) => entry.kind === "frame" && entry.method === "thread/start",
				).length,
			).toBe(mutationCount);
		} finally {
			await resources.disposeAsync();
		}
	}, 105_000);
});
