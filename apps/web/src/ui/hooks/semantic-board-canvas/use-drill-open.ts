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

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { use, useCallback, useEffect, useRef } from "react";

import type { VariantReading } from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import {
	drillPlace,
	resolveDrillDown,
	type OpenDown,
} from "#ui/rules/semantic-board-canvas/drilling/drill-target.ts";
import {
	semanticBoardDocumentQuery,
	semanticBoardListQuery,
} from "#ui/clients/semantic-board-canvas/reads/queries.ts";
import { RepositoryPlacesContext } from "#ui/state/semantic-board-canvas/repository-places.ts";
import { usePaneVault } from "#ui/hooks/semantic-board-canvas/use-pane-vault.ts";
import type { SemanticNode } from "@archboard/board/content";

type DrillDown = NonNullable<SemanticNode["drillDown"]>;

/**
 * The repository identity of the vault a link is drawn in, read only when the
 * link names a repository it could be compared with.
 * @param queryClient The page's queries.
 * @param target The link.
 * @param vault The vault it is drawn in.
 * @returns The identity, or undefined when the link names none or the vault has none.
 */
async function ownRepository(
	queryClient: QueryClient,
	target: DrillDown,
	vault: string,
): Promise<string | undefined> {
	if (target.repo === undefined) return undefined;
	return (await queryClient.fetchQuery(semanticBoardListQuery(vault))).repository;
}

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
	const queryClient = useQueryClient();
	const vault = usePaneVault();
	const places = use(RepositoryPlacesContext);
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
			 * Find the vault the target board is in, read it there, and open the
			 * variant the link names when it is there. A board of a repository this
			 * machine cannot read opens nothing; the inspector says why.
			 */
			const follow = async (): Promise<void> => {
				const place = drillPlace(target, await ownRepository(queryClient, target, vault), places);
				if (place.kind !== "readable") return;
				const { there } = place;
				const document = await queryClient.fetchQuery(
					semanticBoardDocumentQuery(there?.vault ?? vault, target.board),
				);
				const resolved = resolveDrillDown(target, document);
				if (resolved.kind === "ready" && current()) {
					onOpenDown(resolved.board.name, resolved.variant.id, there);
				}
			};
			// A board that could not be read opens nothing; the inspector reads the
			// same board and says why.
			follow().catch(() => undefined);
		},
		[reading, onOpenDown, queryClient, vault, places],
	);
}

export { useDrillOpen };
