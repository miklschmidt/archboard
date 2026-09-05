// Presenting one pane fullscreen: one owned root, the pane wanted on it, and
// a browser that may refuse, lose, or answer late. Every answer is reconciled
// against what the browser says now rather than trusted on its own.

/** What the presentation shows: the presented pane and any recoverable error. */
interface FullscreenPresentationSnapshot {
	readonly paneId: string | null;
	readonly error: string | null;
}

/** One root's fullscreen presentation. */
interface FullscreenPresentation {
	readonly getSnapshot: () => FullscreenPresentationSnapshot;
	/** The pane wanted, whether or not the browser has granted it yet. */
	readonly getTargetPaneId: () => string | null;
	readonly subscribe: (listener: () => void) => () => void;
	readonly present: (paneId: string) => void;
	readonly exit: () => void;
	readonly clearError: () => void;
	/** The root left the document; whatever it owned is given up. */
	readonly rootRemoved: () => void;
	readonly dispose: () => void;
}

const IDLE: FullscreenPresentationSnapshot = Object.freeze({ paneId: null, error: null });

/**
 * Plain words for a browser refusal.
 * @param error What the browser threw.
 * @returns Its message, or a stand-in.
 */
function errorMessage(error: unknown): string {
	if (error instanceof Error && error.message !== "") {
		return error.message;
	}
	const text = String(error);
	return text === "" ? "browser refusal" : text;
}

/**
 * Call a browser method that may throw synchronously or reject.
 * @param request The browser call.
 * @param settle What to do with the outcome.
 */
function attempt(request: () => Promise<void>, settle: (error?: unknown) => void): void {
	try {
		request().then(
			() => settle(),
			(error: unknown) => settle(error),
		);
	} catch (error) {
		settle(error);
	}
}

/**
 * Create the presentation for one root.
 * @param root The element presented fullscreen.
 * @returns The presentation.
 */
