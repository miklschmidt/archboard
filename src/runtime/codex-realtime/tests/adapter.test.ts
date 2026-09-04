import { afterEach, describe, expect, test } from "bun:test";
import {
	parseRealtimeCorrelationId,
	parseRealtimeItemId,
	parseRealtimeSessionId,
	type RealtimeSemanticEvent,
} from "../../../shared/codex-realtime-host/index.js";
import {
	createIdentityAuthority,
	type ChildEpoch,
	type ChildId,
	type ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	decodeServerNotification,
	type DecodedServerNotification,
} from "../../codex-protocol/index.js";
import { CodexSessionMutationError, type SessionParams } from "../../codex-session/index.js";
import type { TransportServerNotification } from "../../codex-transport/server-requests.js";
import {
	createCodexRealtimeAdapter,
	type CodexRealtimeAdapter,
	type CodexRealtimeAdapterOptions,
	type CodexRealtimeBinding,
} from "../index.js";
import { recordReducerCheckedEvents } from "./state-test-support.js";

type TimelinePage = Awaited<ReturnType<CodexRealtimeAdapterOptions["session"]["timelineListPage"]>>;

interface FakeSession {
	readonly port: CodexRealtimeAdapterOptions["session"];
	readonly starts: SessionParams<"thread/realtime/start">[];
	readonly texts: SessionParams<"thread/realtime/appendText">[];
	readonly speeches: SessionParams<"thread/realtime/appendSpeech">[];
	readonly stops: SessionParams<"thread/realtime/stop">[];
	readonly timelineRequests: SessionParams<"thread/timeline/list">[];
	timelinePages: TimelinePage[];
	appendSpeechFailure: Error | null;
	afterAppendText: (() => void) | null;
}

function fakeSession(): FakeSession {
	const starts: SessionParams<"thread/realtime/start">[] = [];
	const texts: SessionParams<"thread/realtime/appendText">[] = [];
	const speeches: SessionParams<"thread/realtime/appendSpeech">[] = [];
	const stops: SessionParams<"thread/realtime/stop">[] = [];
	const timelineRequests: SessionParams<"thread/timeline/list">[] = [];
	const state: FakeSession = {
		starts,
		texts,
		speeches,
		stops,
		timelineRequests,
		timelinePages: [],
		appendSpeechFailure: null,
		afterAppendText: null,
		port: {
			realtimeStart: async (params) => {
				starts.push(params);
				return {};
			},
			realtimeAppendText: async (params) => {
				texts.push(params);
				state.afterAppendText?.();
				return {};
			},
			realtimeAppendSpeech: async (params) => {
				speeches.push(params);
				if (state.appendSpeechFailure) throw state.appendSpeechFailure;
				return {};
			},
			realtimeStop: async (params) => {
				stops.push(params);
				return {};
			},
			timelineListPage: async (params) => {
				timelineRequests.push(params);
				return (
					state.timelinePages.shift() ?? {
						data: [],
						nextCursor: null,
						activeRealtimeSessionAtPageStart: null,
					}
				);
			},
		},
	};
	return state;
}

interface Harness {
	readonly adapter: CodexRealtimeAdapter;
	readonly session: FakeSession;
	readonly events: RealtimeSemanticEvent[];
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly linkedThreadId: ThreadId;
	readonly coordinatorThreadId: ThreadId;
	binding: CodexRealtimeBinding | null;
}

const transitionFailures: string[] = [];
afterEach(() => {
	expect(transitionFailures).toEqual([]);
	transitionFailures.length = 0;
});

