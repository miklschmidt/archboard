import { readFileSync } from "node:fs";

import { expect, test } from "bun:test";

import {
	createHarness,
	makeNotification,
	type RealtimeHarness,
	withHarness,
} from "./fixtures/codex-realtime-process.ts";
import { createIdentityAuthority } from "../../../src/shared/codex-workbench-identity/index.ts";
import {
	parseRealtimeCorrelationId,
	parseRealtimeItemId,
	parseRealtimeSessionId,
} from "../../../src/shared/codex-realtime-host/index.ts";

function browserCorrelation(suffix = "") {
	return {
		sessionId: parseRealtimeSessionId(`process-browser-session${suffix}`),
		correlationId: parseRealtimeCorrelationId(`process-browser-correlation${suffix}`),
	};
}

function readRecords(harness: RealtimeHarness): Record<string, unknown>[] {
	return readFileSync(harness.logPath, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as Record<string, unknown>);
}

function requestParams(harness: RealtimeHarness, method: string): Record<string, unknown>[] {
	return readRecords(harness)
		.filter((entry) => entry.kind === "request" && entry.method === method)
		.map((entry) => entry.params as Record<string, unknown>);
}

test("real process proves the exact realtime envelope, gates, transcript, and one-attempt commands", async () => {
	await withHarness(
		{
			afterStartEvents: [
				{
					method: "thread/realtime/item/started",
					params: {
						threadId: "$THREAD",
						item: {
							id: "assistant-item",
							realtimeSessionId: "$SESSION",
							type: "transcriptSegment",
							role: "assistant",
							text: "Hel",
						},
					},
				},
				{
					method: "thread/realtime/item/transcript/delta",
					params: { threadId: "$THREAD", itemId: "assistant-item", delta: "lo" },
				},
				{
					method: "thread/realtime/item/completed",
					params: {
						threadId: "$THREAD",
						item: {
							id: "assistant-item",
							realtimeSessionId: "$SESSION",
							type: "transcriptSegment",
							role: "assistant",
							text: "Hello",
						},
					},
				},
			],
		},
		async (harness, generation) => {
			const browser = browserCorrelation();
			const answer = await generation.adapter.createOffer({ ...browser, sdp: "offer-sdp" });
			expect(answer).toEqual({ ...browser, sdp: "answer-sdp" });
			const startResponses = readRecords(harness).filter(
				(entry) => entry.kind === "response" && entry.method === "thread/realtime/start",
			);
			expect(startResponses).toHaveLength(1);
			expect(startResponses[0]?.result).toEqual({});
			const start = requestParams(harness, "thread/realtime/start")[0];
			expect(start).toBeDefined();
			expect(Object.keys(start!).toSorted()).toEqual(
				[
					"clientManagedHandoffs",
					"codexResponseHandoffMode",
					"codexResponsesAsItems",
					"delegationAckFiller",
					"flushTranscriptTailOnSessionEnd",
					"includeStartupContext",
					"initialItems",
					"prompt",
					"realtimeEndInstructions",
					"realtimeSessionId",
					"realtimeStartInstructions",
					"threadId",
					"transport",
					"version",
					"voice",
					"outputModality",
				].toSorted(),
			);
			expect(start).toMatchObject({
				threadId: "coordinator-thread",
				clientManagedHandoffs: false,
				delegationAckFiller: true,
				flushTranscriptTailOnSessionEnd: true,
				codexResponsesAsItems: false,
				codexResponseHandoffMode: "bemTags",
				outputModality: "audio",
				includeStartupContext: true,
				initialItems: [
					{ role: "developer", text: '{"source":"fresh-process-brief","board":"Architecture"}' },
				],
				prompt: null,
				transport: { type: "webrtc", sdp: "offer-sdp" },
				version: "v3",
				voice: "breeze",
			});
			expect(start!.realtimeStartInstructions).toContain("persistent voice coordinator");
			expect(generation.adapter.transcript()).toEqual([
				expect.objectContaining({
					itemId: "assistant-item",
					role: "assistant",
					status: "final",
					text: "Hello",
				}),
			]);
			expect(await generation.adapter.appendText({ ...browser, text: "typed" })).toMatchObject({
				outcome: "delivered",
			});
			expect(await generation.adapter.appendSpeech({ ...browser, text: "spoken" })).toMatchObject({
				outcome: "delivered",
			});
			expect(await generation.adapter.stop(browser)).toMatchObject({ outcome: "delivered" });
			for (const method of [
				"thread/realtime/start",
				"thread/realtime/appendText",
				"thread/realtime/appendSpeech",
				"thread/realtime/stop",
			])
				expect(requestParams(harness, method)).toHaveLength(1);
			expect(JSON.stringify(harness.events)).not.toContain("awaiting_user");
		},
	);
});

