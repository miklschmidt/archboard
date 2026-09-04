import type {
	VoiceContextLedgerEntry,
	VoiceContextSessionIdentity,
	VoiceContextSessionStart,
	VoiceContextStartBrief,
} from "../../index.js";

export const SESSION_A = Object.freeze({
	childId: "child-a",
	epoch: "epoch-a",
	workhorseThreadId: "workhorse-a",
	coordinatorThreadId: "coordinator-a",
	realtimeSessionId: "realtime-a",
	paneId: "primary",
}) satisfies VoiceContextSessionIdentity;

export const SESSION_B = Object.freeze({
	childId: "child-b",
	epoch: "epoch-b",
	workhorseThreadId: "workhorse-b",
	coordinatorThreadId: "coordinator-b",
	realtimeSessionId: "realtime-b",
	paneId: "right",
}) satisfies VoiceContextSessionIdentity;

export function startBrief(
	overrides: Partial<VoiceContextStartBrief> = {},
): VoiceContextStartBrief {
	return {
		canonicalBrief: '{"repository":"archboard","board":"checkout"}',
		capturedAtMs: 1_800_000_000_000,
		repository: "archboard",
		board: { key: "checkout", note: "Architecture/checkout.excalidraw.md" },
		version: 42,
		focused: true,
		focusCapturedAtMs: 1_799_999_999_900,
		focusFreshUntilMs: 1_800_000_001_900,
		focusFreshness: "fresh",
		selection: {
			elementIds: ["api", "worker"],
			capturedAtMs: 1_799_999_999_800,
			freshUntilMs: 1_800_000_001_800,
			freshness: "fresh",
		},
		claim: { holder: "agent", doing: "Inspecting the delivery seam" },
		doing: "Explaining the selected path",
		cursor: { feedId: "feed-a", sequence: 17 },
		ambiguity: [],
		truncated: false,
		staleness: { state: "current", reasons: [] },
		...overrides,
	};
}

export function sessionStart(
	identity: VoiceContextSessionIdentity = SESSION_A,
	overrides: Partial<VoiceContextSessionStart> = {},
): VoiceContextSessionStart {
	return {
		identity,
		brief: startBrief(),
		startedAtMs: 1_800_000_000_010,
		provenance: "live",
		...overrides,
	};
}

export function ledgerEntry(
	id: string,
	overrides: Partial<VoiceContextLedgerEntry> = {},
): VoiceContextLedgerEntry {
	return {
		id,
		kind: "semantic",
		capturedAtMs: 1_800_000_001_000 + Number(id.replace(/\D/gu, "") || 0),
		attemptedAtMs: 1_800_000_001_100 + Number(id.replace(/\D/gu, "") || 0),
		attempted: true,
		outcome: "delivered",
		reason: null,
		body: `exact-body-${id}`,
		provenance: "live",
		connection: "connected",
		...overrides,
	};
}
