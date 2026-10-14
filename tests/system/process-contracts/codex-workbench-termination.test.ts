import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parseDynamicToolCallResponse } from "../../../src/runtime/codex-thread-tools/index.ts";
import {
	openApplicationSocket,
	prepareProductionFixture,
} from "../server-state/support/codex-production.ts";
import { createRequester, waitFor } from "../server-state/support/http.ts";
import { processExists } from "../support/owned-server.ts";
import {
	approveOrdinary,
	extendFixture,
	pane,
	records,
	resolveDynamic,
	reverseResponses,
	snapshot,
	startServer,
	target,
} from "./support/codex-workbench-lifecycle.ts";

async function pendingShutdownBatch(resources: AsyncDisposableStack, label: string) {
	const staging = join(
		process.env["TMPDIR"] ?? "/tmp",
		`archboard-process-termination-${process.pid}-${label}`,
	);
	rmSync(staging, { recursive: true, force: true });
	mkdirSync(staging, { recursive: true });
	resources.defer(() => rmSync(staging, { recursive: true, force: true }));
	const fixture = prepareProductionFixture(resources, extendFixture(staging));
	// Observe the child's consumption and natural closure, rather than inferring
	// either from the parent's completed stdin writes or a vanished pid.
	writeFileSync(
		fixture.executablePath,
		String.raw`
process.stdin.once("end", () => record({ kind: "stdin_eof" }));
process.once("SIGTERM", () => {
	record({ kind: "termination_signal" });
	process.exit(143);
});
process.once("exit", (code) => record({ kind: "process_exit", code }));
`,
		{ flag: "a" },
	);
	const server = await startServer(fixture);
	resources.defer(() => server.dispose());
	const clientId = `termination-${label}`;
	const socket = await openApplicationSocket(server.base, clientId);
	resources.defer(() => socket.close());
	const request = createRequester({
		base: server.base,
		assertRunning: async () => undefined,
		vault: server.vault,
	});
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
	const link = snapshot(await socket.request("snapshot"))["threadLink"] as Record<string, unknown>;
	const startLease = await socket.request("claimLease");
	expect(
		await socket.request("command", {
			command: {
				kind: "browser_command",
				command: "start",
				...target(startLease),
				threadId: link["threadId"],
				prompt: "Prepare pending shutdown work.",
			},
		}),
	).toMatchObject({ ok: true, value: { outcome: "delivered" } });
	const initial = await waitFor(async () => {
		const state = snapshot(await socket.request("snapshot"));
		const approvals = state["approvals"] as Record<string, unknown>[];
		const dynamic = state["dynamicApprovals"] as Record<string, unknown>[];
		return approvals.length === 7 && dynamic.length === 1 ? { approvals, dynamic } : undefined;
	}, `${label} initial approvals`);
	if (initial === undefined) {
		throw new Error(`${label} initial approvals did not remain pending.`);
	}
	for (const approval of initial.approvals) {
		await approveOrdinary(socket, approval);
	}
	await resolveDynamic(socket, initial.dynamic[0]!);
	await waitFor(
		() => (reverseResponses(fixture.logPath, "dynamic-request-1").length === 1 ? true : undefined),
		`${label} initial mutation`,
	);
	writeFileSync(fixture.controlPath, JSON.stringify({ emit: "shutdown" }));
	await waitFor(async () => {
		const state = snapshot(await socket.request("snapshot"));
		return (state["approvals"] as unknown[]).length === 1 &&
			(state["dynamicApprovals"] as unknown[]).length === 1
			? state
			: undefined;
	}, `${label} pending shutdown batch`);
	const childPid = records(fixture.logPath).find((entry) => entry.kind === "app_server_spawn")?.pid;
	if (childPid === undefined) {
		throw new Error("The pending-shutdown child did not start.");
	}
	return { server, childPid, fixture, socket };
}

describe.serial("composed Codex terminal process lifecycle", () => {
	test("SIGINT and SIGTERM settle pending request classes before child teardown", async () => {
		for (const signal of ["SIGINT", "SIGTERM"] as const) {
			const resources = new AsyncDisposableStack();
			try {
				const { server, childPid, fixture } = await pendingShutdownBatch(resources, signal);
				const mutationCount = records(fixture.logPath).filter(
					(entry) => entry.kind === "frame" && entry.method === "thread/start",
				).length;
				await server.dispose(signal);
				expect(processExists(server.pid), signal).toBeFalse();
				expect(processExists(childPid), signal).toBeFalse();
				for (const id of ["shutdown-ordinary", "shutdown-dynamic", "shutdown-wait"]) {
					expect(reverseResponses(fixture.logPath, id), `${signal}:${id}`).toHaveLength(1);
				}
				const childEvents = records(fixture.logPath);
				const eofIndex = childEvents.findIndex((entry) => entry.kind === "stdin_eof");
				expect(eofIndex, signal).toBeGreaterThanOrEqual(0);
				for (const id of ["shutdown-ordinary", "shutdown-dynamic", "shutdown-wait"]) {
					const consumedIndex = childEvents.findIndex(
						(entry) => entry.kind === "reverse_response" && entry.frame?.id === id,
					);
					expect(consumedIndex, `${signal}:${id}:before-EOF`).toBeLessThan(eofIndex);
				}
				expect(
					childEvents.filter((entry) => entry.kind === "termination_signal"),
					signal,
				).toEqual([]);
				expect(
					childEvents.filter((entry) => entry.kind === "process_exit"),
					signal,
				).toEqual([{ kind: "process_exit", code: 0 }]);
				expect(
					childEvents.filter((entry) => entry.kind === "app_server_spawn"),
					signal,
				).toHaveLength(1);
				expect(reverseResponses(fixture.logPath, "shutdown-ordinary")[0]?.frame).toEqual({
					id: "shutdown-ordinary",
					result: { decision: "cancel" },
				});
				const dynamic = parseDynamicToolCallResponse(
					"create_thread",
					reverseResponses(fixture.logPath, "shutdown-dynamic")[0]?.frame?.result,
				).envelope;
				if (dynamic.tag !== "approval_required") {
					throw new Error(`${signal} did not terminalize the dynamic approval safely.`);
				}
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
				await server.dispose(signal);
				expect(readFileSync(fixture.logPath, "utf8")).toBe(terminalLog);
			} finally {
				await resources.disposeAsync();
			}
		}
	}, 40_000);
});
