import type {
	LegacyElementIngress,
	RuntimeBoardElement,
} from "../../../../shared/board-elements/index.ts";
import { expandElements } from "../../expand-elements.ts";
import { wellFormAgentStatement } from "../../apply-element-input.ts";

/** Route shorthand fixtures through the same named ingress as real agent writes. */
export function agentStatement(input: LegacyElementIngress): LegacyElementIngress {
	return wellFormAgentStatement(
		input as unknown as Record<string, unknown>,
	) as unknown as LegacyElementIngress;
}

/** Build a real native arm through the production write-ingress completion. */
export function completeElement(input: LegacyElementIngress): RuntimeBoardElement {
	const element = expandElements([agentStatement(input)], {
		deterministic: true,
		forStore: true,
	}).find((candidate) => candidate.id === input.id);
	if (!element) throw new Error(`Fixture did not produce ${input.id}`);
	return element;
}

export function completeElements(inputs: LegacyElementIngress[]): RuntimeBoardElement[] {
	return expandElements(inputs.map(agentStatement), { deterministic: true, forStore: true });
}
