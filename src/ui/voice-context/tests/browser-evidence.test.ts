import { describe, expect, test } from "bun:test";

import { createIdentityAuthorities } from "@/shared/codex-workbench-identity";
import {
	BROWSER_IDLE_SPOKEN_APPROVAL,
	createCodexBrowserModel,
} from "@/shared/codex-browser-model";
import type { BrowserSnapshot, BrowserVoiceContext } from "@/shared/codex-browser-model";
import type { VoiceSessionView } from "@/ui/voice-session";
import {
	createVoiceContextHistory,
	ingestVoiceContextBrowserEvidence,
	projectVoiceContext,
} from "@/ui/voice-context";
import type {
	VoiceContextBrowserEvidenceInput,
	VoiceContextHistory,
	VoiceContextSessionView,
} from "@/ui/voice-context";
import {
	BINDING_A,
	BINDING_B,
	SESSION_A,
	SESSION_B,
	canonicalBrief,
	voiceSession,
} from "@/ui/voice-context/tests/support/fixtures";

const authorities = createIdentityAuthorities();
const model = createCodexBrowserModel(authorities);
const threadId = model.ThreadIdSchema.parse(
	authorities.identity.decoder.adoptThreadId("thread-context"),
);

type BrowserEntry = BrowserVoiceContext["entries"][number];

/**
 * A complete snapshot carrying one voice context, parsed by the browser model.
 * @param voiceContext The voice context, or null.
 * @returns The snapshot.
 */
function snapshot(voiceContext: BrowserVoiceContext | null): BrowserSnapshot {
	return model.BrowserSnapshotSchema.parse({
		kind: "snapshot",
		version: 1,
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "ready", accountType: "chatgpt" },
		login: { kind: "login", state: "idle" },
		threadLink: {
			kind: "thread_link",
			state: "executable",
			childId: authorities.identity.validator.childId,
			epoch: authorities.identity.validator.epoch,
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
			threadId,
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
			state: "active",
			realtimeSessionId: voiceContext?.sessionId ?? null,
			transcript: [],
			delivery: null,
			reason: null,
		},
		spokenApproval: BROWSER_IDLE_SPOKEN_APPROVAL,
		lease: null,
		operation: null,
		voiceContext,
	});
}

/**
 * A voice context for one session, parsed by the browser model.
 * @param session The session it names.
 * @param entries The entries.
 * @param omissions The owner's omissions.
 * @param omissions.owner Records the owner evicted for good.
 * @param omissions.transport Records the transport left out.
 * @returns The voice context.
 */
function browserContext(
	session: VoiceSessionView = SESSION_A,
	entries: readonly BrowserEntry[] = [],
	omissions: { readonly owner: number; readonly transport: number } = { owner: 0, transport: 0 },
): BrowserVoiceContext {
	return model.BrowserVoiceContextSchema.parse({
		kind: "voice_context",
		sessionId: session.sessionId,
		ledgerId: `ledger-${session.sessionId}`,
		canonicalBrief: canonicalBrief(session),
		ownerEntriesTruncated: omissions.owner,
		entriesTruncated: omissions.transport,
		entries,
	});
}

/**
 * One delivered browser entry at a source position.
 * @param sourceOrder The position.
 * @param kind The entry kind.
 * @returns The entry.
 */
function delivery(sourceOrder: number, kind: BrowserEntry["kind"]): BrowserEntry {
	return {
		id: `${kind}-${sourceOrder}`,
		kind,
		sourceOrder,
		capturedAtMs: 1_800_000_000_000 + sourceOrder,
		freshUntilMs: 1_800_000_000_500 + sourceOrder,
		attempted: true,
		attemptedAtMs: 1_800_000_000_100 + sourceOrder,
		outcome: sourceOrder === 2 ? "outcome_unknown" : "delivered",
		reason: sourceOrder === 2 ? "response_lost" : null,
		body: `exact-${kind}-${sourceOrder}`,
	};
}

/**
 * The first projected session of a history.
 * @param history The history.
 * @returns The first session view.
 */
function firstSession(history: VoiceContextHistory): VoiceContextSessionView {
	return defined(
		projectVoiceContext({
			snapshot: history.snapshot(),
			sessionPage: 1,
			entryPages: new Map(),
			briefPages: new Map(),
			entryBodyPages: new Map(),
		}).sessions[0],
	);
}

/**
 * An ingestion input over one snapshot.
 * @param value The snapshot.
 * @param session The session view.
 * @param observedAtMs When.
 * @returns The input.
 */
function ingestion(
	value: BrowserSnapshot,
	session: VoiceSessionView,
	observedAtMs: number,
): VoiceContextBrowserEvidenceInput {
	return { snapshot: value, session, observedAtMs, provenance: "live", connection: "connected" };
}

/**
 * A value that must exist.
 * @param value The value, possibly absent.
 * @returns The value.
 */
function defined<T>(value: T | null | undefined): T {
	if (value === null || value === undefined) {
		throw new Error("Expected a value.");
	}
	return value;
}

