// The fullscreen presentation over the shell's stage element, and the
// shell's presentation derived from it: live while the presented pane is
// connected, recovery once it is not.

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";

import {
	createFullscreenPresentation,
	type FullscreenPresentation,
	type FullscreenPresentationSnapshot,
} from "@/ui/fullscreen-presentation";
import type { ShellPresentation } from "@/ui/shell";

const IDLE: FullscreenPresentationSnapshot = Object.freeze({ paneId: null, error: null });

/** The presentation and the ref that gives it its root. */
interface Fullscreen {
	/** Receives the shell's stage element: the element presented fullscreen. */
	readonly attachStage: (element: HTMLDivElement | null) => void;
	/** The stage element, once mounted. */
	readonly stage: HTMLDivElement | null;
	readonly snapshot: FullscreenPresentationSnapshot;
	readonly present: (paneId: string) => void;
	readonly exit: () => void;
	readonly clearError: () => void;
	/** The presented or wanted pane closed; the survivor, if any, takes over. */
	readonly paneRemoved: (paneId: string, survivorPaneId: string | null) => void;
	/** The pane wanted on the stage, granted or not; null when nothing is wanted. */
	readonly target: () => string | null;
}

/**
 * No presentation exists yet: nothing to subscribe to.
 * @returns Stops nothing.
 */
function subscribeToNothing(): () => void {
	return () => {
		// Nothing was subscribed.
	};
}

/**
 * The snapshot before a root exists.
 * @returns The idle snapshot.
 */
function idleSnapshot(): FullscreenPresentationSnapshot {
	return IDLE;
}

/**
 * The fullscreen presentation.
 * @returns The presentation's ref, snapshot and moves.
 */
function useFullscreen(): Fullscreen {
	const [presentation, setPresentation] = useState<FullscreenPresentation | null>(null);
	const [stage, setStage] = useState<HTMLDivElement | null>(null);
	const owned = useRef<FullscreenPresentation | null>(null);

	const attachStage = useCallback((element: HTMLDivElement | null): void => {
		owned.current?.rootRemoved();
		owned.current?.dispose();
		owned.current = element === null ? null : createFullscreenPresentation(element);
		setPresentation(owned.current);
		setStage(element);
	}, []);

	const snapshot = useSyncExternalStore(
		presentation?.subscribe ?? subscribeToNothing,
		presentation?.getSnapshot ?? idleSnapshot,
		idleSnapshot,
	);
	const present = useCallback(
		(paneId: string): void => presentation?.present(paneId),
		[presentation],
	);
	const exit = useCallback((): void => presentation?.exit(), [presentation]);
	const clearError = useCallback((): void => presentation?.clearError(), [presentation]);
	const paneRemoved = useCallback(
		(paneId: string, survivorPaneId: string | null): void =>
			presentation?.paneRemoved(paneId, survivorPaneId),
		[presentation],
	);

	const target = useCallback(
		(): string | null => presentation?.getTargetPaneId() ?? null,
		[presentation],
	);

	return useMemo(
		() => ({ attachStage, stage, snapshot, present, exit, clearError, paneRemoved, target }),
		[attachStage, stage, snapshot, present, exit, clearError, paneRemoved, target],
	);
}

/**
 * The shell's presentation for a fullscreen snapshot.
 * @param snapshot The fullscreen snapshot.
 * @param connected Whether the presented pane is connected.
 * @returns Live, recovery, or null while nothing is presented.
 */
function shellPresentationOf(
	snapshot: FullscreenPresentationSnapshot,
	connected: boolean,
): ShellPresentation | null {
	if (snapshot.paneId === null) {
		return null;
	}
	if (connected) {
		return { kind: "live", paneId: snapshot.paneId, error: snapshot.error };
	}
	return {
		kind: "recovery",
		paneId: snapshot.paneId,
		message: `Pane ${snapshot.paneId} lost its connection to the canvas. It reconnects on its own; exit the presentation to keep working in the workspace.`,
	};
}

export { shellPresentationOf, useFullscreen, type Fullscreen };
