import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseDynamicToolCallResponse } from "../../../src/runtime/codex-thread-tools/index.ts";
import { waitFor } from "../canvas-state/support/http.ts";
import { processExists } from "../support/owned-canvas.ts";
import {
	records,
	resolveDynamic,
	reverseResponses,
	snapshot,
} from "./support/codex-workbench-lifecycle.ts";
import { mutationCount, startLinkedWorkbench } from "./support/codex-workbench-process-harness.ts";
import { extendTerminalFixture } from "./support/codex-workbench-terminal-controls.ts";

function terminalSource(resources: AsyncDisposableStack, label: string): string {
	const root = mkdtempSync(join(tmpdir(), `archboard-terminal-${label}-`));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	return extendTerminalFixture(root);
}

describe.serial("composed Codex cancellation and child-disconnect lifecycle", () => {
	for (const cause of ["call_cancelled", "caller_turn_interrupted"] as const) {
		test(`${cause} terminalizes a mutation and releases its wait once`, async () => {
			const resources = new AsyncDisposableStack();
			try {
				const { fixture, socket } = await startLinkedWorkbench(
					resources,
					cause,
					terminalSource(resources, cause),
				);
				const effectsBefore = mutationCount(fixture.logPath);
				writeFileSync(fixture.controlPath, JSON.stringify({ emit: cause }));
				const approval = await waitFor(async () => {
					const state = snapshot(await socket.request("snapshot"));
					const dynamic = state["dynamicApprovals"] as Record<string, unknown>[];
					return dynamic.length === 1 ? dynamic[0] : undefined;
				}, `${cause} visual approval`);
				if (approval === undefined) {
					throw new Error(`${cause} approval did not remain pending.`);
				}
				await waitFor(
					() =>
						records(fixture.logPath).some(
							(entry) =>
								entry.kind === "frame" &&
								entry.method === "thread/read" &&
								entry.params?.["threadId"] === "thread-3",
						)
							? true
							: undefined,
					`${cause} wait owner activation`,
				);
				expect(reverseResponses(fixture.logPath, `${cause}-dynamic`)).toHaveLength(0);
				expect(reverseResponses(fixture.logPath, `${cause}-wait`)).toHaveLength(0);
				for (const terminalMismatch of ["wrong_call", "wrong_turn"] as const) {
					const targetPollsBefore = records(fixture.logPath).filter(
						(entry) =>
							entry.kind === "frame" &&
							entry.method === "thread/read" &&
							entry.params?.["threadId"] === "thread-3",
					).length;
					writeFileSync(
						fixture.controlPath,
						JSON.stringify({ terminalCause: cause, terminalMismatch }),
					);
					await waitFor(
						() =>
							records(fixture.logPath).some(
								(entry) =>
									entry.kind === "terminal_mismatch" &&
									(entry as { readonly cause?: unknown }).cause === cause &&
									(entry as { readonly mismatch?: unknown }).mismatch === terminalMismatch,
							)
								? true
								: undefined,
						`${cause} ${terminalMismatch} barrier`,
					);
					await waitFor(
						() =>
							records(fixture.logPath).filter(
								(entry) =>
									entry.kind === "frame" &&
									entry.method === "thread/read" &&
									entry.params?.["threadId"] === "thread-3",
							).length > targetPollsBefore
								? true
								: undefined,
						`${cause} ${terminalMismatch} retained wait poll`,
					);
					const stillPending = snapshot(await socket.request("snapshot"));
					expect(stillPending["dynamicApprovals"]).toHaveLength(1);
					expect(reverseResponses(fixture.logPath, `${cause}-dynamic`)).toHaveLength(0);
					expect(reverseResponses(fixture.logPath, `${cause}-wait`)).toHaveLength(0);
					expect(mutationCount(fixture.logPath)).toBe(effectsBefore);
				}

				writeFileSync(fixture.controlPath, JSON.stringify({ terminal: cause }));
				for (const suffix of ["dynamic", "wait"] as const) {
					await waitFor(
						() =>
							reverseResponses(fixture.logPath, `${cause}-${suffix}`).length === 1
								? true
								: undefined,
						`${cause} ${suffix} settlement`,
					);
				}

				const dynamic = parseDynamicToolCallResponse(
					"create_thread",
					reverseResponses(fixture.logPath, `${cause}-dynamic`)[0]?.frame?.result,
				).envelope;
				if (dynamic.tag !== "approval_required") {
					throw new Error(`${cause} did not return terminal approval_required.`);
				}
				expect(dynamic).toEqual({
					tag: "approval_required",
					operationId: dynamic.operationId,
					summary: `Create thread: Do not execute the ${cause} effect.`,
				});
				const wait = parseDynamicToolCallResponse(
					"wait_threads",
					reverseResponses(fixture.logPath, `${cause}-wait`)[0]?.frame?.result,
				).envelope;
				expect(wait).toEqual({
					tag: "refused",
					reason: "invalid_call",
					message: "The wait call did not remain active until settlement.",
				});
				expect(mutationCount(fixture.logPath)).toBe(effectsBefore);

				const late = await resolveDynamic(socket, approval);
				expect(late).toMatchObject({
					ok: true,
					value: {
						kind: "command_result",
						outcome: "not_delivered",
						code: "dynamic_approval_not_pending",
						message: "That coordination approval is no longer pending.",
					},
				});
				expect(reverseResponses(fixture.logPath, `${cause}-dynamic`)).toHaveLength(1);
				expect(reverseResponses(fixture.logPath, `${cause}-wait`)).toHaveLength(1);
				expect(mutationCount(fixture.logPath)).toBe(effectsBefore);
			} finally {
				await resources.disposeAsync();
			}
		}, 40_000);
	}

	test("child exit classifies every pending request without a late effect or orphan", async () => {
		const resources = new AsyncDisposableStack();
		try {
			const { canvas, childPid, fixture, socket } = await startLinkedWorkbench(
				resources,
				"child-exit",
				terminalSource(resources, "child-exit"),
			);
			const effectsBefore = mutationCount(fixture.logPath);
			writeFileSync(
				fixture.controlPath,
				JSON.stringify({ emit: "child_exit", holdClientRpc: true }),
			);
			const approval = await waitFor(async () => {
				const state = snapshot(await socket.request("snapshot"));
				const ordinary = state["approvals"] as Record<string, unknown>[];
				const dynamic = state["dynamicApprovals"] as Record<string, unknown>[];
				return ordinary.length === 1 && dynamic.length === 1
					? { ordinary: ordinary[0]!, dynamic: dynamic[0]! }
					: undefined;
			}, "child-exit pending approvals");
			if (approval === undefined) {
				throw new Error("The child-exit approvals did not remain pending.");
			}
			const heldAccountRead = socket.request("accountRead");
			await waitFor(
				() =>
					records(fixture.logPath).some(
						(entry) =>
							entry.kind === "held_client_rpc" &&
							entry.method === "account/read" &&
							(entry as { readonly state?: unknown }).state === "pending",
					)
						? true
						: undefined,
				"held account/read before child exit",
			);
			await waitFor(
				() =>
					records(fixture.logPath).some(
						(entry) => entry.kind === "frame" && entry.method === "thread/read",
					)
						? true
						: undefined,
				"child-exit wait edge",
			);
			writeFileSync(fixture.controlPath, JSON.stringify({ exit: true }));
			await waitFor(() => (!processExists(childPid) ? true : undefined), "controlled child exit");
			const accountResult = await heldAccountRead;
			expect(accountResult).toMatchObject({
				ok: true,
				value: {
					kind: "account_read",
					code: "outcome_unknown",
					outcome: "outcome_unknown",
					message:
						"The command may have taken effect; inspect authoritative state before another mutation.",
				},
			});
			await waitFor(async () => {
				const result = await socket.request("snapshot");
				return result.ok ? undefined : result;
			}, "child-exit gateway retirement");
			expect(reverseResponses(fixture.logPath, "child-exit-ordinary")).toHaveLength(0);
			expect(reverseResponses(fixture.logPath, "child-exit-dynamic")).toHaveLength(0);
			expect(reverseResponses(fixture.logPath, "child-exit-wait")).toHaveLength(0);
			expect(mutationCount(fixture.logPath)).toBe(effectsBefore);
			const staleBinding = approval.dynamic["binding"] as Record<string, unknown>;
			expect(
				await socket.request("command", {
					command: {
						kind: "browser_command",
						command: "dynamicApprovalRespond",
						commandId: staleBinding["commandId"],
						paneId: staleBinding["paneId"],
						...(staleBinding["capturedLink"] as Record<string, unknown>),
						capturedLink: staleBinding["capturedLink"],
						identity: approval.dynamic["identity"],
						effectHash: approval.dynamic["effectHash"],
						decision: "approve",
					},
				}),
			).toMatchObject({ ok: false, error: "The Codex workbench is unavailable." });
			const terminalLog = readFileSync(fixture.logPath, "utf8");
			expect((await socket.request("snapshot")).ok).toBeFalse();
			expect(readFileSync(fixture.logPath, "utf8")).toBe(terminalLog);
			expect(processExists(canvas.pid)).toBeTrue();
			expect(processExists(childPid)).toBeFalse();
		} finally {
			await resources.disposeAsync();
		}
	}, 40_000);
});
