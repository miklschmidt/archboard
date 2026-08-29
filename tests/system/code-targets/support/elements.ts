import { wellFormAgentStatement } from "../../../../src/runtime/engine/apply-element-input.ts";
import { expandElements } from "../../../../src/runtime/engine/expand-elements.ts";
import type {
	LegacyElementIngress,
	RuntimeBoardElement,
} from "../../../../src/shared/board-elements/index.ts";

/** Build a canonical native element through the production write-ingress completion. */
export function completeElement(input: LegacyElementIngress): RuntimeBoardElement {
	const statement = wellFormAgentStatement(
		input as unknown as Record<string, unknown>,
	) as unknown as LegacyElementIngress;
	const element = expandElements([statement], { deterministic: true, forStore: true }).find(
		(candidate) => candidate.id === input.id,
	);
	if (!element) throw new Error(`Fixture did not produce ${input.id}`);
	return element;
}
