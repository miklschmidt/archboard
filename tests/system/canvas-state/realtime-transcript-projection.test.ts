import { expect, test } from "bun:test";

import {
	createCodexRealtimeAdapter,
	type CodexRealtimeAdapter,
} from "../../../src/runtime/codex-realtime/index.js";
import { decodeServerNotification } from "../../../src/runtime/codex-protocol/index.js";
import type { SessionParams } from "../../../src/runtime/codex-session/index.js";
import { EMPTY_SPOKEN_APPROVAL_SNAPSHOT } from "../../../src/runtime/codex-spoken-approval/index.js";
import { createCodexBrowserModel } from "../../../src/shared/codex-browser-model/index.js";
import {
	parseRealtimeCorrelationId,
	parseRealtimeSessionId,
} from "../../../src/shared/codex-realtime-host/index.js";
import {
	createIdentityAuthorities,
	type ChildEpoch,
	type ChildId,
	type ThreadId,
} from "../../../src/shared/codex-workbench-identity/index.js";
import {
	projectCodexBrowserState,
	type BrowserProjectionInput,
} from "../../../src/server/codex-workbench/index.js";

const LINKED_THREAD = "projection-linked-thread";
const COORDINATOR_THREAD = "projection-coordinator-thread";
const TRANSCRIPT_ITEM = "controlled-user-transcript";

test("raw realtime transcript identities publish as canonical browser items", async () => {
	const authorities = createIdentityAuthorities();
	const identity = authorities.identity;
	const [linkedThreadId, coordinatorThreadId] = identity.decoder.adoptCodexResponseIdentities({
		threadIds: [LINKED_THREAD, COORDINATOR_THREAD],
	}).threadIds;
	if (!linkedThreadId || !coordinatorThreadId) throw new Error("Missing thread identities.");
	const starts: SessionParams<"thread/realtime/start">[] = [];
	const adapter = createCodexRealtimeAdapter({
		identity,
		currentBinding: () => ({
			child: identity.validator.childId,
			epoch: identity.validator.epoch,
			linkedThreadId,
			coordinatorThreadId,
		}),
		freshSemanticBrief: () => '{"source":"realtime-transcript-projection"}',
		session: {
			realtimeStart: async (params) => {
				starts.push(params);
				return {};
			},
			realtimeAppendText: async () => ({}),
			realtimeAppendSpeech: async () => ({}),
			realtimeStop: async () => ({}),
			timelineListPage: async () => ({
				data: [],
				nextCursor: null,
				activeRealtimeSessionAtPageStart: null,
			}),
		},
	});
	let transcriptEvents = 0;
	adapter.onSemanticEvent((event) => {
		if (event.kind === "transcript") transcriptEvents++;
	});
	const browser = {
		sessionId: parseRealtimeSessionId("projection-browser-session"),
		correlationId: parseRealtimeCorrelationId("projection-browser-correlation"),
	};
	try {
		const answer = adapter.createOffer({ ...browser, sdp: "offer" });
		await Promise.resolve();
		const wireSessionId = starts[0]?.realtimeSessionId;
		if (!wireSessionId) throw new Error("Realtime start did not run.");
		notify(adapter, identity.validator, "thread/realtime/sdp", {
			threadId: COORDINATOR_THREAD,
			sdp: "answer",
		});
		notify(adapter, identity.validator, "thread/realtime/started", {
			threadId: COORDINATOR_THREAD,
			realtimeSessionId: wireSessionId,
			version: "v3",
		});
		await answer;

		notify(adapter, identity.validator, "thread/realtime/item/started", {
			threadId: COORDINATOR_THREAD,
			item: {
				id: TRANSCRIPT_ITEM,
				realtimeSessionId: wireSessionId,
				type: "transcriptSegment",
				role: "user",
				text: "Hel",
			},
		});
		notify(adapter, identity.validator, "thread/realtime/item/transcript/delta", {
			threadId: COORDINATOR_THREAD,
			itemId: TRANSCRIPT_ITEM,
			delta: "lo",
		});
		notify(adapter, identity.validator, "thread/realtime/item/completed", {
			threadId: COORDINATOR_THREAD,
			item: {
				id: TRANSCRIPT_ITEM,
				realtimeSessionId: wireSessionId,
				type: "transcriptSegment",
				role: "user",
				text: "Hello",
			},
		});

		const projection = projectCodexBrowserState(
			createCodexBrowserModel(authorities),
			identity.decoder,
			projectionInput({
				adapter,
				linkedThreadId,
				coordinatorThreadId,
				childId: identity.validator.childId,
				epoch: identity.validator.epoch,
				browserSessionId: browser.sessionId,
			}),
		);
		expect(projection.tag).toBe("projected");
		if (projection.tag !== "projected") throw new Error(projection.message);
		expect(projection.snapshot.voice.transcript).toEqual([
			{
				itemId: identity.decoder.resolveItemId(TRANSCRIPT_ITEM),
				sequence: 0,
				speaker: "user",
				text: "Hello",
				final: true,
			},
		]);

		const published = adapter.transcript();
		const publishedEventCount = transcriptEvents;
		notify(adapter, identity.validator, "thread/realtime/item/completed", {
			threadId: COORDINATOR_THREAD,
			item: {
				id: "unissued-completed-item",
				realtimeSessionId: wireSessionId,
				type: "transcriptSegment",
				role: "assistant",
				text: "must not publish",
			},
		});
		notify(adapter, identity.validator, "thread/realtime/item/transcript/delta", {
			threadId: COORDINATOR_THREAD,
			itemId: "unissued-delta-item",
			delta: "must not publish",
		});
		expect(() =>
			notify(adapter, identity.validator, "thread/realtime/item/started", {
				threadId: COORDINATOR_THREAD,
				item: {
					id: "",
					realtimeSessionId: wireSessionId,
					type: "transcriptSegment",
					role: "assistant",
					text: "invalid",
				},
			}),
		).not.toThrow();
		const staleEpoch = identity.issuer.mintChildEpoch();
		notify(
			adapter,
			{ childId: identity.validator.childId, epoch: staleEpoch },
			"thread/realtime/item/started",
			{
				threadId: COORDINATOR_THREAD,
				item: {
					id: "stale-item",
					realtimeSessionId: wireSessionId,
					type: "transcriptSegment",
					role: "assistant",
					text: "stale",
				},
			},
		);
		notify(adapter, identity.validator, "thread/realtime/item/started", {
			threadId: LINKED_THREAD,
			item: {
				id: "wrong-thread-item",
				realtimeSessionId: wireSessionId,
				type: "transcriptSegment",
				role: "assistant",
				text: "wrong thread",
			},
		});
		notify(adapter, identity.validator, "thread/realtime/item/started", {
			threadId: COORDINATOR_THREAD,
			item: {
				id: "wrong-session-item",
				realtimeSessionId: "wrong-session",
				type: "transcriptSegment",
				role: "assistant",
				text: "wrong session",
			},
		});
		expect(adapter.transcript()).toEqual(published);
		expect(transcriptEvents).toBe(publishedEventCount);
		for (const raw of [
			"unissued-completed-item",
			"unissued-delta-item",
			"stale-item",
			"wrong-thread-item",
			"wrong-session-item",
		]) {
			expect(() => identity.decoder.resolveItemId(raw)).toThrow();
		}
	} finally {
		adapter.dispose();
	}
});

