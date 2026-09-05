// The producer contract this module keeps: fresh semantic bytes stay
// byte-identical in the stored capture, the projected display, and the copy
// source, together with their identity, provenance and freshness fields.
// The former system owner proved this against a product server; the module
// proves the same observable contract over the browser model alone.

import { describe, expect, test } from "bun:test";

import { createIdentityAuthorities } from "@/shared/codex-workbench-identity";
import {
	BROWSER_IDLE_SPOKEN_APPROVAL,
	createCodexBrowserModel,
} from "@/shared/codex-browser-model";
import type { BrowserSnapshot, BrowserVoiceContext } from "@/shared/codex-browser-model";
import {
	createVoiceContextHistory,
	ingestVoiceContextBrowserEvidence,
	parseCanonicalBrief,
	projectVoiceContext,
} from "@/ui/voice-context";
import { SESSION_A, canonicalBrief } from "@/ui/voice-context/tests/support/fixtures";

const authorities = createIdentityAuthorities();
const model = createCodexBrowserModel(authorities);
const threadId = model.ThreadIdSchema.parse(
	authorities.identity.decoder.adoptThreadId("thread-producer"),
);

/**
 * A complete snapshot carrying one voice context, parsed by the browser model.
 * @param voiceContext The voice context.
 * @returns The snapshot.
 */
function snapshot(voiceContext: BrowserVoiceContext): BrowserSnapshot {
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
			state: "active",
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
			realtimeSessionId: voiceContext.sessionId,
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

describe("voice context producer contract", () => {
	test("fresh semantic bytes are identical in the stored capture, the display, and the copy source", () => {
		const fresh = canonicalBrief(SESSION_A, {
			description: "Checkout calls the worker through the queue; the API waits.",
			selection: ["api", "queue", "worker"],
			freshness: {
				capturedAtMs: 1_800_000_000_000,
				freshUntilMs: 1_800_000_030_000,
				state: "fresh",
			},
		});
		const context = model.BrowserVoiceContextSchema.parse({
			kind: "voice_context",
			sessionId: SESSION_A.sessionId,
			ledgerId: "ledger-producer",
			canonicalBrief: fresh,
			ownerEntriesTruncated: 0,
			entriesTruncated: 0,
			entries: [],
		});
		const wire = snapshot(context);
		const history = createVoiceContextHistory();
		const result = ingestVoiceContextBrowserEvidence(history, {
			snapshot: wire,
			session: SESSION_A,
			observedAtMs: 1_800_000_000_010,
			provenance: "live",
			connection: "connected",
		});
		expect(defined(result.capture).outcome).toBe("applied");

		// Stored capture: the exact wire bytes, and the identity they carry.
		const stored = defined(history.snapshot().sessions[0]);
		expect(stored.captured.canonicalBrief).toBe(defined(wire.voiceContext).canonicalBrief);
		expect(stored.captured.canonicalBrief).toBe(fresh);
		expect(stored.captured.provenance).toBe("live");
		expect(stored.captured.session.sessionId).toBe(SESSION_A.sessionId);
		expect(stored.captured.brief).toEqual(defined(parseCanonicalBrief(fresh)));
		expect(stored.captured.brief.freshness).toEqual({
			capturedAtMs: 1_800_000_000_000,
			freshUntilMs: 1_800_000_030_000,
			state: "fresh",
		});
		expect(stored.captured.brief.child).toEqual({ id: "child-a", epoch: "epoch-a" });
		expect(stored.captured.brief.coordinator.realtimeSessionId).toBe("realtime-a");

		// Display: the projection carries the same bytes through, and its
		// preview is a window over those bytes, not a re-encoding.
		const view = defined(
			projectVoiceContext({
				snapshot: history.snapshot(),
				sessionPage: 1,
				entryPages: new Map(),
				briefPages: new Map(),
				entryBodyPages: new Map(),
				limits: { bodyWindowCharacters: 40 },
			}).sessions[0],
		);
		expect(view.canonicalBrief).toBe(fresh);
		expect(view.canonicalBriefPreview).toBe(Array.from(fresh).slice(0, 40).join(""));
		expect(view.canonicalBriefTotalCharacters).toBe(Array.from(fresh).length);
		expect(view.provenanceLabel).toBe("Live session");
		expect(view.briefLabel).toBe("Captured brief");
		expect(view.sessionId).toBe("realtime-a");
		expect(view.fields).toContainEqual({
			label: "Freshness",
			value: "Fresh at capture",
			technical: false,
		});
		expect(view.fields).toContainEqual({
			label: "Selection",
			value: "api, queue, worker",
			technical: true,
		});

		// Copy: the committed panel copies `voiceContext.canonicalBrief` from the
		// wire snapshot; that string is the same bytes the history stored and
		// the projection displays.
		expect(defined(wire.voiceContext).canonicalBrief).toBe(view.canonicalBrief);
		expect(new TextEncoder().encode(defined(wire.voiceContext).canonicalBrief)).toEqual(
			new TextEncoder().encode(stored.captured.canonicalBrief),
		);
	});

	test("a stale brief keeps its bytes and is labelled stale rather than rewritten", () => {
		const stale = canonicalBrief(SESSION_A, {
			freshness: {
				capturedAtMs: 1_800_000_000_000,
				freshUntilMs: 1_800_000_000_500,
				state: "stale",
			},
			staleness: { state: "stale", reasons: ["semantic freshness window expired"] },
		});
		const history = createVoiceContextHistory();
		history.capture({
			session: SESSION_A,
			canonicalBrief: stale,
			observedAtMs: 1_800_000_001_000,
			provenance: "recovered",
		});
		const view = defined(
			projectVoiceContext({
				snapshot: history.snapshot(),
				sessionPage: 1,
				entryPages: new Map(),
				briefPages: new Map(),
				entryBodyPages: new Map(),
			}).sessions[0],
		);
		expect(view.canonicalBrief).toBe(stale);
		expect(view.briefLabel).toBe("Stale brief");
		expect(view.briefDetail).toContain("semantic freshness window expired");
		expect(view.provenanceLabel).toBe("Recovered history");
	});
});