function harness(): Harness {
	const identity = createIdentityAuthority();
	const adopted = identity.decoder.adoptCodexResponseIdentities({
		threadIds: ["linked-thread", "coordinator-thread", "other-thread"],
	});
	const linkedThreadId = adopted.threadIds[0];
	const coordinatorThreadId = adopted.threadIds[1];
	if (!linkedThreadId || !coordinatorThreadId)
		throw new Error("Thread identities were not adopted.");
	const session = fakeSession();
	const events: RealtimeSemanticEvent[] = [];
	const bindingState: { binding: CodexRealtimeBinding | null } = {
		binding: {
			child: identity.validator.childId,
			epoch: identity.validator.epoch,
			linkedThreadId,
			coordinatorThreadId,
		},
	};
	const adapter = createCodexRealtimeAdapter({
		session: session.port,
		identity,
		freshSemanticBrief: () => semanticBrief(),
		currentBinding: () => bindingState.binding,
	});
	recordReducerCheckedEvents(adapter, events, transitionFailures);
	return {
		adapter,
		session,
		events,
		child: identity.validator.childId,
		epoch: identity.validator.epoch,
		linkedThreadId,
		coordinatorThreadId,
		get binding() {
			return bindingState.binding;
		},
		set binding(value) {
			bindingState.binding = value;
		},
	};
}

function semanticBrief(): string {
	return '{"source":"fresh_brief","board":"Architecture"}';
}

function notificationEvent(
	h: Harness,
	notification: DecodedServerNotification,
	identity: { child: ChildId; epoch: ChildEpoch } = h,
): TransportServerNotification {
	return {
		correlation: { child: identity.child, epoch: identity.epoch, requestId: null },
		notification,
	};
}

function notify(h: Harness, method: string, params: unknown): void {
	h.adapter.onNotification(notificationEvent(h, decodeServerNotification({ method, params })));
}

function correlation(suffix = "") {
	return {
		sessionId: parseRealtimeSessionId(`browser-session${suffix}`),
		correlationId: parseRealtimeCorrelationId(`browser-correlation${suffix}`),
	};
}

