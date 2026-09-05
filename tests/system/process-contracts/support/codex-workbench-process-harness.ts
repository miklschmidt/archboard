import { expect } from "bun:test";

import {
	openApplicationSocket,
	prepareProductionFixture,
} from "../../canvas-state/support/codex-production.ts";
import { createRequester, waitFor } from "../../canvas-state/support/http.ts";
import {
	approveOrdinary,
	pane,
	records,
	resolveDynamic,
	reverseResponses,
	snapshot,
	startCanvas,
	target,
} from "./codex-workbench-lifecycle.ts";

async function startLinkedWorkbench(
	resources: AsyncDisposableStack,
	label: string,
	executableSource: string,
) {
	const fixture = prepareProductionFixture(resources, executableSource);
	const canvas = await startCanvas(fixture);
	resources.defer(() => canvas.dispose());
	const clientId = `process-${label}`;
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
	const link = snapshot(await socket.request("snapshot"))["threadLink"] as Record<string, unknown>;
	const startLease = await socket.request("claimLease");
	expect(
		await socket.request("command", {
			command: {
				kind: "browser_command",
				command: "start",
				...target(startLease),
				threadId: link["threadId"],
				prompt: `Prepare the ${label} process owner.`,
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
	const childPid = records(fixture.logPath).find((entry) => entry.kind === "app_server_spawn")?.pid;
	if (childPid === undefined) {
		throw new Error(`${label} child did not start.`);
	}
	return { canvas, childPid, fixture, link, request, socket };
}

function mutationCount(logPath: string): number {
	return records(logPath).filter(
		(entry) => entry.kind === "frame" && entry.method === "thread/start",
	).length;
}

export { startLinkedWorkbench, mutationCount };
