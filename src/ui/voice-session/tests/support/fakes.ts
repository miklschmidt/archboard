import type { BrowserSnapshot } from "../../../../shared/codex-browser-model/index.js";
import type {
	RealtimeCorrelation,
	RealtimeMediaSnapshot,
	RealtimeState,
} from "../../../codex-realtime/index.js";
import type { BrowserWorkbenchMediaState } from "../../../codex-workbench-media/index.js";
import type {
	BrowserWorkbenchCapabilities,
	BrowserWorkbenchCommandTarget,
	BrowserWorkbenchState,
} from "../../../workbench-transport/index.js";
import type { VoiceRealtimePort, VoiceTransportPort } from "../../index.js";

type ExecutableLink = Extract<BrowserSnapshot["threadLink"], { readonly state: "executable" }>;
type Coordinator = BrowserSnapshot["coordinator"];
type Voice = BrowserSnapshot["voice"];

export const CORRELATION: RealtimeCorrelation = Object.freeze({
	sessionId: "session-1" as RealtimeCorrelation["sessionId"],
	correlationId: "session-1" as RealtimeCorrelation["correlationId"],
});

export function correlation(id: string): RealtimeCorrelation {
	return Object.freeze({
		sessionId: id as RealtimeCorrelation["sessionId"],
		correlationId: id as RealtimeCorrelation["correlationId"],
	});
}

export function mediaSnapshot(
	state: RealtimeState,
	overrides: Partial<RealtimeMediaSnapshot> = {},
): RealtimeMediaSnapshot {
	return Object.freeze({ correlation: CORRELATION, state, inputLevel: 0, ...overrides });
}

