import type { VoiceSessionBinding, VoiceSessionView } from "@/ui/voice-session";

import type {
	VoiceContextLedgerEntry,
	VoiceContextSessionCapture,
	VoiceContextSessionEvidence,
} from "../../index.js";

export const BINDING_A = Object.freeze({
	paneId: "primary",
	childId: "child-a",
	epoch: "epoch-a",
	workhorseThreadId: "workhorse-a",
	coordinatorThreadId: "coordinator-a",
}) satisfies VoiceSessionBinding;

export const BINDING_B = Object.freeze({
	paneId: "right",
	childId: "child-b",
	epoch: "epoch-b",
	workhorseThreadId: "workhorse-b",
	coordinatorThreadId: "coordinator-b",
}) satisfies VoiceSessionBinding;

const CONTROLS = Object.freeze({
	canStart: false,
	canMute: true,
	canUnmute: false,
	canStop: true,
	canRestart: true,
	canClose: false,
});

export function voiceSession(
	binding: VoiceSessionBinding = BINDING_A,
	sessionId = binding === BINDING_B ? "realtime-b" : "realtime-a",
	overrides: Partial<VoiceSessionView> = {},
): VoiceSessionView {
	return {
		status: "listening",
		label: "Listening",
		detail: "Voice is listening on the bound pane.",
		accessibleStatus: "Listening. Voice is listening on the bound pane.",
		failure: null,
		outcome: { kind: "none" },
		controls: CONTROLS,
		binding,
		sessionId,
		...overrides,
	};
}

export const SESSION_A = Object.freeze(voiceSession());
export const SESSION_B = Object.freeze(voiceSession(BINDING_B));

interface CanonicalBriefOptions {
	readonly focused?: boolean;
	readonly selection?: readonly string[];
	readonly description?: string;
	readonly coordinatorRealtimeSessionId?: string;
	readonly clippedIdentity?: string;
	readonly freshness?: {
		readonly capturedAtMs: number;
		readonly freshUntilMs: number;
		readonly state: "fresh" | "stale";
	};
	readonly ambiguity?: readonly string[];
	readonly truncated?: boolean;
	readonly staleness?: { readonly state: "current" | "stale"; readonly reasons: readonly string[] };
}

export function canonicalBrief(
	session: VoiceSessionView = SESSION_A,
	options: CanonicalBriefOptions = {},
): string {
	if (session.binding === null || session.sessionId === null) throw new TypeError("bound fixture");
	const binding = session.binding;
	const clipped = options.clippedIdentity;
	return JSON.stringify({
		source: "semantic_context",
		feedId: "feed-a",
		repository: "archboard",
		workhorse: {
			threadId: clipped ?? binding.workhorseThreadId,
			turnId: clipped ?? "turn-a",
		},
		coordinator: {
			threadId: clipped ?? binding.coordinatorThreadId,
			realtimeSessionId: clipped ?? options.coordinatorRealtimeSessionId ?? session.sessionId,
		},
		board: { key: "checkout", note: "Architecture/checkout.excalidraw.md", version: 42 },
		pane: { paneId: clipped ?? binding.paneId, focused: options.focused ?? true },
		version: 42,
		selection: options.selection ?? ["api", "worker"],
		claim: { holder: "agent", doing: "Inspecting the delivery seam" },
		doing: "Explaining the selected path",
		cursor: { feedId: "feed-a", sequence: 17 },
		description: options.description ?? "Checkout calls the worker.",
		freshness: options.freshness ?? {
			capturedAtMs: 1_800_000_000_000,
			freshUntilMs: 1_800_000_002_000,
			state: "fresh",
		},
		truncated: options.truncated ?? false,
		ambiguity: options.ambiguity ?? [],
		staleness: options.staleness ?? { state: "current", reasons: [] },
		child: { id: clipped ?? binding.childId, epoch: clipped ?? binding.epoch },
		threadLink: { state: "executable", reason: null },
	});
}

export function capture(
	session: VoiceSessionView = SESSION_A,
	overrides: Partial<VoiceContextSessionCapture> = {},
): VoiceContextSessionCapture {
	return {
		session,
		canonicalBrief: canonicalBrief(session),
		observedAtMs: 1_800_000_000_010,
		provenance: "live",
		...overrides,
	};
}

export function evidence(
	session: VoiceSessionView,
	observedAtMs: number,
	provenance: "live" | "recovered" = "live",
): VoiceContextSessionEvidence {
	return { session, observedAtMs, provenance };
}

export function ledgerEntry(
	id: string,
	overrides: Partial<VoiceContextLedgerEntry> = {},
): VoiceContextLedgerEntry {
	const numeric = Number(id.replace(/\D/gu, "") || 0);
	const capturedAtMs = 1_800_000_001_000 + numeric;
	return {
		id,
		kind: "semantic",
		sourceOrder: { kind: "adapter_ledger", ledgerId: "coordinator-a", position: numeric },
		freshness: { capturedAtMs, freshUntilMs: capturedAtMs + 500 },
		attemptedAtMs: capturedAtMs + 100,
		attempted: true,
		outcome: "delivered",
		reason: null,
		body: `exact-body-${id}`,
		provenance: "live",
		connection: "connected",
		...overrides,
	};
}
