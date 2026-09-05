// Publishing a pane's current workbench transport to whoever composes the
// workbench over it. Each production transport is published once, cleared
// before a replacement, and cleared on retirement, so a listener never sees
// two transports for one pane at once.

/** Who hears about a pane's transport. */
interface WorkbenchTransportPublicationListener<Transport> {
	/**
	 * A different transport is about to be published (called before the clear).
	 * A listener that owns something bound to another transport retires it here.
	 */
	readonly replacing?: (next: Transport) => void;
	/** The published transport changed: a transport, or null for none. */
	readonly publish: (transport: Transport | null) => void;
	/**
	 * Every reconciliation ends here with the transport now current, changed or
	 * not, so a listener can refresh what it derives from the transport.
	 */
	readonly settled?: (transport: Transport | null) => void;
}

/** What the publisher needs: where the current transport is read from. */
interface WorkbenchTransportPublicationOptions<Transport> {
	readonly current: () => Transport | null;
	readonly listener: WorkbenchTransportPublicationListener<Transport>;
}

/** A publisher over one pane's transport generations. */
interface WorkbenchTransportPublication<Transport> {
	/** Compare the current transport with the published one and publish any change. */
	readonly reconcile: () => void;
	/** The transport last published, or null. */
	readonly published: () => Transport | null;
	/** Clear the publication; the pane is going. */
	readonly dispose: () => void;
}

/**
 * Publish each of a pane's transports once, clearing before replacement.
 * @param options Where the current transport comes from and who listens.
 * @returns The publisher.
 */
function createWorkbenchTransportPublication<Transport extends object>(
	options: WorkbenchTransportPublicationOptions<Transport>,
): WorkbenchTransportPublication<Transport> {
	const { listener } = options;
	let published: Transport | null = null;

	/** Clear the published transport, telling the listener when one was published. */
	function clear(): void {
		if (published !== null) {
			published = null;
			listener.publish(null);
		}
	}

	/**
	 * Replace the published transport with another: announce the replacement,
	 * clear, then publish.
	 * @param next The transport now current, or null for none.
	 */
	function replace(next: Transport | null): void {
		if (next !== null) {
			listener.replacing?.(next);
		}
		clear();
		if (next !== null) {
			published = next;
			listener.publish(next);
		}
	}

	/** Compare the current transport with the published one and publish any change. */
	function reconcile(): void {
		const next = options.current();
		if (next !== published) {
			replace(next);
		}
		listener.settled?.(next);
	}

	/**
	 * The transport last published.
	 * @returns The transport, or null.
	 */
	function current(): Transport | null {
		return published;
	}

	return Object.freeze({ reconcile, published: current, dispose: clear });
}

export {
	type WorkbenchTransportPublication,
	type WorkbenchTransportPublicationListener,
	type WorkbenchTransportPublicationOptions,
	createWorkbenchTransportPublication,
};
