import { TEST_CONTEXT_CODEC } from "#tests/runtime/support/host.ts";
// Giving the coordinator a workhorse outcome while voice is live (TASK-291, TASK-321): the
// Archboard server's half.
//
// What is guarded: the outcome goes out at once as one turn/start, under a minted identity and
// the reviewed producer, whatever the coordinator is doing (Codex adds it to a running turn or
// starts one, so nothing here reads the thread or waits); a recording's voice gets nothing to
// speak into the video; and a start that failed says whether anything was delivered.

import { describe, expect, test } from "bun:test";
import { createOutcomeReportPort } from "#server/services/voice/outcome-report.ts";
import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import { generationContextFixture } from "#tests/server/support/generation/generation-values.ts";

/** A port whose turn/start a test scripts, recording what was started. */
function harness(startFails = false, recording = false) {
	const threadId = createIdentityAuthorities().identity.decoder.adoptThreadId("coordinator");
	const starts: { readonly prompt: string; readonly clientUserMessageId: unknown }[] = [];
	const contexts: string[] = [];
	const port = createOutcomeReportPort({
		contextCodec: TEST_CONTEXT_CODEC,
		session: {
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
		recording: () => recording,
	});
	return { port, threadId, starts, contexts };
}

describe("a workhorse outcome given to the coordinator", () => {
	test("goes out at once as one turn/start carrying the outcome under a minted identity", async () => {
		const h = harness();
		const result = await h.port.report({
			threadId: h.threadId,
			news: "The workhorse finished a turn.",
			situation: "ended",
		});
		expect(result).toEqual({ attempted: true, outcome: "delivered", reason: null });
		expect(h.starts).toHaveLength(1);
		expect(h.starts[0]?.prompt).toContain("The workhorse finished a turn.");
		expect(h.starts[0]?.clientUserMessageId).toBe("operation-1");
		expect(h.contexts).toEqual(["operation-1"]);
	});

	test("sends nothing while a recording holds the voice", async () => {
		// Whatever the coordinator answered would be spoken into the video.
		const h = harness(false, true);
		expect(await h.port.report({ threadId: h.threadId, news: "News.", situation: "ended" })).toBe(
			"recording",
		);
		expect(h.starts).toHaveLength(0);
	});

	test("says the outcome is unknown when the start may or may not have landed", async () => {
		const h = harness(true);
		expect(
			await h.port.report({ threadId: h.threadId, news: "News.", situation: "ended" }),
		).toEqual({
			attempted: true,
			outcome: "outcome_unknown",
			reason: "response_lost",
		});
	});
});
