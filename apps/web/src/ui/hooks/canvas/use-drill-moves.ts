// What following a card's drill-down, and going back up the trail, do to a pane.
//
// Both clear the selection the move was made from, tell the shell that the
// reader changed the model by hand, and say which way the reader went so the
// picture being left knows how to leave. Going back any number of levels is
// one move, so the shell hears of it once. Which move is a flight is the
// dive's to decide: it is handed what the plain move does, and ends with it.
// Only the model one level up opened the model on screen from one of its
// cards, so only going back to it can fly out of that card.

import { useCallback, useMemo } from "react";

import type { Destination, Flier } from "#ui/hooks/canvas/use-dive.ts";
import type { DrillNavigation } from "#ui/hooks/canvas/use-drill-down.ts";
import type { DepartureWay } from "#ui/clients/canvas/picture/picture-departure.ts";
import type { OpenDown } from "#ui/rules/canvas/drilling/drill-target.ts";
import type { SemanticPaneContextSchema } from "@archboard/model/pane-context";
import type { z } from "zod";

type SemanticPanePart = NonNullable<z.infer<typeof SemanticPaneContextSchema>["byUser"]>[number];

/** What a pane's moves between models are made from. */
interface DrillMovesInputs {
	/** Where the pane is looking, and how it got there. */
	readonly drill: DrillNavigation;
	/** The flights into a card's model and back out of it. */
	readonly flier: Pick<Flier, "into" | "out">;
	/**
	 * Say which way the reader is about to go, before they go.
	 * @param way Into a card, back out, or across.
	 * @param card The card opened, when going into one.
	 */
	readonly leave: (way: DepartureWay, card?: string | null) => void;
	/** The subject picked out, which a drill-down opens from. */
	readonly picked: string | null;
	/** The view the shell has the pane read its own model through. */
	readonly ownView: string | undefined;
	/**
	 * Clear the selection.
	 * @param id Nothing is selected.
	 */
	readonly onSelect: (id: null) => void;
	/** The user changed a part of the reading by hand that the shell hears of no other way. */
	readonly onUserChanged: ((part: SemanticPanePart) => void) | undefined;
}

/** The two moves a pane makes between models. */
interface DrillMoves {
	/**
	 * Follow a drill-down to a model and one of its variants.
	 * @param board The target model.
	 * @param variant The variant to open, by id.
	 */
	readonly onOpenDown: OpenDown;
	/**
	 * Go back to one of the models the reader came down through.
	 * @param depth Where it is in the trail: 0 is its first model.
	 */
	readonly onBackTo: (depth: number) => void;
}

/**
 * The model above the one on screen, and how the pane reads it once the reader
 * is back on it: the shell's view for the pane's own model, and the whole of
 * the model for one a level further down.
 * @param drill How the pane got here, and where its own model is in that.
 * @param ownView The view the shell has the pane read its own model through.
 * @returns The model, or null when the pane is on its own model, which nothing
 *   in the pane opened from a card.
 */
function levelAbove(
	drill: Pick<DrillNavigation, "trail" | "own">,
	ownView: string | undefined,
): Destination | null {
	const { trail, own } = drill;
	const above = trail.at(-1);
	// A model before the pane's own is in another vault, or another model the
	// pane held: going back to it is a move of the pane, not a flight.
	if (above === undefined || trail.length - 1 < own) {
		return null;
	}
	return {
		model: above.model,
		variant: above.variant,
		view: trail.length - 1 === own ? ownView : undefined,
	};
}

/**
 * The moves a pane makes between models.
 * @param inputs Where the pane is looking, what it can fly, and what a move clears.
 * @returns Following a drill-down, and going back.
 */
function useDrillMoves(inputs: DrillMovesInputs): DrillMoves {
	const { drill, flier, leave, picked, ownView, onSelect, onUserChanged } = inputs;
	const { into, out } = flier;
	const above = useMemo(() => levelAbove(drill, ownView), [drill, ownView]);
	const onOpenDown = useCallback<OpenDown>(
		(model, variant, there) => {
			// A model of another repository is shown by the shell, which moves the
			// pane and tells everybody; the pane reports nothing of its own here.
			if (there !== undefined) {
				leave("into", picked);
				onSelect(null);
				drill.open(model, variant, there);
				return;
			}
			into(picked, { model, variant }, () => {
				leave("into", picked);
				onSelect(null);
				onUserChanged?.("model");
				drill.open(model, variant);
			});
		},
		[drill, into, leave, onSelect, onUserChanged, picked],
	);
	const onBackTo = useCallback(
		(depth: number): void => {
			/** Go back the plain way. */
			const proceed = (): void => {
				leave("out");
				onSelect(null);
				// A move the shell makes for it is announced by the shell, and a back that
				// leaves the model on screen where it is changed nothing to report.
				if (drill.backTo(depth)) onUserChanged?.("model");
			};
			if (above === null || depth !== drill.trail.length - 1) {
				proceed();
				return;
			}
			out(above, proceed);
		},
		[above, drill, leave, onSelect, onUserChanged, out],
	);
	return { onOpenDown, onBackTo };
}

export { useDrillMoves };
