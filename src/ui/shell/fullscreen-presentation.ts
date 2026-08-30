export interface FullscreenPresentationSnapshot {
	readonly paneId: string | null;
	readonly error: string | null;
}

export interface FullscreenPresentation {
	readonly getSnapshot: () => FullscreenPresentationSnapshot;
	readonly subscribe: (listener: () => void) => () => void;
	readonly present: (paneId: string) => void;
	readonly exit: () => void;
	readonly rootRemoved: () => void;
	readonly dispose: () => void;
}

const idleSnapshot: FullscreenPresentationSnapshot = Object.freeze({ paneId: null, error: null });

function errorMessage(error: unknown): string {
	return error instanceof Error && error.message
		? error.message
		: String(error || "browser refusal");
}

export function createFullscreenPresentation(root: HTMLElement): FullscreenPresentation {
	const ownerDocument = root.ownerDocument;
	const listeners = new Set<() => void>();
	let snapshot = idleSnapshot;
	let wantedPaneId: string | null = null;
	let operation = 0;
	let disposed = false;

	const ownsRoot = (): boolean => ownerDocument.fullscreenElement === root;
	const isPresenting = (): boolean => root.isConnected && ownsRoot();
	const publish = (paneId: string | null, error: string | null): void => {
		if (disposed || (snapshot.paneId === paneId && snapshot.error === error)) return;
		snapshot = { paneId, error };
		for (const listener of listeners) listener();
	};
	const exitOwnedRoot = (): void => {
		if (disposed || !ownsRoot()) return;
		try {
			void ownerDocument.exitFullscreen().catch(() => undefined);
		} catch {
			// The root may disappear between the ownership check and the browser call.
		}
	};
	const clearPresentation = (): void => {
		wantedPaneId = null;
		operation += 1;
		publish(null, null);
	};
	const reconcileFullscreenChange = (): void => {
		if (disposed) return;
		if (!root.isConnected) {
			clearPresentation();
			exitOwnedRoot();
			return;
		}
		if (!ownsRoot()) {
			clearPresentation();
			return;
		}
		if (wantedPaneId) publish(wantedPaneId, null);
		else {
			publish(null, null);
			exitOwnedRoot();
		}
	};
	const reconcileEntry = (token: number, error?: unknown): void => {
		if (disposed) return;
		if (!root.isConnected) {
			clearPresentation();
			exitOwnedRoot();
			return;
		}
		if (ownsRoot()) {
			if (wantedPaneId) publish(wantedPaneId, null);
			else {
				publish(null, null);
				exitOwnedRoot();
			}
			return;
		}
		if (token !== operation) return;
		wantedPaneId = null;
		publish(
			null,
			error ? `Could not start presentation: ${errorMessage(error)}. Try Present again.` : null,
		);
	};
	const reconcileExit = (token: number, error?: unknown): void => {
		if (disposed) return;
		if (!root.isConnected || !ownsRoot()) {
			clearPresentation();
			return;
		}
		if (!wantedPaneId) {
			publish(null, null);
			exitOwnedRoot();
			return;
		}
		publish(
			wantedPaneId,
			token === operation && error
				? `Could not exit presentation: ${errorMessage(error)}. Use Exit again or press Escape.`
				: null,
		);
	};
	ownerDocument.addEventListener("fullscreenchange", reconcileFullscreenChange);

	return {
		getSnapshot: () => snapshot,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		present: (paneId) => {
			if (disposed) return;
			wantedPaneId = paneId;
			const token = ++operation;
			if (isPresenting()) {
				publish(paneId, null);
				return;
			}
			publish(null, null);
			try {
				const result = root.requestFullscreen();
				void result.then(
					() => reconcileEntry(token),
					(error) => reconcileEntry(token, error),
				);
			} catch (error) {
				reconcileEntry(token, error);
			}
		},
		exit: () => {
			if (disposed) return;
			const token = ++operation;
			if (!isPresenting()) {
				wantedPaneId = null;
				publish(null, null);
				return;
			}
			try {
				const result = ownerDocument.exitFullscreen();
				void result.then(
					() => reconcileExit(token),
					(error) => reconcileExit(token, error),
				);
			} catch (error) {
				reconcileExit(token, error);
			}
		},
		rootRemoved: () => {
			if (disposed) return;
			clearPresentation();
			exitOwnedRoot();
		},
		dispose: () => {
			if (disposed) return;
			disposed = true;
			operation += 1;
			ownerDocument.removeEventListener("fullscreenchange", reconcileFullscreenChange);
			listeners.clear();
		},
	};
}
