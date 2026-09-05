// What the stage element hears for the whole application: Escape leaves path
// focus, and a pointer on a pane focuses that pane. Both are captured before
// Excalidraw so they work whatever tool is active.

import { useEffect } from "react";

/** What the stage reports. */
interface StageEvents {
	readonly onEscape: () => void;
	readonly onPanePointer: (paneId: string) => void;
}

/** The pane section a pointer landed in, by its accessible name. */
const PANE_SECTION = 'section[aria-label^="Pane "]';

/**
 * The pane id of the section an event target sits in.
 * @param target The event target.
 * @returns The pane id, or null outside any pane.
 */
function paneIdOf(target: EventTarget | null): string | null {
	if (!(target instanceof Element)) {
		return null;
	}
	const label = target.closest(PANE_SECTION)?.getAttribute("aria-label") ?? null;
	return label === null ? null : label.replace(/^Pane /u, "");
}

/**
 * Listen on the stage.
 * @param stage The stage element, or null before it mounts.
 * @param events What to report; read live.
 */
function useStageEvents(stage: HTMLDivElement | null, events: StageEvents): void {
	useEffect(() => {
		if (stage === null) {
			return undefined;
		}
		/**
		 * Escape leaves path focus.
		 * @param event The key event.
		 */
		function onKeyDown(event: KeyboardEvent): void {
			if (event.key === "Escape") {
				events.onEscape();
			}
		}
		/**
		 * A pointer on a pane focuses it.
		 * @param event The pointer event.
		 */
		function onPointerDown(event: PointerEvent): void {
			const paneId = paneIdOf(event.target);
			if (paneId !== null) {
				events.onPanePointer(paneId);
			}
		}
		const options: AddEventListenerOptions = { capture: true, passive: true };
		stage.addEventListener("keydown", onKeyDown, options);
		stage.addEventListener("pointerdown", onPointerDown, options);
		return () => {
			stage.removeEventListener("keydown", onKeyDown, options);
			stage.removeEventListener("pointerdown", onPointerDown, options);
		};
	}, [stage, events]);
}

export { useStageEvents, type StageEvents };
