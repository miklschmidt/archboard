import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Model } from "@archboard/model/content";
import {
	branchFootprintQuery,
	sourceRefsQuery,
	type SourceRefsAnswer,
} from "#ui/architecture-drawing/model-reader/access/clients/branch-footprint.ts";
import { useReadVault } from "#ui/architecture-drawing/model-reader/reading/branch-footprint/hooks/use-read-vault.ts";
import {
	useMergeBaseStates,
	type RefRange,
} from "#ui/architecture-drawing/model-reader/reading/branch-footprint/hooks/use-merge-base-states.ts";
import {
	defaultAgainst,
	holds,
	type VaultStates,
} from "#ui/architecture-drawing/model-reader/reading/branch-footprint/rules/against.ts";

/**
 * What the reader chose for the range and the state, each absent until chosen, which takes its
 * default. A head of null is the head of each checkout.
 */
interface FootprintChoice {
	readonly base?: string | undefined;
	readonly head?: string | null | undefined;
	readonly against?: string | undefined;
}

/**
 * Read the branches, and the footprint from the chosen base, else the default base of the vault's
 * repository, to the chosen head, else the ref of a branch reading on screen, else the head of each
 * checkout. The footprint is set against the chosen state, else its default. Both reads happen
 * while the view is open and again on Refresh, and at no other time.
 * @param vault The explicitly addressed vault.
 * @param model The reading on screen.
 * @param choice What the reader chose.
 * @returns The reads, the range and the state they read, the vault they read, and Refresh.
 */
function useBranchFootprint(
	vault: string,
	model: Pick<Model, "manifest" | "selectedState" | "revision" | "sourceRef">,
	choice: FootprintChoice,
) {
	const refs = useQuery(sourceRefsQuery(vault, model));
	const base = baseOf(choice, refs.data);
	const head = headOf(choice, model);
	const read = useReadVault(vault, head);
	const against = useAgainst(vault, model, choice, { base, head }, read.states);
	const ready = base !== null && against !== null;
	const footprint = useQuery({
		...branchFootprintQuery(vault, model, { base: base ?? "", head, state: against ?? "" }),
		enabled: ready,
	});
	const { refetch: readRefs } = refs;
	const { refetch: readFootprint } = footprint;
	const refresh = useCallback((): void => {
		void readRefs();
		if (ready) void readFootprint();
	}, [readRefs, readFootprint, ready]);
	return { refs, footprint, base, head, read, against, refresh };
}

/**
 * The base to read from: the chosen one, else the default base of the vault's repository.
 * @param choice What the reader chose.
 * @param refs The source refs, when read.
 * @returns The base, or null when there is none yet.
 */
function baseOf(choice: FootprintChoice, refs: SourceRefsAnswer | undefined): string | null {
	return choice.base ?? refs?.vault?.defaultBase ?? null;
}

/**
 * The head to read up to: the chosen one, else the ref of a branch reading on screen, else the
 * head of each checkout.
 * @param choice What the reader chose.
 * @param model The reading on screen.
 * @returns The head, or null for the head of each checkout.
 */
function headOf(choice: FootprintChoice, model: Pick<Model, "sourceRef">): string | null {
	return choice.head === undefined ? (model.sourceRef?.ref ?? null) : choice.head;
}

/**
 * The state to set the commits against: the chosen one, else the default, once the vault that is
 * read is known and, when the default needs them, the states at the merge base.
 * @param vault The explicitly addressed vault.
 * @param model The reading on screen.
 * @param choice What the reader chose.
 * @param range The base and the head.
 * @param read The states of the vault that is read, once read.
 * @returns The state, or null while it is not known.
 */
function useAgainst(
	vault: string,
	model: Pick<Model, "manifest" | "selectedState" | "revision" | "sourceRef">,
	choice: FootprintChoice,
	range: RefRange,
	read: VaultStates | undefined,
): string | null {
	const shown = model.selectedState?.id;
	const before = useMergeBaseStates(vault, model, range, needsMergeBase(choice, read, shown));
	if (choice.against !== undefined) return choice.against;
	if (read === undefined || !before.settled) return null;
	return defaultAgainst(read, shown, before.states);
}

/**
 * Whether the default state needs the states at the merge base: the reader chose none, and the
 * vault that is read does not hold the state on screen.
 * @param choice What the reader chose.
 * @param read The states of the vault that is read, once read.
 * @param shown The state on screen.
 * @returns Whether it needs them.
 */
function needsMergeBase(
	choice: FootprintChoice,
	read: VaultStates | undefined,
	shown: string | undefined,
): boolean {
	if (choice.against !== undefined || read === undefined) return false;
	return !holds(read, shown);
}

export { useBranchFootprint, type FootprintChoice };
