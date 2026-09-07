import { describe, expect, test } from "bun:test";
import {
	parseRealtimeCorrelationId,
	parseRealtimeSessionId,
	type RealtimeSemanticEvent,
} from "../../../shared/codex-realtime-host/index.js";
import {
	createIdentityAuthority,
	type ChildEpoch,
	type ChildId,
	type ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import { decodeServerNotification } from "../../codex-protocol/index.js";
import type { SessionParams } from "../../codex-session/index.js";
import {
	createCodexRealtimeAdapter,
	type CodexRealtimeAdapter,
	type CodexRealtimeBinding,
} from "../index.js";

interface Harness {
	readonly adapter: CodexRealtimeAdapter;
	readonly events: RealtimeSemanticEvent[];
	readonly starts: SessionParams<"thread/realtime/start">[];
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly staleEpoch: ChildEpoch;
	readonly linkedWireThreadId: string;
	readonly coordinatorWireThreadId: string;
	readonly coordinatorThreadId: ThreadId;
	readonly binding: CodexRealtimeBinding;
	readonly setBinding: (binding: CodexRealtimeBinding | null) => void;
}

function harness(): Harness {
	const identity = createIdentityAuthority();
	const linkedWireThreadId = "identity-linked";
	const coordinatorWireThreadId = "identity-coordinator";
	const [linkedThreadId, coordinatorThreadId] = identity.decoder.adoptCodexResponseIdentities({
		threadIds: [linkedWireThreadId, coordinatorWireThreadId],
	}).threadIds;
	if (!linkedThreadId || !coordinatorThreadId) {
		throw new Error("Missing thread identity.");
	}
	const initialBinding: CodexRealtimeBinding = {
		child: identity.validator.childId,
		epoch: identity.validator.epoch,
		linkedThreadId,
		coordinatorThreadId,
	};
	let binding: CodexRealtimeBinding | null = initialBinding;
	const starts: SessionParams<"thread/realtime/start">[] = [];
	const adapter = createCodexRealtimeAdapter({
		identity,
		currentBinding: () => binding,
		boardCatalogue: {
			read: () => '{"type":"archboard_board_catalogue","boards":[],"omitted":0}',
			subscribe: () => () => {},
		},
		freshSemanticBrief: () => '{"source":"notification-identity-test"}',
		session: {
			realtimeStart: async (params) => {
				starts.push(params);
				return {};
			},
			realtimeAppendText: async () => ({}),
			threadInjectItems: async () => ({}),
			realtimeAppendSpeech: async () => ({}),
			realtimeStop: async () => ({}),
			timelineListPage: async () => ({
				data: [],
				nextCursor: null,
				activeRealtimeSessionAtPageStart: null,
			}),
		},
	});
	const events: RealtimeSemanticEvent[] = [];
	adapter.onSemanticEvent((event) => events.push(event));
	return {
		adapter,
		events,
		starts,
		child: identity.validator.childId,
		epoch: identity.validator.epoch,
		staleEpoch: identity.issuer.mintChildEpoch(),
		linkedWireThreadId,
		coordinatorWireThreadId,
		coordinatorThreadId,
		binding: initialBinding,
		setBinding: (value) => {
			binding = value;
		},
	};
}

function notify(
	h: Harness,
	method: string,
	params: unknown,
	correlation: { readonly child: ChildId; readonly epoch: ChildEpoch } = h,
): void {
	h.adapter.onNotification({
		correlation: { ...correlation, requestId: null },
		notification: decodeServerNotification({ method, params }),
	});
}

function browser() {
	return {
		sessionId: parseRealtimeSessionId("notification-identity-session"),
		correlationId: parseRealtimeCorrelationId("notification-identity-correlation"),
	};
}

async function begin(h: Harness) {
	const correlation = browser();
	const answer = h.adapter.createOffer({ ...correlation, sdp: "offer" });
	await Promise.resolve();
	const wireSessionId = h.starts[0]?.realtimeSessionId;
	if (!wireSessionId) {
		throw new Error("Start request missing.");
	}
	return { answer, correlation, wireSessionId };
}

describe("Codex realtime notification identity", () => {
	test("resolves a raw coordinator thread id before matching the canonical binding", async () => {
		const h = harness();
		const pending = await begin(h);
		try {
			notify(h, "thread/realtime/sdp", {
				threadId: h.coordinatorWireThreadId,
				sdp: "answer",
			});
			notify(h, "thread/realtime/started", {
				threadId: h.coordinatorWireThreadId,
				realtimeSessionId: pending.wireSessionId,
				version: "v3",
			});
			for (let turn = 0; turn < 3; turn++) {
				await Promise.resolve();
			}
			expect(h.events).toContainEqual(
				expect.objectContaining({
					kind: "state",
					state: { phase: "listening", reason: "negotiation_succeeded" },
				}),
			);
			expect(await pending.answer).toEqual({ ...pending.correlation, sdp: "answer" });
		} finally {
			h.adapter.dispose();
			await pending.answer.catch(() => undefined);
		}
	});

	test("rejects invalid, stale, and wrong notification identities", async () => {
		const h = harness();
		const pending = await begin(h);
		let settled = false;
		void pending.answer.then(() => (settled = true));
		const sdp = (threadId: string, value: string) =>
			notify(h, "thread/realtime/sdp", { threadId, sdp: value });

		// Canonical IDs are invalid as raw Codex input; unknown IDs are unissued.
		sdp(h.coordinatorThreadId, "canonical-as-raw");
		sdp("unknown-thread", "unissued");
		sdp(h.linkedWireThreadId, "wrong-thread");
		const foreign = createIdentityAuthority();
		notify(
			h,
			"thread/realtime/sdp",
			{ threadId: h.coordinatorWireThreadId, sdp: "wrong-child" },
			{ child: foreign.validator.childId, epoch: foreign.validator.epoch },
		);
		notify(
			h,
			"thread/realtime/sdp",
			{ threadId: h.coordinatorWireThreadId, sdp: "stale-epoch" },
			{ child: h.child, epoch: h.staleEpoch },
		);
		h.setBinding(null);
		sdp(h.coordinatorWireThreadId, "stale-binding-generation");
		h.setBinding(h.binding);
		notify(h, "thread/realtime/started", {
			threadId: h.coordinatorWireThreadId,
			realtimeSessionId: "wrong-session",
			version: "v3",
		});
		notify(h, "thread/realtime/started", {
			threadId: h.coordinatorWireThreadId,
			realtimeSessionId: pending.wireSessionId,
			version: "v2",
		});
		for (let turn = 0; turn < 3; turn++) {
			await Promise.resolve();
		}
		expect(settled).toBe(false);
		expect(
			h.events.some((event) => event.kind === "state" && event.state.phase === "listening"),
		).toBe(false);

		sdp(h.coordinatorWireThreadId, "answer");
		notify(h, "thread/realtime/started", {
			threadId: h.coordinatorWireThreadId,
			realtimeSessionId: pending.wireSessionId,
			version: "v3",
		});
		expect(await pending.answer).toEqual({ ...pending.correlation, sdp: "answer" });
	});
});
