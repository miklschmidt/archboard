// How the workbench rides a pane's socket: pane-report sequencing, the
// registration latch, and the owner that keeps one transport generation and
// one media generation together per socket. The canvas session remains the
// only owner that can close the actual socket.

import {
	stoppedState,
	type PaneSocket,
	type WorkbenchMediaPort,
	type WorkbenchTransportPort,
	type WorkbenchTransportState,
} from "@/ui/canvas/workbench-port";

/** One pane report, identified within a socket generation. */
interface CanvasPaneReportRequest {
	readonly generation: number;
	readonly requestId: number;
}

/**
 * The authoritative pane registration acknowledgement for one canvas socket.
 * A negative acknowledgement deliberately leaves the promise pending: the pane
 * report path recovers it on a later report without a second retry loop.
 */
interface CanvasPaneRegistration {
	readonly socket: PaneSocket;
	readonly generation: number;
	readonly promise: Promise<void>;
	/** Release the one-shot attach latch; pane health is tracked separately. */
	readonly acknowledge: (registered: boolean) => boolean;
}

/** The identity a pane report was dispatched under. */
interface CanvasPaneReportDispatch {
	readonly request: CanvasPaneReportRequest;
	readonly socket: PaneSocket | null;
	readonly registration: CanvasPaneRegistration | null;
}

/** The identity the pane holds when the response comes back. */
interface CanvasPaneReportCurrent {
	readonly socket: PaneSocket | null;
	readonly generation: number;
	readonly registration: CanvasPaneRegistration | null;
}

/** How a pane report ended. */
type CanvasPaneReportOutcome =
	| { readonly settled: true; readonly registered: boolean }
	| { readonly settled: false };

/** What one pane-report response is allowed to change, and nothing more. */
interface CanvasPaneReportEffects {
	/** A newer request, another socket, or another generation owns the answer. */
	readonly superseded: boolean;
	readonly acknowledgeRegistration: boolean;
	/** null leaves connection health exactly as it was. */
	readonly connectionHealth: boolean | null;
	readonly clearPublishedReport: boolean;
	readonly acceptPaneListing: boolean;
	readonly applyStaleBuild: boolean;
}

const SUPERSEDED: CanvasPaneReportEffects = Object.freeze({
	superseded: true,
	acknowledgeRegistration: false,
	connectionHealth: null,
	clearPublishedReport: false,
	acceptPaneListing: false,
	applyStaleBuild: false,
});

/** Makes pane-report responses last-dispatched-wins within a socket generation. */
interface CanvasPaneReportSequencer {
	readonly begin: (generation: number) => CanvasPaneReportRequest;
	/**
	 * Decide what this response may change. The caller applies the answer; it
	 * does not repeat the reasoning, so a test can drive the same decision.
	 */
	readonly settle: (
		dispatch: CanvasPaneReportDispatch,
		current: CanvasPaneReportCurrent,
		outcome: CanvasPaneReportOutcome,
	) => CanvasPaneReportEffects;
}

/**
 * Whether a dispatch is the latest request of the current generation.
 * @param latest The most recent request.
 * @param request The request that is settling.
 * @param current The pane's current identity.
 * @returns True when the answer is still the pane's to apply.
 */
function isLatestRequest(
	latest: CanvasPaneReportRequest | null,
	request: CanvasPaneReportRequest,
	current: CanvasPaneReportCurrent,
): boolean {
	return (
		latest !== null &&
		latest.generation === request.generation &&
		latest.requestId === request.requestId &&
		request.generation === current.generation
	);
}

/**
 * Whether the dispatch's registration is the one the pane holds, on the same socket.
 * @param dispatch The dispatch identity.
 * @param current The pane's current identity.
 * @returns True when the registration may be acknowledged by this answer.
 */
function isCurrentRegistration(
	dispatch: CanvasPaneReportDispatch,
	current: CanvasPaneReportCurrent,
): boolean {
	const registration = current.registration;
	return (
		registration !== null &&
		registration === dispatch.registration &&
		registration.socket === dispatch.socket &&
		registration.generation === dispatch.request.generation
	);
}

