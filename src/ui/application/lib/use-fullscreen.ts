// The fullscreen presentation over the shell's stage element, and the
// shell's presentation derived from it: live while the presented pane is
// connected, recovery once it is not.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import {
	createFullscreenPresentation,
	type FullscreenPresentation,
	type FullscreenPresentationSnapshot,
} from "@/ui/fullscreen-presentation";
import type { ShellPresentation } from "@/ui/shell";

const IDLE: FullscreenPresentationSnapshot = Object.freeze({ paneId: null, error: null });

/** Who hears the browser refuse, the moment it does. */
interface FullscreenOptions {
	/**
	 * A refused entry names no pane and is cleared from the presentation once
	 * heard: it belongs to the workspace the person is still in. A refused
	 * exit names the presented pane and stays with the presentation.
	 */
	readonly onRefused?: (error: string, paneId: string | null) => void;
}

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
 * @param options Who hears a refusal.
 * @returns The presentation's ref, snapshot and moves.
 */
function useFullscreen(options: FullscreenOptions = {}): Fullscreen {
	const [presentation, setPresentation] = useState<FullscreenPresentation | null>(null);
	const [stage, setStage] = useState<HTMLDivElement | null>(null);
	const owned = useRef<FullscreenPresentation | null>(null);
	// The presentation is created once per stage element and outlives any one
	// render's listener; it reads the latest through this ref.
	const refused = useRef(options.onRefused);
	useEffect(() => {
		refused.current = options.onRefused;
	}, [options.onRefused]);

	const attachStage = useCallback((element: HTMLDivElement | null): void => {
		owned.current?.rootRemoved();
		owned.current?.dispose();
		owned.current =
			element === null
				? null
				: createFullscreenPresentation(element, {
						/**
						 * The browser refused; a refused entry is the workspace's notice, not
						 * the presentation's error.
						 * @param error The refusal's words.
						 * @param paneId The presented pane, or null after a refused entry.
						 */
						onRefused: (error: string, paneId: string | null): void => {
							refused.current?.(error, paneId);
							if (paneId === null) {
								owned.current?.clearError();
							}
						},
					});
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

export { shellPresentationOf, useFullscreen, type Fullscreen, type FullscreenOptions };
