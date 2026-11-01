import { seedCanonicalFixture } from "../support/canonical-fixture.ts";
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { processExists, startOwnedServer } from "../support/owned-server.ts";
import {
	openApplicationSocket,
	prepareProductionFixture,
	productionRecords as records,
	productionSnapshot as snapshots,
	productionLeaseTarget as leaseTarget,
	productionPane as pane,
} from "./support/codex-production.ts";
import { createRequester, waitFor } from "./support/http.ts";
import { productionServer } from "./support/production-server.ts";

const executableSource = join(import.meta.dir, "fixtures/fake-codex-production.ts");
/** The archboard checkout these tests run from, where no thread of a served vault works. */
const repoRoot = realpathSync(resolve(import.meta.dir, "../../.."));

describe.serial("actual production Codex composition", () => {
	test("apps/server/src/server.ts crosses every browser, protocol, semantic, approval, and cleanup seam", async () => {
		const resources = new AsyncDisposableStack();
		try {
			const fixture = prepareProductionFixture(resources, executableSource);
			const { controlPath, executablePath, logPath, root, vault } = fixture;
			let server: Awaited<ReturnType<typeof startOwnedServer>>;
			try {
				server = await startOwnedServer({
					...productionServer,
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
					`Production server startup failed.\nControlled app-server log:\n${readFileSync(logPath, "utf8")}`,
					{ cause: error },
				);
			}
			resources.defer(() => server.dispose());
			const request = createRequester(server);
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
			const first = await openApplicationSocket(server.base, "bound-client");
			resources.defer(() => first.close());
			const focused = await openApplicationSocket(server.base, "focused-client");
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
			const current = await openApplicationSocket(server.base, "bound-client");
			resources.defer(() => current.close());
			await first.close();
			expect(await current.request("connect")).toMatchObject({ ok: true });

			const initialLease = await current.request("claimLease");
			expect(initialLease).toMatchObject({ ok: true });
			expect(await current.request("releaseLease")).toMatchObject({ ok: true });
			/**
			 * The model of every thread the server has started, in order.
			 * @returns The models.
			 */
			const startedModels = () =>
				records(logPath)
					.filter((entry) => entry.kind === "frame" && entry.method === "thread/start")
					.map((entry) => entry.params?.["model"]);
			// Signed in and thread-capable, and no thread started: the conversation's
			// first create starts the coordinator.
			const signedIn = snapshots(await current.request("snapshot"));
			expect(signedIn["readiness"]).toMatchObject({ state: "thread_capable" });
			expect(startedModels()).toEqual([]);
			const createLease = await current.request("claimLease");
			const created = await current.request("command", {
				command: {
					kind: "browser_command",
					command: "threadLinkCreate",
					...leaseTarget(createLease),
				},
			});
			expect(created).toMatchObject({ ok: true, value: { outcome: "delivered" } });
			// The coordinator's thread starts before the workhorse's.
			expect(startedModels()[0]).toBe("gpt-6-sol");
			expect(startedModels()).toHaveLength(2);
			// The app-server and the coordinator work in a directory of their own under the state
			// directory, which holds no vault. The workhorse works in its checkout: for this untracked
			// vault, the directory that holds it. No thread works in the archboard checkout (ADR 0050).
			const [coordinatorStart, workhorseStart] = records(logPath).filter(
				(entry) => entry.kind === "frame" && entry.method === "thread/start",
			);
			const coordinatorDirectory = String(coordinatorStart?.params?.["cwd"]);
			const spawned = records(logPath).filter((entry) => entry.kind === "app_server_cwd");
			expect(spawned.map((entry) => entry.cwd)).toEqual([coordinatorDirectory]);
			expect(basename(coordinatorDirectory)).toBe("coordinator");
			expect(existsSync(join(coordinatorDirectory, ".archboard"))).toBe(false);
			expect(coordinatorDirectory.startsWith(repoRoot)).toBe(false);
			expect(workhorseStart?.params?.["cwd"]).toBe(realpathSync(root));
			expect(workhorseStart?.params?.["runtimeWorkspaceRoots"]).toEqual([realpathSync(root)]);

			const linked = snapshots(await current.request("snapshot"));
			const threadLink = linked["threadLink"] as Record<string, unknown>;
			expect(threadLink).toMatchObject({ state: "executable" });
			expect(typeof threadLink["threadId"]).toBe("string");
			expect(linked["coordinator"]).toMatchObject({
				state: "ready",
				configuredModel: "gpt-6-sol",
				configuredEffort: "low",
				model: "gpt-6-sol",
				effort: "low",
				serviceTier: null,
			});
			expect(typeof (linked["coordinator"] as Record<string, unknown>)["threadId"]).toBe("string");

			expect(await current.request("mediaReady", { ready: true })).toMatchObject({ ok: true });
			expect(snapshots(await current.request("snapshot"))["voice"]).toMatchObject({
				state: "ready",
			});
			expect(await current.request("mediaReady", { ready: false })).toMatchObject({ ok: true });
			expect(snapshots(await current.request("snapshot"))["voice"]).toMatchObject({
				state: "unavailable",
				reason: "Browser audio is unavailable for this socket.",
			});

			seedCanonicalFixture(fixture.vault, "scratch", [
				{ name: "Gateway", kind: "service" },
				{ name: "Orders", kind: "service" },
			]);

			const startLease = await current.request("claimLease");
			const started = await current.request("command", {
				command: {
					kind: "browser_command",
					command: "start",
					...leaseTarget(startLease),
					threadId: threadLink["threadId"],
					prompt: "Exercise both production reverse-request owners.",
				},
			});
			expect(started).toMatchObject({ ok: true, value: { outcome: "delivered" } });
			const semanticStart = records(logPath).find(
				(entry) =>
					entry.kind === "frame" &&
					entry.method === "turn/start" &&
					entry.params?.["threadId"] === "thread-2",
			);
			if (semanticStart === undefined) {
				throw new Error("The semantic turn/start was not logged.");
			}
			const additionalContext = semanticStart.params?.["additionalContext"] as {
				readonly archboard?: { readonly value?: unknown };
			};
			const archboardContext = JSON.parse(String(additionalContext.archboard?.value)) as {
				readonly paneId: string;
				readonly focus: { readonly paneId: string | null };
				readonly semantic: { readonly brief: string };
			};
			const turnBrief = JSON.parse(archboardContext.semantic.brief) as {
				readonly pane: { readonly paneId: string; readonly focused: boolean };
			};
			expect(archboardContext.paneId).toBe("bound-pane");
			expect(archboardContext.focus.paneId).toBeNull();
			expect(turnBrief.pane).toEqual({ paneId: "bound-pane", focused: false });

			// Whether a settled change reaches the workhorse, and whose change is
			// worth telling it about, is the semantic delivery gate's own question
			// and has its own owner under codex-thread-context. What this test owns
			// is the composition: that the real apps/server/src/server.ts wires the feed, the
			// context and the workbench together at all, which the turn/start
			// context above is the evidence for.

			const pending = await waitFor(async () => {
				const snapshot = snapshots(await current!.request("snapshot"));
				const approvals = snapshot["approvals"] as Record<string, unknown>[];
				const dynamicApprovals = snapshot["dynamicApprovals"] as Record<string, unknown>[];
				return approvals.length === 1 && dynamicApprovals.length === 1
					? { approvals, dynamicApprovals }
					: undefined;
			}, "both production approval owners to publish through the gateway").catch((error) => {
				throw new Error(`Approval publication failed.\n${readFileSync(logPath, "utf8")}`, {
					cause: error,
				});
			});
			if (pending === undefined) {
				throw new Error("The approval projection disappeared.");
			}
			const ordinary = pending.approvals[0]!;
			const ordinaryLease = await current.request("claimLease");
			const ordinaryCommand = {
				kind: "browser_command",
				command: "approvalRespond",
				...leaseTarget(ordinaryLease),
				requestId: ordinary["requestId"],
				approvalId: ordinary["approvalId"],
				response: { approvalKind: "command_execution", decision: "accept" },
			};
			const ordinaryFirst = await current.request("command", { command: ordinaryCommand });
			const ordinaryDuplicate = await current.request("command", { command: ordinaryCommand });
			expect(ordinaryFirst.value).toEqual(ordinaryDuplicate.value);

			const dynamicLease = await current.request("claimLease");
			const rebound = snapshots(await current.request("snapshot"));
			const dynamic = (rebound["dynamicApprovals"] as Record<string, unknown>[])[0]!;
			const binding = dynamic["binding"] as Record<string, unknown>;
			expect(binding["commandId"]).toBe(dynamicLease.value?.["commandId"]);
			const dynamicResult = await current.request("command", {
				command: {
					kind: "browser_command",
					command: "dynamicApprovalRespond",
					...leaseTarget(dynamicLease),
					capturedLink: binding["capturedLink"],
					identity: dynamic["identity"],
					effectHash: dynamic["effectHash"],
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
			if (startedThreads.length !== 3) {
				throw new Error(
					`The approved dynamic create did not start its thread.\n${readFileSync(logPath, "utf8")}`,
				);
			}

			// History exists after the first message; finish that turn before switching conversations.
			writeFileSync(controlPath, JSON.stringify({ completeWorkhorseTurn: true }));
			await waitFor(
				async () =>
					(snapshots(await current.request("snapshot"))["threadLink"] as Record<string, unknown>)[
						"status"
					] === "idle",
				"the workhorse turn to finish",
			);
			// The finished turn carries what the person sent, when it ran, and the
			// plan and token usage Codex reported only as notifications.
			const finished = await waitFor(async () => {
				const timeline = snapshots(await current.request("snapshot"))["timeline"] as {
					readonly usage: unknown;
					readonly turns: readonly Record<string, unknown>[];
				} | null;
				const turn = timeline?.turns.at(-1);
				return timeline &&
					turn?.["status"] === "completed" &&
					turn["plan"] !== null &&
					timeline.usage !== null
					? { timeline, turn }
					: undefined;
			}, "the finished workhorse turn to carry its evidence");
			if (finished === undefined) {
				throw new Error("The finished workhorse turn disappeared.");
			}
			expect((finished.turn["items"] as readonly Record<string, unknown>[])[0]).toMatchObject({
				media: "prompt",
				text: "Exercise both production reverse-request owners.",
			});
			expect(finished.turn["startedAtMs"]).toBeGreaterThan(0);
			expect(finished.turn["completedAtMs"]).toBeGreaterThanOrEqual(
				finished.turn["startedAtMs"] as number,
			);
			expect(finished.turn["plan"]).toMatchObject({
				steps: [{ status: "completed" }, { status: "completed" }],
			});
			expect(finished.timeline.usage).toMatchObject({
				total: { totalTokens: 1_200 },
				modelContextWindow: 258_000,
			});
			const childPid = records(logPath).find((entry) => entry.kind === "app_server_spawn")?.pid;
			if (childPid === undefined) {
				throw new Error("The controlled app-server pid was not logged.");
			}
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
			if (retired === undefined) {
				throw new Error("The retired gateway result disappeared.");
			}
			expect(retired.error).toContain("unavailable");
			await server.assertRunning();
		} finally {
			await resources.disposeAsync();
		}
	}, 60_000);
});
