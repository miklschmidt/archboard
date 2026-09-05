// The queue's window onto the transport. `capabilities()` and
// `captureCommandIntent()` both mint a fresh value per call, so neither can be
// an external-store snapshot on its own. This takes one observation per
// transport notification: the identity changes exactly when the transport
// said something changed, never during a render. The presented child lives
// here too, because remembering which child a rendered queue belonged to is
// state about an external system, not view state.

import type {
	WorkbenchQueueChildIdentity,
	WorkbenchQueueTargetCapture,
} from "@/ui/workbench-queue/contracts";
import { captureWorkbenchQueueTarget } from "@/ui/workbench-queue/lib/actions";
import { childIdentityOf } from "@/ui/workbench-queue/lib/state";
import type {
	WorkbenchQueueTransportPort,
	WorkbenchTransportCapabilities,
	WorkbenchTransportState,
} from "@/ui/workbench-queue/transport-port";

/** One reading of the transport, taken when it said something changed. */
interface WorkbenchQueueObservation {
	readonly state: WorkbenchTransportState;
	readonly capabilities: WorkbenchTransportCapabilities;
	/** The command target captured for the queue this observation publishes. */
	readonly target: WorkbenchQueueTargetCapture;
	/** The child the presented queue belongs to; a newer one means a restart. */
	readonly presentedChild: WorkbenchQueueChildIdentity | null;
}

/** The observation store. */
interface WorkbenchQueueStore {
	readonly subscribe: (listener: () => void) => () => void;
	readonly getSnapshot: () => WorkbenchQueueObservation;
	/** Accept the current child as the one the queue is presented for. */
	readonly acceptCurrentChild: () => void;
}

/**
 * One observation store over one transport.
 * @param transport The transport port.
 * @returns The store.
 */
function createWorkbenchQueueStore(transport: WorkbenchQueueTransportPort): WorkbenchQueueStore {
	const listeners = new Set<() => void>();
	let presentedChild: WorkbenchQueueChildIdentity | null = null;
	/**
	 * The child the snapshot names now.
	 * @returns The identity, or null.
	 */
	const currentChild = (): WorkbenchQueueChildIdentity | null =>
		childIdentityOf(transport.state().snapshot?.threadLink ?? null);
	/**
	 * One fresh observation.
	 * @returns The observation.
	 */
	const read = (): WorkbenchQueueObservation => {
		presentedChild ??= currentChild();
		return Object.freeze({
			state: transport.state(),
			capabilities: transport.capabilities(),
			target: captureWorkbenchQueueTarget(transport),
			presentedChild,
		});
	};
	let cached = read();
	/**
	 * Re-read and tell every listener.
	 */
	const publish = (): void => {
		cached = read();
		for (const listener of listeners) {
			listener();
		}
	};
	return Object.freeze({
		/**
		 * Follow the transport while subscribed.
		 * @param listener Notified after each observation.
		 * @returns Release the subscription.
		 */
		subscribe: (listener: () => void): (() => void) => {
			listeners.add(listener);
			const release = transport.subscribe(publish);
			cached = read();
			return () => {
				listeners.delete(listener);
				release();
			};
		},
		/**
		 * The latest observation; a stable identity between notifications.
		 * @returns The observation.
		 */
		getSnapshot: (): WorkbenchQueueObservation => cached,
		/**
		 * Accept the current child as the one the queue is presented for.
		 */
		acceptCurrentChild: (): void => {
			presentedChild = currentChild();
			publish();
		},
	});
}

export { createWorkbenchQueueStore, type WorkbenchQueueObservation, type WorkbenchQueueStore };
