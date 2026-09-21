// Running the coordinator with a terminal workhorse outcome (TASK-291): the host's half.
//
// A turn can only be started on an idle thread, and the callbacks behind this one wait while it
// waits. What is guarded: the turn is started once the coordinator is idle, under a minted
// identity and the reviewed producer; a coordinator that stays busy is reported busy rather than
// interrupted or waited on for ever; and a start that failed says whether anything was delivered.

import { describe, expect, test } from "bun:test";
import { createOutcomeReportPort } from "@/server/canvas/index";
import { createIdentityAuthorities } from "@/shared/codex-workbench-identity";
import { COORDINATOR_IDLE_WAIT_MS } from "@/shared/timing/timing";
import { generationContextFixture } from "./support/codex-workbench-generation-values.js";

/** A port over a coordinator thread whose status a test scripts, recording what was started. */
function harness(statuses: readonly ("idle" | "active")[], startFails = false) {
	const threadId = createIdentityAuthorities().identity.decoder.adoptThreadId("coordinator");
	const starts: { readonly prompt: string; readonly clientUserMessageId: unknown }[] = [];
	const contexts: string[] = [];
	let reads = 0;
	let waited = 0;
	const port = createOutcomeReportPort({
		session: {
			threadRead: async () => {
				const type = statuses[Math.min(reads, statuses.length - 1)] ?? "active";
				reads += 1;
				return { thread: { id: threadId, status: { type } } } as never;
			},
			turnStart: async (params) => {
				if (startFails) {
					throw new Error("lost");
				}
				const [input] = params.input;
				starts.push({
					prompt: input?.type === "text" ? input.text : "",
					clientUserMessageId: params.clientUserMessageId,
				});
				return { turn: { id: "turn" } } as never;
			},
		},
		issue: () => "operation-1",
		contextFor: (operationId) => {
			contexts.push(operationId);
			return {
				...generationContextFixture,
				operation: {
					id: operationId,
					kind: "workhorse_outcome_report",
					rpc: "turn/start",
					outcome: null,
				},
			};
		},
		wait: async (ms) => {
			waited += ms;
		},
	});
	return { port, threadId, starts, contexts, waitedMs: () => waited };
}

describe("a terminal workhorse outcome reported to the coordinator", () => {
	test("starts one turn once the coordinator is idle, carrying the outcome under a minted identity", async () => {
		const h = harness(["active", "active", "idle"]);
		const result = await h.port.report({ threadId: h.threadId, text: '{"type":"completed"}' });
		expect(result).toEqual({ attempted: true, outcome: "delivered", reason: null });
		expect(h.starts).toHaveLength(1);
		expect(h.starts[0]?.prompt).toContain('{"type":"completed"}');
		expect(h.starts[0]?.clientUserMessageId).toBe("operation-1");
		expect(h.contexts).toEqual(["operation-1"]);
	});

	test("is reported busy, and starts nothing, when the coordinator never becomes idle in the bound", async () => {
		const h = harness(["active"]);
		expect(await h.port.report({ threadId: h.threadId, text: "{}" })).toBe("busy");
		expect(h.starts).toHaveLength(0);
		expect(h.waitedMs()).toBeGreaterThanOrEqual(COORDINATOR_IDLE_WAIT_MS);
	});

	test("says the outcome is unknown when the start may or may not have landed", async () => {
		const h = harness(["idle"], true);
		expect(await h.port.report({ threadId: h.threadId, text: "{}" })).toEqual({
			attempted: true,
			outcome: "outcome_unknown",
			reason: "response_lost",
		});
	});
});
