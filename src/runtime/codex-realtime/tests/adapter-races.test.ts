import { afterEach, describe, expect, test } from "bun:test";
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
import { CodexSessionMutationError, type SessionParams } from "../../codex-session/index.js";
import {
	createCodexRealtimeAdapter,
	type CodexRealtimeAdapter,
	type CodexRealtimeAdapterOptions,
	type CodexRealtimeBinding,
} from "../index.js";
import { recordReducerCheckedEvents } from "./state-test-support.js";

interface Deferred<Value> {
	readonly promise: Promise<Value>;
	readonly resolve: (value: Value) => void;
	readonly reject: (error: Error) => void;
}

function deferred<Value>(): Deferred<Value> {
	let resolve!: (value: Value) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<Value>((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});
	return { promise, resolve, reject };
}

type StartResult = Awaited<ReturnType<CodexRealtimeAdapterOptions["session"]["realtimeStart"]>>;
type StopResult = Awaited<ReturnType<CodexRealtimeAdapterOptions["session"]["realtimeStop"]>>;
type AppendResult = Awaited<
	ReturnType<CodexRealtimeAdapterOptions["session"]["realtimeAppendText"]>
>;
type TimelineResult = Awaited<
	ReturnType<CodexRealtimeAdapterOptions["session"]["timelineListPage"]>
>;

interface RaceHarness {
	readonly adapter: CodexRealtimeAdapter;
	readonly events: RealtimeSemanticEvent[];
	readonly coordinatorThreadId: ThreadId;
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly starts: SessionParams<"thread/realtime/start">[];
	readonly start: Deferred<StartResult>;
	readonly stop: Deferred<StopResult>;
	readonly append: Deferred<AppendResult>;
	readonly timeline: Deferred<TimelineResult>;
	readonly replaceBinding: () => void;
	startFailure: Error | null;
}

const COORDINATOR_WIRE_THREAD_ID = "race-coordinator";

const transitionFailures: string[] = [];
afterEach(() => {
	expect(transitionFailures).toEqual([]);
	transitionFailures.length = 0;
});

function raceHarness(): RaceHarness {
	const identity = createIdentityAuthority();
	const adopted = identity.decoder.adoptCodexResponseIdentities({
		threadIds: ["race-linked", COORDINATOR_WIRE_THREAD_ID, "replacement-coordinator"],
	});
	const linkedThreadId = adopted.threadIds[0];
	const coordinatorThreadId = adopted.threadIds[1];
	const replacementThreadId = adopted.threadIds[2];
	if (!linkedThreadId || !coordinatorThreadId || !replacementThreadId) {
		throw new Error("Missing adopted race identity.");
	}
	const start = deferred<StartResult>();
	const stop = deferred<StopResult>();
	const append = deferred<AppendResult>();
	const timeline = deferred<TimelineResult>();
	const starts: SessionParams<"thread/realtime/start">[] = [];
	let binding: CodexRealtimeBinding = {
		child: identity.validator.childId,
		epoch: identity.validator.epoch,
		linkedThreadId,
		coordinatorThreadId,
	};
	const control = { startFailure: null as Error | null };
	const adapter = createCodexRealtimeAdapter({
		identity,
		currentBinding: () => binding,
		freshSemanticBrief: () => '{"source":"race"}',
		session: {
			realtimeStart: (params) => {
				starts.push(params);
				if (control.startFailure) {
					throw control.startFailure;
				}
				return start.promise;
			},
			realtimeAppendText: () => append.promise,
			realtimeAppendSpeech: async () => ({}),
			realtimeStop: () => stop.promise,
			timelineListPage: () => timeline.promise,
		},
	});
	const events: RealtimeSemanticEvent[] = [];
	recordReducerCheckedEvents(adapter, events, transitionFailures);
	const result: RaceHarness = {
		adapter,
		events,
		coordinatorThreadId,
		child: identity.validator.childId,
		epoch: identity.validator.epoch,
		starts,
		start,
		stop,
		append,
		timeline,
		replaceBinding: () => {
			binding = { ...binding, coordinatorThreadId: replacementThreadId };
		},
		get startFailure() {
			return control.startFailure;
		},
		set startFailure(value) {
			control.startFailure = value;
		},
	};
	return result;
}

function notify(h: RaceHarness, method: string, params: unknown): void {
	h.adapter.onNotification({
		correlation: { child: h.child, epoch: h.epoch, requestId: null },
		notification: decodeServerNotification({ method, params }),
	});
}

function browser(suffix: string) {
	return {
		sessionId: parseRealtimeSessionId(`race-session-${suffix}`),
		correlationId: parseRealtimeCorrelationId(`race-correlation-${suffix}`),
	};
}

