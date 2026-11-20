// How the workbench rides a pane's socket: pane-report sequencing and the
// registration latch the workbench attach waits on. The pane's socket
// conversation keeps the workbench generations; the pane session remains the
// only owner that can close the actual socket.

/** One pane report, identified within a socket generation. */
interface PaneReportRequest {
	readonly generation: number;
	readonly requestId: number;
}

/**
 * The authoritative pane registration acknowledgement for one pane socket.
 * A negative acknowledgement deliberately leaves the promise pending: the pane
 * report path recovers it on a later report without a second retry loop.
 */
interface PaneRegistrationLatch {
	readonly socket: WebSocket;
	readonly generation: number;
	readonly promise: Promise<void>;
	/** Release the one-shot attach latch; pane health is tracked separately. */
	readonly acknowledge: (registered: boolean) => boolean;
}

/** The identity a pane report was dispatched under. */
interface PaneReportDispatch {
	readonly request: PaneReportRequest;
	readonly socket: WebSocket | null;
	readonly registration: PaneRegistrationLatch | null;
}

/** The identity the pane holds when the response comes back. */
interface PaneReportCurrent {
	readonly socket: WebSocket | null;
	readonly generation: number;
	readonly registration: PaneRegistrationLatch | null;
}

/** How a pane report ended. */
type PaneReportOutcome =
	| { readonly settled: true; readonly registered: boolean }
	| { readonly settled: false };

/** What one pane-report response is allowed to change, and nothing more. */
interface PaneReportEffects {
	/** A newer request, another socket, or another generation owns the answer. */
	readonly superseded: boolean;
	readonly acknowledgeRegistration: boolean;
	/** null leaves connection health exactly as it was. */
	readonly connectionHealth: boolean | null;
	readonly clearPublishedReport: boolean;
	readonly applyStaleBuild: boolean;
}

const SUPERSEDED: PaneReportEffects = Object.freeze({
	superseded: true,
	acknowledgeRegistration: false,
	connectionHealth: null,
	clearPublishedReport: false,
	applyStaleBuild: false,
});

/** Makes pane-report responses last-dispatched-wins within a socket generation. */
interface PaneReportSequencer {
	readonly begin: (generation: number) => PaneReportRequest;
	/**
	 * Decide what this response may change. The caller applies the answer; it
	 * does not repeat the reasoning, so a test can drive the same decision.
	 */
	readonly settle: (
		dispatch: PaneReportDispatch,
		current: PaneReportCurrent,
		outcome: PaneReportOutcome,
	) => PaneReportEffects;
}

/**
 * Whether a dispatch is the latest request of the current generation.
 * @param latest The most recent request.
 * @param request The request that is settling.
 * @param current The pane's current identity.
 * @returns True when the answer is still the pane's to apply.
 */
function isLatestRequest(
	latest: PaneReportRequest | null,
	request: PaneReportRequest,
	current: PaneReportCurrent,
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
function isCurrentRegistration(dispatch: PaneReportDispatch, current: PaneReportCurrent): boolean {
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
function createPaneReportSequencer(): PaneReportSequencer {
	let nextRequestId = 0;
	let latest: PaneReportRequest | null = null;
	/**
	 * Start a request.
	 * @param generation The socket generation it belongs to.
	 * @returns The request identity.
	 */
	function begin(generation: number): PaneReportRequest {
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
		dispatch: PaneReportDispatch,
		current: PaneReportCurrent,
		outcome: PaneReportOutcome,
	): PaneReportEffects {
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
function permittedEffects(standing: ReportStanding): PaneReportEffects {
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
		applyStaleBuild: currentReport && settled,
	});
}

/**
 * The registration latch for one socket generation.
 * @param socket The socket.
 * @param generation Its generation.
 * @returns The registration.
 */
function createPaneRegistrationLatch(socket: WebSocket, generation: number): PaneRegistrationLatch {
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
interface WorkbenchAttachAfterRegistrationOptions<Attached> {
	readonly registration: PaneRegistrationLatch;
	readonly isCurrent: () => boolean;
	readonly attach: () => Promise<Attached>;
}

/**
 * Release a workbench attach only after pane registration, with the generation
 * check immediately before the attach is called. The callback is synchronous at
 * that point, so an old completion cannot attach a replacement socket.
 * @param options The registration, the currency check and the attach.
 * @returns What the attach gave, or null when the registration was no longer current.
 */
async function attachWorkbenchAfterRegistration<Attached>(
	options: WorkbenchAttachAfterRegistrationOptions<Attached>,
): Promise<Attached | null> {
	await options.registration.promise;
	return options.isCurrent() ? options.attach() : null;
}

export {
	type PaneRegistrationLatch,
	type PaneReportCurrent,
	type PaneReportDispatch,
	type PaneReportEffects,
	attachWorkbenchAfterRegistration,
	createPaneRegistrationLatch,
	createPaneReportSequencer,
};
