import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { processExists, startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	openApplicationSocket,
	prepareProductionFixture,
	type WorkbenchResult,
} from "./support/codex-production.ts";
import { createRequester, waitFor } from "./support/http.ts";

const serverPath = join(import.meta.dir, "fixtures/codex-production-server.ts");
const executableSource = join(import.meta.dir, "fixtures/fake-codex-production.ts");

interface FixtureRecord {
	readonly kind?: string;
	readonly id?: string;
	readonly method?: string;
	readonly pid?: number;
	readonly params?: Record<string, unknown>;
	readonly frame?: { readonly id?: unknown; readonly result?: unknown; readonly error?: unknown };
}

const records = (path: string): FixtureRecord[] => {
	const contents = readFileSync(path, "utf8");
	const lines = contents.split("\n");
	if (!contents.endsWith("\n")) lines.pop();
	return lines.filter(Boolean).map((line) => JSON.parse(line) as FixtureRecord);
};

const snapshots = (result: WorkbenchResult): Record<string, unknown> => {
	if (!result.ok) throw new Error(result.error ?? "The workbench snapshot failed.");
	const message = result.value as { readonly snapshot?: Record<string, unknown> } | undefined;
	if (message?.snapshot === undefined) throw new Error("The workbench returned no snapshot.");
	return message.snapshot;
};

const leaseTarget = (result: WorkbenchResult): Record<string, unknown> => {
	if (!result.ok || result.value === undefined)
		throw new Error(result.error ?? "The workbench lease failed.");
	return {
		commandId: result.value.commandId,
		paneId: result.value.paneId,
		childId: result.value.childId,
		epoch: result.value.epoch,
	};
};

const pane = (clientId: string, paneId: string, focused: boolean, primary: boolean) => ({
	clientId,
	paneId,
	primary,
	focused,
	elementCount: 0,
	board: "scratch",
	rect: { x: focused ? 640 : 0, y: 0, width: 640, height: 800 },
	viewport: { x: 0, y: 0, width: 640, height: 800, zoom: 1 },
});

