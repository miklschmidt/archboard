// Which model a pane is actually looking at, once somebody has followed a
// drill-down out of the one it was opened on
// (`state/canvas/drill-trail.ts`).
//
// The trail is presentation state, in the same class as the camera and the
// selection: it is never written down and closing the tab forgets it (ADR
// 0023). The model on screen is what the pane reports, so the shell, the
// address and every other pane hear of it as of any model the pane holds. A
// model of another repository is a move of the pane, which the shell makes and
// the server announces; the trail is kept across that arrival (ADR 0050).
//
// An empty trail means the pane is showing its own model, and in that case
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
} from "#ui/state/canvas/drill-trail.ts";
import type { OtherRepository } from "#ui/rules/canvas/drilling/drill-target.ts";

/**
 * Ask the shell to show a model in its vault: the pane moves there.
 * @param stop The model, its variant and its vault.
 * @returns Whether the shell showed it.
 */
type Dive = (stop: DrillStop) => Promise<boolean>;

/** Where a pane is, and the two moves it can make. */
interface DrillNavigation {
	/** The model on screen. */
	readonly model: string;
	/** The variant on screen, or undefined for the model's current one. */
	readonly variant: string | undefined;
	/**
	 * How the pane got here: every model before the one on screen, first to
	 * last. Empty when nothing has been followed.
	 */
	readonly trail: readonly DrillStop[];
	/** Where the pane's own model is among the trail and the model on screen. */
	readonly own: number;
	/**
	 * Follow a drill-down into another legacy board.
	 * @param model The target legacy board.
	 * @param variant A variant id or name, or undefined for its current one.
	 * @param there The other repository's vault it is in, when it is not in the pane's own.
	 */
	readonly open: (model: string, variant: string | undefined, there?: OtherRepository) => void;
	/**
	 * Go back to one of the models of the trail.
	 * @param depth Where it is in the trail: 0 is the first model.
	 * @returns Whether the model on screen changed in the pane, rather than by a move the shell makes.
	 */
	readonly backTo: (depth: number) => boolean;
}

/** The model the shell pointed the pane at, and what counts as being pointed again. */
interface OwnModel {
	readonly model: string;
	readonly variant: string | undefined;
	/** Which time the pane has been pointed at a model, when the shell counts. */
	readonly arrival: number | undefined;
	/** The pane's vault. */
	readonly vault: string;
	/** The repository identity of the pane's vault, when it has one and it is known. */
	readonly repository: string | null;
}

/**
 * Keep the trail across the shell's arrivals: the one the trail asked for keeps
 * it, any other one ends it. An arrival is folded in during render, as React
 * asks for state that follows a prop, so no frame draws a model of the vault
 * the pane left as though it were in the one it arrived in.
 * @param own The model the shell pointed the pane at.
 * @param held The trail as last set.
 * @param setTrail Replace the trail.
 * @returns The trail, the arrival folded in.
 */
function useArrivals(
	own: OwnModel,
	held: DrillTrail,
	setTrail: (next: DrillTrail) => void,
): DrillTrail {
	const { model, variant, arrival, vault } = own;
	const [opened, setOpened] = useState({ model, variant, arrival, vault });
	if (
		opened.model === model &&
		opened.variant === variant &&
		opened.arrival === arrival &&
		opened.vault === vault
	) {
		return held;
	}
	// A trail of its own even when it is empty, so that a move asked for before
	// the arrival can tell that the trail it was asked from is gone.
	const arrived = { ...drillArrived(held, { model, variant, vault, repository: null }) };
	setOpened({ model, variant, arrival, vault });
	setTrail(arrived);
	return arrived;
}

/**
 * Where the pane is looking, and how to move it.
 * @param own The model the shell pointed the pane at.
 * @param dive Ask the shell to show a model of another vault, when it can.
 * @returns The model on screen, the trail behind it, and the moves.
 */
function useDrillDown(own: OwnModel, dive: Dive | undefined): DrillNavigation {
	const [held, setTrail] = useState<DrillTrail>(NO_TRAIL);
	const trail = useArrivals(own, held, setTrail);
	const ownStop = useMemo<DrillStop>(
		() => ({
			model: own.model,
			variant: own.variant,
			vault: own.vault,
			repository: own.repository,
		}),
		[own.model, own.variant, own.vault, own.repository],
	);
	/**
	 * Take a step, and ask the shell for the model it leaves for, if any. A step
	 * asked for from a trail that is gone leaves the trail as it is now: a flight
	 * that lands after the pane was pointed elsewhere opens no model over the one
	 * the pane holds now.
	 */
	const take = useCallback(
		(from: DrillTrail, step: TrailStep): void => {
			setTrail((current) => (current === from ? step.trail : current));
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
		(model: string, variant: string | undefined, there?: OtherRepository): void => {
			take(
				trail,
				drillInto(trail, ownStop, {
					model,
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
			take(trail, step);
			return step.dive === null && step.trail.above.length < trail.above.length;
		},
		[take, trail, ownStop],
	);
	return useMemo(() => {
		const stops = stopsOf(trail, ownStop);
		const here = stops.at(-1) ?? ownStop;
		return {
			model: here.model,
			variant: here.variant,
			trail: stops.slice(0, -1),
			own: trail.before.length,
			open,
			backTo,
		};
	}, [trail, ownStop, open, backTo]);
}

export { type Dive, type DrillNavigation, type OwnModel, useDrillDown };
