// Snapshots, states and a transport double for the runtime owners. Every
// identity is minted through the real authority so nothing asserts a string
// into an identity type.

import {
	BROWSER_IDLE_SPOKEN_APPROVAL,
	type BrowserApproval,
	type BrowserCommandLease,
	type BrowserSnapshot,
	type BrowserTimeline,
} from "@/shared/codex-browser-model";
import { createIdentityAuthorities } from "@/shared/codex-workbench-identity";
import type {
	BrowserCommandDraft,
	BrowserWorkbenchCommandIntent,
	BrowserWorkbenchCommandResult,
	BrowserWorkbenchSnapshotMessage,
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "@/ui/workbench-transport";

const authorities = createIdentityAuthorities();
const { decoder, issuer, validator } = authorities.identity;

const ids = {
	threadId: decoder.adoptThreadId("thread-a"),
	turnId: decoder.adoptTurnId("turn-a"),
	otherTurnId: decoder.adoptTurnId("turn-b"),
	itemId: decoder.adoptItemId("item-a"),
	requestId: decoder.adoptJsonRpcRequestId("request-a"),
	approvalId: decoder.adoptApprovalId("approval-a"),
	queuedA: decoder.adoptQueuedSubmissionId("queued-a"),
	queuedB: decoder.adoptQueuedSubmissionId("queued-b"),
	coordinatorId: decoder.adoptThreadId("coordinator-a"),
	childId: validator.childId,
	epoch: validator.epoch,
	commandId: issuer.mintBrowserCommandId(),
};

type Turn = BrowserTimeline["turns"][number];

/**
 * A timeline with one turn.
 * @param overrides The turn fields to replace.
 * @returns The timeline.
 */
function timeline(overrides: Partial<Turn> = {}): BrowserTimeline {
	return {
		kind: "timeline",
		threadId: ids.threadId,
		turns: [
			{
				turnId: ids.turnId,
				status: "completed",
				items: [{ media: "text", itemId: ids.itemId, text: "Authoritative response" }],
				summary: "Completed",
				outputsIncluded: true,
				outputsTruncated: false,
				...overrides,
			},
		],
		nextCursor: null,
	};
}

/**
 * A thread-capable snapshot with an executable link.
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
		threadLink: {
			kind: "thread_link",
			state: "executable",
			childId: ids.childId,
			epoch: ids.epoch,
			threadId: ids.threadId,
			sourcePresentation: "standard",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
		threadCandidates: {
			kind: "thread_candidates",
			state: "unknown",
			records: [],
			truncated: false,
			reason: null,
		},
		timeline: timeline(),
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
			configuredModel: "gpt-daybreak-blue-latest",
			configuredEffort: "low",
			model: "gpt-daybreak-blue-latest",
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
 * A connected thread-capable state.
 * @param value The snapshot.
 * @returns The state.
 */
function connected(value = snapshot()): BrowserWorkbenchState {
	return {
		kind: "readiness",
		state: "thread_capable",
		connection: "connected",
		snapshot: value,
		sequence: 1,
	};
}

/**
 * A pending command-execution approval.
 * @returns The approval.
 */
function approval(): BrowserApproval {
	return {
		kind: "approval",
		approvalKind: "command_execution",
		requestId: ids.requestId,
		threadId: ids.threadId,
		turnId: ids.turnId,
		itemId: ids.itemId,
		approvalId: ids.approvalId,
		expiresAtMs: 4_000_000_000_000,
		lifecycle: { state: "pending", decision: null, outcome: null, reason: null },
		binding: {
			child: ids.childId,
			epoch: ids.epoch,
			link: null,
			target: "the workhorse shell",
			effect: "run a command",
		},
		spoken: { eligible: true, reason: "eligible" },
		reason: null,
		command: "ls",
		availableDecisions: ["accept", "decline"],
	};
}

/** One recorded human action. */
interface RecordedAction {
	readonly draft: BrowserCommandDraft;
	readonly intent: BrowserWorkbenchCommandIntent | undefined;
}

/** How the double answers a human action. */
type ActionAnswer = (draft: BrowserCommandDraft) => Promise<BrowserWorkbenchCommandResult>;

/** A transport double whose state a test moves and whose answers a test sets. */
interface MutableTransport extends BrowserWorkbenchTransport {
	readonly publish: (state: BrowserWorkbenchState) => void;
	readonly sent: RecordedAction[];
	readonly setAnswer: (answer: ActionAnswer) => void;
	readonly listenerCount: () => number;
	readonly subscriptions: () => number;
	readonly teardowns: () => number;
}

/**
 * A delivered result naming the fixture turn.
 * @param value The snapshot it carries.
 * @returns The result.
 */
function delivered(value = snapshot()): BrowserWorkbenchCommandResult {
	return {
		kind: "command_result",
		commandId: ids.commandId,
		outcome: "delivered",
		code: null,
		message: null,
		turnId: ids.turnId,
		snapshot: value,
	};
}

/**
 * A lease the double hands out.
 * @returns The lease.
 */
function lease(): BrowserCommandLease {
	return {
		kind: "command_lease",
		commandId: ids.commandId,
		paneId: "pane-a",
		childId: ids.childId,
		epoch: ids.epoch,
		state: "active",
		expiresAtMs: 4_000_000_000_000,
	};
}

/**
 * A member the runtime owners never reach.
 */
function unsupported(): never {
	throw new Error("The runtime owner does not exercise this transport member.");
}

/**
 * The default answer: delivered.
 * @returns A delivered result.
 */
function deliveredAnswer(): Promise<BrowserWorkbenchCommandResult> {
	return Promise.resolve(delivered());
}

/**
 * Nothing to dispose.
 * @returns Settled.
 */
function dispose(): Promise<void> {
	return Promise.resolve();
}

/**
 * A transport double.
 * @param initial The first state.
 * @returns The double.
 */
function mutableTransport(initial = connected()): MutableTransport {
	let current = initial;
	let answer: ActionAnswer = deliveredAnswer;
	let currentLease: BrowserCommandLease | null = null;
	const listeners = new Set<() => void>();
	const sent: RecordedAction[] = [];
	let subscriptions = 0;
	let teardowns = 0;
	/**
	 * Move the state and tell listeners.
	 * @param next The state.
	 */
	function publish(next: BrowserWorkbenchState): void {
		current = next;
		for (const listener of listeners) {
			listener();
		}
	}
	/**
	 * Hear state changes.
	 * @param listener The listener.
	 * @returns A function that stops listening.
	 */
	function subscribe(listener: () => void): () => void {
		subscriptions += 1;
		listeners.add(listener);
		return () => {
			teardowns += 1;
			listeners.delete(listener);
		};
	}
	/**
	 * The captured intent: the current link, no exact authority.
	 * @returns The intent.
	 */
	function captureCommandIntent(): BrowserWorkbenchCommandIntent {
		if (current.snapshot === null) {
			throw new Error("The workbench is not ready to capture an action.");
		}
		return { capturedThreadLink: current.snapshot.threadLink, authority: null };
	}
	/**
	 * Record a human action and answer it.
	 * @param draft The draft.
	 * @param intent The intent.
	 * @returns The result.
	 */
	function executeCommand(
		draft: BrowserCommandDraft,
		intent?: BrowserWorkbenchCommandIntent,
	): Promise<BrowserWorkbenchCommandResult> {
		sent.push({ draft, intent });
		return answer(draft);
	}
	/**
	 * Record an exact-authority command and answer it.
	 * @param draft The draft.
	 * @returns The result.
	 */
	function command(draft: BrowserCommandDraft): Promise<BrowserWorkbenchCommandResult> {
		sent.push({ draft, intent: undefined });
		return answer(draft);
	}
	/**
	 * Hand out a lease.
	 * @returns The lease.
	 */
	function claimLease(): Promise<BrowserCommandLease> {
		currentLease = lease();
		return Promise.resolve(currentLease);
	}
	/**
	 * A fresh snapshot message.
	 * @returns The message.
	 */
	function refresh(): Promise<BrowserWorkbenchSnapshotMessage> {
		return Promise.resolve({ kind: "snapshot", sequence: 1, snapshot: snapshot() });
	}
	/**
	 * The current snapshot.
	 * @returns The snapshot, or null.
	 */
	function currentSnapshot(): BrowserSnapshot | null {
		return current.snapshot;
	}
	/**
	 * The current sequence.
	 * @returns The sequence, or null.
	 */
	function sequence(): number | null {
		return current.sequence;
	}
	/**
	 * The held lease.
	 * @returns The lease, or null.
	 */
	function heldLease(): BrowserCommandLease | null {
		return currentLease;
	}
	/**
	 * The state.
	 * @returns The state.
	 */
	function state(): BrowserWorkbenchState {
		return current;
	}
	/**
	 * Replace how actions are answered.
	 * @param next The answer.
	 */
	function setAnswer(next: ActionAnswer): void {
		answer = next;
	}
	/**
	 * How many listeners are attached.
	 * @returns The count.
	 */
	function listenerCount(): number {
		return listeners.size;
	}
	/**
	 * How many subscriptions were made.
	 * @returns The count.
	 */
	function subscriptionCount(): number {
		return subscriptions;
	}
	/**
	 * How many subscriptions were torn down.
	 * @returns The count.
	 */
	function teardownCount(): number {
		return teardowns;
	}
	return {
		attach: unsupported,
		detach: unsupported,
		close: unsupported,
		refresh,
		setMediaReady: unsupported,
		claimLease,
		renewLease: unsupported,
		releaseLease: unsupported,
		accountRead: unsupported,
		command,
		executeCommand,
		captureCommandIntent,
		captureCommandTarget: unsupported,
		snapshot: currentSnapshot,
		sequence,
		lease: heldLease,
		state,
		capabilities: unsupported,
		subscribe,
		dispose,
		publish,
		sent,
		setAnswer,
		listenerCount,
		subscriptions: subscriptionCount,
		teardowns: teardownCount,
	};
}

export {
	approval,
	connected,
	delivered,
	ids,
	mutableTransport,
	snapshot,
	timeline,
	type ActionAnswer,
	type MutableTransport,
	type RecordedAction,
};
