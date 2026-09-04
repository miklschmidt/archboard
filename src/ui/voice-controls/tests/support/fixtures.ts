import type { BrowserSnapshot } from "../../../../shared/codex-browser-model/index.js";
import type {
	RealtimeCorrelation,
	RealtimeMediaSnapshot,
	RealtimeState,
} from "../../../codex-realtime/index.js";
import type { BrowserWorkbenchMediaState } from "../../../codex-workbench-media/index.js";
import type {
	BrowserWorkbenchCapabilities,
	BrowserWorkbenchState,
} from "../../../workbench-transport/index.js";
import {
	projectVoiceSession,
	type VoiceSessionBinding,
	type VoiceSessionProjectionInput,
	type VoiceSessionView,
} from "../../../voice-session/index.js";
import { voiceControlState, type VoiceControlState } from "../../index.js";

type ExecutableLink = Extract<BrowserSnapshot["threadLink"], { readonly state: "executable" }>;

/** The one identity every fixture is bound to, so a test can assert it exactly. */
export const BINDING: VoiceSessionBinding = Object.freeze({
	paneId: "pane-a",
	childId: "child-a",
	epoch: "epoch-a",
	workhorseThreadId: "workhorse-a",
	coordinatorThreadId: "coordinator-a",
});

export const SESSION_ID = "session-1";

const CORRELATION: RealtimeCorrelation = Object.freeze({
	sessionId: SESSION_ID as RealtimeCorrelation["sessionId"],
	correlationId: SESSION_ID as RealtimeCorrelation["correlationId"],
});

export function workbenchSnapshot(): BrowserSnapshot {
	return {
		kind: "snapshot",
		version: 1,
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: {
			kind: "thread_link",
			state: "executable",
			childId: BINDING.childId as ExecutableLink["childId"],
			epoch: BINDING.epoch as ExecutableLink["epoch"],
			threadId: BINDING.workhorseThreadId as ExecutableLink["threadId"],
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
			threadId: BINDING.coordinatorThreadId as BrowserSnapshot["coordinator"]["threadId"],
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
	} as unknown as BrowserSnapshot;
}

export function connectedState(): BrowserWorkbenchState {
	return {
		kind: "readiness",
		state: "thread_capable",
		connection: "connected",
		snapshot: workbenchSnapshot(),
		sequence: 7,
	} as BrowserWorkbenchState;
}

export function reconnectingState(): BrowserWorkbenchState {
	return {
		kind: "connection",
		state: "reconnecting",
		connection: "reconnecting",
		snapshot: null,
		sequence: null,
		reason: "The Codex workbench connection dropped.",
	} as BrowserWorkbenchState;
}

export function capabilities(): BrowserWorkbenchCapabilities {
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
	} as BrowserWorkbenchCapabilities;
}

export function mediaSnapshot(state: RealtimeState, inputLevel = 0): RealtimeMediaSnapshot {
	return Object.freeze({ correlation: CORRELATION, state, inputLevel });
}

const READY_MEDIA: BrowserWorkbenchMediaState = Object.freeze({ state: "ready" });

function projectionInput(
	overrides: Partial<VoiceSessionProjectionInput> = {},
): VoiceSessionProjectionInput {
	return {
		media: null,
		mediaState: READY_MEDIA,
		transportState: connectedState(),
		capabilities: capabilities(),
		binding: BINDING,
		replaced: false,
		busy: false,
		closed: false,
		closedSessionId: null,
		controlFailure: null,
		...overrides,
	};
}

/** The realtime state that produces each control state, built from the real machine. */
const REALTIME_STATES = {
	requesting_permission: { phase: "requesting_permission", reason: "start_requested" },
	negotiating: { phase: "negotiating", reason: "permission_granted" },
	listening: { phase: "listening", reason: "negotiation_succeeded" },
	muted: { phase: "muted", reason: "mute_requested" },
	processing: { phase: "processing", reason: "input_completed" },
	agent_speaking: { phase: "speaking", reason: "assistant_started" },
	recovering: { phase: "requesting_permission", reason: "recovery_requested" },
	stopping: { phase: "stopping", reason: "stop_requested" },
	stopped: { phase: "closed", reason: "stopped" },
	retryable_failure: {
		phase: "recoverable_error",
		reason: "ice_disconnected",
		message: "The realtime audio connection was lost.",
	},
	terminal_failure: {
		phase: "terminal_error",
		reason: "protocol_error",
		message: "The realtime answer did not match its offer.",
	},
} as const satisfies Partial<Record<VoiceControlState, RealtimeState>>;

/**
 * One projected adapter view per control state, produced by the real
 * `projectVoiceSession` over real realtime and host state. Nothing here is a
 * hand-written view: a state that stops being reachable through the adapter
 * fails these owners instead of passing on a fixture nobody can produce.
 */
export function voiceView(state: VoiceControlState): VoiceSessionView {
	if (state === "unavailable")
		return projectVoiceSession(projectionInput({ transportState: reconnectingState() }));
	if (state === "ready") return projectVoiceSession(projectionInput());
	return projectVoiceSession(projectionInput({ media: mediaSnapshot(REALTIME_STATES[state]) }));
}

/** A live listening view carrying a level, for the meter owners. */
export function listeningView(inputLevel: number): VoiceSessionView {
	return projectVoiceSession(
		projectionInput({ media: mediaSnapshot(REALTIME_STATES.listening, inputLevel) }),
	);
}

/** The view a replaced binding produces: terminal, close-only. */
export function replacedView(): VoiceSessionView {
	return projectVoiceSession(projectionInput({ replaced: true }));
}

/** Asserts, at fixture time, that each fixture really is the state it claims. */
export function assertFixtureStates(states: readonly VoiceControlState[]): readonly string[] {
	return states.filter((state) => voiceControlState(voiceView(state)) !== state);
}
