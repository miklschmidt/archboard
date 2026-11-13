import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Model } from "@archboard/model/content";
import {
	branchFootprintQuery,
	sourceRefsQuery,
	type SourceRefsAnswer,
} from "#ui/architecture-drawing/model-reader/access/clients/branch-footprint.ts";

/** What the reader chose for the range: a base, or nothing yet, which takes the default. */
interface FootprintChoice {
	readonly base?: string | undefined;
}

/**
 * Read the branches and the footprint of the reading on screen, from the chosen base, else the
 * default base of the vault's repository. The head is the head of each checkout, or the ref of a
 * branch reading on screen, whose model only that ref holds. Both reads happen while the view is
 * open and again on Refresh, and at no other time.
 * @param vault The explicitly addressed vault.
 * @param model The reading on screen.
 * @param choice What the reader chose.
 * @returns The two reads, the range they read, and Refresh.
 */
function useBranchFootprint(
	vault: string,
	model: Pick<Model, "manifest" | "selectedState" | "revision" | "sourceRef">,
	choice: FootprintChoice,
) {
	const refs = useQuery(sourceRefsQuery(vault, model));
	const base = baseOf(choice, refs.data);
	const head = model.sourceRef?.ref ?? null;
	const footprint = useQuery({
		...branchFootprintQuery(vault, model, { base: base ?? "", head }),
		enabled: base !== null,
	});
	const { refetch: readRefs } = refs;
	const { refetch: readFootprint } = footprint;
	const refresh = useCallback((): void => {
		void readRefs();
		if (base !== null) void readFootprint();
	}, [readRefs, readFootprint, base]);
	return { refs, footprint, base, head, refresh };
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

export { useBranchFootprint, type FootprintChoice };
