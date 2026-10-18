// The part of the picture the pointer is resting on.
//
// Resting is judged the way a tip is: it takes a moment to start, so crossing
// the board does not flash, and once a part is resting on the next one is at
// once. Leaving waits a moment too, so crossing the gap between two cards, or
// the thin width of a line, keeps the part the pointer was on.

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

import { EXPLORING_MS } from "@archboard/timing";
import { frameClock } from "@/ui/frame-clock";
import type { SemanticAtlas } from "@/ui/semantic-board-canvas/api/semantic-boards";
import { tipTargetAt } from "@/ui/semantic-board-canvas/lib/subject-tips";

/** The part a pointer rests on, and the picture it rests on. */
interface Resting {
	readonly id: string;
	readonly atlas: SemanticAtlas;
}

/** The resting part, and what moves it. */
interface RestingPart {
	/** The part the pointer rests on in this picture, or null. */
	readonly part: string | null;
	/**
	 * The pointer moved over the picture while no gesture is under way.
	 * @param event The move.
	 */
	readonly onHover: (event: PointerEvent<HTMLElement>) => void;
	/** The pointer left the picture, or the picture moved under it: it rests on nothing. */
	readonly release: () => void;
}

/**
 * The part of the picture under the pointer that can be asked what it is wired
 * to: a card, a container by its header, a label, or a line.
 * @param event The move.
 * @returns The part's semantic id, or null over anything else.
 */
function partUnder(event: PointerEvent<HTMLElement>): string | null {
	const part = tipTargetAt(event.target, event.clientY);
	if (part !== null) {
		return part.id;
	}
	const group = event.target instanceof Element ? event.target.closest("[data-semantic-id]") : null;
	return group?.getAttribute("data-semantic-kind") === "edge"
		? group.getAttribute("data-semantic-id")
		: null;
}

/**
 * Which part the pointer rests on.
 * @param atlas The picture it rests on, which a part of another picture is not a part of.
 * @returns The part, and the handlers that move it.
 */
function useRestingPart(atlas: SemanticAtlas): RestingPart {
	const [resting, setResting] = useState<Resting | null>(null);
	// What the pointer is over now, which may not be resting yet, and the timer that will make it so.
	const over = useRef<string | null>(null);
	const timer = useRef<number | null>(null);
	const settled = useRef(false);

	const cancel = useCallback((): void => {
		if (timer.current !== null) {
			frameClock().cancelAfter(timer.current);
			timer.current = null;
		}
	}, []);
	useEffect(() => cancel, [cancel]);

	/**
	 * Rest on a part, or on nothing, after a while.
	 * @param id The part, or null for none.
	 * @param wait How long to wait, in milliseconds.
	 */
	const restAfter = useCallback(
		(id: string | null, wait: number): void => {
			cancel();
			/** Rest on the part, or leave it. */
			const arrive = (): void => {
				timer.current = null;
				settled.current = id !== null;
				setResting(id === null ? null : { id, atlas });
			};
			if (wait <= 0) {
				arrive();
				return;
			}
			timer.current = frameClock().after(wait, arrive);
		},
		[atlas, cancel],
	);

	const onHover = useCallback(
		(event: PointerEvent<HTMLElement>): void => {
			const id = partUnder(event);
			if (id === over.current) {
				return;
			}
			over.current = id;
			if (id === null) {
				restAfter(null, EXPLORING_MS.lightingGrace);
				return;
			}
			restAfter(id, settled.current ? 0 : EXPLORING_MS.lightingDwell);
		},
		[restAfter],
	);

	const release = useCallback((): void => {
		over.current = null;
		restAfter(null, 0);
	}, [restAfter]);

	return { part: resting?.atlas === atlas ? resting.id : null, onHover, release };
}

export { useRestingPart, type RestingPart };