function createFullscreenPresentation(root: HTMLElement): FullscreenPresentation {
	const ownerDocument = root.ownerDocument;
	const listeners = new Set<() => void>();
	let snapshot = IDLE;
	let wantedPaneId: string | null = null;
	let operation = 0;
	let disposed = false;

	/**
	 * Whether the root owns fullscreen right now.
	 * @returns True when the document's fullscreen element is the root.
	 */
	function ownsRoot(): boolean {
		return ownerDocument.fullscreenElement === root;
	}

	/**
	 * Publish a snapshot when it differs from the current one.
	 * @param paneId The presented pane, or null.
	 * @param error The recoverable error, or null.
	 */
	function publish(paneId: string | null, error: string | null): void {
		if (disposed || (snapshot.paneId === paneId && snapshot.error === error)) {
			return;
		}
		snapshot = { paneId, error };
		for (const listener of listeners) {
			listener();
		}
	}

	/** Leave fullscreen, when this root owns it. */
	function exitOwnedRoot(): void {
		if (disposed || !ownsRoot()) {
			return;
		}
		try {
			void ownerDocument.exitFullscreen().catch(() => undefined);
		} catch {
			// The root may disappear between the ownership check and the browser call.
		}
	}

	/** Nothing is presented and nothing is wanted. */
	function clearPresentation(): void {
		wantedPaneId = null;
		operation += 1;
		publish(null, null);
	}

	/** The root owns fullscreen: show the wanted pane, or give fullscreen up. */
	function showWantedOrExit(): void {
		if (wantedPaneId === null) {
			publish(null, null);
			exitOwnedRoot();
		} else {
			publish(wantedPaneId, null);
		}
	}

	/** The browser said fullscreen changed. */
	function reconcileFullscreenChange(): void {
		if (disposed) {
			return;
		}
		if (!root.isConnected) {
			clearPresentation();
			exitOwnedRoot();
			return;
		}
		if (!ownsRoot()) {
			clearPresentation();
			return;
		}
		showWantedOrExit();
	}

	/**
	 * A fullscreen request settled.
	 * @param token The operation it belonged to.
	 * @param error The refusal, if it was refused.
	 */
	function reconcileEntry(token: number, error?: unknown): void {
		if (disposed) {
			return;
		}
		if (!root.isConnected) {
			clearPresentation();
			exitOwnedRoot();
			return;
		}
		if (ownsRoot()) {
			showWantedOrExit();
			return;
		}
		if (token !== operation) {
			return;
		}
		wantedPaneId = null;
		publish(null, entryFailure(error));
	}

	/**
	 * The error shown for a refused entry.
	 * @param error The refusal, if any.
	 * @returns The message, or null when the entry simply did not happen.
	 */
	function entryFailure(error: unknown): string | null {
		return error === undefined
			? null
			: `Could not start presentation: ${errorMessage(error)}. Try Present again.`;
	}

	/**
	 * An exit request settled.
	 * @param token The operation it belonged to.
	 * @param error The refusal, if it was refused.
	 */
	function reconcileExit(token: number, error?: unknown): void {
		if (disposed) {
			return;
		}
		if (!root.isConnected || !ownsRoot()) {
			clearPresentation();
			return;
		}
		if (wantedPaneId === null) {
			publish(null, null);
			exitOwnedRoot();
			return;
		}
		publish(wantedPaneId, exitFailure(token, error));
	}

	/**
	 * The error shown for a refused exit.
	 * @param token The operation it belonged to.
	 * @param error The refusal, if any.
	 * @returns The message, or null when a newer operation owns the outcome.
	 */
	function exitFailure(token: number, error: unknown): string | null {
		return token === operation && error !== undefined
			? `Could not exit presentation: ${errorMessage(error)}. Use Exit again or press Escape.`
			: null;
	}

	/**
	 * Present a pane: on the owned root at once, else after asking the browser.
	 * @param paneId The pane.
	 */
	function present(paneId: string): void {
		if (disposed) {
			return;
		}
		wantedPaneId = paneId;
		const token = ++operation;
		if (root.isConnected && ownsRoot()) {
			publish(paneId, null);
			return;
		}
		publish(null, null);
		attempt(
			() => root.requestFullscreen(),
			(error) => reconcileEntry(token, error),
		);
	}

	/** Leave fullscreen. */
	function exit(): void {
		if (disposed) {
			return;
		}
		const token = ++operation;
		if (!root.isConnected || !ownsRoot()) {
			wantedPaneId = null;
			publish(null, null);
			return;
		}
		attempt(
			() => ownerDocument.exitFullscreen(),
			(error) => reconcileExit(token, error),
		);
	}

	/** Dismiss a recoverable error. */
	function clearError(): void {
		if (disposed || snapshot.paneId !== null || snapshot.error === null) {
			return;
		}
		publish(null, null);
	}

	/** The root left the document. */
	function rootRemoved(): void {
		if (disposed) {
			return;
		}
		clearPresentation();
		exitOwnedRoot();
	}

	/** Stop listening; pending work is invalidated. */
	function dispose(): void {
		if (disposed) {
			return;
		}
		disposed = true;
		operation += 1;
		ownerDocument.removeEventListener("fullscreenchange", reconcileFullscreenChange);
		listeners.clear();
	}

	/**
	 * Hear about changes.
	 * @param listener What to call.
	 * @returns Stops listening.
	 */
	function subscribe(listener: () => void): () => void {
		listeners.add(listener);
		return () => listeners.delete(listener);
	}

	/**
	 * What the presentation shows.
	 * @returns The snapshot.
	 */
	function getSnapshot(): FullscreenPresentationSnapshot {
		return snapshot;
	}

	/**
	 * The pane wanted, whether or not the browser has granted it yet.
	 * @returns The pane, or null.
	 */
	function getTargetPaneId(): string | null {
		return disposed ? null : wantedPaneId;
	}

	ownerDocument.addEventListener("fullscreenchange", reconcileFullscreenChange);

	return {
		getSnapshot,
		getTargetPaneId,
		subscribe,
		present,
		exit,
		clearError,
		rootRemoved,
		dispose,
	};
}

export {
	createFullscreenPresentation,
	type FullscreenPresentation,
	type FullscreenPresentationSnapshot,
};
