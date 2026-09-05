import { expect, test } from "bun:test";

import {
	createHarness,
	latestState,
	makeNotification,
	waitFor,
	waitForGenerations,
	waitForState,
	withHarness,
} from "./fixtures/codex-realtime-process.ts";
import { composeCoordinatorInstructions } from "../../../src/runtime/codex-instructions/index.ts";
import { createIdentityAuthority } from "../../../src/shared/codex-workbench-identity/index.ts";
import { parseRealtimeItemId } from "../../../src/shared/codex-realtime-host/index.ts";
import {
	browserCorrelation,
	expectPendingOffer,
	readRecords,
	requestParams,
	waitForDiagnostic,
} from "./support/codex-realtime-assertions.ts";

const REALTIME_END_INSTRUCTIONS =
	"Finish the current sentence, preserve unresolved approvals for the visual workbench, and leave no work waiting on voice.";

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
			const records = readRecords(harness);
			const versionProbe = records.findIndex((entry) => entry["kind"] === "version_probe");
			const appServerSpawn = records.findIndex((entry) => entry["kind"] === "app_server_spawn");
			expect(records[versionProbe]).toMatchObject({ kind: "version_probe", args: ["--version"] });
			expect(records[appServerSpawn]).toMatchObject({
				kind: "app_server_spawn",
				args: ["app-server", "--stdio", "--strict-config"],
			});
			expect(versionProbe).toBeGreaterThanOrEqual(0);
			expect(appServerSpawn).toBeGreaterThan(versionProbe);
			const startResponses = records.filter(
				(entry) => entry["kind"] === "response" && entry["method"] === "thread/realtime/start",
			);
			expect(startResponses).toHaveLength(1);
			expect(startResponses[0]?.["result"]).toEqual({});
			const start = requestParams(harness, "thread/realtime/start")[0];
			expect(start).toBeDefined();
			expect(start).toEqual({
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
				realtimeStartInstructions: composeCoordinatorInstructions(),
				realtimeEndInstructions: REALTIME_END_INSTRUCTIONS,
				prompt: null,
				realtimeSessionId: start!["realtimeSessionId"],
				transport: { type: "webrtc", sdp: "offer-sdp" },
				version: "v3",
				voice: "breeze",
			});
			expect(start!["realtimeSessionId"]).toMatch(/^archboard:realtime-session:h[a-f0-9]{32}$/);
			// The fixture emits the after-start item events on timers after answering start.
			await waitFor(() =>
				generation.adapter.transcript().some((segment) => segment.status === "final"),
			);
			expect(generation.adapter.transcript()).toEqual([
				expect.objectContaining({
					itemId: parseRealtimeItemId(generation.identity.decoder.resolveItemId("assistant-item")),
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
			]) {
				expect(requestParams(harness, method)).toHaveLength(1);
			}
			expect(JSON.stringify(harness.events)).not.toContain("awaiting_user");
		},
	);
});

