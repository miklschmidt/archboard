// Following a card's drill-down from the picture, by double-clicking the card.
//
// The same reading the inspector's "Open" makes (`use-drill-target.ts`): a
// target that leads nowhere, such as a named variant that is not there, opens
// nothing (ADR 0023). The two clicks before the double-click selected the card,
// so when nothing opens the inspector beside the picture is already saying why.
//
// The read answers later. An answer arriving after the reader has moved on,
// to another board or state, to another double-click or away from the
// picture, belongs to a card that is no longer there to open, and opens nothing.

import { useCallback, useEffect, useRef } from "react";

import type { VariantReading } from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import type { OpenDown } from "#ui/rules/semantic-board-canvas/drilling/drill-target.ts";
import { useDrillTargetReader } from "#ui/hooks/semantic-board-canvas/use-drill-target.ts";
import type { SemanticNode } from "@archboard/board/content";

type DrillDown = NonNullable<SemanticNode["drillDown"]>;

/**
 * The drill-down of a subject.
 * @param reading The variant on screen.
 * @param id The subject's semantic id.
 * @returns The drill-down, or undefined.
 */
function drillDownOf(reading: VariantReading | null, id: string | null): DrillDown | undefined {
	return reading?.variant?.content.nodes.find((node) => node.id === id)?.drillDown;
}

/**
 * Open the board one level down from a card, when it has one to open.
 * @param reading What the board says about the variant the picture draws, or null.
 * @param onOpenDown Follow a drill-down to a board and one of its variants, when the picture can.
 * @returns Open the drill-down of the subject with this id, if it is a card that has one.
 */
function useDrillOpen(
	reading: VariantReading | null,
	onOpenDown: OpenDown | undefined,
): (id: string | null) => void {
	const readTarget = useDrillTargetReader();
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
			const target = drillDownOf(reading, id);
			if (target === undefined || onOpenDown === undefined) {
				return;
			}
			latest.current += 1;
			const asked = latest.current;
			/**
			 * Whether the picture the request came from is still on screen.
			 * @returns Whether nothing has moved on since.
			 */
			const current = (): boolean =>
				asked === latest.current &&
				shown.current.reading === reading &&
				shown.current.onOpenDown === onOpenDown;
			/**
			 * Open where the target leads, if it leads somewhere and the picture
			 * it was asked from is still on screen. A target that leads nowhere
			 * opens nothing; the inspector reads the same target and says why.
			 */
			const follow = async (): Promise<void> => {
				const reached = await readTarget(target);
				if (reached.kind === "ready" && current()) {
					onOpenDown(reached.board.name, reached.variant.id, reached.there);
				}
			};
			void follow();
		},
		[reading, onOpenDown, readTarget],
	);
}

export { useDrillOpen };
