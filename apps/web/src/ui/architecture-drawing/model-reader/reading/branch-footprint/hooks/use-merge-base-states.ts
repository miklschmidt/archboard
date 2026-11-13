import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Model } from "@archboard/model/content";
import {
	mergeBaseQuery,
	type NamedRange,
} from "#ui/architecture-drawing/model-reader/access/clients/branch-footprint.ts";
import { architectureModelQuery } from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";
import type { VaultStates } from "#ui/architecture-drawing/model-reader/reading/branch-footprint/rules/against.ts";

/** A range as the reader has it: a base and a head, each null where there is none. */
interface RefRange {
	readonly base: string | null;
	readonly head: string | null;
}

/** What a read says about whether it is over. */
type Settling = Pick<UseQueryResult, "data" | "isError">;

/** The states of the vault at the merge base, as far as they are known. */
interface MergeBaseStates {
	/** The states, or undefined when they are not read or there is no merge base. */
	readonly states: VaultStates | undefined;
	/** Whether the reads are over, so that a default can be chosen without them. */
	readonly settled: boolean;
}

/**
 * The states of the vault at the merge base of the range, read only when the default state needs
 * them: the vault at the head does not hold the state on screen, so the default is the proposal
 * that the head adds over the merge base.
 * @param vault The explicitly addressed vault.
 * @param model The reading on screen.
 * @param range The base and the head, or null where there is none.
 * @param needed Whether the default needs them.
 * @returns The states, and whether the reads are over.
 */
function useMergeBaseStates(
	vault: string,
	model: Pick<Model, "manifest" | "selectedState" | "revision" | "sourceRef">,
	range: RefRange,
	needed: boolean,
): MergeBaseStates {
	const named = needed ? namedOf(range) : null;
	const span = useQuery({
		...mergeBaseQuery(vault, model, named ?? { base: "", head: "" }),
		enabled: named !== null,
	});
	const mergeBase = span.data?.mergeBase;
	const before = useQuery({
		...architectureModelQuery(vault, null, { ref: mergeBase }),
		enabled: named !== null && mergeBase !== undefined,
	});
	if (named === null) return { states: undefined, settled: true };
	return { states: before.data, settled: settledOf(span, before) };
}

/**
 * The range, when both its ends are named.
 * @param range The range.
 * @returns The range, or null.
 */
function namedOf(range: RefRange): NamedRange | null {
	const { base, head } = range;
	return base === null || head === null ? null : { base, head };
}

/**
 * Whether the reads of the merge base are over: the range has none, or a read failed, or the
 * states arrived.
 * @param span The read of the range.
 * @param before The read of the vault at the merge base.
 * @returns Whether they are over.
 */
function settledOf(span: Settling, before: Settling): boolean {
	if (span.isError || span.data === null) return true;
	return before.isError || before.data !== undefined;
}

export { useMergeBaseStates, type RefRange };
