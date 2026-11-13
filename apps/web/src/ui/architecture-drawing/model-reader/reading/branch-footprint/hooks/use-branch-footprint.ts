import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Model } from "@archboard/model/content";
import {
	branchFootprintQuery,
	sourceRefsQuery,
	type SourceRefsAnswer,
} from "#ui/architecture-drawing/model-reader/access/clients/branch-footprint.ts";
import { useReadVault } from "#ui/architecture-drawing/model-reader/reading/branch-footprint/hooks/use-read-vault.ts";
import { defaultAgainst } from "#ui/architecture-drawing/model-reader/reading/branch-footprint/rules/against.ts";

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
	const against = choice.against ?? againstOf(read.states, model);
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
 * The default state to set the commits against, once the vault that is read is known.
 * @param read The states of that vault, once read.
 * @param model The reading on screen.
 * @returns The state, or null while it is not known.
 */
function againstOf(
	read: ReturnType<typeof useReadVault>["states"],
	model: Pick<Model, "selectedState">,
): string | null {
	if (read === undefined) return null;
	return defaultAgainst(read, model.selectedState?.id, undefined);
}

export { useBranchFootprint, type FootprintChoice };
