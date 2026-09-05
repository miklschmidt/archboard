// Publishing the person's selection to the server, debounced, so an agent
// asking "what is selected" reads server state rather than waking a browser.

import { SELECTION_DEBOUNCE_MS } from "@/shared/timing/timing";

/** What the publisher needs. */
interface SelectionPublisherOptions {
	send: (elementIds: readonly string[]) => Promise<void>;
}

/** One pane's selection publisher. */
interface SelectionPublisher {
	/** The selection changed; publish it after the debounce. */
	publish: (elementIds: readonly string[]) => void;
	/** Forget what was published, so the next selection goes out even if equal. */
	reset: () => void;
	/** The pane is closing. */
	dispose: () => void;
}

/**
 * Create a debounced selection publisher.
 * @param options How the selection reaches the server.
 * @returns The publisher.
 */
function createSelectionPublisher(options: SelectionPublisherOptions): SelectionPublisher {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let published = "";
	let pending: readonly string[] | null = null;

	/** Send the pending selection, unless it is what was already published. */
	function flush(): void {
		timer = null;
		const ids = pending ?? [];
		pending = null;
		const key = ids.join(",");
		if (key === published) {
			return;
		}
		published = key;
		options.send(ids).catch(() => {
			// A failed publication forgets what was published, so the next change resends.
			published = "";
		});
	}

	/**
	 * The selection changed.
	 * @param elementIds The selected ids.
	 */
	function publish(elementIds: readonly string[]): void {
		const ids = [...elementIds].toSorted();
		if (ids.join(",") === published && pending === null) {
			return;
		}
		pending = ids;
		if (timer !== null) {
			clearTimeout(timer);
		}
		timer = setTimeout(flush, SELECTION_DEBOUNCE_MS);
	}

	/** Forget what was published. */
	function reset(): void {
		published = "";
	}

	/** The pane is closing. */
	function dispose(): void {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	}

	return { publish, reset, dispose };
}

export { createSelectionPublisher, type SelectionPublisher, type SelectionPublisherOptions };
