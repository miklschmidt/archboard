import type {
	LegacyElementIngress,
	RuntimeBoardElement,
} from "../../../../shared/board-elements/index.ts";
import { expandElements } from "../../expand-elements.ts";

/** Build a real native arm through the production write-ingress completion. */
export function completeElement(input: LegacyElementIngress): RuntimeBoardElement {
	const element = expandElements([input], { deterministic: true, forStore: true }).find(
		(candidate) => candidate.id === input.id,
	);
	if (!element) throw new Error(`Fixture did not produce ${input.id}`);
	return element;
}

export function completeElements(inputs: LegacyElementIngress[]): RuntimeBoardElement[] {
	return expandElements(inputs, { deterministic: true, forStore: true });
}
