// The part of the picture the pointer is resting on.
//
// Resting is judged the way a tip is: it takes a moment to start, so crossing
// the model does not flash, and once a part is resting on the next one is at
// once. Leaving waits a moment too, so crossing the gap between two cards, or
// the thin width of a line, keeps the part the pointer was on.
//
// Lines that share a stretch draw over one another, and only the topmost hears the
// pointer, so the pointer rests on every line of the stretch it is over.

import {
	pickedElements,
	pickedTarget,
} from "#ui/architecture-drawing/canvas/picture/camera/clients/picture-pick.ts";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

import { EXPLORING_MS } from "#ui/architecture-drawing/constants/motion.ts";
import { frameClock } from "@archboard/ui-kit/frame-clock";
import type { SemanticAtlas } from "#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts";
import { tipTargetAt } from "#ui/architecture-drawing/canvas/picture/clients/subject-tips.ts";

/** What a pointer rests on, and the picture it rests on. */
interface Resting {
	/** The part, or every line of a stretch, with the topmost first. */
	readonly ids: readonly string[];
	readonly atlas: SemanticAtlas;
}

/** What a pointer rests on over nothing. */
const NOTHING: readonly string[] = [];

/** The resting part, and what moves it. */
interface RestingPart {
	/** The part the pointer rests on in this picture, or null. */
	readonly part: string | null;
	/** Every part the pointer rests on: the one, or each line of a shared stretch. */
	readonly parts: readonly string[];
	/**
	 * The pointer moved over the picture while no gesture is under way.
	 * @param event The move.
	 */
	readonly onHover: (event: PointerEvent<HTMLElement>) => void;
	/** The pointer left the picture, or the picture moved under it: it rests on nothing. */
	readonly release: () => void;
}

/**
 * The line a group draws.
 * @param group A subject's group, or null.
 * @returns The line's semantic id, or null for anything else.
 */
function lineOf(group: Element | null): string | null {
	return group?.getAttribute("data-semantic-kind") === "edge"
		? group.getAttribute("data-semantic-id")
		: null;
}

/**
 * Every line under the pointer, the ones the topmost hides included.
 * @param event The move.
 * @returns The lines' semantic ids.
 */
function linesUnder(event: PointerEvent<HTMLElement>): string[] {
	const under = pickedElements(event) ?? document.elementsFromPoint(event.clientX, event.clientY);
	return under
		.map((element) => lineOf(element?.closest("[data-semantic-id]") ?? null))
		.filter((id) => id !== null);
}

/**
 * What the pointer is over in the picture that can be asked what it is wired
 * to: a card, a container by its header, a label, or the lines of a stretch.
 * @param event The move.
 * @returns The semantic ids, or none over anything else.
 */
function partsUnder(event: PointerEvent<HTMLElement>): readonly string[] {
	const target = pickedTarget(event);
	const part = tipTargetAt(target, event.clientY);
	if (part !== null) {
		return part.part === "line" ? [...new Set([part.id, ...linesUnder(event)])] : [part.id];
	}
	const group = target instanceof Element ? target.closest("[data-semantic-id]") : null;
	const line = lineOf(group);
	return line === null ? [] : [line];
}

/**
 * Which part the pointer rests on.
 * @param atlas The picture it rests on, which a part of another picture is not a part of.
 * @returns The part, and the handlers that move it.
 */
function useRestingPart(atlas: SemanticAtlas): RestingPart {
	const [resting, setResting] = useState<Resting | null>(null);
	// What the pointer is over now, which may not be resting yet, and the timer that will make it so.
	const over = useRef<readonly string[]>([]);
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
	 * Rest on some parts, or on nothing, after a while.
	 * @param ids The parts, or none.
	 * @param wait How long to wait, in milliseconds.
	 */
	const restAfter = useCallback(
		(ids: readonly string[], wait: number): void => {
			cancel();
			/** Rest on the parts, or leave them. */
			const arrive = (): void => {
				timer.current = null;
				settled.current = ids.length > 0;
				setResting(ids.length > 0 ? { ids, atlas } : null);
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
			const ids = partsUnder(event);
			if (ids.join() === over.current.join()) {
				return;
			}
			over.current = ids;
			if (ids.length === 0) {
				restAfter(ids, EXPLORING_MS.lightingGrace);
				return;
			}
			restAfter(ids, settled.current ? 0 : EXPLORING_MS.lightingDwell);
		},
		[restAfter],
	);

	const release = useCallback((): void => {
		over.current = [];
		restAfter([], 0);
	}, [restAfter]);

	const parts = resting?.atlas === atlas ? resting.ids : NOTHING;
	return { part: parts[0] ?? null, parts, onHover, release };
}

export { useRestingPart };
