// What the pane knows about the model behind the picture: which variants it
// holds, which one is on screen, and what that one explains about itself.
//
// It comes from the model document — the same read the inspector goes through —
// because a render answer says which variant it drew and not which others the
// model has, and carries the model's views and not the variant's narrative. The read is
// cached per model and invalidated by the model's own change announcement, so
// two panes on one model share it and a pane pays for it once.
//
// Nothing here writes. The browser never states anything about a semantic
// model (ADR 0023); it reads one, and says which part of it a person is
// looking at.

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { readVariant, type VariantReading } from "#ui/rules/canvas/reading/document.ts";
import { retainedDocumentQuery } from "#ui/clients/canvas/reads/queries.ts";
import { usePaneVault } from "#ui/hooks/canvas/use-pane-vault.ts";

/**
 * The legacy board behind one pane's picture.
 * @param model The legacy board on screen.
 * @param variant The variant on screen: an id or name, or undefined for the
 *   current one.
 * @returns The reading, or null while the legacy board has not arrived or cannot be read.
 */
function useVariantReading(model: string, variant: string | undefined): VariantReading | null {
	const held = useQuery(retainedDocumentQuery(usePaneVault(), model));
	const answer = held.data;
	return useMemo(() => readVariant(answer, variant), [answer, variant]);
}

export { useVariantReading };
