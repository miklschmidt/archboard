// Fixtures built through the closed browser model with a real identity
// authority, so a snapshot the contract would refuse fails here instead of
// proving something about a shape the host can never publish.

import {
	BROWSER_IDLE_SPOKEN_APPROVAL,
	createCodexBrowserModel,
	type BrowserSnapshot,
} from "@/shared/codex-browser-model";
import { createIdentityAuthorities } from "@/shared/codex-workbench-identity";
import type { BrowserWorkbenchState } from "@/ui/workbench-transport";

const authorities = createIdentityAuthorities();
const authority = authorities.identity;
const model = createCodexBrowserModel(authorities);

const CHILD = model.ChildIdSchema.parse(authority.validator.childId);
const EPOCH = model.ChildEpochSchema.parse(authority.validator.epoch);
const THREAD = model.ThreadIdSchema.parse(authority.decoder.adoptThreadId("workhorse-a"));

const TURN = model.TurnIdSchema.parse(authority.decoder.adoptTurnId("repair-turn"));
/**
 * An executable link.
 * @param threadId The thread it names.
 * @returns The link.
 */
function executableLink(
	threadId: BrowserSnapshot["threadLink"]["threadId"] = THREAD,
): BrowserSnapshot["threadLink"] {
	return model.BrowserThreadLinkSchema.parse({
		kind: "thread_link",
		state: "executable",
		childId: CHILD,
		epoch: EPOCH,
		threadId,
		sourcePresentation: "standard",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: true,
		reason: null,
	});
}

/**
 * An unbound link.
 * @param reason The host's reason, or null.
 * @returns The link.
 */
function unboundLink(reason: string | null = null): BrowserSnapshot["threadLink"] {
	return model.BrowserThreadLinkSchema.parse({
		kind: "thread_link",
		state: "unbound",
		childId: null,
		epoch: null,
		threadId: null,
		sourcePresentation: null,
		status: "notLoaded",
		loaded: false,
		canAcceptDirectInput: false,
		reason,
	});
}

/**
 * A thread-capable snapshot.
 * @param overrides The fields to replace.
 * @returns The snapshot.
 */
function snapshot(overrides: Partial<BrowserSnapshot> = {}): BrowserSnapshot {
	return model.BrowserSnapshotSchema.parse({
		kind: "snapshot",
		version: 1,
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: executableLink(),
		threadCandidates: {
			kind: "thread_candidates",
			state: "unknown",
			records: [],
			truncated: false,
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
			threadId: model.ThreadIdSchema.parse(authority.decoder.adoptThreadId("coordinator-a")),
			activeTurnId: null,
			configuredModel: null,
			configuredEffort: null,
			model: null,
			effort: null,
			serviceTier: null,
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
	});
}

/**
 * A connected checker target.
 * @param value The snapshot.
 * @returns Thread-capable transport state.
 */
function connected(value = snapshot()): BrowserWorkbenchState {
	return {
		kind: "readiness",
		state: "thread_capable",
		connection: "connected",
		snapshot: value,
		sequence: 7,
	};
}

export { model, THREAD, TURN, connected, snapshot, unboundLink };
