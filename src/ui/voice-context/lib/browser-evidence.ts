// Adapts one immutable browser-owner snapshot into the presentation ledger:
// the exact canonical brief bytes are captured once, later entries are
// appended by their ledger position, and the owner's omissions are recorded.

import type { BrowserVoiceContext } from "@/shared/codex-browser-model";
import type {
	VoiceContextBrowserEvidenceInput,
	VoiceContextBrowserIngestResult,
	VoiceContextHistory,
	VoiceContextLedgerEntry,
	VoiceContextMutationResult,
	VoiceContextSessionEvidence,
} from "@/ui/voice-context/contract";

type BrowserEntry = BrowserVoiceContext["entries"][number];

/**
 * An identity-mismatch result at the history's current revision.
 * @param history The history.
 * @returns The result.
 */
function identityMismatch(history: VoiceContextHistory): VoiceContextMutationResult {
	return Object.freeze({
		outcome: "ignored",
		reason: "identity_mismatch",
		revision: history.snapshot().revision,
	});
}

/**
 * A ledger entry from one browser entry.
 * @param value The browser entry.
 * @param ledgerId The ledger it came from.
 * @param input The ingestion input.
 * @returns The ledger entry.
 */
function ledgerEntry(
	value: BrowserEntry,
	ledgerId: string,
	input: VoiceContextBrowserEvidenceInput,
): VoiceContextLedgerEntry {
	const shared = {
		id: value.id,
		kind: value.kind,
		sourceOrder: { kind: "adapter_ledger" as const, ledgerId, position: value.sourceOrder },
		freshness: { capturedAtMs: value.capturedAtMs, freshUntilMs: value.freshUntilMs },
		reason: value.reason,
		body: value.body,
		provenance: input.provenance,
		connection: input.connection,
	};
	return value.attempted
		? { ...shared, attempted: true, attemptedAtMs: value.attemptedAtMs, outcome: value.outcome }
		: { ...shared, attempted: false, attemptedAtMs: null, outcome: "not_delivered" };
}

/**
 * An ingestion result with no ledger work.
 * @param capture The capture result, if any.
 * @param observation The observation result, if any.
 * @param truncated The owner's transport omissions.
 * @returns The result.
 */
function bareResult(
	capture: VoiceContextMutationResult | null,
	observation: VoiceContextMutationResult | null,
	truncated: number,
): VoiceContextBrowserIngestResult {
	return Object.freeze({
		capture,
		observation,
		entries: Object.freeze([]),
		sourceHistory: null,
		sourceEntriesTruncated: truncated,
	});
}

/**
 * Appends every browser entry and records the owner's omissions.
 * @param history The history.
 * @param input The ingestion input.
 * @param evidence The browser voice context.
 * @param capture The capture result.
 * @param observation The observation result, if any.
 * @returns The result.
 */
function ingestLedger(
	history: VoiceContextHistory,
	input: VoiceContextBrowserEvidenceInput,
	evidence: BrowserVoiceContext,
	capture: VoiceContextMutationResult,
	observation: VoiceContextMutationResult | null,
): VoiceContextBrowserIngestResult {
	const entries = evidence.entries.map((value) =>
		history.append({ session: input.session, entry: ledgerEntry(value, evidence.ledgerId, input) }),
	);
	const sourceHistory = history.recordSourceHistory({
		session: input.session,
		ownerOmittedPrefixCount: evidence.ownerEntriesTruncated,
		sourceEntryCount: evidence.entriesTruncated + evidence.entries.length,
	});
	return Object.freeze({
		capture,
		observation,
		entries: Object.freeze(entries),
		sourceHistory,
		sourceEntriesTruncated: evidence.entriesTruncated,
	});
}

/**
 * Ingests a browser voice context that names the session.
 * @param history The history.
 * @param input The ingestion input.
 * @param evidence The browser voice context.
 * @param sessionEvidence The session observation.
 * @returns What was applied.
 */
function ingestContext(
	history: VoiceContextHistory,
	input: VoiceContextBrowserEvidenceInput,
	evidence: BrowserVoiceContext,
	sessionEvidence: VoiceContextSessionEvidence,
): VoiceContextBrowserIngestResult {
	const capture = history.capture({ ...sessionEvidence, canonicalBrief: evidence.canonicalBrief });
	const duplicate = capture.outcome === "ignored" && capture.reason === "duplicate_session";
	const observation = duplicate ? history.observe(sessionEvidence) : null;
	if (capture.outcome === "ignored" && !duplicate) {
		return bareResult(capture, observation, evidence.entriesTruncated);
	}
	return ingestLedger(history, input, evidence, capture, observation);
}

/**
 * Ingests one browser snapshot into the history.
 * @param history The history.
 * @param input The ingestion input.
 * @returns What was applied.
 */
function ingestVoiceContextBrowserEvidence(
	history: VoiceContextHistory,
	input: VoiceContextBrowserEvidenceInput,
): VoiceContextBrowserIngestResult {
	const evidence = input.snapshot.voiceContext ?? null;
	const sessionEvidence: VoiceContextSessionEvidence = {
		session: input.session,
		observedAtMs: input.observedAtMs,
		provenance: input.provenance,
	};
	if (evidence === null) {
		return bareResult(null, history.observe(sessionEvidence), 0);
	}
	if (input.session.sessionId === null || input.session.sessionId !== evidence.sessionId) {
		return bareResult(identityMismatch(history), null, evidence.entriesTruncated);
	}
	return ingestContext(history, input, evidence, sessionEvidence);
}

export { ingestVoiceContextBrowserEvidence };