async function begin(h: RaceHarness, suffix: string) {
	const correlation = browser(suffix);
	const startIndex = h.starts.length;
	const offer = h.adapter.createOffer({ ...correlation, sdp: "offer" });
	await Promise.resolve();
	const wireSessionId = h.starts[startIndex]?.realtimeSessionId;
	if (!wireSessionId) {
		throw new Error("Race start has no realtime session identity.");
	}
	return { correlation, offer, wireSessionId };
}

async function ready(h: RaceHarness, suffix: string) {
	const pending = await begin(h, suffix);
	h.start.resolve({});
	await Promise.resolve();
	notify(h, "thread/realtime/sdp", { threadId: COORDINATOR_WIRE_THREAD_ID, sdp: "answer" });
	notify(h, "thread/realtime/started", {
		threadId: COORDINATOR_WIRE_THREAD_ID,
		realtimeSessionId: pending.wireSessionId,
		version: "v3",
	});
	await pending.offer;
	return pending;
}

function close(h: RaceHarness): void {
	notify(h, "thread/realtime/closed", {
		threadId: COORDINATOR_WIRE_THREAD_ID,
		reason: "authoritative close",
	});
}

function transcript(h: RaceHarness, wireSessionId: string): void {
	notify(h, "thread/realtime/item/started", {
		threadId: COORDINATOR_WIRE_THREAD_ID,
		item: {
			id: "retained-item",
			realtimeSessionId: wireSessionId,
			type: "transcriptSegment",
			role: "assistant",
			text: "retained",
		},
	});
	notify(h, "thread/realtime/item/completed", {
		threadId: COORDINATOR_WIRE_THREAD_ID,
		item: {
			id: "retained-item",
			realtimeSessionId: wireSessionId,
			type: "transcriptSegment",
			role: "assistant",
			text: "retained",
		},
	});
}

function stateCount(h: RaceHarness, phase: string): number {
	return h.events.filter((event) => event.kind === "state" && event.state.phase === phase).length;
}

function stateEventCount(h: RaceHarness): number {
	return h.events.filter((event) => event.kind === "state").length;
}

function observeRejection(promise: Promise<unknown>) {
	const observation = {
		count: 0,
		message: Promise.resolve("pending"),
	};
	observation.message = promise.then(
		() => "resolved",
		(error: unknown) => {
			observation.count++;
			return error instanceof Error ? error.message : String(error);
		},
	);
	return observation;
}

