// Following a card's drill-down from the picture, by double-clicking the card.
//
// The same resolution the inspector's "Open" makes: the target board is read,
// and a named variant that is not there opens nothing (ADR 0023). The two
// clicks before the double-click selected the card, so when nothing opens the
// inspector beside the picture is already saying why.
//
// The read answers later. An answer arriving after the reader has moved on,
// to another board or state, to another double-click or away from the
// picture, belongs to a card that is no longer there to open, and opens nothing.

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import type { DrillDown } from "@/shared/semantic-board/index";
import type { VariantReading } from "@/ui/semantic-board-canvas/lib/board-document";
import { resolveDrillDown } from "@/ui/semantic-board-canvas/lib/drill-target";
import { semanticBoardDocumentQuery } from "@/ui/semantic-board-canvas/lib/queries";
import { usePaneVault } from "@/ui/semantic-board-canvas/hooks/use-pane-vault";

/**
 * The drill-down of a subject, when it opens a board of this pane's own vault.
 * A board of another repository is not the board of this vault that shares its
 * name, so nothing here reads it (TASK-472.13 dives into it).
 * @param reading The variant on screen.
 * @param id The subject's semantic id.
 * @returns The drill-down, or undefined.
 */
function localDrillDown(reading: VariantReading | null, id: string | null): DrillDown | undefined {
	const target = reading?.variant?.content.nodes.find((node) => node.id === id)?.drillDown;
	return target?.repo === undefined ? target : undefined;
}

/**
 * Open the board one level down from a card, when it has one to open.
 * @param reading What the board says about the variant the picture draws, or null.
 * @param onOpenDown Follow a drill-down to a board and one of its variants, when the picture can.
 * @returns Open the drill-down of the subject with this id, if it is a card that has one.
 */
function useDrillOpen(
	reading: VariantReading | null,
	onOpenDown: ((board: string, variant: string) => void) | undefined,
): (id: string | null) => void {
	const queryClient = useQueryClient();
	const vault = usePaneVault();
	// A read answers for the latest request, made from the reading still on
	// screen, while the picture is: a newer request, another reading or the
	// picture going away leaves it answering for nothing.
	const latest = useRef(0);
	const shown = useRef({ reading, onOpenDown });
	useEffect(() => {
		shown.current = { reading, onOpenDown };
	});
	useEffect(
		() => () => {
			latest.current += 1;
		},
		[],
	);
	return useCallback(
		(id: string | null): void => {
			const target = localDrillDown(reading, id);
			if (target === undefined || onOpenDown === undefined) {
				return;
			}
			latest.current += 1;
			const asked = latest.current;
			/** Read the target board, and open the variant the link names when it is there. */
			const follow = async (): Promise<void> => {
				const document = await queryClient.fetchQuery(
					semanticBoardDocumentQuery(vault, target.board),
				);
				const resolved = resolveDrillDown(target, document);
				const current =
					asked === latest.current &&
					shown.current.reading === reading &&
					shown.current.onOpenDown === onOpenDown;
				if (resolved.kind === "ready" && current) {
					onOpenDown(resolved.board.name, resolved.variant.id);
				}
			};
			// A board that could not be read opens nothing; the inspector reads the
			// same board and says why.
			follow().catch(() => undefined);
		},
		[reading, onOpenDown, queryClient, vault],
	);
}

export { useDrillOpen };