/**
 * Make pane-report responses last-dispatched-wins within a socket generation.
 * The report itself still uses the debounce path; this only prevents an older
 * HTTP response from changing health, registration, or freshness.
 * @returns The sequencer.
 */
function createCanvasPaneReportSequencer(): CanvasPaneReportSequencer {
	let nextRequestId = 0;
	let latest: CanvasPaneReportRequest | null = null;
	/**
	 * Start a request.
	 * @param generation The socket generation it belongs to.
	 * @returns The request identity.
	 */
	function begin(generation: number): CanvasPaneReportRequest {
		const request = Object.freeze({ generation, requestId: ++nextRequestId });
		latest = request;
		return request;
	}
	/**
	 * Decide what a response may change.
	 * @param dispatch The identity it was dispatched under.
	 * @param current The identity the pane holds now.
	 * @param outcome How the report ended.
	 * @returns The permitted effects.
	 */
	function settle(
		dispatch: CanvasPaneReportDispatch,
		current: CanvasPaneReportCurrent,
		outcome: CanvasPaneReportOutcome,
	): CanvasPaneReportEffects {
		if (!isLatestRequest(latest, dispatch.request, current)) {
			return SUPERSEDED;
		}
		const currentReport = dispatch.socket !== null && dispatch.socket === current.socket;
		return permittedEffects({
			currentReport,
			currentRegistration: currentReport && isCurrentRegistration(dispatch, current),
			registered: outcome.settled && outcome.registered,
			settled: outcome.settled,
		});
	}
	return Object.freeze({ begin, settle });
}

/** The facts a current response is judged by. */
interface ReportStanding {
	readonly currentReport: boolean;
	readonly currentRegistration: boolean;
	readonly registered: boolean;
	readonly settled: boolean;
}

/**
 * What a response that was not superseded may change.
 * @param standing How the response stands against the pane's identity.
 * @returns The permitted effects.
 */
function permittedEffects(standing: ReportStanding): CanvasPaneReportEffects {
	const { currentReport, currentRegistration, registered, settled } = standing;
	return Object.freeze({
		superseded: false,
		// The first positive result releases the one-shot attach latch;
		// connection health follows every current pane report instead.
		acknowledgeRegistration: currentRegistration && registered,
		connectionHealth: currentRegistration ? registered : null,
		// Nothing is lost by a refused or failed report except its freshness,
		// and the next change resends, but only if this one is not remembered
		// as sent. That is the recovery path; there is no private retry loop.
		clearPublishedReport: currentReport && !registered,
		acceptPaneListing: currentRegistration && registered,
		applyStaleBuild: currentReport && settled,
	});
}

/**
 * The registration latch for one socket generation.
 * @param socket The socket.
 * @param generation Its generation.
 * @returns The registration.
 */
function createCanvasPaneRegistration(
	socket: PaneSocket,
	generation: number,
): CanvasPaneRegistration {
	const latch = createLatch();
	let acknowledged = false;
	/**
	 * Release the latch on the first positive acknowledgement.
	 * @param registered Whether the server registered the pane.
	 * @returns Whether this call released it.
	 */
	function acknowledge(registered: boolean): boolean {
		if (!registered || acknowledged) {
			return false;
		}
		acknowledged = true;
		latch.release();
		return true;
	}
	return Object.freeze({ socket, generation, promise: latch.promise, acknowledge });
}

/** A promise released from outside. */
interface Latch {
	readonly promise: Promise<void>;
	readonly release: () => void;
}

/**
 * A promise and the function that resolves it.
 * @returns The latch.
 */
function createLatch(): Latch {
	let resolveLatch: (() => void) | null = null;
	/**
	 * Capture the resolver.
	 * @param resolve The promise's resolver.
	 */
	function capture(resolve: () => void): void {
		resolveLatch = resolve;
	}
	const promise = new Promise<void>(capture);
	/** Resolve the promise. */
	function release(): void {
		resolveLatch?.();
	}
	return { promise, release };
}

/** Inputs for attaching after registration. */
interface CanvasWorkbenchAttachAfterRegistrationOptions {
	readonly registration: CanvasPaneRegistration;
	readonly isCurrent: () => boolean;
	readonly attach: () => Promise<WorkbenchTransportState>;
}

