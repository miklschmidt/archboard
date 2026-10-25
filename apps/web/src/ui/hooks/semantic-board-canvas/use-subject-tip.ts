// Which part of the picture has its tip open, decided by where the pointer rests.
//
// A tip opens once the pointer has rested on a part for a moment, and moves at
// once to the next part while one is open. It belongs to the picture and the
// camera it opened under: a pan, a zoom or a new picture puts the part
// somewhere else, so the tip closes rather than pointing at where it was.

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

import { EXPLORING_MS } from "@archboard/timing";
import { frameClock } from "@archboard/ui-kit/frame-clock";
import type { SemanticDrawing } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import type { BoardCamera } from "#ui/hooks/semantic-board-canvas/use-board-camera.ts";
import {
	tipTargetAt,
	type TipTarget,
} from "#ui/clients/semantic-board-canvas/subjects/subject-tips.ts";

/** What a tip opens over: the picture, and the camera it is seen through. */
interface TipScene {
	readonly drawing: SemanticDrawing;
	readonly camera: Pick<BoardCamera, "subscribe">;
}

/** An open tip, and the picture it opened on. */
interface OpenTip {
	readonly drawing: SemanticDrawing;
	readonly target: TipTarget;
}

/** The open tip, and what moves it. */
interface SubjectTipControls {
	/** The part whose tip is open, or null. */
	readonly shown: TipTarget | null;
	/**
	 * The pointer moved over the picture while no gesture is under way.
	 * @param event The move.
	 */
	readonly onHover: (event: PointerEvent<HTMLElement>) => void;
	/** Close the tip and forget any that was about to open. */
	readonly dismiss: () => void;
}

/**
 * Whether two targets are the same part of the same subject.
 * @param a One target.
 * @param b The other.
 * @returns True when they are.
 */
function samePart(a: TipTarget, b: TipTarget): boolean {
	return a.id === b.id && a.part === b.part;
}

/**
 * The tip over the picture, opened by resting the pointer.
 * @param scene The picture on the surface and the camera it is seen through.
 * @returns The open tip and its controls.
 */
function useSubjectTip(scene: TipScene): SubjectTipControls {
	const [open, setOpen] = useState<OpenTip | null>(null);
	const waiting = useRef<{ readonly target: TipTarget; readonly timer: number } | null>(null);
	const shown =
		open !== null && open.drawing === scene.drawing && open.target.anchor.isConnected
			? open.target
			: null;

	const forget = useCallback((): void => {
		if (waiting.current !== null) {
			frameClock().cancelAfter(waiting.current.timer);
			waiting.current = null;
		}
	}, []);
	useEffect(() => forget, [forget]);

	const dismiss = useCallback((): void => {
		forget();
		setOpen(null);
	}, [forget]);

	// Any move of the camera puts the part somewhere else.
	const { drawing, camera } = scene;
	const { subscribe } = camera;
	useEffect(() => subscribe(dismiss), [subscribe, dismiss]);

	const onHover = useCallback(
		(event: PointerEvent<HTMLElement>): void => {
			const target = tipTargetAt(event.target, event.clientY);
			if (target === null) {
				dismiss();
				return;
			}
			if (shown !== null) {
				// One tip is open: the next opens at once, and the same one stays.
				forget();
				if (!samePart(shown, target)) {
					setOpen({ target, drawing });
				}
				return;
			}
			if (waiting.current !== null && samePart(waiting.current.target, target)) {
				return;
			}
			forget();
			waiting.current = {
				target,
				timer: frameClock().after(EXPLORING_MS.subjectTip, () => {
					waiting.current = null;
					setOpen({ target, drawing });
				}),
			};
		},
		[shown, drawing, dismiss, forget],
	);

	return { shown, onHover, dismiss };
}

export { useSubjectTip };
