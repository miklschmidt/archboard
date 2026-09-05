// The disclosure rows a spoken view carries beside the ordinary card: the
// request and effect rows the card already owns, the broker source plus the
// coordinator thread, and the immutable gate facts.

import type { BrowserSpokenApproval } from "@/shared/codex-browser-model";
import type { VoiceSpokenApprovalUtterance } from "@/ui/voice-spoken-approval/contract";
import type {
	WorkbenchApprovalDisclosure,
	WorkbenchOrdinaryApprovalCard,
} from "@/ui/workbench-approvals/contracts";

/**
 * Frozen copies of disclosure rows.
 * @param rows The rows.
 * @returns The frozen rows.
 */
function frozenRows(
	rows: readonly WorkbenchApprovalDisclosure[],
): readonly WorkbenchApprovalDisclosure[] {
	return Object.freeze(rows.map((row) => Object.freeze({ ...row })));
}

/**
 * The source rows: the broker's identity and the coordinator thread of an armed gate.
 * @param card The ordinary card.
 * @param gate The spoken gate, if any.
 * @returns The rows.
 */
function sourceRows(
	card: WorkbenchOrdinaryApprovalCard,
	gate: BrowserSpokenApproval["gate"],
): readonly WorkbenchApprovalDisclosure[] {
	const coordinator =
		gate === null
			? []
			: [{ label: "Coordinator thread", value: gate.coordinatorThreadId, technical: true }];
	return frozenRows([...card.broker, ...coordinator]);
}

/**
 * The gate rows: every immutable fact of an armed gate.
 * @param gate The spoken gate, if any.
 * @returns The rows, empty without a gate.
 */
function gateRows(gate: BrowserSpokenApproval["gate"]): readonly WorkbenchApprovalDisclosure[] {
	if (gate === null) {
		return Object.freeze([]);
	}
	return frozenRows([
		{ label: "Realtime session", value: String(gate.realtimeSessionId), technical: true },
		{ label: "Effect summary", value: gate.effectSummary, technical: false },
		{ label: "Effect fingerprint", value: gate.effectFingerprint, technical: true },
		{ label: "Effect prompt item", value: String(gate.effectPrompt.itemId), technical: true },
		{ label: "Effect prompt sequence", value: String(gate.effectPrompt.sequence), technical: true },
		{ label: "Gate expires", value: new Date(gate.expiresAtMs).toISOString(), technical: true },
	]);
}

/**
 * The captured final user utterance with its authority, when the gate has one.
 * @param spoken The spoken approval.
 * @returns The utterance, or null.
 */
function utterance(spoken: BrowserSpokenApproval): VoiceSpokenApprovalUtterance | null {
	const item = spoken.capturedUserFinal;
	const gate = spoken.gate;
	if (item === null || gate === null) {
		return null;
	}
	return Object.freeze({
		...item,
		realtimeSessionId: gate.realtimeSessionId,
		authority: "captured_user_final",
		label: "Captured final user utterance",
	});
}

export { frozenRows, gateRows, sourceRows, utterance };
