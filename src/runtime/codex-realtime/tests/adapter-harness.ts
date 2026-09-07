import { expect } from "bun:test";
import {
	parseRealtimeCorrelationId,
	parseRealtimeSessionId,
	type RealtimeSemanticEvent,
} from "../../../shared/codex-realtime-host/index.js";
import {
	createIdentityAuthority,
	type ChildEpoch,
	type ChildId,
	type ItemId,
	type ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	decodeServerNotification,
	type DecodedServerNotification,
} from "../../codex-protocol/index.js";
import type { SessionParams } from "../../codex-session/index.js";
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
	readonly injections: SessionParams<"thread/inject_items">[];
	timelinePages: TimelinePage[];
	appendSpeechFailure: Error | null;
	afterAppendText: (() => void) | null;
	afterInjection: (() => void) | null;
}

function fakeSession(): FakeSession {
	const starts: SessionParams<"thread/realtime/start">[] = [];
	const texts: SessionParams<"thread/realtime/appendText">[] = [];
	const speeches: SessionParams<"thread/realtime/appendSpeech">[] = [];
	const stops: SessionParams<"thread/realtime/stop">[] = [];
	const timelineRequests: SessionParams<"thread/timeline/list">[] = [];
	const injections: SessionParams<"thread/inject_items">[] = [];
	const state: FakeSession = {
		starts,
		texts,
		speeches,
		stops,
		timelineRequests,
		injections,
		timelinePages: [],
		appendSpeechFailure: null,
		afterAppendText: null,
		afterInjection: null,
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
			threadInjectItems: async (params) => {
				injections.push(params);
				state.afterInjection?.();
				return {};
			},
			realtimeAppendSpeech: async (params) => {
				speeches.push(params);
				if (state.appendSpeechFailure) {
					throw state.appendSpeechFailure;
				}
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
	readonly itemId: (raw: string) => ItemId;
	binding: CodexRealtimeBinding | null;
}

const LINKED_WIRE_THREAD_ID = "linked-thread";
const COORDINATOR_WIRE_THREAD_ID = "coordinator-thread";

const transitionFailures: string[] = [];
function harness(
	boardCatalogue: CodexRealtimeAdapterOptions["boardCatalogue"] = {
		read: () => '{"type":"archboard_board_catalogue","boards":[],"omitted":0}',
		subscribe: () => () => {},
	},
): Harness {
	const identity = createIdentityAuthority();
	const adopted = identity.decoder.adoptCodexResponseIdentities({
		threadIds: [LINKED_WIRE_THREAD_ID, COORDINATOR_WIRE_THREAD_ID, "other-thread"],
	});
	const linkedThreadId = adopted.threadIds[0];
	const coordinatorThreadId = adopted.threadIds[1];
	if (!linkedThreadId || !coordinatorThreadId) {
		throw new Error("Thread identities were not adopted.");
	}
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
		boardCatalogue,
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
		itemId: identity.decoder.resolveItemId,
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
	if (!start?.realtimeSessionId) {
		throw new Error("Start did not mint a realtime identity.");
	}
	notify(h, "thread/realtime/sdp", {
		threadId: COORDINATOR_WIRE_THREAD_ID,
		sdp: "answer-sdp",
	});
	notify(h, "thread/realtime/started", {
		threadId: COORDINATOR_WIRE_THREAD_ID,
		realtimeSessionId: start.realtimeSessionId,
		version: "v3",
	});
	expect(await answer).toEqual({ ...browser, sdp: "answer-sdp" });
	return { wireSessionId: start.realtimeSessionId, correlation: browser };
}

export {
	type TimelinePage,
	type FakeSession,
	fakeSession,
	type Harness,
	LINKED_WIRE_THREAD_ID,
	COORDINATOR_WIRE_THREAD_ID,
	transitionFailures,
	harness,
	semanticBrief,
	notificationEvent,
	notify,
	correlation,
	started,
};
