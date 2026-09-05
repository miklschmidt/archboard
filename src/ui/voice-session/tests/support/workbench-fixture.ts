// A complete, schema-parsed workbench snapshot for the voice session tests,
// with the overrides they need: another child, epoch, workhorse or
// coordinator, and host coordinator and voice states.

import { createIdentityAuthorities } from "@/shared/codex-workbench-identity";
import type { IdentityAuthorities } from "@/shared/codex-workbench-identity";
import {
	BROWSER_IDLE_SPOKEN_APPROVAL,
	createCodexBrowserModel,
} from "@/shared/codex-browser-model";
import type { BrowserSnapshot, CodexBrowserModel } from "@/shared/codex-browser-model";

type Coordinator = BrowserSnapshot["coordinator"];
type Voice = BrowserSnapshot["voice"];
type ThreadLink = BrowserSnapshot["threadLink"];
type Readiness = BrowserSnapshot["readiness"];

/** The overrides a snapshot may carry. */
interface SnapshotOverrides {
	readonly readiness?: Readiness;
	readonly threadLink?: ThreadLink;
	readonly coordinator?: Coordinator;
	readonly voice?: Voice;
}

/** One authority's world: its model and the identities it issued. */
interface FixtureWorld {
	readonly authorities: IdentityAuthorities;
	readonly model: CodexBrowserModel;
	readonly childId: string;
	readonly epoch: string;
}

/**
 * A fresh authority world.
 * @returns The world.
 */
function world(): FixtureWorld {
	const authorities = createIdentityAuthorities();
	const model = createCodexBrowserModel(authorities);
	return {
		authorities,
		model,
		childId: String(authorities.identity.validator.childId),
		epoch: String(authorities.identity.validator.epoch),
	};
}

const PRIMARY = world();

/**
 * A branded thread id adopted through one world's authority.
 * @param target The world.
 * @param name The thread name.
 * @returns The thread id.
 */
function threadIdIn(target: FixtureWorld, name: string): Coordinator["threadId"] {
	return target.model.ThreadIdSchema.parse(target.authorities.identity.decoder.adoptThreadId(name));
}

/**
 * A branded thread id adopted through the primary authority.
 * @param name The thread name.
 * @returns The thread id.
 */
function threadId(name: string): Coordinator["threadId"] {
	return threadIdIn(PRIMARY, name);
}
/**
 * An executable link in one world.
 * @param target The world.
 * @param workhorse The workhorse thread name.
 * @returns The link, parsed by that world's model.
 */
function executableLink(target: FixtureWorld, workhorse: string): ThreadLink {
	return target.model.BrowserThreadLinkSchema.parse({
		kind: "thread_link",
		state: "executable",
		childId: target.authorities.identity.validator.childId,
		epoch: target.authorities.identity.validator.epoch,
		threadId: target.authorities.identity.decoder.adoptThreadId(workhorse),
		sourcePresentation: "standard",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: true,
		reason: null,
	});
}

/** The pane's link with no executable thread. */
const UNBOUND_LINK: ThreadLink = PRIMARY.model.BrowserThreadLinkSchema.parse({
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
});

/**
 * The default coordinator in one world, with overrides.
 * @param target The world.
 * @param overrides The fields to change.
 * @returns The coordinator.
 */
function coordinatorIn(target: FixtureWorld, overrides: Partial<Coordinator> = {}): Coordinator {
	return target.model.BrowserCoordinatorSchema.parse({
		kind: "coordinator",
		state: "ready",
		threadId: threadIdIn(target, "coordinator-a"),
		activeTurnId: null,
		configuredModel: "gpt-5.6-luna",
		configuredEffort: "medium",
		model: "gpt-5.6-luna",
		effort: "medium",
		serviceTier: "priority",
		reason: null,
		...overrides,
	});
}

/**
 * The default coordinator, with overrides.
 * @param overrides The fields to change.
 * @returns The coordinator.
 */
function coordinator(overrides: Partial<Coordinator> = {}): Coordinator {
	return coordinatorIn(PRIMARY, overrides);
}

/**
 * The default host voice projection, with overrides.
 * @param overrides The fields to change.
 * @returns The voice projection.
 */
function voice(overrides: Partial<Voice> = {}): Voice {
	return PRIMARY.model.BrowserVoiceSchema.parse({
		kind: "voice",
		state: "ready",
		realtimeSessionId: null,
		transcript: [],
		delivery: null,
		reason: null,
		...overrides,
	});
}

/**
 * A snapshot in one world.
 * @param target The world whose model parses it.
 * @param overrides The fields to change.
 * @returns The snapshot.
 */
function snapshotIn(target: FixtureWorld, overrides: SnapshotOverrides): BrowserSnapshot {
	return target.model.BrowserSnapshotSchema.parse({
		kind: "snapshot",
		version: 1,
		readiness: overrides.readiness ?? { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: overrides.threadLink ?? executableLink(target, "workhorse-a"),
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
		coordinator: overrides.coordinator ?? coordinatorIn(target),
		voice: overrides.voice ?? voice(),
		spokenApproval: BROWSER_IDLE_SPOKEN_APPROVAL,
		lease: null,
		operation: null,
	});
}

/**
 * The default snapshot, with overrides.
 * @param overrides The fields to change.
 * @returns The snapshot.
 */
function snapshot(overrides: SnapshotOverrides = {}): BrowserSnapshot {
	return snapshotIn(PRIMARY, overrides);
}

/**
 * The same pane, pointed at a different child (another authority's) or a
 * different workhorse.
 * @param change Which identity moved.
 * @returns The snapshot.
 */
function relinked(change: "child" | "workhorse"): BrowserSnapshot {
	if (change === "child") {
		return snapshotIn(world(), {});
	}
	return snapshot({ threadLink: executableLink(PRIMARY, "workhorse-b") });
}

/** The identities the default snapshot is bound to, as plain strings. */
const DEFAULT_BINDING = Object.freeze({
	childId: PRIMARY.childId,
	epoch: PRIMARY.epoch,
	workhorseThreadId: String(threadId("workhorse-a")),
	coordinatorThreadId: String(threadId("coordinator-a")),
});

export { DEFAULT_BINDING, UNBOUND_LINK, coordinator, relinked, snapshot, threadId, voice };