describe.serial("actual production Codex composition", () => {
	test("src/server.ts crosses every browser, protocol, semantic, approval, and cleanup seam", async () => {
		const resources = new AsyncDisposableStack();
		try {
			const fixture = prepareProductionFixture(resources, executableSource);
			const { controlPath, executablePath, logPath, root, vault } = fixture;
			let canvas: Awaited<ReturnType<typeof startOwnedCanvas>>;
			try {
				canvas = await startOwnedCanvas({
					serverPath,
					vault,
					env: {
						ARCHBOARD_TEST_CODEX_EXECUTABLE: executablePath,
						ARCHBOARD_TEST_CODEX_LOG: logPath,
						ARCHBOARD_TEST_CODEX_CONTROL: controlPath,
						ARCHBOARD_SETTLE_MS: "20",
						XDG_STATE_HOME: join(root, "state"),
					},
				});
			} catch (error) {
				throw new Error(
					`Production canvas startup failed.\nControlled app-server log:\n${readFileSync(logPath, "utf8")}`,
					{ cause: error },
				);
			}
			resources.defer(() => canvas.dispose());
			const request = createRequester(canvas);
			const removedStatus = await request("/api/injection");
			const unknownStatus = await request("/api/unknown-route-contract");
			expect(removedStatus.status).toBe(404);
			expect(removedStatus.text.replace("/api/injection", "<path>")).toBe(
				unknownStatus.text.replace("/api/unknown-route-contract", "<path>"),
			);
			const removedProbe = await request("/api/injection/test", {
				method: "POST",
				doing: false,
				body: { note: "legacy probe", loud: true },
			});
			const unknownProbe = await request("/api/unknown-route-contract", {
				method: "POST",
				doing: false,
				body: { note: "ordinary unknown route" },
			});
			expect(removedProbe.status).toBe(404);
			expect(removedProbe.text.replace("/api/injection/test", "<path>")).toBe(
				unknownProbe.text.replace("/api/unknown-route-contract", "<path>"),
			);
			const first = await openApplicationSocket(canvas.base, "bound-client");
			resources.defer(() => first.close());
			const focused = await openApplicationSocket(canvas.base, "focused-client");
			resources.defer(() => focused.close());
			const boundPane = await request("/api/panes", {
				method: "POST",
				doing: false,
				body: pane("bound-client", "bound-pane", false, true),
			});
			expect(boundPane.status).toBe(200);
			const focusedPane = await request("/api/panes", {
				method: "POST",
				doing: false,
				body: pane("focused-client", "focused-pane", true, false),
			});
			expect(focusedPane.status).toBe(200);

			expect(await first.request("connect")).toMatchObject({ ok: true });
			expect(await first.request("claimLease")).toMatchObject({ ok: true });
			const current = await openApplicationSocket(canvas.base, "bound-client");
			resources.defer(() => current.close());
			await first.close();
			expect(await current.request("connect")).toMatchObject({ ok: true });

			const initialLease = await current.request("claimLease");
			expect(initialLease).toMatchObject({ ok: true });
			expect(await current.request("releaseLease")).toMatchObject({ ok: true });
			const createLease = await current.request("claimLease");
			const created = await current.request("command", {
				command: {
					kind: "browser_command",
					command: "threadLinkCreate",
					...leaseTarget(createLease),
				},
			});
			expect(created).toMatchObject({ ok: true, value: { outcome: "delivered" } });

			const linked = snapshots(await current.request("snapshot"));
			const threadLink = linked.threadLink as Record<string, unknown>;
			expect(threadLink).toMatchObject({ state: "executable" });
			expect(typeof threadLink.threadId).toBe("string");
			expect(linked.coordinator).toMatchObject({ state: "ready" });
			expect(typeof (linked.coordinator as Record<string, unknown>).threadId).toBe("string");

			expect(await current.request("mediaReady", { ready: true })).toMatchObject({ ok: true });
			expect(snapshots(await current.request("snapshot")).voice).toMatchObject({ state: "ready" });
			expect(await current.request("mediaReady", { ready: false })).toMatchObject({ ok: true });
			expect(snapshots(await current.request("snapshot")).voice).toMatchObject({
				state: "unavailable",
				reason: "Browser audio is unavailable for this socket.",
			});

			const seeded = await request<{ element: Record<string, unknown> }>(
				"/api/elements?board=scratch",
				{
					method: "POST",
					doing: "seeding the production semantic proof",
					body: { type: "rectangle", x: 0, y: 0, width: 100, height: 60 },
				},
			);
			expect(seeded.status).toBe(200);
			const changed = await request("/api/elements/changes?board=scratch", {
				method: "POST",
				doing: false,
				body: {
					upserts: [{ ...seeded.body.element, x: 120 }],
					deletes: [],
					origin: "human",
					clientId: "bound-client",
				},
			});
			expect(changed.status).toBe(200);
			const settled = await request<Record<string, unknown>>("/api/changes?board=scratch&since=0");
			expect(settled.status).toBe(200);
			expect("injection" in settled.body).toBeFalse();

			const startLease = await current.request("claimLease");
			const started = await current.request("command", {
				command: {
					kind: "browser_command",
					command: "start",
					...leaseTarget(startLease),
					threadId: threadLink.threadId,
					prompt: "Exercise both production reverse-request owners.",
				},
			});
			expect(started).toMatchObject({ ok: true, value: { outcome: "delivered" } });
			const semanticStart = records(logPath).find(
				(entry) =>
					entry.kind === "frame" &&
					entry.method === "turn/start" &&
					entry.params?.threadId === "thread-2",
			);
			if (semanticStart === undefined) throw new Error("The semantic turn/start was not logged.");
			const additionalContext = semanticStart.params?.additionalContext as {
				readonly archboard?: { readonly value?: unknown };
			};
			const archboardContext = JSON.parse(String(additionalContext.archboard?.value)) as {
				readonly paneId: string;
				readonly focus: { readonly paneId: string | null };
				readonly semantic: { readonly brief: string };
			};
			const semanticBrief = JSON.parse(archboardContext.semantic.brief) as {
				readonly pane: { readonly paneId: string; readonly focused: boolean };
			};
			expect(archboardContext.paneId).toBe("bound-pane");
			expect(archboardContext.focus.paneId).toBeNull();
			expect(semanticBrief.pane).toEqual({ paneId: "bound-pane", focused: false });

			const followup = await request("/api/elements/changes?board=scratch", {
				method: "POST",
				doing: false,
				body: {
					upserts: [{ ...seeded.body.element, x: 180 }],
					deletes: [],
					origin: "human",
					clientId: "bound-client",
				},
			});
			expect(followup.status).toBe(200);
			await request("/api/changes?board=scratch&since=1");
			const semanticState = await waitFor(async () => {
				const snapshot = snapshots(await current!.request("snapshot"));
				return snapshot.semantic as Record<string, unknown> | null;
			}, "the linked workhorse semantic outcome");
			expect(semanticState).toMatchObject({
				kind: "semantic_delivery",
				threadId: threadLink.threadId,
				delivery: "delivered",
				reason: null,
			});
			const semanticDelivery = records(logPath).find(
				(entry) => entry.kind === "semantic_injection",
			);
			if (semanticDelivery === undefined) throw new Error("The semantic delivery was not logged.");
			expect(semanticDelivery.params).toMatchObject({
				threadId: semanticStart.params?.threadId,
				items: [
					{
						type: "message",
						role: "developer",
						content: [{ type: "input_text" }],
					},
				],
			});
			expect(records(logPath).filter((entry) => entry.kind === "semantic_injection")).toHaveLength(
				1,
			);
			const agentOnly = await request("/api/elements/changes?board=scratch", {
				method: "POST",
				doing: "moving the box through the agent write boundary",
				body: {
					upserts: [{ ...seeded.body.element, x: 220 }],
					deletes: [],
					origin: "agent",
				},
			});
			expect(agentOnly.status).toBe(200);
			await request("/api/changes?board=scratch&since=2");
			expect(records(logPath).filter((entry) => entry.kind === "semantic_injection")).toHaveLength(
				1,
			);

			const pending = await waitFor(async () => {
				const snapshot = snapshots(await current!.request("snapshot"));
				const approvals = snapshot.approvals as Record<string, unknown>[];
				const dynamicApprovals = snapshot.dynamicApprovals as Record<string, unknown>[];
				return approvals.length === 1 && dynamicApprovals.length === 1
					? { approvals, dynamicApprovals }
					: undefined;
			}, "both production approval owners to publish through the gateway").catch((error) => {
				throw new Error(`Approval publication failed.\n${readFileSync(logPath, "utf8")}`, {
					cause: error,
				});
			});
			if (pending === undefined) throw new Error("The approval projection disappeared.");
			const ordinary = pending.approvals[0]!;
			const ordinaryLease = await current.request("claimLease");
			const ordinaryCommand = {
				kind: "browser_command",
				command: "approvalRespond",
				...leaseTarget(ordinaryLease),
				requestId: ordinary.requestId,
				approvalId: ordinary.approvalId,
				response: { approvalKind: "command_execution", decision: "accept" },
			};
			const ordinaryFirst = await current.request("command", { command: ordinaryCommand });
			const ordinaryDuplicate = await current.request("command", { command: ordinaryCommand });
			expect(ordinaryFirst.value).toEqual(ordinaryDuplicate.value);

			const dynamicLease = await current.request("claimLease");
			const rebound = snapshots(await current.request("snapshot"));
			const dynamic = (rebound.dynamicApprovals as Record<string, unknown>[])[0]!;
			const binding = dynamic.binding as Record<string, unknown>;
			expect(binding.commandId).toBe(dynamicLease.value?.commandId);
			const dynamicResult = await current.request("command", {
				command: {
					kind: "browser_command",
					command: "dynamicApprovalRespond",
					...leaseTarget(dynamicLease),
					capturedLink: binding.capturedLink,
					identity: dynamic.identity,
					effectHash: dynamic.effectHash,
					decision: "approve",
				},
			});
			expect(dynamicResult).toMatchObject({ ok: true, value: { outcome: "delivered" } });

			await waitFor(
				() =>
					records(logPath).filter(
						(entry) =>
							entry.kind === "reverse_response" &&
							(entry.frame?.id === "ordinary-request-1" || entry.frame?.id === "dynamic-request-1"),
					).length === 2,
				"both real reverse responses",
			);
			const reverse = records(logPath).filter((entry) => entry.kind === "reverse_response");
			expect(reverse.filter((entry) => entry.frame?.id === "ordinary-request-1")).toHaveLength(1);
			expect(reverse.filter((entry) => entry.frame?.id === "dynamic-request-1")).toHaveLength(1);
			const startedThreads = records(logPath).filter(
				(entry) => entry.kind === "frame" && entry.method === "thread/start",
			);
			if (startedThreads.length !== 3)
				throw new Error(
					`The approved dynamic create did not start its thread.\n${readFileSync(logPath, "utf8")}`,
				);

			const childPid = records(logPath).find((entry) => entry.kind === "app_server_spawn")?.pid;
			if (childPid === undefined) throw new Error("The controlled app-server pid was not logged.");
			expect(processExists(childPid)).toBeTrue();
			writeFileSync(controlPath, JSON.stringify({ exit: true }));
			await waitFor(
				() => !processExists(childPid),
				"the exact controlled app-server child to exit",
			);
			const retired = await waitFor(async () => {
				const result = await current!.request("snapshot");
				return result.ok ? undefined : result;
			}, "the production gateway to retire after child exit");
			if (retired === undefined) throw new Error("The retired gateway result disappeared.");
			expect(retired.error).toContain("unavailable");
			await canvas.assertRunning();
		} finally {
			await resources.disposeAsync();
		}
	}, 60_000);
});
