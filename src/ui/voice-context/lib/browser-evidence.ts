import type { BrowserVoiceContext } from "../../../shared/codex-browser-model/index.js";
import type {
	VoiceContextBrowserEvidenceInput,
	VoiceContextBrowserIngestResult,
	VoiceContextHistory,
	VoiceContextLedgerEntry,
	VoiceContextMutationResult,
} from "../contract.js";

function identityMismatch(history: VoiceContextHistory): VoiceContextMutationResult {
	return Object.freeze({
		outcome: "ignored",
		reason: "identity_mismatch",
		revision: history.snapshot().revision,
	});
}

function ledgerEntry(
	value: BrowserVoiceContext["entries"][number],
	ledgerId: string,
	input: VoiceContextBrowserEvidenceInput,
): VoiceContextLedgerEntry {
	const shared = {
		id: value.id,
		kind: value.kind,
		sourceOrder: {
			kind: "adapter_ledger" as const,
			ledgerId,
			position: value.sourceOrder,
		},
		freshness: {
			capturedAtMs: value.capturedAtMs,
			freshUntilMs: value.freshUntilMs,
		},
		reason: value.reason,
		body: value.body,
		provenance: input.provenance,
		connection: input.connection,
	} as const;
	return value.attempted
		? { ...shared, attempted: true, attemptedAtMs: value.attemptedAtMs, outcome: value.outcome }
		: { ...shared, attempted: false, attemptedAtMs: null, outcome: "not_delivered" };
}

/** Adapt one immutable browser-owner snapshot into the presentation ledger. */
export function ingestVoiceContextBrowserEvidence(
	history: VoiceContextHistory,
	input: VoiceContextBrowserEvidenceInput,
): VoiceContextBrowserIngestResult {
	const evidence = input.snapshot.voiceContext ?? null;
	const sessionEvidence = {
		session: input.session,
		observedAtMs: input.observedAtMs,
		provenance: input.provenance,
	} as const;
	if (evidence === null) {
		return Object.freeze({
			capture: null,
			observation: history.observe(sessionEvidence),
			entries: Object.freeze([]),
			sourceEntriesTruncated: 0,
		});
	}
	if (input.session.sessionId === null || input.session.sessionId !== evidence.sessionId) {
		return Object.freeze({
			capture: identityMismatch(history),
			observation: null,
			entries: Object.freeze([]),
			sourceEntriesTruncated: evidence.entriesTruncated,
		});
	}
	const capture = history.capture({ ...sessionEvidence, canonicalBrief: evidence.canonicalBrief });
	const observation =
		capture.outcome === "ignored" && capture.reason === "duplicate_session"
			? history.observe(sessionEvidence)
			: null;
	if (capture.outcome === "ignored" && capture.reason !== "duplicate_session")
		return Object.freeze({
			capture,
			observation,
			entries: Object.freeze([]),
			sourceEntriesTruncated: evidence.entriesTruncated,
		});
	const entries = evidence.entries.map((value) =>
		history.append({ session: input.session, entry: ledgerEntry(value, evidence.ledgerId, input) }),
	);
	return Object.freeze({
		capture,
		observation,
		entries: Object.freeze(entries),
		sourceEntriesTruncated: evidence.entriesTruncated,
	});
}
