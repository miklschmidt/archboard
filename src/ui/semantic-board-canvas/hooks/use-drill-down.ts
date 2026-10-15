// Which board a pane is actually looking at, once somebody has followed a
// drill-down out of the one it was opened on (lib/drill-trail.ts).
//
// The trail is presentation state, in the same class as the camera and the
// selection: it is never written down and closing the tab forgets it (ADR
// 0023). The board on screen is what the pane reports, so the shell, the
// address and every other pane hear of it as of any board the pane holds. A
// board of another repository is a move of the pane, which the shell makes and
// the server announces; the trail is kept across that arrival (ADR 0050).
//
// An empty trail means the pane is showing its own board, and in that case
// every value here is exactly what the pane was given — a pane nobody has
// drilled into behaves as though this hook were not there.

import { useCallback, useMemo, useState } from "react";

import {
	NO_TRAIL,
	drillArrived,
	drillBack,
	drillInto,
	drillRefused,
	stopsOf,
	type DrillStop,
	type DrillTrail,
	type TrailStep,
} from "@/ui/semantic-board-canvas/lib/drill-trail";
import type { OtherRepository } from "@/ui/semantic-board-canvas/lib/drill-target";

/**
 * Ask the shell to show a board in its vault: the pane moves there.
 * @param stop The board, its variant and its vault.
 * @returns Whether the shell showed it.
 */
type Dive = (stop: DrillStop) => Promise<boolean>;

/** Where a pane is, and the two moves it can make. */
interface DrillNavigation {
	/** The board on screen. */
	readonly board: string;
	/** The variant on screen, or undefined for the board's current one. */
	readonly variant: string | undefined;
	/**
	 * How the pane got here: every board before the one on screen, first to
	 * last. Empty when nothing has been followed.
	 */
	readonly trail: readonly DrillStop[];
	/** Where the pane's own board is among the trail and the board on screen. */
	readonly own: number;
	/**
	 * Follow a drill-down into another board.
	 * @param board The target board.
	 * @param variant A variant id or name, or undefined for its current one.
	 * @param there The other repository's vault it is in, when it is not in the pane's own.
	 */
	readonly open: (board: string, variant: string | undefined, there?: OtherRepository) => void;
	/**
	 * Go back to one of the boards of the trail.
	 * @param depth Where it is in the trail: 0 is the first board.
	 * @returns Whether the board on screen changed in the pane, rather than by a move the shell makes.
	 */
	readonly backTo: (depth: number) => boolean;
}

/** The board the shell pointed the pane at, and what counts as being pointed again. */
interface OwnBoard {
	readonly board: string;
	readonly variant: string | undefined;
	/** Which time the pane has been pointed at a board, when the shell counts. */
	readonly arrival: number | undefined;
	/** The pane's vault. */
	readonly vault: string;
	/** The repository identity of the pane's vault, when it has one and it is known. */
	readonly repository: string | null;
}

/**
 * Keep the trail across the shell's arrivals: the one the trail asked for keeps
 * it, any other one ends it. An arrival is folded in during render, as React
 * asks for state that follows a prop, so no frame draws a board of the vault
 * the pane left as though it were in the one it arrived in.
 * @param own The board the shell pointed the pane at.
 * @param held The trail as last set.
 * @param setTrail Replace the trail.
 * @returns The trail, the arrival folded in.
 */
function useArrivals(
	own: OwnBoard,
	held: DrillTrail,
	setTrail: (next: DrillTrail) => void,
): DrillTrail {
	const { board, variant, arrival, vault } = own;
	const [opened, setOpened] = useState({ board, variant, arrival, vault });
	if (
		opened.board === board &&
		opened.variant === variant &&
		opened.arrival === arrival &&
		opened.vault === vault
	) {
		return held;
	}
	const arrived = drillArrived(held, { board, variant, vault, repository: null });
	setOpened({ board, variant, arrival, vault });
	setTrail(arrived);
	return arrived;
}

/**
 * Where the pane is looking, and how to move it.
 * @param own The board the shell pointed the pane at.
 * @param dive Ask the shell to show a board of another vault, when it can.
 * @returns The board on screen, the trail behind it, and the moves.
 */
function useDrillDown(own: OwnBoard, dive: Dive | undefined): DrillNavigation {
	const [held, setTrail] = useState<DrillTrail>(NO_TRAIL);
	const trail = useArrivals(own, held, setTrail);
	const ownStop = useMemo<DrillStop>(
		() => ({
			board: own.board,
			variant: own.variant,
			vault: own.vault,
			repository: own.repository,
		}),
		[own.board, own.variant, own.vault, own.repository],
	);
	/** Take a step, and ask the shell for the board it leaves for, if any. */
	const take = useCallback(
		(step: TrailStep): void => {
			setTrail(step.trail);
			const stop = step.dive;
			if (stop === null) return;
			/** The shell did not show it: the trail no longer waits on it. */
			const refused = (): void => {
				setTrail((current) => drillRefused(current, stop));
			};
			if (dive === undefined) {
				refused();
				return;
			}
			void dive(stop).then((shown) => {
				if (!shown) refused();
				return shown;
			}, refused);
		},
		[dive],
	);
	const open = useCallback(
		(board: string, variant: string | undefined, there?: OtherRepository): void => {
			take(
				drillInto(trail, ownStop, {
					board,
					variant,
					vault: there?.vault ?? ownStop.vault,
					repository: there?.repository ?? ownStop.repository,
				}),
			);
		},
		[take, trail, ownStop],
	);
	const backTo = useCallback(
		(depth: number): boolean => {
			const step = drillBack(trail, ownStop, depth);
			take(step);
			return step.dive === null && step.trail.above.length < trail.above.length;
		},
		[take, trail, ownStop],
	);
	return useMemo(() => {
		const stops = stopsOf(trail, ownStop);
		const here = stops.at(-1) ?? ownStop;
		return {
			board: here.board,
			variant: here.variant,
			trail: stops.slice(0, -1),
			own: trail.before.length,
			open,
			backTo,
		};
	}, [trail, ownStop, open, backTo]);
}

export { type Dive, type DrillNavigation, type OwnBoard, useDrillDown };
