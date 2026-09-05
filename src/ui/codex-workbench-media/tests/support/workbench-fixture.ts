// A complete, schema-parsed workbench snapshot for the media owner tests,
// minted through the real identity authorities so no test asserts a plain
// string into an identity type.

import { createIdentityAuthorities } from "@/shared/codex-workbench-identity";
import {
	BROWSER_IDLE_SPOKEN_APPROVAL,
	createCodexBrowserModel,
} from "@/shared/codex-browser-model";
import type { BrowserCommandLease, BrowserSnapshot } from "@/shared/codex-browser-model";

const authorities = createIdentityAuthorities();
const authority = authorities.identity;
const model = createCodexBrowserModel(authorities);
const childId = model.ChildIdSchema.parse(authority.validator.childId);
const epoch = model.ChildEpochSchema.parse(authority.validator.epoch);
const threadId = model.ThreadIdSchema.parse(authority.decoder.adoptThreadId("thread-media"));
const coordinatorThreadId = model.ThreadIdSchema.parse(
	authority.decoder.adoptThreadId("coordinator-media"),
);

/** The voice states the fixture can publish. */
type FixtureVoiceState = BrowserSnapshot["voice"]["state"];

/**
 * A snapshot whose pane is executably linked to `thread-media`.
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
			threadId: coordinatorThreadId,
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
 * A fresh active lease on the fixture pane.
 * @param expiresAtMs When it expires.
 * @returns The parsed lease.
 */
function mediaLease(expiresAtMs: number): BrowserCommandLease {
	return model.BrowserCommandLeaseSchema.parse({
		kind: "command_lease",
		commandId: authority.issuer.mintBrowserCommandId(),
		paneId: "pane-media",
		childId,
		epoch,
		state: "active",
		expiresAtMs,
	});
}

export { mediaLease, workbenchSnapshot, type FixtureVoiceState };
