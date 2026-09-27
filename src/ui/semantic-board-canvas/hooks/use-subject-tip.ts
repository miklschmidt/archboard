// Which part of the picture has its tip open, decided by where the pointer rests.
//
// A tip opens once the pointer has rested on a part for a moment, and moves at
// once to the next part while one is open. It belongs to the picture and the
// camera it opened under: a pan, a zoom or a new picture puts the part
// somewhere else, so the tip closes rather than pointing at where it was.

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

import { SUBJECT_TIP_DELAY_MS } from "@/shared/timing/timing";
import type { SemanticDrawing } from "@/ui/semantic-board-canvas/api/semantic-boards";
import { tipTargetAt, type TipTarget } from "@/ui/semantic-board-canvas/lib/subject-tips";

/** What a tip opened under: the picture, and where the camera was. */
interface TipScene {
	readonly drawing: SemanticDrawing;
	readonly camera: string;
}

/** An open tip, and the scene it opened in. */
interface OpenTip extends TipScene {
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
 * @param scene The picture on the surface and where the camera is now.
 * @returns The open tip and its controls.
 */
function useSubjectTip(scene: TipScene): SubjectTipControls {
	const [open, setOpen] = useState<OpenTip | null>(null);
	const waiting = useRef<{ readonly target: TipTarget; readonly timer: number } | null>(null);
	const shown =
		open !== null &&
		open.drawing === scene.drawing &&
		open.camera === scene.camera &&
		open.target.anchor.isConnected
			? open.target
			: null;

	const forget = useCallback((): void => {
		if (waiting.current !== null) {
			window.clearTimeout(waiting.current.timer);
			waiting.current = null;
		}
	}, []);
	useEffect(() => forget, [forget]);

	const dismiss = useCallback((): void => {
		forget();
		setOpen(null);
	}, [forget]);

	const { drawing, camera } = scene;
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
					setOpen({ target, drawing, camera });
				}
				return;
			}
			if (waiting.current !== null && samePart(waiting.current.target, target)) {
				return;
			}
			forget();
			waiting.current = {
				target,
				timer: window.setTimeout(() => {
					waiting.current = null;
					setOpen({ target, drawing, camera });
				}, SUBJECT_TIP_DELAY_MS),
			};
		},
		[shown, drawing, camera, dismiss, forget],
	);

	return { shown, onHover, dismiss };
}

export { useSubjectTip };
