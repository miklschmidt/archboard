import type { WorkbenchApprovalCard } from "../contract.js";

export interface ApprovalFocusReturn {
	/** The card whose authority was removed while it held focus. */
	readonly key: string;
	readonly announcement: string;
}

const ENTRY_SEPARATOR = "\u001f";
const FIELD_SEPARATOR = "\u001e";

/**
 * A stable description of which cards can still be decided. The projection
 * rebuilds its cards on every host snapshot, so identity comparison would say
 * "changed" forever; this says what actually changed.
 */
export function approvalDecisionSignature(cards: readonly WorkbenchApprovalCard[]): string {
	return cards
		.map((card) =>
			[card.key, card.offers.length > 0 ? "decidable" : "read_only", card.status.phase].join(
				FIELD_SEPARATOR,
			),
		)
		.join(ENTRY_SEPARATOR);
}

function decidableKeys(signature: string): ReadonlySet<string> {
	if (signature.length === 0) return new Set();
	const keys = new Set<string>();
	for (const entry of signature.split(ENTRY_SEPARATOR)) {
		const [key, state] = entry.split(FIELD_SEPARATOR);
		if (key !== undefined && state === "decidable") keys.add(key);
	}
	return keys;
}

/**
 * When the card a person was working in loses its authority — it settles,
 * expires, is cancelled, goes stale, or the connection drops — its decision
 * controls disappear. Focus must not disappear with them, so the surface takes
 * focus back to its own heading and says what happened to the request.
 */
export function approvalFocusReturn(
	previousSignature: string,
	cards: readonly WorkbenchApprovalCard[],
	focusedKey: string | null,
): ApprovalFocusReturn | null {
	if (focusedKey === null) return null;
	if (!decidableKeys(previousSignature).has(focusedKey)) return null;
	const current = cards.find((card) => card.key === focusedKey);
	if (current !== undefined && current.offers.length > 0) return null;
	const outcome =
		current === undefined
			? "It is gone from this workbench."
			: `${current.status.label}. ${current.status.detail}`;
	const title = current?.title ?? "This approval";
	return Object.freeze({
		key: focusedKey,
		announcement: `${title} no longer accepts a decision: ${outcome} Focus returned to the approvals heading.`,
	});
}
