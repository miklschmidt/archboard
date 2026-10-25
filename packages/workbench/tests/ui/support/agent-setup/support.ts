// A transport double whose published state a test moves by hand, and the
// snapshots it moves through on the way from signed out to a conversation.

import { type BrowserSnapshot } from "@archboard/codex-realtime-voice/contract";
import { BROWSER_IDLE_SPOKEN_APPROVAL } from "@archboard/codex-realtime-voice/schemas";

import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import type { BrowserWorkbenchState } from "@archboard/codex-realtime-voice/controllers";

const { decoder, validator } = createIdentityAuthorities().identity;

const ids = {
	threadId: decoder.adoptThreadId("thread-a"),
	turnId: decoder.adoptTurnId("turn-a"),
	itemId: decoder.adoptItemId("item-a"),
	loginId: decoder.adoptLoginId("login-a"),
	coordinatorId: decoder.adoptThreadId("coordinator-a"),
};

/** An executable link to the workhorse. */
const LINKED: BrowserSnapshot["threadLink"] = {
	kind: "thread_link",
	state: "executable",
	childId: validator.childId,
	epoch: validator.epoch,
	threadId: ids.threadId,
	sourcePresentation: "standard",
	status: "idle",
	loaded: true,
	canAcceptDirectInput: true,
	reason: null,
};

/** No link yet. */
const UNLINKED: BrowserSnapshot["threadLink"] = {
	kind: "thread_link",
	state: "unbound",
	childId: null,
	epoch: null,
	threadId: null,
	sourcePresentation: null,
	status: "notLoaded",
	loaded: false,
	canAcceptDirectInput: false,
	reason: null,
};

/**
 * A snapshot, thread capable with no conversation unless told otherwise.
 * @param overrides The fields to replace.
 * @returns The snapshot.
 */
function snapshot(overrides: Partial<BrowserSnapshot> = {}): BrowserSnapshot {
	return {
		kind: "snapshot",
		version: 1,
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: UNLINKED,
		timeline: null,
		queue: { kind: "queue", status: "empty", entries: [] },
		settings: [],
		approvals: [],
		dynamicApprovals: [],
		semantic: null,
		coordinator: {
			kind: "coordinator",
			state: "ready",
			threadId: ids.coordinatorId,
			activeTurnId: null,
			configuredModel: "model",
			configuredEffort: "low",
			model: "model",
			effort: "low",
			serviceTier: "priority",
			reason: null,
		},
		voice: {
			kind: "voice",
			state: "unavailable",
			realtimeSessionId: null,
			transcript: [],
			delivery: null,
			reason: "Voice is unavailable.",
		},
		spokenApproval: BROWSER_IDLE_SPOKEN_APPROVAL,
		lease: null,
		operation: null,
		...overrides,
	};
}

/**
 * A conversation of finished turns, one per prompt, in order.
 * @param prompts The person's prompts.
 * @returns The snapshot.
 */
function conversation(prompts: readonly string[]): BrowserSnapshot {
	return snapshot({
		threadLink: LINKED,
		timeline: {
			kind: "timeline",
			threadId: ids.threadId,
			turns: prompts.map((text, index) => ({
				turnId: decoder.adoptTurnId(`turn-${index}`),
				status: "completed" as const,
				items: [{ media: "prompt" as const, itemId: decoder.adoptItemId(`item-${index}`), text }],
				summary: "done",
				outputsIncluded: true,
				outputsTruncated: false,
				startedAtMs: null,
				completedAtMs: null,
				durationMs: null,
				error: null,
				plan: null,
			})),
			nextCursor: null,
			usage: null,
		},
	});
}

