// How the pane is reading whichever board it is actually looking at.
//
// Two cases, and they differ in who owns the answer rather than in what it
// means. The pane's own board is read the way the shell says: which variant and
// which view belong in the address, two panes can read one board two ways, and
// a reload keeps both — so the shell holds them and hands them down.
//
// A board somebody drilled into is not addressed at all. The trail is local on
// purpose and the address still names where the reader started, so there is
// nothing above to hold the level's view and this holds it instead. It is reset
// whenever the level changes, because the ids do not carry: a view is a subject
// of one board, so what was being read a level up means nothing here. What
// replaces it is the target's own views, because a board one level down is still
// a board somebody is reading, and hiding its controls left a reader unable to
// switch grammar. The variant is the one the link that led here asked for.

import { useCallback, useMemo, useState } from "react";

import type { DrillNavigation } from "#ui/hooks/canvas/use-drill-down.ts";
import { usePaneVault } from "#ui/hooks/canvas/use-pane-vault.ts";
import type { SemanticPaneContextSchema } from "@archboard/model/pane-context";
import type { z } from "zod";

type SemanticPanePart = NonNullable<z.infer<typeof SemanticPaneContextSchema>["byUser"]>[number];

/** What the shell says about the pane's own board. */
interface OwnReading {
	/** The view the pane was told to read its own board through, if any. */
	readonly view: string | undefined;
	/**
	 * The person chose a way of reading the pane's own board.
	 * @param view The view's id, or null for the whole variant.
	 */
	readonly onView: ((view: string | null) => void) | undefined;
	/**
	 * The user changed, by hand, how a board they walked down into is read. The shell hears of
	 * a choice about the pane's own board through the one above, and of this no other way.
	 * @param part What their choice was about.
	 */
	readonly onUserChanged?: ((part: SemanticPanePart) => void) | undefined;
}

/** How the board on screen is being read, whoever owns the answer. */
interface PaneReading extends OwnReading {
	/** The variant to ask for: an id or name, or undefined for the current one. */
	readonly variant: string | undefined;
}

/** What is being read at one level of a trail. */
interface LevelPlace {
	/** How deep the trail was; a different depth is a different level. */
	readonly depth: number;
	/** The board at that level. */
	readonly board: string;
	/**
	 * The vault it is in: two repositories can each hold a board of one name,
	 * and the ids of one mean nothing in the other.
	 */
	readonly vault: string;
	/** The view chosen there, or null for the whole variant. */
	readonly view: string | null;
}

/**
 * The remembered reading, when it is this level's.
 * @param place What was last chosen, or null when nothing has been.
 * @param depth How deep the trail is now.
 * @param board The board on screen now.
 * @param vault The vault it is in.
 * @returns The place, or null when it belongs to a level the pane has left.
 */
function placeAt(
	place: LevelPlace | null,
	depth: number,
	board: string,
	vault: string,
): LevelPlace | null {
	if (place === null) {
		return null;
	}
	return place.depth === depth && place.board === board && place.vault === vault ? place : null;
}

/**
 * How the board on screen is being read, and how a person changes it.
 * @param drill Where the pane is looking, and how deep.
 * @param own What the shell says about the pane's own board.
 * @returns The variant and view to ask for, and what a choice does.
 */
function useLevelReading(drill: DrillNavigation, own: OwnReading): PaneReading {
	const depth = drill.trail.length;
	const board = drill.board;
	const vault = usePaneVault();
	const [place, setPlace] = useState<LevelPlace | null>(null);
	const here = placeAt(place, depth, board, vault);

	const { onUserChanged } = own;
	const onView = useCallback(
		(view: string | null): void => {
			onUserChanged?.("view");
			setPlace({ depth, board, vault, view });
		},
		[board, depth, vault, onUserChanged],
	);

	// The pane's own board is read as the shell says; a trail kept across a dive
	// into another repository puts boards before it (ADR 0050).
	const ownDepth = drill.own;
	return useMemo(() => {
		if (depth === ownDepth) {
			return {
				variant: drill.variant,
				view: own.view,
				onView: own.onView,
			};
		}
		// Until somebody chooses at this level, the level is read as the link that
		// led here asked for it: that variant, and the whole of it.
		return { variant: drill.variant, view: here?.view ?? undefined, onView };
	}, [depth, ownDepth, drill.variant, here, onView, own.onView, own.view]);
}

export { useLevelReading, type OwnReading, type PaneReading };
