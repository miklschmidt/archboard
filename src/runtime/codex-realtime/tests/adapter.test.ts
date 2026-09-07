import { afterEach, describe, expect, test } from "bun:test";
import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.js";
import { decodeServerNotification } from "../../codex-protocol/index.js";
import { parseRealtimeItemId } from "../../../shared/codex-realtime-host/index.js";
import { CodexSessionMutationError } from "../../codex-session/index.js";
import {
	COORDINATOR_WIRE_THREAD_ID,
	LINKED_WIRE_THREAD_ID,
	correlation,
	harness,
	notificationEvent,
	notify,
	semanticBrief,
	started,
	transitionFailures,
} from "./adapter-harness.js";

afterEach(() => {
	expect(transitionFailures).toEqual([]);
	transitionFailures.length = 0;
});

describe("Codex realtime adapter", () => {
	test("constructs the exact V3 start and waits for exact SDP and readiness events", async () => {
		const h = harness();
		const browser = correlation();
		let settled = false;
		const answer = h.adapter.createOffer({ ...browser, sdp: "offer-sdp" }).then((value) => {
			settled = true;
			return value;
		});
		await Promise.resolve();
		const start = h.session.starts[0];
		if (!start?.realtimeSessionId) {
			throw new Error("Start request missing.");
		}
		expect(start.realtimeStartInstructions).toContain(semanticBrief());
		expect(start.prompt).toBeString();
		expect(start.prompt?.length).toBeGreaterThan(0);
		expect(start).toEqual({
			threadId: h.coordinatorThreadId,
			clientManagedHandoffs: false,
			delegationAckFiller: true,
			flushTranscriptTailOnSessionEnd: true,
			codexResponsesAsItems: false,
			codexResponseHandoffMode: "bemTags",
			outputModality: "audio",
			includeStartupContext: true,
			initialItems: [
				{ role: "developer", text: semanticBrief() },
				{ role: "developer", text: '{"type":"archboard_board_catalogue","boards":[],"omitted":0}' },
			],
			realtimeStartInstructions: start.realtimeStartInstructions,
			realtimeEndInstructions:
				"Finish the current sentence, preserve unresolved approvals for the visual workbench, and leave no work waiting on voice.",
			prompt: start.prompt,
			realtimeSessionId: start.realtimeSessionId,
			transport: { type: "webrtc", sdp: "offer-sdp" },
			version: "v3",
			voice: "breeze",
		});
		expect(h.adapter.generation()?.semanticBrief).toBe(semanticBrief());
		notify(h, "thread/realtime/sdp", {
			threadId: COORDINATOR_WIRE_THREAD_ID,
			sdp: "answer",
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		notify(h, "thread/realtime/started", {
			threadId: COORDINATOR_WIRE_THREAD_ID,
			realtimeSessionId: "wrong",
			version: "v3",
		});
		expect(settled).toBe(false);
		notify(h, "thread/realtime/started", {
			threadId: COORDINATOR_WIRE_THREAD_ID,
			realtimeSessionId: start.realtimeSessionId,
			version: "v3",
		});
		expect(await answer).toEqual({ ...browser, sdp: "answer" });

		const h2 = harness();
		await started(h2);
		expect(h2.session.starts[0]?.realtimeSessionId).not.toBe(start.realtimeSessionId);
	});

	test("reduces only item-scoped transcript events and diagnoses rejected paths", async () => {
		const h = harness();
		const { wireSessionId } = await started(h);
		notify(h, "thread/realtime/item/started", {
			threadId: COORDINATOR_WIRE_THREAD_ID,
			item: {
				id: "item-a",
				realtimeSessionId: wireSessionId,
				type: "transcriptSegment",
				role: "assistant",
				text: "Hel",
			},
		});
		notify(h, "thread/realtime/item/transcript/delta", {
			threadId: COORDINATOR_WIRE_THREAD_ID,
			itemId: "item-a",
			delta: "lo",
		});
		notify(h, "thread/realtime/item/completed", {
			threadId: COORDINATOR_WIRE_THREAD_ID,
			item: {
				id: "item-a",
				realtimeSessionId: wireSessionId,
				type: "transcriptSegment",
				role: "assistant",
				text: "Hello",
			},
		});
		const rejectedEvents: readonly (readonly [string, Readonly<Record<string, unknown>>])[] = [
			["thread/realtime/transcript/delta", { role: "user", delta: "flat" }],
			["thread/realtime/transcript/done", { role: "user", text: "flat" }],
			[
				"thread/realtime/outputAudio/delta",
				{
					audio: {
						data: "AA==",
						sampleRate: 24_000,
						numChannels: 1,
						samplesPerChannel: 1,
						itemId: null,
					},
				},
			],
			["thread/realtime/itemAdded", { item: { type: "appendAudio" } }],
		];
		for (const [method, params] of rejectedEvents) {
			notify(h, method, { threadId: COORDINATOR_WIRE_THREAD_ID, ...params });
		}
		expect(h.adapter.transcript()).toEqual([
			expect.objectContaining({
				itemId: h.itemId("item-a"),
				sequence: 0,
				status: "final",
				text: "Hello",
			}),
		]);
		expect(h.events.filter((entry) => entry.kind === "diagnostic")).toHaveLength(4);
		notify(h, "thread/realtime/error", {
			threadId: COORDINATOR_WIRE_THREAD_ID,
			message: "server error",
		});
		notify(h, "thread/realtime/closed", {
			threadId: COORDINATOR_WIRE_THREAD_ID,
			reason: "closed",
		});
		expect(h.adapter.transcript()).toHaveLength(1);
		expect(h.events.filter((entry) => entry.kind === "diagnostic")).toHaveLength(6);
		expect(JSON.stringify(h.events)).not.toContain("awaiting_user");
	});

	test("exhausts recovery and overlays live records by stable identity", async () => {
		const h = harness();
		const { wireSessionId, correlation: browser } = await started(h);
		for (const [id, role, text] of [
			["item-b", "user", "live overlay"],
			["live-only", "assistant", "preserved"],
		] as const) {
			const item = { id, realtimeSessionId: wireSessionId, type: "transcriptSegment", role, text };
			for (const method of ["started", "completed"] as const) {
				notify(h, `thread/realtime/item/${method}`, {
					threadId: COORDINATOR_WIRE_THREAD_ID,
					item,
				});
			}
		}
		h.session.timelinePages = [
			{
				data: [
					{
						type: "realtime",
						position: 20,
						item: {
							id: "item-b",
							realtimeSessionId: wireSessionId,
							type: "transcriptSegment",
							role: "assistant",
							text: "recovered",
						},
					},
				],
				nextCursor: "next",
				activeRealtimeSessionAtPageStart: wireSessionId,
			},
			{
				data: [
					{
						type: "realtime",
						position: 10,
						item: {
							id: "item-a",
							realtimeSessionId: wireSessionId,
							type: "transcriptSegment",
							role: "user",
							text: "first",
						},
					},
				],
				nextCursor: null,
				activeRealtimeSessionAtPageStart: wireSessionId,
			},
		];
		notify(h, "thread/realtime/error", {
			threadId: COORDINATOR_WIRE_THREAD_ID,
			message: "recover timeline",
		});
		expect(await h.adapter.recover(browser)).toEqual({ ...browser, outcome: "delivered" });
		expect(h.session.timelineRequests.map((request) => request.cursor)).toEqual([null, "next"]);
		const itemA = parseRealtimeItemId(h.itemId("item-a"));
		const itemB = parseRealtimeItemId(h.itemId("item-b"));
		const liveOnly = parseRealtimeItemId(h.itemId("live-only"));
		expect(
			h.adapter
				.transcript()
				.map(({ itemId, sequence, role, text }) => ({ itemId, sequence, role, text })),
		).toEqual([
			{ itemId: itemA, sequence: 0, role: "user", text: "first" },
			{ itemId: itemB, sequence: 1, role: "assistant", text: "recovered" },
			{ itemId: liveOnly, sequence: 2, role: "assistant", text: "preserved" },
		]);
	});

	test("finalizes authoritative close, rejects stale commands, and accepts a replacement", async () => {
		const h = harness();
		const first = await started(h, "-first");
		notify(h, "thread/realtime/item/completed", {
			threadId: COORDINATOR_WIRE_THREAD_ID,
			item: {
				id: "closed-item",
				realtimeSessionId: first.wireSessionId,
				type: "realtimeSessionClosed",
				outcome: "failed",
			},
		});
		expect(h.events).toContainEqual(
			expect.objectContaining({ kind: "diagnostic", message: expect.stringContaining("failed") }),
		);
		const staleOutcomes = await Promise.all([
			h.adapter.appendText({ ...first.correlation, text: "late" }),
			h.adapter.stop(first.correlation),
			h.adapter.recover(first.correlation),
		]);
		for (const outcome of staleOutcomes) {
			expect(outcome).toMatchObject({ outcome: "not_delivered" });
		}
		await started(h, "-replacement");
		expect(h.session.starts).toHaveLength(2);
	});

	test("revalidates every mutation, attempts once, and classifies lost responses", async () => {
		const h = harness();
		const { correlation: browser } = await started(h);
		expect(await h.adapter.appendText({ ...browser, text: "hello" })).toMatchObject({
			outcome: "delivered",
		});
		expect(h.session.texts).toHaveLength(1);
		h.session.appendSpeechFailure = new CodexSessionMutationError(
			"thread/realtime/appendSpeech",
			"outcome_unknown",
			"lost",
		);
		expect(await h.adapter.appendSpeech({ ...browser, text: "speech" })).toMatchObject({
			outcome: "outcome_unknown",
			reason: "response_lost",
		});
		expect(h.session.speeches).toHaveLength(1);

		const original = h.binding;
		h.session.afterAppendText = () => {
			h.binding = null;
		};
		expect(await h.adapter.appendText({ ...browser, text: "uncertain" })).toMatchObject({
			outcome: "outcome_unknown",
			reason: "response_lost",
		});
		expect(h.session.texts).toHaveLength(2);
		h.binding = original;
		h.session.afterAppendText = null;
		h.binding = null;
		expect(await h.adapter.appendText({ ...browser, text: "stale" })).toMatchObject({
			outcome: "not_delivered",
			reason: "stale_session",
		});
		expect(h.session.texts).toHaveLength(2);
		h.binding = original;
		expect(await h.adapter.stop(browser)).toMatchObject({ outcome: "delivered" });
		expect(h.session.stops).toHaveLength(1);
		expect(await h.adapter.stop(browser)).toMatchObject({ outcome: "not_delivered" });
	});

	test("ignores mismatched child, thread, session, and version and cleans up pending start", async () => {
		const h = harness();
		const browser = correlation();
		const pending = h.adapter.createOffer({ ...browser, sdp: "offer" });
		await Promise.resolve();
		const start = h.session.starts[0];
		if (!start?.realtimeSessionId) {
			throw new Error("Start request missing.");
		}
		const other = createIdentityAuthority();
		h.adapter.onNotification(
			notificationEvent(
				h,
				decodeServerNotification({
					method: "thread/realtime/sdp",
					params: { threadId: COORDINATOR_WIRE_THREAD_ID, sdp: "wrong-child" },
				}),
				{ child: other.validator.childId, epoch: other.validator.epoch },
			),
		);
		notify(h, "thread/realtime/started", {
			threadId: LINKED_WIRE_THREAD_ID,
			realtimeSessionId: start.realtimeSessionId,
			version: "v2",
		});
		h.adapter.dispose();
		await expect(pending).rejects.toThrow("disposed");
		expect(h.adapter.transcript()).toEqual([]);
	});
});
