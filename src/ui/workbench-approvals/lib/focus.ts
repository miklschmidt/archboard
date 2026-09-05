// When the card a person was working in loses its authority, it settles,
// expires, is cancelled, goes stale, or the connection drops, its decision
// controls disappear. Focus must not disappear with them, so the surface
// takes focus back to its own heading and says what happened.

import type { WorkbenchApprovalCard } from "@/ui/workbench-approvals/contracts";

/** The card whose authority was removed while it held focus. */
interface ApprovalFocusReturn {
	readonly key: string;
	readonly announcement: string;
}

const ENTRY_SEPARATOR = "";
const FIELD_SEPARATOR = "";

/**
 * A stable description of which cards can still be decided. The projection
 * rebuilds its cards on every host snapshot, so identity comparison would say
 * "changed" forever; this says what actually changed.
 * @param cards The cards.
 * @returns The signature.
 */
function approvalDecisionSignature(cards: readonly WorkbenchApprovalCard[]): string {
	return cards
		.map((card) =>
			[card.key, card.offers.length > 0 ? "decidable" : "read_only", card.status.phase].join(
				FIELD_SEPARATOR,
			),
		)
		.join(ENTRY_SEPARATOR);
}

/**
 * The keys a signature marked decidable.
 * @param signature The signature.
 * @returns The keys.
 */
function decidableKeys(signature: string): ReadonlySet<string> {
	if (signature.length === 0) {
		return new Set();
	}
	const keys = new Set<string>();
	for (const entry of signature.split(ENTRY_SEPARATOR)) {
		const [key, state] = entry.split(FIELD_SEPARATOR);
		if (key !== undefined && state === "decidable") {
			keys.add(key);
		}
	}
	return keys;
}

/**
 * The words for what happened to a card that lost its authority.
 * @param current The card as it is now, or undefined when it is gone.
 * @returns The outcome.
 */
function outcomeWords(current: WorkbenchApprovalCard | undefined): string {
	return current === undefined
		? "It is gone from this workbench."
		: `${current.status.label}. ${current.status.detail}`;
}

/**
 * Whether focus must return to the heading, and what to announce.
 * @param previousSignature The signature before the change.
 * @param cards The cards now.
 * @param focusedKey The card that held focus, or null.
 * @returns The return, or null when the focused card still accepts a decision.
 */
function approvalFocusReturn(
	previousSignature: string,
	cards: readonly WorkbenchApprovalCard[],
	focusedKey: string | null,
): ApprovalFocusReturn | null {
	if (focusedKey === null || !decidableKeys(previousSignature).has(focusedKey)) {
		return null;
	}
	const current = cards.find((card) => card.key === focusedKey);
	return stillDecidable(current) ? null : focusReturn(focusedKey, current);
}

/**
 * Whether a card still accepts a decision.
 * @param current The card as it is now, or undefined when it is gone.
 * @returns True while it offers a decision.
 */
function stillDecidable(current: WorkbenchApprovalCard | undefined): boolean {
	return current !== undefined && current.offers.length > 0;
}

/**
 * The return for one card that lost its authority.
 * @param key The card's key.
 * @param current The card as it is now, or undefined when it is gone.
 * @returns The return.
 */
function focusReturn(key: string, current: WorkbenchApprovalCard | undefined): ApprovalFocusReturn {
	const title = current?.title ?? "This approval";
	return Object.freeze({
		key,
		announcement: `${title} no longer accepts a decision: ${outcomeWords(current)} Focus returned to the approvals heading.`,
	});
}

export { approvalDecisionSignature, approvalFocusReturn, type ApprovalFocusReturn };