describe("Codex realtime adapter races", () => {
	test("dispose before the invocation turn makes no start call", async () => {
		const h = raceHarness();
		const correlation = browser("disposed-before-call");
		const offer = h.adapter.createOffer({ ...correlation, sdp: "offer" });
		const rejection = observeRejection(offer);
		h.adapter.dispose();
		await Promise.resolve();
		expect(h.starts).toHaveLength(0);
		expect(await rejection.message).toBe("The Codex realtime adapter was disposed.");
		expect(rejection.count).toBe(1);
	});

	test("binding replacement before the invocation turn makes no start call", async () => {
		const h = raceHarness();
		const correlation = browser("stale-before-call");
		const offer = h.adapter.createOffer({ ...correlation, sdp: "offer" });
		const rejection = observeRejection(offer);
		h.replaceBinding();
		await Promise.resolve();
		expect(h.starts).toHaveLength(0);
		expect(await rejection.message).toBe(
			"Codex closed the realtime session before negotiation completed.",
		);
		expect(rejection.count).toBe(1);
		expect(stateCount(h, "closed")).toBe(1);
	});

	test("a synchronous start throw settles once and permits canonical recovery", async () => {
		const h = raceHarness();
		h.startFailure = new Error("synchronous start failure");
		const failed = await begin(h, "sync-throw");
		const rejection = observeRejection(failed.offer);
		expect(await rejection.message).toBe("synchronous start failure");
		expect(rejection.count).toBe(1);
		expect(h.starts).toHaveLength(1);
		expect(stateCount(h, "recoverable_error")).toBe(1);
		h.startFailure = null;
		h.timeline.resolve({
			data: [],
			nextCursor: null,
			activeRealtimeSessionAtPageStart: failed.wireSessionId,
		});
		expect(await h.adapter.recover(failed.correlation)).toMatchObject({ outcome: "delivered" });
		const replacement = await begin(h, "after-sync-throw");
		h.start.resolve({});
		notify(h, "thread/realtime/sdp", {
			threadId: COORDINATOR_WIRE_THREAD_ID,
			sdp: "answer",
		});
		notify(h, "thread/realtime/started", {
			threadId: COORDINATOR_WIRE_THREAD_ID,
			realtimeSessionId: replacement.wireSessionId,
			version: "v3",
		});
		await replacement.offer;
		expect(h.starts).toHaveLength(2);
	});

	test("start error owns rejection before a late RPC rejection", async () => {
		const h = raceHarness();
		const pending = await begin(h, "rpc-reject");
		const rejection = observeRejection(pending.offer);
		notify(h, "thread/realtime/error", {
			threadId: COORDINATOR_WIRE_THREAD_ID,
			message: "start failed first",
		});
		expect(await rejection.message).toBe("start failed first");
		h.start.reject(new Error("late RPC rejection"));
		await Promise.resolve();
		expect(stateCount(h, "recoverable_error")).toBe(1);
		expect(rejection.count).toBe(1);
		expect(h.events.filter((event) => event.kind === "diagnostic")).toHaveLength(1);
	});

	test("start error makes late RPC success, SDP, and readiness inert", async () => {
		const h = raceHarness();
		const pending = await begin(h, "late-gates");
		const rejection = observeRejection(pending.offer);
		notify(h, "thread/realtime/error", {
			threadId: COORDINATOR_WIRE_THREAD_ID,
			message: "start closed",
		});
		expect(await rejection.message).toBe("start closed");
		h.start.resolve({});
		await Promise.resolve();
		notify(h, "thread/realtime/sdp", { threadId: COORDINATOR_WIRE_THREAD_ID, sdp: "late" });
		notify(h, "thread/realtime/started", {
			threadId: COORDINATOR_WIRE_THREAD_ID,
			realtimeSessionId: pending.wireSessionId,
			version: "v3",
		});
		expect(stateCount(h, "recoverable_error")).toBe(1);
		expect(stateCount(h, "listening")).toBe(0);
		expect(rejection.count).toBe(1);
	});

	test("start error beats SDP and readiness gates waiting on RPC success", async () => {
		const h = raceHarness();
		const pending = await begin(h, "competing-gates");
		const rejection = observeRejection(pending.offer);
		notify(h, "thread/realtime/sdp", {
			threadId: COORDINATOR_WIRE_THREAD_ID,
			sdp: "early",
		});
		notify(h, "thread/realtime/started", {
			threadId: COORDINATOR_WIRE_THREAD_ID,
			realtimeSessionId: pending.wireSessionId,
			version: "v3",
		});
		notify(h, "thread/realtime/error", {
			threadId: COORDINATOR_WIRE_THREAD_ID,
			message: "error won",
		});
		expect(await rejection.message).toBe("error won");
		h.start.resolve({});
		await Promise.resolve();
		expect(stateCount(h, "listening")).toBe(0);
		expect(rejection.count).toBe(1);
	});

	for (const completion of ["resolve", "reject"] as const) {
		test(`authoritative close wins while stop awaits ${completion}`, async () => {
			const h = raceHarness();
			const active = await ready(h, `stop-${completion}`);
			transcript(h, active.wireSessionId);
			const outcome = h.adapter.stop(active.correlation);
			close(h);
			const stateEventsAtClose = stateEventCount(h);
			if (completion === "resolve") {
				h.stop.resolve({});
			} else {
				h.stop.reject(
					new CodexSessionMutationError("thread/realtime/stop", "outcome_unknown", "late"),
				);
			}
			expect(await outcome).toMatchObject({ outcome: "outcome_unknown", reason: "response_lost" });
			expect(h.adapter.transcript()).toHaveLength(1);
			expect(stateCount(h, "closed")).toBe(1);
			expect(stateEventCount(h)).toBe(stateEventsAtClose);
		});
	}

	for (const completion of ["resolve", "reject"] as const) {
		test(`authoritative close wins while recovery awaits ${completion}`, async () => {
			const h = raceHarness();
			const active = await ready(h, `recovery-${completion}`);
			transcript(h, active.wireSessionId);
			notify(h, "thread/realtime/error", {
				threadId: COORDINATOR_WIRE_THREAD_ID,
				message: "recoverable",
			});
			const outcome = h.adapter.recover(active.correlation);
			close(h);
			const stateEventsAtClose = stateEventCount(h);
			if (completion === "resolve") {
				h.timeline.resolve({
					data: [],
					nextCursor: null,
					activeRealtimeSessionAtPageStart: active.wireSessionId,
				});
			} else {
				h.timeline.reject(new Error("late timeline failure"));
			}
			expect(await outcome).toMatchObject({ outcome: "outcome_unknown", reason: "response_lost" });
			expect(h.adapter.transcript()).toHaveLength(1);
			expect(stateCount(h, "closed")).toBe(1);
			expect(stateEventCount(h)).toBe(stateEventsAtClose);
		});
	}

	test("authoritative close invalidates an in-flight append generation", async () => {
		const h = raceHarness();
		const active = await ready(h, "append");
		const outcome = h.adapter.appendText({ ...active.correlation, text: "late append" });
		close(h);
		const stateEventsAtClose = stateEventCount(h);
		h.append.resolve({});
		expect(await outcome).toMatchObject({ outcome: "outcome_unknown", reason: "response_lost" });
		expect(stateEventCount(h)).toBe(stateEventsAtClose);
	});
});