export function snapshot(overrides: Partial<BrowserSnapshot> = {}): BrowserSnapshot {
	return {
		kind: "snapshot",
		version: 1,
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: {
			kind: "thread_link",
			state: "executable",
			childId: "child-a" as ExecutableLink["childId"],
			epoch: "epoch-a" as ExecutableLink["epoch"],
			threadId: "workhorse-a" as ExecutableLink["threadId"],
			sourcePresentation: "standard",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
		timeline: null,
		queue: { kind: "queue", status: "empty", entries: [] },
		settings: [],
		approvals: [],
		dynamicApprovals: [],
		semantic: null,
		coordinator: {
			kind: "coordinator",
			state: "ready",
			threadId: "coordinator-a" as Coordinator["threadId"],
			activeTurnId: null,
			configuredModel: "gpt-5.6-luna",
			configuredEffort: "medium",
			model: "gpt-5.6-luna",
			effort: "medium",
			serviceTier: "priority",
			reason: null,
		},
		voice: {
			kind: "voice",
			state: "ready",
			realtimeSessionId: null,
			transcript: [],
			delivery: null,
			reason: null,
		},
		lease: null,
		operation: null,
		...overrides,
	};
}

export function coordinator(overrides: Partial<Coordinator>): Coordinator {
	return { ...snapshot().coordinator, ...overrides } as Coordinator;
}

export function voice(overrides: Partial<Voice>): Voice {
	return { ...snapshot().voice, ...overrides } as Voice;
}

export function connectedState(value: BrowserSnapshot = snapshot()): BrowserWorkbenchState {
	return {
		kind: "readiness",
		state: "thread_capable",
		connection: "connected",
		snapshot: value,
		sequence: 7,
	};
}

export function reconnectingState(value: BrowserSnapshot | null = null): BrowserWorkbenchState {
	return {
		kind: "connection",
		state: "reconnecting",
		connection: "reconnecting",
		snapshot: value,
		sequence: value === null ? null : 7,
		reason: "The Codex workbench connection dropped.",
	};
}

export function capabilities(
	overrides: Partial<BrowserWorkbenchCapabilities> = {},
): BrowserWorkbenchCapabilities {
	return {
		connected: true,
		readiness: "thread_capable",
		canReadAccount: true,
		canClaimLease: true,
		canRenewLease: true,
		canReleaseLease: true,
		canCommand: true,
		canThreadCommands: true,
		canRealtime: true,
		supportsCommand: () => true,
		...overrides,
	};
}

export function commandTarget(
	value: BrowserSnapshot = snapshot(),
	paneId = "pane-a",
): BrowserWorkbenchCommandTarget {
	const link = value.threadLink;
	if (link.state !== "executable") throw new Error("The fixture link is not executable.");
	return {
		commandId: "command-1" as BrowserWorkbenchCommandTarget["commandId"],
		paneId: paneId as BrowserWorkbenchCommandTarget["paneId"],
		childId: link.childId,
		epoch: link.epoch,
		capturedThreadLink: link,
	};
}

export interface TransportFake extends VoiceTransportPort {
	set: (state: BrowserWorkbenchState) => void;
	setCapabilities: (value: BrowserWorkbenchCapabilities) => void;
	setPaneId: (value: string) => void;
	failCapture: (message: string | null) => void;
	listenerCount: () => number;
	captureCalls: () => number;
}

export function transportFake(initial: BrowserWorkbenchState = connectedState()): TransportFake {
	let state = initial;
	let caps = capabilities();
	let paneId = "pane-a";
	let captureError: string | null = null;
	let captures = 0;
	const listeners = new Set<() => void>();
	const notify = (): void => {
		const notified = [...listeners];
		for (const listener of notified) listener();
	};
	return {
		state: () => state,
		snapshot: () => state.snapshot,
		capabilities: () => caps,
		captureCommandTarget: () => {
			captures += 1;
			if (captureError !== null) throw new Error(captureError);
			const value = state.snapshot;
			if (value === null) throw new Error("The Codex workbench has no active socket.");
			return commandTarget(value, paneId);
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		set: (next) => {
			state = next;
			notify();
		},
		setCapabilities: (value) => {
			caps = value;
			notify();
		},
		setPaneId: (value) => {
			paneId = value;
			notify();
		},
		failCapture: (message) => {
			captureError = message;
		},
		listenerCount: () => listeners.size,
		captureCalls: () => captures,
	};
}

export interface RealtimeFake extends VoiceRealtimePort {
	set: (snapshot: RealtimeMediaSnapshot | null, state?: BrowserWorkbenchMediaState) => void;
	setState: (state: BrowserWorkbenchMediaState) => void;
	onStart: (handler: () => Promise<RealtimeMediaSnapshot>) => void;
	onStop: (handler: () => Promise<RealtimeMediaSnapshot>) => void;
	calls: () => readonly string[];
	listenerCount: () => number;
}

export function realtimeFake(
	initial: RealtimeMediaSnapshot | null = null,
	initialState: BrowserWorkbenchMediaState = { state: "ready" },
): RealtimeFake {
	let media = initial;
	let ownerState = initialState;
	const calls: string[] = [];
	const listeners = new Set<() => void>();
	const publish = (): void => {
		const notified = [...listeners];
		for (const listener of notified) listener();
	};
	/** The real owner publishes every change it makes; so does this fake. */
	const setMedia = (next: RealtimeMediaSnapshot): RealtimeMediaSnapshot => {
		media = next;
		publish();
		return next;
	};
	let startHandler = async (): Promise<RealtimeMediaSnapshot> =>
		setMedia(mediaSnapshot({ phase: "listening", reason: "negotiation_succeeded" }));
	let stopHandler = async (): Promise<RealtimeMediaSnapshot> =>
		setMedia(mediaSnapshot({ phase: "closed", reason: "stopped" }));
	return {
		snapshot: () => media,
		state: () => ownerState,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		start: () => {
			calls.push("start");
			return startHandler();
		},
		stop: () => {
			calls.push("stop");
			return stopHandler();
		},
		set: (next, state) => {
			media = next;
			if (state !== undefined) ownerState = state;
			publish();
		},
		setState: (state) => {
			ownerState = state;
			publish();
		},
		onStart: (handler) => {
			startHandler = handler;
		},
		onStop: (handler) => {
			stopHandler = handler;
		},
		calls: () => [...calls],
		listenerCount: () => listeners.size,
	};
}