describe("voice context browser evidence", () => {
	test("retains exact start bytes and inserts callback-owner records by source order", () => {
		const history = createVoiceContextHistory();
		const exact = canonicalBrief(SESSION_A);
		const entries = [
			delivery(4, "selection"),
			delivery(2, "semantic"),
			delivery(5, "callback"),
			delivery(3, "focus"),
		];
		const context = browserContext(SESSION_A, entries, { owner: 1, transport: 3 });
		const input: VoiceContextBrowserEvidenceInput = {
			snapshot: snapshot(context),
			session: SESSION_A,
			observedAtMs: 1_800_000_001_000,
			provenance: "recovered",
			connection: "disconnected",
		};

		const first = ingestVoiceContextBrowserEvidence(history, input);
		expect(first.entries.every((result) => result.outcome === "applied")).toBe(true);
		expect(defined(first.sourceHistory).outcome).toBe("applied");
		expect(defined(history.snapshot().sessions[0]).captured.canonicalBrief).toBe(exact);
		expect(defined(history.snapshot().sessions[0]).entries.map((entry) => entry.kind)).toEqual([
			"semantic",
			"focus",
			"selection",
			"callback",
		]);
		expect(defined(history.snapshot().sessions[0]).entries[3]).toMatchObject({
			body: "exact-callback-5",
			provenance: "recovered",
			connection: "disconnected",
		});
		expect(history.snapshot().sessions[0]).toMatchObject({
			ownerOmittedPrefixCount: 1,
			sourceEntryCount: 7,
		});
		expect(firstSession(history).omittedPrefixCount).toBe(3);

		ingestVoiceContextBrowserEvidence(history, {
			...input,
			observedAtMs: input.observedAtMs + 1,
			snapshot: snapshot(
				browserContext(SESSION_A, [delivery(0, "semantic"), delivery(1, "focus"), ...entries], {
					owner: 1,
					transport: 1,
				}),
			),
		});
		expect(firstSession(history).omittedPrefixCount).toBe(1);
		expect(defined(history.snapshot().sessions[0]).entries).toHaveLength(6);

		const revision = history.snapshot().revision;
		ingestVoiceContextBrowserEvidence(history, input);
		expect(history.snapshot().revision).toBe(revision);
	});

	test("retains replaced and stopped observations after browser generation evidence vanishes", () => {
		const history = createVoiceContextHistory();
		ingestVoiceContextBrowserEvidence(history, ingestion(snapshot(browserContext()), SESSION_A, 1));
		const replaced = voiceSession(BINDING_A, "realtime-a", {
			status: "failed",
			label: "Failed",
			detail: "The browser owner replaced this session.",
			failure: { code: "replaced", recoverable: false, message: "Binding changed." },
		});
		ingestVoiceContextBrowserEvidence(history, ingestion(snapshot(null), replaced, 2));
		ingestVoiceContextBrowserEvidence(
			history,
			ingestion(snapshot(browserContext(SESSION_B)), SESSION_B, 3),
		);
		const stopped = voiceSession(BINDING_B, "realtime-b", {
			status: "stopped",
			label: "Stopped",
			detail: "Voice stopped.",
		});
		ingestVoiceContextBrowserEvidence(history, ingestion(snapshot(null), stopped, 4));

		expect(history.snapshot().sessions).toHaveLength(2);
		expect(
			defined(defined(history.snapshot().sessions[0]).observations.at(-1)).session.failure?.code,
		).toBe("replaced");
		expect(
			defined(defined(history.snapshot().sessions[1]).observations.at(-1)).session.status,
		).toBe("stopped");
		expect(
			history.snapshot().sessions.every((record) => record.captured.canonicalBrief.length > 0),
		).toBe(true);
	});

	test("refuses a voice context naming another realtime session as an identity mismatch", () => {
		const history = createVoiceContextHistory();
		const result = ingestVoiceContextBrowserEvidence(
			history,
			ingestion(snapshot(browserContext(SESSION_B)), SESSION_A, 1),
		);
		expect(defined(result.capture)).toMatchObject({
			outcome: "ignored",
			reason: "identity_mismatch",
		});
		expect(result.entries).toEqual([]);
		expect(history.snapshot().sessions).toHaveLength(0);
	});

	test("keeps owner-evicted evidence complete when the UI retained it earlier", () => {
		const history = createVoiceContextHistory();
		const entries = [delivery(0, "semantic"), delivery(1, "focus"), delivery(2, "selection")];
		ingestVoiceContextBrowserEvidence(
			history,
			ingestion(snapshot(browserContext(SESSION_A, entries)), SESSION_A, 1),
		);
		ingestVoiceContextBrowserEvidence(
			history,
			ingestion(
				snapshot(browserContext(SESSION_A, entries.slice(1), { owner: 1, transport: 1 })),
				SESSION_A,
				2,
			),
		);
		const projected = firstSession(history);

		expect(history.snapshot().sessions[0]).toMatchObject({
			ownerOmittedPrefixCount: 1,
			sourceEntryCount: 3,
		});
		expect(projected.entryCount).toBe(3);
		expect(projected.omittedPrefixCount).toBe(0);
	});
});
