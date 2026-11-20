// A `useSyncExternalStore` source over a store whose reads build fresh
// objects: the read is repeated only after the store publishes, so the
// snapshot identity is stable between publications.

/** A store React can subscribe to with a cached snapshot. */
interface SnapshotStore<T> {
	readonly subscribe: (listener: () => void) => () => void;
	readonly getSnapshot: () => T;
}

/**
 * Cache a store's read between its publications.
 * @param subscribe The store's subscribe.
 * @param read The store's read, called once per publication.
 * @returns The cached store.
 */
function createSnapshotCache<T>(
	subscribe: (listener: () => void) => () => void,
	read: () => T,
): SnapshotStore<T> {
	let cached: { value: T } | null = null;
	return Object.freeze({
		/**
		 * Subscribe, invalidating the cache before the listener runs.
		 * @param listener React's listener.
		 * @returns Stops listening.
		 */
		subscribe: (listener: () => void): (() => void) =>
			subscribe(() => {
				cached = null;
				listener();
			}),
		/**
		 * The snapshot, read once per publication.
		 * @returns The snapshot.
		 */
		getSnapshot: (): T => {
			if (cached === null) {
				cached = { value: read() };
			}
			return cached.value;
		},
	});
}

export { createSnapshotCache, type SnapshotStore };
