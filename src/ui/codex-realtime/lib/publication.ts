// Ordered publication to a cohort of subscribers: every listener subscribed
// at the moment of publishing sees that publication, in order, after any
// publication already being delivered, whatever a listener throws.

/** Receives one published value. */
type PublicationListener<T> = (value: T) => void;

/** One publication and the subscribers it was addressed to. */
interface Publication<T> {
	readonly value: T;
	readonly listeners: readonly PublicationListener<T>[];
}

/** A cohort publisher. */
interface Publisher<T> {
	readonly subscribe: (listener: PublicationListener<T>) => () => void;
	/** Publishes one value to the current subscribers. */
	readonly publish: (value: T) => void;
	/** Removes every subscriber; later subscriptions are refused. */
	readonly close: () => void;
}

/**
 * Delivers one publication to its cohort, isolating every throwing subscriber.
 * @param publication The publication.
 */
function deliver<T>(publication: Publication<T>): void {
	for (const listener of publication.listeners) {
		try {
			listener(publication.value);
		} catch {
			// A subscriber cannot take ownership of the lifecycle it observes.
		}
	}
}

/**
 * Creates a publisher.
 * @returns The publisher.
 */
function createPublisher<T>(): Publisher<T> {
	const listeners = new Set<PublicationListener<T>>();
	const queue: Publication<T>[] = [];
	let delivering = false;
	let closed = false;

	/**
	 * Drains the queue in order, once, however deep the re-entrancy.
	 */
	const drain = (): void => {
		if (delivering) {
			return;
		}
		delivering = true;
		try {
			for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
				deliver(next);
			}
		} finally {
			delivering = false;
		}
	};

	return Object.freeze({
		/**
		 * Subscribes.
		 * @param listener The listener.
		 * @returns The unsubscribe function.
		 */
		subscribe: (listener: PublicationListener<T>) => {
			if (closed) {
				return () => undefined;
			}
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		/**
		 * Publishes to the cohort of this moment.
		 * @param value The value.
		 */
		publish: (value: T) => {
			queue.push({ value, listeners: [...listeners] });
			drain();
		},
		/**
		 * Closes the publisher.
		 */
		close: () => {
			closed = true;
			listeners.clear();
		},
	});
}

export { createPublisher, type PublicationListener, type Publisher };