function notify(
	adapter: CodexRealtimeAdapter,
	identity: { readonly childId: ChildId; readonly epoch: ChildEpoch },
	method: string,
	params: unknown,
): void {
	adapter.onNotification({
		correlation: { child: identity.childId, epoch: identity.epoch, requestId: null },
		notification: decodeServerNotification({ method, params }),
	});
}

function projectionInput(input: {
	readonly adapter: CodexRealtimeAdapter;
	readonly linkedThreadId: ThreadId;
	readonly coordinatorThreadId: ThreadId;
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly browserSessionId: string;
}): BrowserProjectionInput {
	return {
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "signed_out" },
		login: { kind: "login", state: "idle" },
		threadLink: {
			kind: "thread_link",
			state: "executable",
			childId: input.childId,
			epoch: input.epoch,
			threadId: input.linkedThreadId,
			source: "appServer",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
		threadCandidates: { kind: "codex_thread_candidates", state: "unknown" },
		timeline: null,
		queue: { kind: "codex_queue", submissions: [] },
		settings: [],
		approvals: [],
		dynamicApprovals: [],
		semantic: { kind: "codex_semantic", outcome: null, freshness: null },
		coordinator: {
			kind: "codex_coordinator",
			state: "ready",
			threadId: input.coordinatorThreadId,
			configured: null,
			effective: null,
			reason: null,
		},
		voice: {
			kind: "codex_voice",
			mediaReady: true,
			generation: { browserSessionId: input.browserSessionId },
			coordinatorState: "ready",
			transcript: input.adapter.transcript(),
		},
		spokenApproval: EMPTY_SPOKEN_APPROVAL_SNAPSHOT,
		lease: null,
		operation: null,
	};
}
