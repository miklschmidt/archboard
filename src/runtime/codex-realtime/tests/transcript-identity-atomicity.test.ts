import { expect, test } from "bun:test";

import {
	parseRealtimeCorrelationId,
	parseRealtimeItemId,
	parseRealtimeSessionId,
	type RealtimeSemanticEvent,
} from "../../../shared/codex-realtime-host/index.js";
import {
	createIdentityAuthorities,
	createIdentityLedger,
	type IdentityAuthority,
	type IdentityLedger,
	type ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import { decodeServerNotification } from "../../codex-protocol/index.js";
import type { SessionParams } from "../../codex-session/index.js";
import {
	createCodexRealtimeAdapter,
	type CodexRealtimeAdapter,
	type CodexRealtimeAdapterOptions,
} from "../index.js";

type TimelinePage = Awaited<ReturnType<CodexRealtimeAdapterOptions["session"]["timelineListPage"]>>;

interface Deferred<Value> {
	readonly promise: Promise<Value>;
	readonly resolve: (value: Value) => void;
}

function deferred<Value>(): Deferred<Value> {
	let resolve!: (value: Value) => void;
	const promise = new Promise<Value>((onResolve) => {
		resolve = onResolve;
	});
	return { promise, resolve };
}

interface Harness {
	readonly adapter: CodexRealtimeAdapter;
	readonly identity: IdentityAuthority;
	readonly ledger: IdentityLedger;
	readonly starts: SessionParams<"thread/realtime/start">[];
	readonly timelineRequests: SessionParams<"thread/timeline/list">[];
	readonly transcriptEvents: RealtimeSemanticEvent[];
	readonly coordinatorThreadId: ThreadId;
	timelinePages: Array<TimelinePage | Promise<TimelinePage>>;
}

const COORDINATOR_THREAD = "atomic-recovery-coordinator";

function harness(): Harness {
	const ledger = createIdentityLedger();
	const identity = createIdentityAuthorities(ledger).identity;
	const [linkedThreadId, coordinatorThreadId] = identity.decoder.adoptCodexResponseIdentities({
		threadIds: ["atomic-recovery-linked", COORDINATOR_THREAD],
	}).threadIds;
	if (!linkedThreadId || !coordinatorThreadId) {
		throw new Error("Missing thread identities.");
	}
	const starts: SessionParams<"thread/realtime/start">[] = [];
	const timelineRequests: SessionParams<"thread/timeline/list">[] = [];
	const state: Pick<Harness, "timelinePages"> = { timelinePages: [] };
	const adapter = createCodexRealtimeAdapter({
		identity,
		currentBinding: () => ({
			child: identity.validator.childId,
			epoch: identity.validator.epoch,
			linkedThreadId,
			coordinatorThreadId,
		}),
		boardCatalogue: {
			read: () => '{"type":"archboard_board_catalogue","boards":[],"omitted":0}',
			subscribe: () => () => {},
		},
		freshSemanticBrief: () => '{"source":"transcript-identity-atomicity"}',
		session: {
			realtimeStart: async (params) => {
				starts.push(params);
				return {};
			},
			realtimeAppendText: async () => ({}),
			threadInjectItems: async () => ({}),
			realtimeAppendSpeech: async () => ({}),
			realtimeStop: async () => ({}),
			timelineListPage: async (params) => {
				timelineRequests.push(params);
				const response = state.timelinePages.shift();
				if (!response) {
					throw new Error("Unexpected timeline request.");
				}
				return response;
			},
		},
	});
	const transcriptEvents: RealtimeSemanticEvent[] = [];
	adapter.onSemanticEvent((event) => {
		if (event.kind === "transcript") {
			transcriptEvents.push(event);
		}
	});
	return {
		adapter,
		identity,
		ledger,
		starts,
		timelineRequests,
		transcriptEvents,
		coordinatorThreadId,
		get timelinePages() {
			return state.timelinePages;
		},
		set timelinePages(value) {
			state.timelinePages = value;
		},
	};
}

function notify(h: Harness, method: string, params: unknown): void {
	h.adapter.onNotification({
		correlation: {
			child: h.identity.validator.childId,
			epoch: h.identity.validator.epoch,
			requestId: null,
		},
		notification: decodeServerNotification({ method, params }),
	});
}

async function started(h: Harness, recoverable = true) {
	const browser = {
		sessionId: parseRealtimeSessionId("atomic-recovery-session"),
		correlationId: parseRealtimeCorrelationId("atomic-recovery-correlation"),
	};
	const answer = h.adapter.createOffer({ ...browser, sdp: "offer" });
	await Promise.resolve();
	const wireSessionId = h.starts[0]?.realtimeSessionId;
	if (!wireSessionId) {
		throw new Error("Realtime start did not run.");
	}
	notify(h, "thread/realtime/sdp", { threadId: COORDINATOR_THREAD, sdp: "answer" });
	notify(h, "thread/realtime/started", {
		threadId: COORDINATOR_THREAD,
		realtimeSessionId: wireSessionId,
		version: "v3",
	});
	await answer;
	if (recoverable) {
		notify(h, "thread/realtime/error", {
			threadId: COORDINATOR_THREAD,
			message: "recover transcript",
		});
	}
	return { browser, wireSessionId };
}

function page(
	rawItemId: string,
	wireSessionId: string,
	nextCursor: string | null,
	position = 10,
): TimelinePage {
	return {
		data: [
			{
				type: "realtime",
				position,
				item: {
					id: rawItemId,
					realtimeSessionId: wireSessionId,
					type: "transcriptSegment",
					role: "assistant",
					text: rawItemId,
				},
			},
		],
		nextCursor,
		activeRealtimeSessionAtPageStart: wireSessionId,
	};
}

function issuedItems(h: Harness): readonly string[] {
	return [...(h.ledger.issued.get("item") ?? [])];
}

async function waitForTimelineRequests(h: Harness, count: number): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt++) {
		if (h.timelineRequests.length === count) {
			return;
		}
		await Promise.resolve();
	}
	throw new Error(`Expected ${count} timeline requests.`);
}

