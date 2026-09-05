// Fixtures for the voice context tests: bound session views, exact canonical
// brief bytes that name them, captures, observations and ledger entries.

import type { VoiceSessionBinding, VoiceSessionView } from "@/ui/voice-session";
import type {
	VoiceContextLedgerEntry,
	VoiceContextSessionCapture,
	VoiceContextSessionEvidence,
} from "@/ui/voice-context";

const BINDING_A: VoiceSessionBinding = Object.freeze({
	paneId: "primary",
	childId: "child-a",
	epoch: "epoch-a",
	workhorseThreadId: "workhorse-a",
	coordinatorThreadId: "coordinator-a",
});

const BINDING_B: VoiceSessionBinding = Object.freeze({
	paneId: "right",
	childId: "child-b",
	epoch: "epoch-b",
	workhorseThreadId: "workhorse-b",
	coordinatorThreadId: "coordinator-b",
});

const CONTROLS = Object.freeze({
	canStart: false,
	canMute: true,
	canUnmute: false,
	canStop: true,
	canRestart: true,
	canClose: false,
});

/**
 * A listening session view over one binding.
 * @param binding The binding.
 * @param sessionId The realtime session id.
 * @param overrides Fields to change.
 * @returns The view.
 */
function voiceSession(
	binding: VoiceSessionBinding = BINDING_A,
	sessionId: string = binding === BINDING_B ? "realtime-b" : "realtime-a",
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
		busy: false,
		...overrides,
	};
}

const SESSION_A: VoiceSessionView = Object.freeze(voiceSession());
const SESSION_B: VoiceSessionView = Object.freeze(voiceSession(BINDING_B));

/** What a brief fixture may vary. */
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

/** The brief fixture's defaults. */
const BRIEF_DEFAULTS: Required<
	Omit<CanonicalBriefOptions, "clippedIdentity" | "coordinatorRealtimeSessionId">
> = {
	focused: true,
	selection: ["api", "worker"],
	description: "Checkout calls the worker.",
	freshness: { capturedAtMs: 1_800_000_000_000, freshUntilMs: 1_800_000_002_000, state: "fresh" },
	ambiguity: [],
	truncated: false,
	staleness: { state: "current", reasons: [] },
};

/**
 * Exact canonical brief bytes naming one session.
 * @param session The session the brief names.
 * @param options Fields to vary.
 * @returns The JSON bytes.
 */
function canonicalBrief(
	session: VoiceSessionView = SESSION_A,
	options: CanonicalBriefOptions = {},
): string {
	const { binding } = session;
	if (binding === null || session.sessionId === null) {
		throw new TypeError("The brief fixture needs a bound session.");
	}
	const resolved = { ...BRIEF_DEFAULTS, ...options };
	/**
	 * An identity value, or the clipped stand-in when the fixture clips identities.
	 * @param value The identity value.
	 * @returns The value the brief carries.
	 */
	const identity = (value: string | null): string | null => options.clippedIdentity ?? value;
	return JSON.stringify({
		source: "semantic_context",
		feedId: "feed-a",
		repository: "archboard",
		workhorse: { threadId: identity(binding.workhorseThreadId), turnId: identity("turn-a") },
		coordinator: {
			threadId: identity(binding.coordinatorThreadId),
			realtimeSessionId: identity(options.coordinatorRealtimeSessionId ?? session.sessionId),
		},
		board: { key: "checkout", note: "Architecture/checkout.excalidraw.md", version: 42 },
		pane: { paneId: identity(binding.paneId), focused: resolved.focused },
		version: 42,
		selection: resolved.selection,
		claim: { holder: "agent", doing: "Inspecting the delivery seam" },
		doing: "Explaining the selected path",
		cursor: { feedId: "feed-a", sequence: 17 },
		description: resolved.description,
		freshness: resolved.freshness,
		truncated: resolved.truncated,
		ambiguity: resolved.ambiguity,
		staleness: resolved.staleness,
		child: { id: identity(binding.childId), epoch: identity(binding.epoch) },
		threadLink: { state: "executable", reason: null },
	});
}

/**
 * A capture of one session.
 * @param session The session.
 * @param overrides Fields to change.
 * @returns The capture.
 */
function capture(
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

/**
 * An observation of one session.
 * @param session The session.
 * @param observedAtMs When.
 * @param provenance Live or recovered.
 * @returns The observation.
 */
function evidence(
	session: VoiceSessionView,
	observedAtMs: number,
	provenance: "live" | "recovered" = "live",
): VoiceContextSessionEvidence {
	return { session, observedAtMs, provenance };
}

/** What a ledger entry fixture may vary. */
type LedgerEntryOverrides = Partial<
	Omit<VoiceContextLedgerEntry, "attempted" | "attemptedAtMs" | "outcome">
> & {
	readonly attempted?: boolean;
	readonly attemptedAtMs?: number;
	readonly outcome?: VoiceContextLedgerEntry["outcome"];
};

/**
 * One ledger entry; its position is the number in its id.
 * @param id The entry id.
 * @param overrides Fields to change.
 * @returns The entry.
 */
function ledgerEntry(id: string, overrides: LedgerEntryOverrides = {}): VoiceContextLedgerEntry {
	const numeric = Number(id.replaceAll(/\D/gu, "") || 0);
	const capturedAtMs = 1_800_000_001_000 + numeric;
	const { attempted, attemptedAtMs, outcome, ...rest } = {
		attempted: true,
		attemptedAtMs: capturedAtMs + 100,
		outcome: "delivered" as const,
		...overrides,
	};
	const shared = {
		id,
		kind: "semantic" as const,
		sourceOrder: { kind: "adapter_ledger" as const, ledgerId: "coordinator-a", position: numeric },
		freshness: { capturedAtMs, freshUntilMs: capturedAtMs + 500 },
		reason: null,
		body: `exact-body-${id}`,
		provenance: "live" as const,
		connection: "connected" as const,
		...rest,
	};
	if (!attempted) {
		return { ...shared, attempted: false, attemptedAtMs: null, outcome: "not_delivered" };
	}
	return { ...shared, attempted: true, attemptedAtMs, outcome };
}

export {
	BINDING_A,
	BINDING_B,
	SESSION_A,
	SESSION_B,
	canonicalBrief,
	capture,
	evidence,
	ledgerEntry,
	voiceSession,
};