async function started(
	h: Harness,
	suffix = "",
): Promise<{
	readonly wireSessionId: string;
	readonly correlation: ReturnType<typeof correlation>;
}> {
	const browser = correlation(suffix);
	const startIndex = h.session.starts.length;
	const answer = h.adapter.createOffer({ ...browser, sdp: "offer-sdp" });
	await Promise.resolve();
	const start = h.session.starts[startIndex];
	if (!start?.realtimeSessionId) throw new Error("Start did not mint a realtime identity.");
	notify(h, "thread/realtime/sdp", {
		threadId: h.coordinatorThreadId,
		sdp: "answer-sdp",
	});
	notify(h, "thread/realtime/started", {
		threadId: h.coordinatorThreadId,
		realtimeSessionId: start.realtimeSessionId,
		version: "v3",
	});
	expect(await answer).toEqual({ ...browser, sdp: "answer-sdp" });
	return { wireSessionId: start.realtimeSessionId, correlation: browser };
}

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
		if (!start?.realtimeSessionId) throw new Error("Start request missing.");
		expect(start.realtimeStartInstructions).toContain("persistent voice coordinator");
		expect(start).toEqual({
			threadId: h.coordinatorThreadId,
			clientManagedHandoffs: false,
			delegationAckFiller: true,
			flushTranscriptTailOnSessionEnd: true,
			codexResponsesAsItems: false,
			codexResponseHandoffMode: "bemTags",
			outputModality: "audio",
			includeStartupContext: true,
			initialItems: [{ role: "developer", text: semanticBrief() }],
			realtimeStartInstructions: start.realtimeStartInstructions,
			realtimeEndInstructions:
				"Finish the current sentence, preserve unresolved approvals for the visual workbench, and leave no work waiting on voice.",
			prompt: null,
			realtimeSessionId: start.realtimeSessionId,
			transport: { type: "webrtc", sdp: "offer-sdp" },
			version: "v3",
			voice: "breeze",
		});
		expect(h.adapter.generation()?.semanticBrief).toBe(semanticBrief());
		notify(h, "thread/realtime/sdp", { threadId: h.coordinatorThreadId, sdp: "answer" });
		await Promise.resolve();
		expect(settled).toBe(false);
		notify(h, "thread/realtime/started", {
			threadId: h.coordinatorThreadId,
			realtimeSessionId: "wrong",
			version: "v3",
		});
		expect(settled).toBe(false);
		notify(h, "thread/realtime/started", {
			threadId: h.coordinatorThreadId,
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
			threadId: h.coordinatorThreadId,
			item: {
				id: "item-a",
				realtimeSessionId: wireSessionId,
				type: "transcriptSegment",
				role: "assistant",
				text: "Hel",
			},
		});
		notify(h, "thread/realtime/item/transcript/delta", {
			threadId: h.coordinatorThreadId,
			itemId: "item-a",
			delta: "lo",
		});
		notify(h, "thread/realtime/item/completed", {
			threadId: h.coordinatorThreadId,
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
			notify(h, method, { threadId: h.coordinatorThreadId, ...params });
		}
		expect(h.adapter.transcript()).toEqual([
			expect.objectContaining({ itemId: "item-a", sequence: 0, status: "final", text: "Hello" }),
		]);
		expect(h.events.filter((entry) => entry.kind === "diagnostic")).toHaveLength(4);
		notify(h, "thread/realtime/error", {
			threadId: h.coordinatorThreadId,
			message: "server error",
		});
		notify(h, "thread/realtime/closed", {
			threadId: h.coordinatorThreadId,
			reason: "closed",
		});
		expect(h.adapter.transcript()).toHaveLength(1);
		expect(h.events.filter((entry) => entry.kind === "diagnostic")).toHaveLength(6);
		expect(JSON.stringify(h.events)).not.toContain("awaiting_user");
	});

	test("exhausts recovery, detects cursor loops, and merges live records by stable identity", async () => {
		const h = harness();
		const { wireSessionId, correlation: browser } = await started(h);
		notify(h, "thread/realtime/item/completed", {
			threadId: h.coordinatorThreadId,
			item: {
				id: "item-b",
				realtimeSessionId: wireSessionId,
				type: "transcriptSegment",
				role: "assistant",
				text: "live",
			},
		});
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
			threadId: h.coordinatorThreadId,
			message: "recover timeline",
		});
		expect(await h.adapter.recover(browser)).toEqual({ ...browser, outcome: "delivered" });
		expect(h.session.timelineRequests.map((request) => request.cursor)).toEqual([null, "next"]);
		expect(
			h.adapter.transcript().map(({ itemId, sequence, text }) => ({ itemId, sequence, text })),
		).toEqual([
			{ itemId: parseRealtimeItemId("item-a"), sequence: 0, text: "first" },
			{ itemId: parseRealtimeItemId("item-b"), sequence: 1, text: "recovered" },
		]);
		const looping = harness();
		const loopStart = await started(looping, "-loop");
		notify(looping, "thread/realtime/error", {
			threadId: looping.coordinatorThreadId,
			message: "recover loop",
		});
		looping.session.timelinePages = [
			{ data: [], nextCursor: "loop", activeRealtimeSessionAtPageStart: loopStart.wireSessionId },
			{ data: [], nextCursor: "loop", activeRealtimeSessionAtPageStart: loopStart.wireSessionId },
		];
		expect(await looping.adapter.recover(loopStart.correlation)).toMatchObject({
			outcome: "outcome_unknown",
			reason: "transport_failure",
		});
	});

	test("finalizes authoritative close, rejects stale commands, and accepts a replacement", async () => {
		const h = harness();
		const first = await started(h, "-first");
		notify(h, "thread/realtime/item/completed", {
			threadId: h.coordinatorThreadId,
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
		for (const outcome of staleOutcomes)
			expect(outcome).toMatchObject({ outcome: "not_delivered" });
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

	test("ignores mismatched child, epoch, thread, session, and version and cleans up pending start", async () => {
		const h = harness();
		const browser = correlation();
		const pending = h.adapter.createOffer({ ...browser, sdp: "offer" });
		await Promise.resolve();
		const start = h.session.starts[0];
		if (!start?.realtimeSessionId) throw new Error("Start request missing.");
		const other = createIdentityAuthority();
		h.adapter.onNotification(
			notificationEvent(
				h,
				decodeServerNotification({
					method: "thread/realtime/sdp",
					params: { threadId: h.coordinatorThreadId, sdp: "wrong-child" },
				}),
				{ child: other.validator.childId, epoch: other.validator.epoch },
			),
		);
		notify(h, "thread/realtime/started", {
			threadId: h.linkedThreadId,
			realtimeSessionId: start.realtimeSessionId,
			version: "v2",
		});
		h.adapter.dispose();
		await expect(pending).rejects.toThrow("disposed");
		expect(h.adapter.transcript()).toEqual([]);
	});
});