/**
 * Release a workbench attach only after pane registration, with the generation
 * check immediately before the owner is called. The callback is synchronous at
 * that point, so an old completion cannot attach a replacement socket.
 * @param options The registration, the currency check and the attach.
 * @returns The attached state, or null when the registration was no longer current.
 */
async function attachCanvasWorkbenchAfterRegistration(
	options: CanvasWorkbenchAttachAfterRegistrationOptions,
): Promise<WorkbenchTransportState | null> {
	await options.registration.promise;
	return options.isCurrent() ? options.attach() : null;
}

/** The socket and transport of one generation. */
interface CanvasWorkbenchSocketGeneration<Transport extends WorkbenchTransportPort> {
	readonly socket: PaneSocket;
	readonly transport: Transport;
}

/** Keeps one transport generation per pane socket. */
interface CanvasWorkbenchSocketOwner<Transport extends WorkbenchTransportPort> {
	readonly current: () => CanvasWorkbenchSocketGeneration<Transport> | null;
	readonly attach: (socket: PaneSocket) => Promise<WorkbenchTransportState>;
	readonly detach: (socket: PaneSocket) => Promise<void>;
	readonly dispose: () => Promise<void>;
}

/** What the owner needs: the media owner and how to make a transport. */
interface CanvasWorkbenchSocketOwnerOptions<Transport extends WorkbenchTransportPort> {
	readonly media: WorkbenchMediaPort<Transport>;
	readonly createTransport: () => Transport;
}

interface Generation<
	Transport extends WorkbenchTransportPort,
> extends CanvasWorkbenchSocketGeneration<Transport> {
	retired: boolean;
	cleanup: Promise<void> | null;
}

/**
 * Run a cleanup step, swallowing its failure: retirement must finish.
 * @param step The step.
 */
async function quietly(step: () => Promise<unknown>): Promise<void> {
	try {
		await step();
	} catch {
		// A retiring generation's failure has nobody left to tell.
	}
}

/**
 * Keep socket generation, transport generation, and media generation together.
 * Retiring a transport only removes its listeners and pending work; the canvas
 * session remains the only owner that closes the actual socket.
 * @param options The media owner and the transport factory.
 * @returns The owner.
 */