test("real process rejects wrong child/thread/session/version, stale SDP, and flat transcript content", async () => {
	await withHarness(
		{
			startEvents: [
				{
					method: "thread/realtime/sdp",
					params: { threadId: "other-thread", sdp: "wrong-thread" },
				},
				{
					method: "thread/realtime/started",
					params: { threadId: "$THREAD", realtimeSessionId: "wrong-session", version: "v3" },
				},
				{
					method: "thread/realtime/started",
					params: { threadId: "$THREAD", realtimeSessionId: "$SESSION", version: "v2" },
				},
				{ method: "thread/realtime/sdp", params: { threadId: "$THREAD", sdp: "answer-sdp" } },
				{
					method: "thread/realtime/started",
					params: { threadId: "$THREAD", realtimeSessionId: "$SESSION", version: "v3" },
				},
			],
			afterStartEvents: [
				{
					method: "thread/realtime/transcript/delta",
					params: { threadId: "$THREAD", role: "assistant", delta: "flat" },
				},
			],
		},
		async (harness, generation) => {
			const browser = browserCorrelation("-gates");
			const foreign = createIdentityAuthority();
			generation.adapter.onNotification(
				makeNotification(foreign, "thread/realtime/sdp", {
					threadId: "coordinator-thread",
					sdp: "wrong-child",
				}),
			);
			const answer = await generation.adapter.createOffer({ ...browser, sdp: "offer-sdp" });
			expect(answer.sdp).toBe("answer-sdp");
			generation.adapter.onNotification(
				makeNotification(foreign, "thread/realtime/sdp", {
					threadId: "coordinator-thread",
					sdp: "stale-answer",
				}),
			);
			expect(generation.adapter.transcript()).toEqual([]);
			const diagnostics = harness.events.filter((event) => event.kind === "diagnostic");
			expect(diagnostics).toHaveLength(3);
			expect(diagnostics.map((event) => event.kind === "diagnostic" && event.code)).toEqual([
				"protocol",
				"protocol",
				"protocol",
			]);
			expect(JSON.stringify(harness.events)).not.toContain("flat");
		},
	);
});

