import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
	type FixtureRecord,
	type HotCanvas,
	pane,
	records,
	resolveDynamic,
	reverseResponses,
	snapshot,
	startHotCanvas,
	target,
} from "./support/codex-workbench-lifecycle.ts";
import {
	expectGeneralMutationEnvelope,
	expectGeneralQueryEnvelopes,
} from "./support/codex-workbench-result-assertions.ts";

describe.serial("composed Codex process lifecycle", () => {
	test("owns exact storage, the closed reverse router, reload, disconnect, and terminal cleanup", async () => {
		const resources = new AsyncDisposableStack();
		let canvas: HotCanvas | null = null;
		try {
			const staging = join(
				process.env.TMPDIR ?? "/tmp",
				`archboard-lifecycle-source-${process.pid}`,
			);
			rmSync(staging, { recursive: true, force: true });
			mkdirSync(staging, { recursive: true });
			resources.defer(() => rmSync(staging, { recursive: true, force: true }));
			const extendedSource = extendFixture(staging);
			const fixture = prepareProductionFixture(resources, extendedSource);
			canvas = await startHotCanvas(fixture);
			const ownedCanvas = canvas;
			resources.defer(() => ownedCanvas.dispose());
			const request = createRequester({ base: canvas.base, assertRunning: async () => undefined });
			let socket = await openApplicationSocket(canvas.base, "lifecycle-client");
			resources.defer(() => socket.close());
			expect(
				(
					await request("/api/panes", {
						method: "POST",
						doing: false,
						body: pane("lifecycle-client"),
					})
				).status,
			).toBe(200);
			await waitFor(async () => {
				const result = await socket.request("connect");
				return result.ok ? result : undefined;
			}, "the replacement workbench connection").catch((error: unknown) => {
				throw new Error(`Replacement connection failed.\n${canvas!.output()}`, { cause: error });
			});

			const configPath = join(
				fixture.root,
				"state/excalidraw-canvas/codex-workbench/codex-home/config.toml",
			);
			const sqliteHome = join(fixture.root, "state/excalidraw-canvas/codex-workbench/sqlite-home");
			await waitFor(
				() => (existsSync(configPath) ? true : undefined),
				"Codex config materialization",
			);
			expect(readFileSync(configPath, "utf8")).toBe(
				`sqlite_home = ${JSON.stringify(sqliteHome)}\n`,
			);
			expect(statSync(configPath).mode & 0o777).toBe(0o600);
			expect(statSync(join(configPath, "..")).mode & 0o777).toBe(0o700);
			const spawned = records(fixture.logPath).filter((entry) => entry.kind === "app_server_spawn");
			expect(spawned).toHaveLength(1);
			const childPid = spawned[0]?.pid;
			if (childPid === undefined) throw new Error("The controlled child did not log its pid.");
			expect(processExists(childPid)).toBeTrue();

			const initialLease = await socket.request("claimLease");
			const linked = await socket.request("command", {
				command: {
					kind: "browser_command",
					command: "threadLinkCreate",
					...target(initialLease),
				},
			});
			expect(linked).toMatchObject({ ok: true, value: { outcome: "delivered" } });
			const linkedSnapshot = snapshot(await socket.request("snapshot"));
			const threadLink = linkedSnapshot.threadLink as Record<string, unknown>;
			const currentTimeLowerBound = Math.floor(Date.now() / 1000);
			const startLease = await socket.request("claimLease");
			expect(
				await socket.request("command", {
					command: {
						kind: "browser_command",
						command: "start",
						...target(startLease),
						threadId: threadLink.threadId,
						prompt: "Drive the composed lifecycle owner.",
					},
				}),
			).toMatchObject({ ok: true, value: { outcome: "delivered" } });

			const pending = await waitFor(async () => {
				const value = snapshot(await socket.request("snapshot"));
				const approvals = value.approvals as Record<string, unknown>[];
				const dynamic = value.dynamicApprovals as Record<string, unknown>[];
				return approvals.length === 7 && dynamic.length === 1 ? { approvals, dynamic } : undefined;
			}, "all seven ordinary families and one dynamic approval");
			if (pending === undefined) throw new Error("The approval projection disappeared.");
			expect(new Set(pending.approvals.map((approval) => approval.approvalKind))).toEqual(
				new Set([
					"command_execution",
					"file_change",
					"user_input",
					"elicitation",
					"permissions",
					"apply_patch",
					"exec_command",
				]),
			);
			for (const approval of pending.approvals)
				expect(await approveOrdinary(socket, approval)).toMatchObject({
					ok: true,
					value: { outcome: "delivered" },
				});
			expect(await resolveDynamic(socket, pending.dynamic[0]!)).toMatchObject({
				ok: true,
				value: { outcome: "delivered" },
			});

			const requestIds = [
				"ordinary-request-1",
				"approval-file",
				"approval-input",
				"approval-elicitation",
				"approval-permissions",
				"approval-patch",
				"approval-exec",
				"dynamic-request-1",
				"session-time",
				"session-token",
				"session-attestation",
			];
			await waitFor(
				() =>
					requestIds.every((id) => reverseResponses(fixture.logPath, id).length === 1)
						? true
						: undefined,
				"one response for every routed reverse request",
			);
			for (const id of requestIds)
				expect(reverseResponses(fixture.logPath, id), id).toHaveLength(1);
			for (const [emit, id] of [
				["fork", "general-fork"],
				["send", "general-send"],
			] as const) {
				writeFileSync(fixture.controlPath, JSON.stringify({ emit }));
				const approval = await waitFor(async () => {
					const value = snapshot(await socket.request("snapshot"));
					const dynamic = value.dynamicApprovals as Record<string, unknown>[];
					return dynamic.length === 1 ? dynamic[0] : undefined;
				}, `${id} visual approval`).catch((error: unknown) => {
					throw new Error(
						`${id} did not reach approval: ${JSON.stringify(reverseResponses(fixture.logPath, id))}\n${canvas!.output()}`,
						{ cause: error },
					);
				});
				if (approval === undefined) throw new Error(`${id} approval disappeared.`);
				expect(await resolveDynamic(socket, approval)).toMatchObject({
					ok: true,
					value: { outcome: "delivered" },
				});
				await waitFor(
					() => (reverseResponses(fixture.logPath, id).length === 1 ? true : undefined),
					`${id} process response`,
				);
				const result = reverseResponses(fixture.logPath, id)[0]?.frame?.result;
				expectGeneralMutationEnvelope(emit, result);
			}
			for (const emit of ["list", "read", "wait"] as const) {
				writeFileSync(fixture.controlPath, JSON.stringify({ emit }));
				await waitFor(
					() =>
						reverseResponses(fixture.logPath, `general-${emit}`).length === 1 ? true : undefined,
					`${emit} process result`,
				);
			}
			expectGeneralQueryEnvelopes(fixture.logPath);
			writeFileSync(fixture.controlPath, JSON.stringify({ emit: "coordinator" }));
			await waitFor(
				() =>
					reverseResponses(fixture.logPath, "coordinator-inspect").length === 1 ? true : undefined,
				"coordinator dynamic process response",
			);
			const coordinatorResult = reverseResponses(fixture.logPath, "coordinator-inspect")[0]?.frame
				?.result as { readonly contentItems?: readonly unknown[] };
			expect(coordinatorResult.contentItems).toHaveLength(1);
			for (const outcome of ["decline", "stale"] as const) {
				const id = `general-${outcome}`;
				writeFileSync(fixture.controlPath, JSON.stringify({ emit: outcome }));
				const approval = await waitFor(async () => {
					const value = snapshot(await socket.request("snapshot"));
					const dynamic = value.dynamicApprovals as Record<string, unknown>[];
					return dynamic.length === 1 ? dynamic[0] : undefined;
				}, `${outcome} visual approval`);
				if (approval === undefined) throw new Error(`${outcome} approval disappeared.`);
				if (outcome === "stale") {
					writeFileSync(fixture.controlPath, JSON.stringify({ emit: "invalidate_stale" }));
					await waitFor(
						() =>
							records(fixture.logPath).some((entry) => entry.kind === "stale_invalidated")
								? true
								: undefined,
						"stale call invalidation",
					);
				}
				expect(
					await resolveDynamic(socket, approval, outcome === "decline" ? "decline" : "approve"),
				).toMatchObject({ ok: true, value: { outcome: "delivered" } });
				await waitFor(
					() => (reverseResponses(fixture.logPath, id).length === 1 ? true : undefined),
					`${outcome} process response`,
				);
				const result = reverseResponses(fixture.logPath, id)[0]?.frame?.result as {
					readonly contentItems?: readonly { readonly text?: string }[];
				};
				expect(result.contentItems?.[0]?.text, outcome).toContain(
					outcome === "decline" ? '"reason":"approval_declined"' : '"reason":"unknown_provenance"',
				);
			}
			const time = reverseResponses(fixture.logPath, "session-time")[0]?.frame?.result as {
				readonly currentTimeAt?: unknown;
			};
			const currentTimeUpperBound = Math.floor(Date.now() / 1000);
			expect(typeof time.currentTimeAt).toBe("number");
			expect(Number.isInteger(time.currentTimeAt)).toBeTrue();
			expect(Number(time.currentTimeAt)).toBeGreaterThanOrEqual(currentTimeLowerBound);
			expect(Number(time.currentTimeAt)).toBeLessThanOrEqual(currentTimeUpperBound);
			for (const [id, message] of [
				["session-token", "Client-managed ChatGPT token refresh is not supported"],
				["session-attestation", "Attestation is not supported by this client"],
			] as const) {
				const error = reverseResponses(fixture.logPath, id)[0]?.frame?.error;
				expect(error?.code, id).toBe(-32601);
				expect(error?.message, id).toBe(message);
			}
			const initialization = records(fixture.logPath).find(
				(entry) => entry.kind === "response" && entry.method === "initialize",
			) as FixtureRecord & { readonly result?: Record<string, unknown> };
			expect(initialization.result?.codexHome).toBe(join(configPath, ".."));
			const configRead = records(fixture.logPath).find(
				(entry) => entry.kind === "response" && entry.method === "config/read",
			) as FixtureRecord & { readonly result?: Record<string, unknown> };
			expect(configRead.result).toMatchObject({
				config: { sqlite_home: sqliteHome },
				origins: {
					sqlite_home: { name: { type: "user", file: configPath, profile: null } },
				},
			});
			expect(
				records(fixture.logPath).filter(
					(entry) => entry.kind === "response" && entry.method === "configRequirements/read",
				),
			).toHaveLength(1);
			expect(linkedSnapshot.readiness).toMatchObject({ state: "thread_capable" });
			expect(threadLink).toMatchObject({ state: "executable" });
			const operationIds = records(fixture.logPath)
				.filter((entry) => entry.kind === "frame" && entry.method === "turn/start")
				.map((entry) => entry.params?.clientUserMessageId)
				.filter((value): value is string => typeof value === "string");
			expect(operationIds.length).toBeGreaterThan(0);
			for (const operationId of operationIds)
				expect(operationId).toMatch(
					/^archboard:operation:h[a-f0-9]{32}\.h[a-f0-9]{32}\.h[a-f0-9]{32}$/,
				);

			writeFileSync(fixture.controlPath, JSON.stringify({ emit: "disconnect" }));
			await waitFor(async () => {
				const value = snapshot(await socket.request("snapshot"));
				return (value.approvals as unknown[]).length === 1 &&
					(value.dynamicApprovals as unknown[]).length === 1
					? value
					: undefined;
			}, "browser disconnect approvals");
			await socket.close();
			for (const id of ["disconnect-ordinary", "disconnect-dynamic"])
				await waitFor(
					() => (reverseResponses(fixture.logPath, id).length === 1 ? true : undefined),
					`${id} settlement on browser disconnect`,
				);
			expect(reverseResponses(fixture.logPath, "disconnect-ordinary")[0]?.frame).toEqual({
				id: "disconnect-ordinary",
				result: { decision: "cancel" },
			});
			const disconnectedDynamic = parseDynamicToolCallResponse(
				"create_thread",
				reverseResponses(fixture.logPath, "disconnect-dynamic")[0]?.frame?.result,
			).envelope;
			if (disconnectedDynamic.tag !== "approval_required")
				throw new Error("The disconnected dynamic approval did not terminalize safely.");
			expect(disconnectedDynamic).toEqual({
				tag: "approval_required",
				operationId: disconnectedDynamic.operationId,
				summary: "Create thread: This authority must end with the browser.",
			});
			socket = await openApplicationSocket(canvas.base, "lifecycle-client");
			expect(
				(
					await request("/api/panes", {
						method: "POST",
						doing: false,
						body: pane("lifecycle-client"),
					})
				).status,
			).toBe(200);
			expect(await socket.request("connect")).toMatchObject({ ok: true });
			const attachLease = await socket.request("claimLease");
			expect(
				await socket.request("command", {
					command: {
						kind: "browser_command",
						command: "threadLinkAttach",
						...target(attachLease),
						threadId: threadLink.threadId,
					},
				}),
			).toMatchObject({ ok: true, value: { outcome: "delivered" } });

			writeFileSync(fixture.controlPath, JSON.stringify({ emit: "reload" }));
			const mutationCountBeforeReload = records(fixture.logPath).filter(
				(entry) => entry.kind === "frame" && entry.method === "thread/start",
			).length;
			await waitFor(
				() =>
					records(fixture.logPath).filter(
						(entry) =>
							entry.kind === "server_request" &&
							["reload-ordinary", "reload-dynamic", "reload-wait"].includes(String(entry.id)),
					).length === 3
						? true
						: undefined,
				"the controlled reload batch",
			);
			let reloadSnapshot: Record<string, unknown> | undefined;
			await waitFor(async () => {
				reloadSnapshot = snapshot(await socket.request("snapshot"));
				return (reloadSnapshot.approvals as unknown[]).length === 1 &&
					(reloadSnapshot.dynamicApprovals as unknown[]).length === 1
					? reloadSnapshot
					: undefined;
			}, "reload to overlap one ordinary request, one dynamic approval, and one wait").catch(
				(error: unknown) => {
					throw new Error(`Reload batch did not stay pending: ${JSON.stringify(reloadSnapshot)}`, {
						cause: error,
					});
				},
			);
			if (reloadSnapshot === undefined) throw new Error("The pre-reload projection disappeared.");
			const retainedBeforeReload = {
				coordinator: reloadSnapshot.coordinator,
				queue: reloadSnapshot.queue,
			};
			const linkedBeforeReload = reloadSnapshot.threadLink;

			const beforeReload = records(fixture.logPath).filter(
				(entry) => entry.kind === "app_server_spawn",
			).length;
			const reload = await request("/api/reload", { method: "POST", doing: false });
			expect(reload.status).toBe(200);
			const reloadGeneration = (reload.body as { readonly generation?: unknown }).generation;
			expect(typeof reloadGeneration).toBe("number");
			await waitFor(
				() =>
					canvas!.output().includes(`canvas reload ${String(reloadGeneration)} cost nothing`)
						? true
						: undefined,
				"the hot reload generation to finish",
			);
			await waitFor(async () => {
				const result = await socket.request("connect");
				return result.ok ? result : undefined;
			}, "the replacement workbench connection").catch((error: unknown) => {
				throw new Error(`Replacement connection failed.\n${canvas!.output()}`, { cause: error });
			});
			const retainedAfterReload = await waitFor(async () => {
				const value = await socket.request("snapshot");
				return value.ok ? snapshot(value) : undefined;
			}, "the replacement workbench gateway");
			if (retainedAfterReload === undefined)
				throw new Error("The replacement gateway did not return a projection.");
			expect({
				coordinator: retainedAfterReload.coordinator,
				queue: retainedAfterReload.queue,
			}).toEqual(retainedBeforeReload);
			const replacementAttachLease = await socket.request("claimLease");
			expect(
				await socket.request("command", {
					command: {
						kind: "browser_command",
						command: "threadLinkAttach",
						...target(replacementAttachLease),
						threadId: threadLink.threadId,
					},
				}),
			).toMatchObject({ ok: true, value: { outcome: "delivered" } });
			const relinked = await waitFor(async () => {
				const value = await socket.request("snapshot");
				if (!value.ok) return undefined;
				const state = snapshot(value);
				return (state.threadLink as Record<string, unknown>).state === "executable"
					? state
					: undefined;
			}, "the retained workhorse link after replacement");
			if (relinked === undefined) throw new Error("The retained workhorse link did not return.");
			expect(relinked.threadLink).toEqual(linkedBeforeReload);
			expect(
				records(fixture.logPath).filter((entry) => entry.kind === "app_server_spawn"),
			).toHaveLength(beforeReload);
			expect(processExists(childPid)).toBeTrue();
			expect(await socket.request("snapshot")).toMatchObject({ ok: true });
			for (const id of ["reload-ordinary", "reload-dynamic"])
				await waitFor(
					() => (reverseResponses(fixture.logPath, id).length === 1 ? true : undefined),
					`${id} settlement during reload`,
				);
			expect(reverseResponses(fixture.logPath, "reload-wait")).toHaveLength(0);
			const reloadDynamic = reverseResponses(fixture.logPath, "reload-dynamic")[0]?.frame
				?.result as { readonly contentItems?: readonly { readonly text?: string }[] };
			expect(reloadDynamic.contentItems?.[0]?.text).toContain('"tag":"approval_required"');
			expect(reverseResponses(fixture.logPath, "reload-ordinary")[0]?.frame).toEqual({
				id: "reload-ordinary",
				result: { decision: "cancel" },
			});
			const reloadedDynamic = parseDynamicToolCallResponse("create_thread", reloadDynamic).envelope;
			if (reloadedDynamic.tag !== "approval_required")
				throw new Error("The reloaded dynamic approval did not terminalize safely.");
			expect(reloadedDynamic).toEqual({
				tag: "approval_required",
				operationId: reloadedDynamic.operationId,
				summary: "Create thread: This authority must not survive reload.",
			});
			writeFileSync(fixture.controlPath, JSON.stringify({ emit: "complete_wait" }));
			await waitFor(
				() => (reverseResponses(fixture.logPath, "reload-wait").length === 1 ? true : undefined),
				"retained wait settlement through the replacement generation",
			);
			const retainedWait = parseDynamicToolCallResponse(
				"wait_threads",
				reverseResponses(fixture.logPath, "reload-wait")[0]?.frame?.result,
			).envelope;
			if (retainedWait.tag !== "ok") throw new Error("The retained reload wait did not settle.");
			const retainedWaitValue = retainedWait.value as { readonly cursor: string | null };
			expect(retainedWait).toEqual({
				tag: "ok",
				operationId: retainedWait.operationId,
				value: {
					event: "completed",
					threadId: "thread-3",
					cursor: retainedWaitValue.cursor,
				},
			});
			expect(
				records(fixture.logPath).filter(
					(entry) => entry.kind === "frame" && entry.method === "thread/start",
				).length,
			).toBe(mutationCountBeforeReload);
			writeFileSync(fixture.controlPath, JSON.stringify({ emit: "post_reload" }));
			await waitFor(
				() =>
					reverseResponses(fixture.logPath, "post-reload-time").length === 1 ? true : undefined,
				"a request through the replacement handler set",
			);
			writeFileSync(fixture.controlPath, JSON.stringify({ exit: true }));
			await waitFor(() => (!processExists(childPid) ? true : undefined), "controlled child exit");
			const terminalLog = readFileSync(fixture.logPath, "utf8");
			await waitFor(async () => {
				const result = await socket.request("snapshot");
				return result.ok ? undefined : result;
			}, "gateway authority retirement after child exit");
			expect(readFileSync(fixture.logPath, "utf8")).toBe(terminalLog);

			await canvas.dispose("SIGTERM");
			canvas = null;
			expect(existsSync(fixture.root)).toBeTrue();
		} finally {
			await resources.disposeAsync();
		}
	}, 60_000);
});