function createCanvasWorkbenchSocketOwner<Transport extends WorkbenchTransportPort>(
	options: CanvasWorkbenchSocketOwnerOptions<Transport>,
): CanvasWorkbenchSocketOwner<Transport> {
	let active: Generation<Transport> | null = null;
	let disposed = false;
	let latestAttach = 0;
	let retirement: Promise<void> = Promise.resolve();

	/**
	 * The state to report now.
	 * @returns The active transport's state, or a stopped state.
	 */
	function state(): WorkbenchTransportState {
		if (active !== null) {
			return active.transport.state();
		}
		return stoppedState(
			disposed
				? "The canvas workbench socket owner is disposed."
				: "No canvas workbench socket is attached.",
		);
	}

	/**
	 * Retire a generation once, after any retirement already in progress.
	 * @param generation The generation.
	 * @returns Settles when its media and transport are gone.
	 */
	function retire(generation: Generation<Transport>): Promise<void> {
		if (generation.retired) {
			return generation.cleanup ?? Promise.resolve();
		}
		generation.retired = true;
		if (active === generation) {
			active = null;
		}
		const cleanup = cleanUpAfter(retirement, generation);
		generation.cleanup = cleanup;
		retirement = quietly(() => cleanup);
		return cleanup;
	}

	/**
	 * Detach a generation's media and dispose its transport, after earlier retirements.
	 * @param after The retirement already in progress.
	 * @param generation The generation to clean up.
	 */
	async function cleanUpAfter(
		after: Promise<void>,
		generation: Generation<Transport>,
	): Promise<void> {
		await after;
		await quietly(() => options.media.detach(generation.transport));
		await quietly(() => generation.transport.dispose());
	}

	/**
	 * Whether a generation is still the one an attach request is for.
	 * @param generation The generation.
	 * @param request The attach request number.
	 * @returns True while nothing has superseded it.
	 */
	function isCurrent(generation: Generation<Transport>, request: number): boolean {
		return !disposed && request === latestAttach && active === generation && !generation.retired;
	}

	/**
	 * Attach the transport and media of a fresh generation, retiring it if superseded.
	 * @param generation The generation.
	 * @param request The attach request number.
	 * @returns The state to report.
	 */
	async function bringUp(
		generation: Generation<Transport>,
		request: number,
	): Promise<WorkbenchTransportState> {
		try {
			await generation.transport.attach(generation.socket);
			if (!isCurrent(generation, request)) {
				await retire(generation);
				return state();
			}
			await options.media.attach(generation.transport);
			if (!isCurrent(generation, request)) {
				await retire(generation);
				return state();
			}
			return generation.transport.state();
		} catch (error) {
			await retire(generation);
			throw error;
		}
	}

	/**
	 * Attach a socket, replacing the previous generation.
	 * @param socket The socket.
	 * @returns The state to report.
	 */
	/**
	 * Whether an attach request may still create a generation.
	 * @param request The attach request number.
	 * @returns True while the owner is live and nothing newer was requested.
	 */
	function acceptsAttach(request: number): boolean {
		return !disposed && request === latestAttach;
	}

	/**
	 * Start a fresh generation on a socket.
	 * @param socket The socket.
	 * @param request The attach request number.
	 * @returns The state to report.
	 */
	function startGeneration(socket: PaneSocket, request: number): Promise<WorkbenchTransportState> {
		const generation: Generation<Transport> = {
			socket,
			transport: options.createTransport(),
			retired: false,
			cleanup: null,
		};
		active = generation;
		return bringUp(generation, request);
	}

	/**
	 * Attach a socket, replacing the previous generation.
	 * @param socket The socket.
	 * @returns The state to report.
	 */
	async function attach(socket: PaneSocket): Promise<WorkbenchTransportState> {
		const request = ++latestAttach;
		if (disposed) {
			return stoppedState("The canvas workbench socket owner is disposed.");
		}
		const previous = active;
		if (previous?.socket === socket && !previous.retired) {
			return previous.transport.state();
		}
		await settlePrevious(previous);
		return acceptsAttach(request) ? startGeneration(socket, request) : state();
	}

	/**
	 * Retire the previous generation, or wait for a retirement in progress.
	 * @param previous The generation that was active, or null.
	 * @returns Settles when the previous generation is gone.
	 */
	function settlePrevious(previous: Generation<Transport> | null): Promise<void> {
		return previous === null ? retirement : retire(previous);
	}

	/**
	 * Retire the generation on a socket, if it is the active one.
	 * @param socket The socket.
	 */
	async function detach(socket: PaneSocket): Promise<void> {
		const generation = active;
		if (generation === null || generation.socket !== socket) {
			return;
		}
		++latestAttach;
		await retire(generation);
	}

	/** Retire everything and dispose the media owner. */
	async function dispose(): Promise<void> {
		if (disposed) {
			return;
		}
		disposed = true;
		++latestAttach;
		const generation = active;
		await (generation === null ? retirement : retire(generation));
		await quietly(() => options.media.dispose());
	}

	/**
	 * The active generation.
	 * @returns The socket and transport, or null when none is attached.
	 */
	function current(): CanvasWorkbenchSocketGeneration<Transport> | null {
		return active;
	}

	return Object.freeze({ current, attach, detach, dispose });
}

export {
	type CanvasPaneRegistration,
	type CanvasPaneReportCurrent,
	type CanvasPaneReportDispatch,
	type CanvasPaneReportEffects,
	type CanvasPaneReportOutcome,
	type CanvasPaneReportRequest,
	type CanvasPaneReportSequencer,
	type CanvasWorkbenchAttachAfterRegistrationOptions,
	type CanvasWorkbenchSocketGeneration,
	type CanvasWorkbenchSocketOwner,
	type CanvasWorkbenchSocketOwnerOptions,
	attachCanvasWorkbenchAfterRegistration,
	createCanvasPaneRegistration,
	createCanvasPaneReportSequencer,
	createCanvasWorkbenchSocketOwner,
};
