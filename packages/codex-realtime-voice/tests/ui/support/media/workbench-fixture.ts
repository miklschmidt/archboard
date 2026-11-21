// A complete, schema-parsed workbench snapshot for the media owner tests,
// branded through the browser model so no test asserts a plain
// string into an identity type.

import { browserIdentities } from "#tests/shared/support/browser-identities.ts";
import { BROWSER_IDLE_SPOKEN_APPROVAL } from "#shared/browser/schemas/spoken-approval.ts";
import { createCodexBrowserModel } from "#shared/browser/schemas/model.ts";
import type { BrowserCommandLease, BrowserSnapshot } from "#shared/browser/schemas/snapshot.ts";

const ids = browserIdentities();
const model = createCodexBrowserModel();
const childId = model.ChildIdSchema.parse(ids.child);
const epoch = model.ChildEpochSchema.parse(ids.epoch);
const threadId = model.ThreadIdSchema.parse(ids.thread("thread-media"));
const coordinatorThreadId = model.ThreadIdSchema.parse(ids.thread("coordinator-media"));

/** The voice states the fixture can publish. */
type FixtureVoiceState = BrowserSnapshot["voice"]["state"];

/**
 * A snapshot whose chat is executably linked to `thread-media`.
 * @param voice The published voice state.
 * @param lease The active lease, if any.
 * @returns The parsed snapshot.
 */
function workbenchSnapshot(
	voice: FixtureVoiceState = "ready",
	lease: BrowserCommandLease | null = null,
): BrowserSnapshot {
	return model.BrowserSnapshotSchema.parse({
		kind: "snapshot",
		version: 1,
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: {
			kind: "thread_link",
			state: "executable",
			childId,
			epoch,
			threadId,
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
		contextDelivery: null,
		coordinator: {
			kind: "coordinator",
			state: "ready",
			threadId: coordinatorThreadId,
			activeTurnId: null,
			configuredModel: "gpt-6-luna",
			configuredEffort: "medium",
			model: "gpt-6-luna",
			effort: "medium",
			serviceTier: "priority",
			reason: null,
		},
		voice: {
			kind: "voice",
			state: voice,
			realtimeSessionId: null,
			transcript: [],
			delivery: null,
			reason: null,
		},
		spokenApproval: BROWSER_IDLE_SPOKEN_APPROVAL,
		lease,
		operation: null,
	});
}

/**
 * A fresh active lease on the fixture chat.
 * @param expiresAtMs When it expires.
 * @returns The parsed lease.
 */
function mediaLease(expiresAtMs: number): BrowserCommandLease {
	return model.BrowserCommandLeaseSchema.parse({
		kind: "command_lease",
		commandId: ids.browserCommand(),
		chatId: "chat-media",
		childId,
		epoch,
		state: "active",
		expiresAtMs,
	});
}

export { mediaLease, workbenchSnapshot, type FixtureVoiceState };
