// How the pane is reading whichever board it is actually looking at.
//
// Two cases, and they differ in who owns the answer rather than in what it
// means. The pane's own board is read the way the shell says: which variant and
// which view belong in the address, two panes can read one board two ways, and
// a reload keeps both — so the shell holds them and hands them down.
//
// A board somebody drilled into is not addressed at all. The trail is local on
// purpose and the address still names where the reader started, so there is
// nothing above to hold the level's reading and this holds it instead. It is
// reset whenever the level changes, because the ids do not carry: a view is a
// subject of one board and a variant id belongs to one board, so
// what was being read a level up means nothing here. What replaces them is the
// target's own — its views, its variants, its current state — because a board
// one level down is still a board somebody is reading, and hiding its controls
// left a reader unable to switch grammar or to see whether what they were
// looking at was the architecture, a proposal, or history.

import { useCallback, useMemo, useState } from "react";

import type { DrillNavigation } from "@/ui/semantic-board-canvas/hooks/use-drill-down";

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
	 * The person chose a state of the pane's own architecture.
	 * @param variant The variant's id, or null for whichever is current.
	 */
	readonly onVariant: ((variant: string | null) => void) | undefined;
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
	/** The view chosen there, or null for the whole variant. */
	readonly view: string | null;
	/** The variant chosen there, or null for whichever is current. */
	readonly variant: string | null;
}

/**
 * The remembered reading, when it is this level's.
 * @param place What was last chosen, or null when nothing has been.
 * @param depth How deep the trail is now.
 * @param board The board on screen now.
 * @returns The place, or null when it belongs to a level the pane has left.
 */
function placeAt(place: LevelPlace | null, depth: number, board: string): LevelPlace | null {
	if (place === null) {
		return null;
	}
	return place.depth === depth && place.board === board ? place : null;
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
	const [place, setPlace] = useState<LevelPlace | null>(null);
	const here = placeAt(place, depth, board);

	// Choosing a way of reading says nothing about which state to read. Falling
	// back to null here would answer that question too, with "whichever is
	// current" — so a link followed into another board's "as built" would quietly
	// become its current architecture the moment somebody switched grammar, and
	// the reader would be looking at a different thing than the one they asked
	// for. What the link asked for stands until somebody chooses otherwise.
	const asked = drill.variant ?? null;
	const onView = useCallback(
		(view: string | null): void => {
			setPlace((current) => {
				// Nothing chosen here yet and "the current one, please" are different
				// answers that look alike: both are null. Falling through the second
				// to the link's variant would undo a choice somebody has just made,
				// so the place itself decides — absent means nobody has said, and
				// present means they have, whatever they said.
				const held = placeAt(current, depth, board);
				return { depth, board, view, variant: held === null ? asked : held.variant };
			});
		},
		[asked, board, depth],
	);
	// A board owns its views, so changing its state keeps the question being read.
	const onVariant = useCallback(
		(variant: string | null): void => {
			setPlace((current) => ({
				depth,
				board,
				view: placeAt(current, depth, board)?.view ?? null,
				variant,
			}));
		},
		[board, depth],
	);

	return useMemo(() => {
		if (depth === 0) {
			return {
				variant: drill.variant,
				view: own.view,
				onView: own.onView,
				onVariant: own.onVariant,
			};
		}
		// Until somebody chooses at this level, the level is read as the link that
		// led here asked for it: that variant, and the whole of it.
		return {
			variant: here === null ? drill.variant : (here.variant ?? undefined),
			view: here?.view ?? undefined,
			onView,
			onVariant,
		};
	}, [depth, drill.variant, here, onVariant, onView, own.onVariant, own.onView, own.view]);
}

export { useLevelReading, type OwnReading, type PaneReading };
