// What the application hears around the stage: Escape (on the document) leaves path
// focus, the present shortcut toggles the fullscreen presentation, and a
// pointer on a pane focuses that pane. All are captured before Excalidraw so
// they work whatever tool is active.

import { useEffect } from "react";

import { isPresentShortcut } from "@/ui/shell";

/** Where an Escape came from: inside the inspector, or anywhere else. */
type EscapeOrigin = "inspector" | "elsewhere";

/** What the stage reports. */
interface StageEvents {
	readonly onEscape: (origin: EscapeOrigin) => void;
	/** The present shortcut: present the active pane, or leave the presentation. */
	readonly onPresentShortcut: () => void;
	readonly onPanePointer: (paneId: string) => void;
}

/** The pane section a pointer landed in, by its accessible name. */
const PANE_SECTION = 'section[aria-label^="Pane "]';
/** The inspector, by its accessible name. */
const INSPECTOR = 'aside[aria-label="Inspector"]';

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
 * Whether an Escape was pressed inside the inspector.
 * @param target The event target.
 * @returns The origin.
 */
function escapeOrigin(target: EventTarget | null): EscapeOrigin {
	return target instanceof Element && target.closest(INSPECTOR) !== null
		? "inspector"
		: "elsewhere";
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
		 * Escape leaves path focus; the present shortcut toggles the presentation.
		 * @param event The key event.
		 */
		function onKeyDown(event: KeyboardEvent): void {
			if (event.key === "Escape") {
				events.onEscape(escapeOrigin(event.target));
			} else if (isPresentShortcut(event)) {
				event.preventDefault();
				events.onPresentShortcut();
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
		// The shortcut must win over the browser's own, so the key listener is
		// not passive; the pointer listener stays passive.
		const keyOptions: AddEventListenerOptions = { capture: true };
		const pointerOptions: AddEventListenerOptions = { capture: true, passive: true };
		// Keys are heard on the document: after a presentation ends, focus may rest
		// on the body, and the mode must still leave on the key that leaves modes.
		const owner = stage.ownerDocument;
		owner.addEventListener("keydown", onKeyDown, keyOptions);
		stage.addEventListener("pointerdown", onPointerDown, pointerOptions);
		return () => {
			owner.removeEventListener("keydown", onKeyDown, keyOptions);
			stage.removeEventListener("pointerdown", onPointerDown, pointerOptions);
		};
	}, [stage, events]);
}

export { useStageEvents, type EscapeOrigin, type StageEvents };
