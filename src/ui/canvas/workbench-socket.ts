import type { BrowserWorkbenchMediaOwner } from "../codex-workbench-media/index.js";
import {
	createBrowserWorkbenchTransport,
	type BrowserWorkbenchSocket,
	type BrowserWorkbenchState,
	type BrowserWorkbenchTransport,
} from "../workbench-transport/index.js";

export interface CanvasWorkbenchSocketGeneration {
	readonly socket: BrowserWorkbenchSocket;
	readonly transport: BrowserWorkbenchTransport;
}

export interface CanvasPaneReportRequest {
	readonly generation: number;
	readonly requestId: number;
}

/** The identity a pane report was dispatched under. */
export interface CanvasPaneReportDispatch {
	readonly request: CanvasPaneReportRequest;
	readonly socket: BrowserWorkbenchSocket | null;
	readonly registration: CanvasPaneRegistration | null;
}

/** The identity the pane holds when the response comes back. */
export interface CanvasPaneReportCurrent {
	readonly socket: BrowserWorkbenchSocket | null;
	readonly generation: number;
	readonly registration: CanvasPaneRegistration | null;
}

export type CanvasPaneReportOutcome =
	| { readonly settled: true; readonly registered: boolean }
	| { readonly settled: false };

/** What one pane-report response is allowed to change, and nothing more. */
export interface CanvasPaneReportEffects {
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

export interface CanvasPaneReportSequencer {
	readonly begin: (generation: number) => CanvasPaneReportRequest;
	/**
	 * Decide what this response may change. The caller applies the answer; it
	 * does not repeat the reasoning, so a test can drive the same decision the
	 * pane makes.
	 */
	readonly settle: (
		dispatch: CanvasPaneReportDispatch,
		current: CanvasPaneReportCurrent,
		outcome: CanvasPaneReportOutcome,
	) => CanvasPaneReportEffects;
}

/**
 * Make pane-report responses last-dispatched-wins within a socket generation.
 * The report itself still uses the existing debounce path; this only prevents
 * an older HTTP response from changing health, registration, or freshness.
 */
export function createCanvasPaneReportSequencer(): CanvasPaneReportSequencer {
	let nextRequestId = 0;
	let latest: CanvasPaneReportRequest | null = null;
	const begin = (generation: number): CanvasPaneReportRequest => {
		const request = Object.freeze({ generation, requestId: ++nextRequestId });
		latest = request;
		return request;
	};
	const settle = (
		dispatch: CanvasPaneReportDispatch,
		current: CanvasPaneReportCurrent,
		outcome: CanvasPaneReportOutcome,
	): CanvasPaneReportEffects => {
		const request = dispatch.request;
		if (
			latest === null ||
			latest.generation !== request.generation ||
			latest.requestId !== request.requestId ||
			request.generation !== current.generation
		)
			return SUPERSEDED;
		const currentReport = dispatch.socket !== null && dispatch.socket === current.socket;
		const registration = current.registration;
		const currentRegistration =
			currentReport &&
			registration !== null &&
			registration === dispatch.registration &&
			registration.socket === dispatch.socket &&
			registration.generation === request.generation;
		const registered = outcome.settled && outcome.registered;
		return Object.freeze({
			superseded: false,
			// The first positive result releases the one-shot attach latch;
			// connection health follows every current pane report instead.
			acknowledgeRegistration: currentRegistration && registered,
			connectionHealth: currentRegistration ? registered : null,
			// Nothing is lost by a refused or failed report except its freshness,
			// and the next change resends — but only if this one is not remembered
			// as sent. That is the recovery path; there is no private retry loop.
			clearPublishedReport: currentReport && !registered,
			acceptPaneListing: currentRegistration && registered,
			applyStaleBuild: currentReport && outcome.settled,
		});
	};
	return Object.freeze({ begin, settle });
}

/**
 * The authoritative pane registration acknowledgement for one canvas socket.
 * A negative acknowledgement deliberately leaves the promise pending: the
 * existing pane-report path can recover it on a later report without creating
 * a second retry loop or a second socket subscription.
 */
export interface CanvasPaneRegistration {
	readonly socket: BrowserWorkbenchSocket;
	readonly generation: number;
	readonly promise: Promise<void>;
	/** Release the one-shot attach latch; pane health is tracked separately. */
	readonly acknowledge: (registered: boolean) => boolean;
}

export interface CanvasWorkbenchAttachAfterRegistrationOptions {
	readonly registration: CanvasPaneRegistration;
	readonly isCurrent: () => boolean;
	readonly attach: () => Promise<BrowserWorkbenchState>;
}

export function createCanvasPaneRegistration(
	socket: BrowserWorkbenchSocket,
	generation: number,
): CanvasPaneRegistration {
	let resolveRegistration!: () => void;
	let acknowledged = false;
	const promise = new Promise<void>((resolve) => {
		resolveRegistration = resolve;
	});
	return Object.freeze({
		socket,
		generation,
		promise,
		acknowledge: (registered: boolean): boolean => {
			if (!registered || acknowledged) return false;
			acknowledged = true;
			resolveRegistration();
			return true;
		},
	});
}

/**
 * Release a workbench attach only after pane registration, with the generation
 * check immediately before the owner is called. The callback is synchronous at
 * that point, so an old completion cannot attach a replacement socket.
 */
export function attachCanvasWorkbenchAfterRegistration({
	registration,
	isCurrent,
	attach,
}: CanvasWorkbenchAttachAfterRegistrationOptions): Promise<BrowserWorkbenchState | null> {
	return registration.promise.then(() => (isCurrent() ? attach() : null));
}

export interface CanvasWorkbenchSocketOwner {
	readonly current: () => CanvasWorkbenchSocketGeneration | null;
	readonly attach: (socket: BrowserWorkbenchSocket) => Promise<BrowserWorkbenchState>;
	readonly detach: (socket: BrowserWorkbenchSocket) => Promise<void>;
	readonly dispose: () => Promise<void>;
}

export interface CanvasWorkbenchSocketOwnerOptions {
	readonly media: Pick<BrowserWorkbenchMediaOwner, "attach" | "detach" | "dispose">;
	readonly createTransport?: () => BrowserWorkbenchTransport;
}

interface Generation extends CanvasWorkbenchSocketGeneration {
	retired: boolean;
	cleanup: Promise<void> | null;
}

function stoppedState(reason = "No canvas workbench socket is attached."): BrowserWorkbenchState {
	return Object.freeze({
		kind: "connection",
		state: "stopped",
		connection: "stopped",
		snapshot: null,
		sequence: null,
		reason,
	}) satisfies BrowserWorkbenchState;
}

/**
 * Keep socket generation, transport generation, and media generation together.
 * The canvas session remains the only owner that can close the actual socket;
 * retiring a transport only removes its listeners and pending work.
 */
export function createCanvasWorkbenchSocketOwner(
	options: CanvasWorkbenchSocketOwnerOptions,
): CanvasWorkbenchSocketOwner {
	const createTransport = options.createTransport ?? createBrowserWorkbenchTransport;
	let active: Generation | null = null;
	let disposed = false;
	let latestAttach = 0;
	let retirement: Promise<void> = Promise.resolve();

	const state = (): BrowserWorkbenchState =>
		active?.transport.state() ??
		stoppedState(
			disposed
				? "The canvas workbench socket owner is disposed."
				: "No canvas workbench socket is attached.",
		);

	const retire = (generation: Generation): Promise<void> => {
		if (generation.retired) return generation.cleanup ?? Promise.resolve();
		generation.retired = true;
		if (active === generation) active = null;
		const cleanup = retirement.then(async () => {
			await options.media.detach(generation.transport).catch(() => undefined);
			await generation.transport.dispose().catch(() => undefined);
			return undefined;
		});
		generation.cleanup = cleanup;
		retirement = cleanup.catch(() => undefined);
		return cleanup;
	};

	const isCurrent = (generation: Generation, request: number): boolean =>
		!disposed && request === latestAttach && active === generation && !generation.retired;

	const attach = async (socket: BrowserWorkbenchSocket): Promise<BrowserWorkbenchState> => {
		const request = ++latestAttach;
		if (disposed) return stoppedState();
		const previous = active;
		if (previous?.socket === socket && !previous.retired) return previous.transport.state();
		if (previous !== null) await retire(previous);
		else await retirement;
		if (disposed || request !== latestAttach) return state();

		const generation: Generation = {
			socket,
			transport: createTransport(),
			retired: false,
			cleanup: null,
		};
		active = generation;
		try {
			await generation.transport.attach(socket);
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
	};

	const detach = async (socket: BrowserWorkbenchSocket): Promise<void> => {
		const generation = active;
		if (generation === null || generation.socket !== socket) return;
		++latestAttach;
		await retire(generation);
	};

	const dispose = async (): Promise<void> => {
		if (disposed) return;
		disposed = true;
		++latestAttach;
		const generation = active;
		if (generation !== null) await retire(generation);
		else await retirement;
		await options.media.dispose().catch(() => undefined);
	};

	return Object.freeze({
		current: () => active,
		attach,
		detach,
		dispose,
	});
}