test("real process rejects wrong child/thread/session/version, stale SDP, and flat transcript content", async () => {
	await withHarness(
		{
			startDelayMs: 50,
			startEvents: [
				{
					method: "thread/realtime/sdp",
					params: { threadId: "other-thread", sdp: "wrong-thread" },
					delayMs: 0,
				},
				{
					method: "thread/realtime/started",
					params: { threadId: "$THREAD", realtimeSessionId: "wrong-session", version: "v3" },
					delayMs: 20,
				},
				{
					method: "thread/realtime/started",
					params: { threadId: "$THREAD", realtimeSessionId: "$SESSION", version: "v2" },
					delayMs: 20,
				},
				{
					method: "thread/realtime/sdp",
					params: { threadId: "$THREAD", sdp: "answer-sdp" },
					delayMs: 20,
				},
				{
					method: "thread/realtime/started",
					params: { threadId: "$THREAD", realtimeSessionId: "$SESSION", version: "v3" },
					delayMs: 20,
				},
			],
			afterStartEvents: [
				{
					method: "thread/realtime/transcript/delta",
					params: { threadId: "$THREAD", role: "assistant", delta: "flat" },
					delayMs: 150,
				},
			],
		},
		async (harness, generation) => {
			const browser = browserCorrelation("-gates");
			let settled = false;
			const pending = generation.adapter.createOffer({ ...browser, sdp: "offer-sdp" }).then(
				(answer) => {
					settled = true;
					return answer;
				},
				(error: unknown) => {
					settled = true;
					throw error;
				},
			);
			await waitFor(() => requestParams(harness, "thread/realtime/start").length === 1);
			const foreign = createIdentityAuthority();
			const sendSdp = (
				identity: typeof generation.identity,
				threadId: string,
				sdp: string,
				overrides: Parameters<typeof makeNotification>[3] = {},
			): void =>
				generation.adapter.onNotification(
					makeNotification(identity, "thread/realtime/sdp", { threadId, sdp }, overrides),
				);
			sendSdp(foreign, "coordinator-thread", "wrong-child", {
				epoch: generation.identity.validator.epoch,
			});
			expectPendingOffer(harness, settled);
			sendSdp(generation.identity, "coordinator-thread", "wrong-epoch-current-child", {
				epoch: foreign.validator.epoch,
			});
			expectPendingOffer(harness, settled);
			const wrongThread = generation.identity.decoder.adoptThreadId("other-thread");
			sendSdp(generation.identity, wrongThread, "wrong-thread-current-child");
			expectPendingOffer(harness, settled);
			const start = requestParams(harness, "thread/realtime/start")[0];
			if (typeof start?.["realtimeSessionId"] !== "string") {
				throw new Error("Pending start identity missing.");
			}
			generation.adapter.onNotification(
				makeNotification(generation.identity, "thread/realtime/started", {
					threadId: "coordinator-thread",
					realtimeSessionId: start["realtimeSessionId"],
					version: "v3",
				}),
			);
			// A matching started event must not make an invalid SDP answer usable.
			expectPendingOffer(harness, settled);
			await waitForDiagnostic(harness, 1);
			expectPendingOffer(harness, settled);
			await waitForDiagnostic(harness, 2);
			expectPendingOffer(harness, settled);
			const answer = await pending;
			expect(answer.sdp).toBe("answer-sdp");
			expect(latestState(harness)).toEqual({ phase: "listening", reason: "negotiation_succeeded" });
			await waitForDiagnostic(harness, 3);
			expect(latestState(harness)).toEqual({ phase: "listening", reason: "negotiation_succeeded" });
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

test("real process probes the pinned binary before spawn and rejects a wrong version", async () => {
	const harness = await createHarness({}, { version: "codex-cli 0.150.0" });
	try {
		const startFailure = harness.owner.start();
		await expect(startFailure).rejects.toMatchObject({ code: "binary_wrong_version" });
		await waitFor(() => harness.owner.snapshot().failure?.code === "binary_wrong_version");
		const records = readRecords(harness);
		const versionProbe = records.findIndex((entry) => entry["kind"] === "version_probe");
		const appServerSpawn = records.findIndex((entry) => entry["kind"] === "app_server_spawn");
		expect(records[versionProbe]).toMatchObject({
			kind: "version_probe",
			args: ["--version"],
			version: "codex-cli 0.150.0",
		});
		expect(versionProbe).toBeGreaterThanOrEqual(0);
		expect(appServerSpawn).toBe(-1);
		expect(harness.generations).toHaveLength(0);
		expect(harness.owner.snapshot()).toMatchObject({
			state: "terminal_failure",
			failure: { code: "binary_wrong_version" },
		});
	} finally {
		await harness.close();
	}
});

test("real process recovers pages, detects cursor loops, and classifies lost append once across restart", async () => {
	await withHarness(
		{
			afterStartEvents: [
				{
					method: "thread/realtime/item/started",
					params: {
						threadId: "$THREAD",
						item: {
							id: "item-a",
							realtimeSessionId: "$SESSION",
							type: "transcriptSegment",
							role: "assistant",
							text: "live",
						},
					},
				},
				{
					method: "thread/realtime/item/completed",
					params: {
						threadId: "$THREAD",
						item: {
							id: "item-a",
							realtimeSessionId: "$SESSION",
							type: "transcriptSegment",
							role: "assistant",
							text: "live",
						},
					},
				},
				{ method: "thread/realtime/error", params: { threadId: "$THREAD", message: "recover" } },
			],
			pages: [
				{
					data: [
						{
							type: "realtime",
							position: 10,
							item: {
								id: "item-a",
								realtimeSessionId: "$SESSION",
								type: "transcriptSegment",
								role: "assistant",
								text: "first",
							},
						},
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
			expect(latestState(harness)).toMatchObject({
				phase: "recoverable_error",
				reason: "realtime_unavailable",
			});
			expect(await generation.adapter.recover(browser)).toMatchObject({ outcome: "delivered" });
			expect(latestState(harness)).toEqual({ phase: "idle", reason: "recovered" });
			expect(
				requestParams(harness, "thread/timeline/list").map((params) => params["cursor"]),
			).toEqual([null, "next"]);
			expect(generation.adapter.transcript()).toHaveLength(2);
			const itemA = parseRealtimeItemId(generation.identity.decoder.resolveItemId("item-a"));
			const itemB = parseRealtimeItemId(generation.identity.decoder.resolveItemId("item-b"));
			expect(
				generation.adapter
					.transcript()
					.map(({ itemId, sequence, text }) => ({ itemId, sequence, text })),
			).toEqual([
				{ itemId: itemA, sequence: 0, text: "first" },
				{ itemId: itemB, sequence: 1, text: "recovered" },
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
				expect(latestState(looping)).toMatchObject({
					phase: "recoverable_error",
					reason: "recovery_failed",
					message: expect.stringContaining("cursor loop"),
				});
			} finally {
				await looping.close();
			}

			harness.setControl({ startDelayMs: 50, exitOn: "thread/realtime/appendText" });
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
			expect(latestState(harness)).toEqual({ phase: "listening", reason: "negotiation_succeeded" });
			await waitFor(() => harness.owner.snapshot().state === "backoff");
			expect(harness.owner.snapshot()).toMatchObject({
				state: "backoff",
				pid: null,
				restartAttempt: 1,
				lastExit: { classification: "crash" },
			});
			await waitForGenerations(harness, 2);
			const second = harness.generations[1];
			if (!second) {
				throw new Error("Restart generation missing.");
			}
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
			let freshSettled = false;
			const freshOffer = second.adapter
				.createOffer({ ...freshBrowser, sdp: "offer-sdp" })
				.then((answer) => {
					freshSettled = true;
					return answer;
				});
			await waitFor(() => requestParams(harness, "thread/realtime/start").length === 3);
			second.adapter.onNotification(
				makeNotification(generation.identity, "thread/realtime/sdp", {
					threadId: "coordinator-thread",
					sdp: "stale-old-child",
				}),
			);
			expectPendingOffer(harness, freshSettled);
			const freshStart = requestParams(harness, "thread/realtime/start")[2];
			if (typeof freshStart?.["realtimeSessionId"] !== "string") {
				throw new Error("Fresh start identity missing.");
			}
			const { decoder } = second.identity;
			const freshThread = decoder.serializeCodexIdentity(second.binding.coordinatorThreadId);
			second.adapter.onNotification(
				makeNotification(second.identity, "thread/realtime/started", {
					threadId: freshThread,
					realtimeSessionId: freshStart["realtimeSessionId"],
					version: "v3",
				}),
			);
			// A fresh generation must ignore stale SDP even after its own identity is started.
			expectPendingOffer(harness, freshSettled);
			second.adapter.onNotification(
				makeNotification(second.identity, "thread/realtime/sdp", {
					threadId: freshThread,
					sdp: "fresh-answer",
				}),
			);
			expect((await freshOffer).sdp).toBe("fresh-answer");
			expect(await second.adapter.stop(freshBrowser)).toMatchObject({ outcome: "delivered" });
		},
	);
});