/** The snapshots a server passes through on the way to a conversation. */
const STAGES = {
	signedOut: snapshot({
		readiness: { kind: "readiness", state: "signed_out" },
		account: { kind: "account", state: "signed_out" },
	}),
	signingIn: snapshot({
		readiness: { kind: "readiness", state: "login_pending", loginId: ids.loginId },
		account: { kind: "account", state: "login_pending", loginId: ids.loginId, variant: "chatgpt" },
		login: {
			kind: "login",
			state: "pending",
			loginId: ids.loginId,
			variant: "chatgpt",
			authUrl: "https://auth.example.test/login",
		},
	}),
	/**
	 * Signed out again after a sign-in Codex gave up on.
	 * @param reason Codex's reason.
	 * @returns The snapshot.
	 */
	signInFailed: (reason: string): BrowserSnapshot =>
		snapshot({
			readiness: { kind: "readiness", state: "signed_out" },
			account: { kind: "account", state: "signed_out" },
			login: { kind: "login", state: "failed", loginId: ids.loginId, reason },
		}),
	/** Signing in, before Codex has named the provider's page. */
	signingInUnnamed: snapshot({
		readiness: { kind: "readiness", state: "login_pending", loginId: ids.loginId },
		account: { kind: "account", state: "login_pending", loginId: ids.loginId, variant: "chatgpt" },
		login: {
			kind: "login",
			state: "pending",
			loginId: ids.loginId,
			variant: "chatgpt",
			authUrl: null,
		},
	}),
	/** Codex runs and the account is being read again. */
	starting: snapshot({
		readiness: { kind: "readiness", state: "initialized" },
		account: { kind: "account", state: "unknown", reason: "Refreshing the Codex account." },
	}),
	/**
	 * Signed in, with the coordinator an earlier create could not start.
	 * @param reason The coordinator's reason.
	 * @returns The snapshot.
	 */
	coordinatorFailed: (reason: string): BrowserSnapshot =>
		snapshot({ coordinator: { ...snapshot().coordinator, state: "failed", reason } }),
	/** The server waits a known time before it starts Codex again. */
	restarting: snapshot({
		readiness: {
			kind: "readiness",
			state: "backoff",
			retryAtMs: 1_000,
			reason: "Codex exited; starting it again.",
		},
	}),
	ready: snapshot(),
	linked: snapshot({ threadLink: LINKED }),
	/**
	 * A conversation whose turn shows the person's prompt.
	 * @param text The prompt.
	 * @returns The snapshot.
	 */
	answered: (text: string): BrowserSnapshot =>
		snapshot({
			threadLink: LINKED,
			timeline: {
				kind: "timeline",
				threadId: ids.threadId,
				turns: [
					{
						turnId: ids.turnId,
						status: "inProgress",
						items: [{ media: "prompt", itemId: ids.itemId, text }],
						summary: "running",
						outputsIncluded: true,
						outputsTruncated: false,
						startedAtMs: null,
						completedAtMs: null,
						durationMs: null,
						error: null,
						plan: null,
					},
				],
				nextCursor: null,
				usage: null,
			},
		}),
	stopped: snapshot({
		readiness: { kind: "readiness", state: "stopped", reason: "Codex exited." },
	}),
};

/** A transport whose state the test sets. */
interface MovableTransport {
	readonly state: () => BrowserWorkbenchState;
	readonly subscribe: (listener: () => void) => () => void;
	/**
	 * Publish a snapshot.
	 * @param next The snapshot.
	 */
	readonly move: (next: BrowserSnapshot) => void;
}

/**
 * A transport double starting at one snapshot.
 * @param initial The first snapshot.
 * @returns The double.
 */
function movableTransport(initial: BrowserSnapshot): MovableTransport {
	let current: BrowserWorkbenchState = stateOf(initial);
	const listeners = new Set<() => void>();
	return {
		/**
		 * The state now.
		 * @returns The state.
		 */
		state: () => current,
		/**
		 * Listen for moves.
		 * @param listener Called after each move.
		 * @returns Stops listening.
		 */
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		/**
		 * Publish a snapshot.
		 * @param next The snapshot.
		 */
		move: (next) => {
			current = stateOf(next);
			for (const listener of listeners) listener();
		},
	};
}

/**
 * The published state of a connected snapshot.
 * @param value The snapshot.
 * @returns The state.
 */
function stateOf(value: BrowserSnapshot): BrowserWorkbenchState {
	return {
		kind: "readiness",
		state: value.readiness.state,
		connection: "connected",
		snapshot: value,
		sequence: 1,
	};
}

export { STAGES, conversation, ids, movableTransport, type MovableTransport };
