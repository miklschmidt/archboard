import type {
	BrowserWorkbenchCapabilities,
	BrowserWorkbenchState,
} from "../../workbench-transport/index.js";

import { captureWorkbenchQueueTarget, type WorkbenchQueueTargetCapture } from "./actions.js";
import type { WorkbenchQueueChildIdentity, WorkbenchQueueTransport } from "./contract.js";
import { childIdentityOf } from "./state.js";

export interface WorkbenchQueueObservation {
	readonly state: BrowserWorkbenchState;
	readonly capabilities: BrowserWorkbenchCapabilities;
	/** The command target captured for the queue this observation publishes. */
	readonly target: WorkbenchQueueTargetCapture;
	/** The child the presented queue belongs to; a newer one means a restart. */
	readonly presentedChild: WorkbenchQueueChildIdentity | null;
}

export interface WorkbenchQueueStore {
	readonly subscribe: (listener: () => void) => () => void;
	readonly getSnapshot: () => WorkbenchQueueObservation;
	/** Accept the current child as the one the queue is presented for. */
	readonly acceptCurrentChild: () => void;
}

/**
 * The queue's window onto the transport.
 *
 * `capabilities()` and `captureCommandTarget()` both mint a fresh value per
 * call, so neither can be a `useSyncExternalStore` snapshot on its own. This
 * takes one observation per transport notification: the identity changes exactly
 * when the transport said something changed, never during a render. The
 * presented child lives here too, because remembering which child a rendered
 * queue belonged to is state about an external system, not React state.
 */
export function createWorkbenchQueueStore(transport: WorkbenchQueueTransport): WorkbenchQueueStore {
	const listeners = new Set<() => void>();
	let presentedChild: WorkbenchQueueChildIdentity | null = null;
	const currentChild = (): WorkbenchQueueChildIdentity | null =>
		childIdentityOf(transport.state().snapshot?.threadLink ?? null);
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
	const publish = (): void => {
		cached = read();
		for (const listener of listeners) listener();
	};
	return Object.freeze({
		subscribe: (listener: () => void): (() => void) => {
			listeners.add(listener);
			const release = transport.subscribe(publish);
			cached = read();
			return () => {
				listeners.delete(listener);
				release();
			};
		},
		getSnapshot: (): WorkbenchQueueObservation => cached,
		acceptCurrentChild: (): void => {
			presentedChild = currentChild();
			publish();
		},
	});
}