test("recovery issues and publishes only after every page succeeds", async () => {
	const h = harness();
	try {
		const active = await started(h);
		const secondPage = deferred<TimelinePage>();
		h.timelinePages = [page("first-page-item", active.wireSessionId, "next"), secondPage.promise];
		const recovery = h.adapter.recover(active.browser);
		await waitForTimelineRequests(h, 2);
		expect(h.adapter.transcript()).toEqual([]);
		expect(issuedItems(h)).toEqual([]);
		expect(h.transcriptEvents).toEqual([]);

		secondPage.resolve(page("second-page-item", active.wireSessionId, null, 20));
		expect(await recovery).toMatchObject({ outcome: "delivered" });
		expect(h.adapter.transcript().map(({ itemId }) => itemId)).toEqual([
			parseRealtimeItemId(h.identity.decoder.resolveItemId("first-page-item")),
			parseRealtimeItemId(h.identity.decoder.resolveItemId("second-page-item")),
		]);
		expect(issuedItems(h)).toHaveLength(2);
		expect(h.transcriptEvents).toHaveLength(2);
	} finally {
		h.adapter.dispose();
	}
});

test("late invalid recovery leaves transcript and authority unchanged", async () => {
	const h = harness();
	try {
		const active = await started(h);
		const oversized = "x".repeat(4_097);
		h.timelinePages = [
			page("valid-first-page", active.wireSessionId, "next"),
			page(oversized, active.wireSessionId, null, 20),
		];
		expect(await h.adapter.recover(active.browser)).toMatchObject({
			outcome: "outcome_unknown",
			reason: "transport_failure",
		});
		expect(h.adapter.transcript()).toEqual([]);
		expect(issuedItems(h)).toEqual([]);
		expect([...h.ledger.rawByIdentity.values()]).not.toContain(oversized);
		expect(h.transcriptEvents).toEqual([]);
	} finally {
		h.adapter.dispose();
	}
});

test("cursor-loop recovery leaves transcript and authority unchanged", async () => {
	const h = harness();
	try {
		const active = await started(h);
		h.timelinePages = [
			page("loop-first-page", active.wireSessionId, "loop"),
			page("loop-second-page", active.wireSessionId, "loop", 20),
		];
		expect(await h.adapter.recover(active.browser)).toMatchObject({
			outcome: "outcome_unknown",
			reason: "transport_failure",
		});
		expect(h.adapter.transcript()).toEqual([]);
		expect(issuedItems(h)).toEqual([]);
		expect(h.transcriptEvents).toEqual([]);
	} finally {
		h.adapter.dispose();
	}
});

test("live transcript identity accepts the authority maximum and rejects one byte more", async () => {
	const h = harness();
	try {
		const active = await started(h, false);
		const exactMaximum = "m".repeat(4_096);
		const oversized = "o".repeat(4_097);
		notify(h, "thread/realtime/item/started", {
			threadId: COORDINATOR_THREAD,
			item: {
				id: exactMaximum,
				realtimeSessionId: active.wireSessionId,
				type: "transcriptSegment",
				role: "assistant",
				text: "maximum",
			},
		});
		expect(h.adapter.transcript().map(({ itemId }) => itemId)).toEqual([
			parseRealtimeItemId(h.identity.decoder.resolveItemId(exactMaximum)),
		]);
		expect(issuedItems(h)).toHaveLength(1);

		notify(h, "thread/realtime/item/started", {
			threadId: COORDINATOR_THREAD,
			item: {
				id: oversized,
				realtimeSessionId: active.wireSessionId,
				type: "transcriptSegment",
				role: "assistant",
				text: "oversized",
			},
		});
		expect(h.adapter.transcript()).toHaveLength(1);
		expect(issuedItems(h)).toHaveLength(1);
		expect([...h.ledger.rawByIdentity.values()]).not.toContain(oversized);
		expect(h.transcriptEvents).toHaveLength(1);
	} finally {
		h.adapter.dispose();
	}
});
