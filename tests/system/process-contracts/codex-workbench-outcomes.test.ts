import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
	parseDynamicToolCallResponse,
	type ParsedDynamicToolCallResponse,
} from "../../../src/runtime/codex-thread-tools/index.ts";
import {
	openApplicationSocket,
	prepareProductionFixture,
} from "../canvas-state/support/codex-production.ts";
import { createRequester, waitFor } from "../canvas-state/support/http.ts";
import {
	approveOrdinary,
	pane,
	records,
	resolveDynamic,
	reverseResponses,
	snapshot,
	startCanvas,
	target,
} from "./support/codex-workbench-lifecycle.ts";
import { extendOutcomeFixture } from "./support/codex-workbench-outcomes.ts";

type MutationScenario = "initial_not_delivered" | "initial_unknown" | "outer_unknown";

function parsedResponse(
	logPath: string,
	id: string,
): ParsedDynamicToolCallResponse<"create_thread"> {
	const response = reverseResponses(logPath, id)[0]?.frame?.result;
	return parseDynamicToolCallResponse("create_thread", response);
}

describe.serial("composed Codex mutation outcomes", () => {
	test("returns confirmed, partial, uncertain-initial, and outer-unknown results once", async () => {
		const resources = new AsyncDisposableStack();
		try {
			const staging = join(
				process.env["TMPDIR"] ?? "/tmp",
				`archboard-process-outcomes-${process.pid}`,
			);
			rmSync(staging, { recursive: true, force: true });
			mkdirSync(staging, { recursive: true });
			resources.defer(() => rmSync(staging, { recursive: true, force: true }));
			const fixture = prepareProductionFixture(resources, extendOutcomeFixture(staging));
			const canvas = await startCanvas(fixture);
			resources.defer(() => canvas.dispose());
			const clientId = "mutation-outcomes";
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
			}, "mutation outcome workbench connection");
			const createLease = await socket.request("claimLease");
			expect(
				await socket.request("command", {
					command: { kind: "browser_command", command: "threadLinkCreate", ...target(createLease) },
				}),
			).toMatchObject({ ok: true, value: { outcome: "delivered" } });
			const linked = snapshot(await socket.request("snapshot"))["threadLink"] as Record<
				string,
				unknown
			>;
			const startLease = await socket.request("claimLease");
			expect(
				await socket.request("command", {
					command: {
						kind: "browser_command",
						command: "start",
						...target(startLease),
						threadId: linked["threadId"],
						prompt: "Exercise deterministic mutation outcomes.",
					},
				}),
			).toMatchObject({ ok: true, value: { outcome: "delivered" } });
			const initial = await waitFor(async () => {
				const state = snapshot(await socket.request("snapshot"));
				const approvals = state["approvals"] as Record<string, unknown>[];
				const dynamic = state["dynamicApprovals"] as Record<string, unknown>[];
				return approvals.length === 7 && dynamic.length === 1 ? { approvals, dynamic } : undefined;
			}, "initial process approvals");
			if (initial === undefined) {
				throw new Error("The initial approvals did not remain pending.");
			}
			for (const approval of initial.approvals) {
				await approveOrdinary(socket, approval);
			}
			await resolveDynamic(socket, initial.dynamic[0]!);
			await waitFor(
				() =>
					reverseResponses(fixture.logPath, "dynamic-request-1").length === 1 ? true : undefined,
				"confirmed create result",
			);
			const confirmed = parsedResponse(fixture.logPath, "dynamic-request-1").envelope;
			if (confirmed.tag !== "ok") {
				throw new Error("The confirmed create was not successful.");
			}
			const confirmedValue = confirmed.value as {
				readonly initialTurn: { readonly operationId: string };
			};
			expect(confirmed.operationId).toMatch(
				/^archboard:operation:h[a-f0-9]{32}\.h[a-f0-9]{32}\.h[a-f0-9]{32}$/,
			);
			expect(confirmedValue.initialTurn.operationId).toMatch(
				/^archboard:operation:h[a-f0-9]{32}\.h[a-f0-9]{32}\.h[a-f0-9]{32}$/,
			);
			expect(confirmed).toEqual({
				tag: "ok",
				operationId: confirmed.operationId,
				value: {
					threadId: "archboard:thread:s7468726561642d33",
					state: "executable",
					initialTurn: {
						delivery: "delivered",
						turnId: "archboard:turn:s7475726e2d32",
						operationId: confirmedValue.initialTurn.operationId,
						reason: null,
					},
				},
			});

			for (const scenario of [
				"initial_not_delivered",
				"initial_unknown",
				"outer_unknown",
			] as const satisfies readonly MutationScenario[]) {
				const id = `scenario-${scenario}`;
				writeFileSync(fixture.controlPath, JSON.stringify({ scenario }));
				const approval = await waitFor(async () => {
					const dynamic = snapshot(await socket.request("snapshot"))["dynamicApprovals"] as Record<
						string,
						unknown
					>[];
					return dynamic.length === 1 ? dynamic[0] : undefined;
				}, `${scenario} approval`);
				if (approval === undefined) {
					throw new Error(`${scenario} approval did not remain pending.`);
				}
				await resolveDynamic(socket, approval);
				await waitFor(
					() => (reverseResponses(fixture.logPath, id).length === 1 ? true : undefined),
					`${scenario} result`,
				);
				const envelope = parsedResponse(fixture.logPath, id).envelope;
				if (scenario === "outer_unknown") {
					expect(envelope).toEqual({
						tag: "outcome_unknown",
						operationId: expect.any(String),
						message:
							"The request may have taken effect. Inspect authoritative state before another mutation.",
					});
				} else {
					expect(envelope).toEqual({
						tag: "ok",
						operationId: expect.any(String),
						value: {
							threadId: expect.any(String),
							state: scenario === "initial_unknown" ? "inspect_only" : "executable",
							initialTurn: {
								delivery: scenario === "initial_unknown" ? "outcome_unknown" : "not_delivered",
								turnId: null,
								operationId: expect.any(String),
								reason: expect.any(String),
							},
						},
					});
				}
			}

			for (const scenario of [
				"initial_not_delivered",
				"initial_unknown",
				"outer_unknown",
			] as const) {
				const effects = records(fixture.logPath).filter(
					(entry) => entry.kind === "mutation_effect" && entry.scenario === scenario,
				);
				expect(effects.filter((entry) => entry.method === "thread/start")).toHaveLength(1);
				expect(effects.filter((entry) => entry.method === "turn/start")).toHaveLength(
					scenario === "outer_unknown" ? 0 : 1,
				);
				expect(reverseResponses(fixture.logPath, `scenario-${scenario}`)).toHaveLength(1);
			}
		} finally {
			await resources.disposeAsync();
		}
	}, 40_000);
});