test("real process recovers pages, detects cursor loops, and classifies lost append once across restart", async () => {
	await withHarness(
		{
			afterStartEvents: [
				{ method: "thread/realtime/error", params: { threadId: "$THREAD", message: "recover" } },
			],
			pages: [
				{
					data: [
						{
							type: "realtime",
							position: 20,
							item: {
								id: "item-b",
								realtimeSessionId: "$SESSION",
								type: "transcriptSegment",
								role: "assistant",
								text: "recovered",
							},
						},
					],
					nextCursor: "next",
					activeRealtimeSessionAtPageStart: "$SESSION",
				},
				{
					data: [
						{
							type: "realtime",
							position: 10,
							item: {
								id: "item-a",
								realtimeSessionId: "$SESSION",
								type: "transcriptSegment",
								role: "user",
								text: "first",
							},
						},
					],
					nextCursor: null,
					activeRealtimeSessionAtPageStart: "$SESSION",
				},
			],
		},
		async (harness, generation) => {
			const browser = browserCorrelation("-recovery");
			await generation.adapter.createOffer({ ...browser, sdp: "offer-sdp" });
			await waitForState(harness);
			expect(await generation.adapter.recover(browser)).toMatchObject({ outcome: "delivered" });
			expect(requestParams(harness, "thread/timeline/list").map((params) => params.cursor)).toEqual(
				[null, "next"],
			);
			expect(
				generation.adapter
					.transcript()
					.map(({ itemId, sequence, text }) => ({ itemId, sequence, text })),
			).toEqual([
				{ itemId: parseRealtimeItemId("item-a"), sequence: 0, text: "first" },
				{ itemId: parseRealtimeItemId("item-b"), sequence: 1, text: "recovered" },
			]);

			const looping = await createHarness({
				afterStartEvents: [
					{ method: "thread/realtime/error", params: { threadId: "$THREAD", message: "loop" } },
				],
				pages: [
					{ data: [], nextCursor: "loop", activeRealtimeSessionAtPageStart: "$SESSION" },
					{ data: [], nextCursor: "loop", activeRealtimeSessionAtPageStart: "$SESSION" },
				],
			});
			try {
				const loopGeneration = await looping.start();
				const loopBrowser = browserCorrelation("-loop");
				await loopGeneration.adapter.createOffer({ ...loopBrowser, sdp: "offer-sdp" });
				await waitForState(looping);
				expect(await loopGeneration.adapter.recover(loopBrowser)).toMatchObject({
					outcome: "outcome_unknown",
					reason: "transport_failure",
				});
			} finally {
				await looping.close();
			}

			harness.setControl({ exitOn: "thread/realtime/appendText" });
			const replacementOffer = browserCorrelation("-lost");
			expect(
				await generation.adapter.createOffer({ ...replacementOffer, sdp: "offer-sdp" }),
			).toMatchObject({
				sessionId: replacementOffer.sessionId,
				correlationId: replacementOffer.correlationId,
				sdp: "answer-sdp",
			});
			expect(
				await generation.adapter.appendText({ ...replacementOffer, text: "lost" }),
			).toMatchObject({ outcome: "outcome_unknown", reason: "response_lost" });
			await waitForGenerations(harness, 2);
			const second = harness.generations[1];
			if (!second) throw new Error("Restart generation missing.");
			await second.ready;
			expect(harness.owner.snapshot()).toMatchObject({
				state: "running",
				ready: true,
				accountReady: true,
				restartAttempt: 0,
			});
			expect(harness.owner.snapshot().lastExit?.classification).toBe("crash");
			expect(requestParams(harness, "thread/realtime/appendText")).toHaveLength(1);
			const freshBrowser = browserCorrelation("-fresh");
			await second.adapter.createOffer({ ...freshBrowser, sdp: "offer-sdp" });
			second.adapter.onNotification(
				makeNotification(generation.identity, "thread/realtime/sdp", {
					threadId: "coordinator-thread",
					sdp: "stale-old-child",
				}),
			);
			expect(await second.adapter.stop(freshBrowser)).toMatchObject({ outcome: "delivered" });
		},
	);
});

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() >= deadline)
			throw new Error("Timed out waiting for the realtime process fixture.");
		await new Promise((done) => setTimeout(done, 10));
	}
}

async function waitForState(harness: RealtimeHarness): Promise<void> {
	await waitFor(() =>
		harness.events.some(
			(event) => event.kind === "state" && event.state.phase === "recoverable_error",
		),
	);
}

async function waitForGenerations(harness: RealtimeHarness, count: number): Promise<void> {
	const deadline = Date.now() + 5_000;
	while (harness.generations.length !== count) {
		if (Date.now() >= deadline)
			throw new Error("Timed out waiting for the realtime process restart.");
		await new Promise((done) => setTimeout(done, 10));
	}
}
