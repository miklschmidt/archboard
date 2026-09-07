type CanvasApplicationPhase =
	| "idle"
	| "starting"
	| "running"
	| "quiescing"
	| "stopping"
	| "stopped"
	| "failed";

type CanvasApplicationStopReason = NodeJS.Signals | "server-error" | "startup-failed" | "test";

import {
	CanvasApplicationBusyError,
	createCanvasMutationAdmission,
	type CanvasActiveMutation,
	type CanvasMutationAdmissionOptions,
	type CanvasMutationLease,
} from "@/server/canvas/lib/mutation-admission";

interface CanvasApplicationResource {
	readonly name: string;
	/** A resource that starts asynchronously must settle when this signal aborts. */
	readonly start?: (signal: AbortSignal) => Promise<void> | void;
	/** Resolve only after the resource has reached its terminal state. */
	readonly stop: (reason: CanvasApplicationStopReason) => Promise<void> | void;
	/** Grace before forceStop runs. A timed resource must provide forceStop. */
	readonly stopGraceMs?: number;
	/** Force terminal state, then allow the original stop promise to settle. */
	readonly forceStop?: (reason: CanvasApplicationStopReason) => Promise<void> | void;
}

interface CanvasApplicationEvent {
	readonly phase: CanvasApplicationPhase;
	readonly resource: string | null;
	readonly action:
		| "phase"
		| "start"
		| "started"
		| "stop"
		| "stopped"
		| "force"
		| "forced"
		| "failed";
}

interface CanvasApplicationLifetimeOptions {
	readonly resources: readonly CanvasApplicationResource[];
	readonly heldBoards?: () => readonly string[];
	/** Stop admitting writes and settle every admitted write. */
	readonly quiesce?: () => Promise<void> | void;
	/** Restore write admission when the authoritative hold check refuses stop. */
	readonly resume?: () => Promise<void> | void;
	readonly observe?: (event: CanvasApplicationEvent) => void;
}

class CanvasApplicationHeldError extends Error {
	readonly code = "CANVAS_HELD";

	/**
	 * Refuse a stop that would lose work held only in this process, naming the
	 * boards and the three outcomes that resolve a hold (ADR 0006).
	 * @param boards The held boards.
	 */
	constructor(readonly boards: readonly string[]) {
		super(
			[
				`Canvas shutdown refused because ${boards.length === 1 ? "this board is" : "these boards are"} held in process memory: ${boards.map((board) => `"${board}"`).join(", ")}.`,
				"Resolve every hold first: reload takes the note and discards the canvas copy; overwrite keeps the canvas copy and replaces the note; elsewhere saves both under separate names.",
			].join(" "),
		);
		this.name = "CanvasApplicationHeldError";
	}
}

class CanvasApplicationStartupCancelledError extends Error {
	/**
	 * Say that startup stopped part way because something asked it to.
	 * @param reason What asked.
	 */
	constructor(readonly reason: CanvasApplicationStopReason) {
		super(`Canvas application startup was canceled by ${reason}.`);
		this.name = "CanvasApplicationStartupCancelledError";
	}
}

/**
 * Whatever was thrown, as an Error, so a cleanup aggregate can carry it.
 * @param error The thrown value.
 * @returns The error.
 */
const failure = (error: unknown): Error =>
	error instanceof Error ? error : new Error(String(error));

/** How a resource's graceful stop ended, observable while it is still running. */
interface GracefulStopState {
	settled: boolean;
	failure: Error | null;
}

/**
 * Begin a resource's graceful stop, recording how it ends without waiting
 * for it, so a stop grace can observe whether it has settled.
 * @param resource The resource.
 * @param reason Why the canvas is stopping.
 * @returns The observable state and the promise that settles with it.
 */
const beginGracefulStop = (
	resource: CanvasApplicationResource,
	reason: CanvasApplicationStopReason,
): { state: GracefulStopState; settled: Promise<void> } => {
	const state: GracefulStopState = { settled: false, failure: null };
	const settled = Promise.resolve()
		.then(() => resource.stop(reason))
		.then(
			() => {
				state.settled = true;
				return undefined;
			},
			(error: unknown) => {
				state.settled = true;
				state.failure = failure(error);
				return undefined;
			},
		);
	return { state, settled };
};

/**
 * Wait for a graceful stop, or for the resource's stop grace to run out.
 * @param resource The resource.
 * @param settled Its graceful stop.
 */
const waitOutStopGrace = async (
	resource: CanvasApplicationResource,
	settled: Promise<void>,
): Promise<void> => {
	if (resource.stopGraceMs === undefined) {
		await settled;
		return;
	}
	let timeout: ReturnType<typeof setTimeout> | null = null;
	try {
		await Promise.race([
			settled,
			new Promise<void>((resolve) => {
				timeout = setTimeout(resolve, resource.stopGraceMs);
			}),
		]);
	} finally {
		if (timeout !== null) {
			clearTimeout(timeout);
		}
	}
};

/**
 * Refuse to start the next resource once something has cancelled startup.
 * @param signal The startup signal, whose reason names what cancelled it.
 */
function requireStartupNotCancelled(signal: AbortSignal): void {
	if (!signal.aborted) {
		return;
	}
	const reason: unknown = signal.reason;
	throw new CanvasApplicationStartupCancelledError(
		typeof reason === "string" ? (reason as CanvasApplicationStopReason) : "test",
	);
}

/**
 * Own one canvas process generation.
 *
 * Resources enter ownership before start is invoked, start in declaration
 * order, and stop in reverse order. A signal can therefore stop an owner that
 * has acquired only part of its startup state. A timed stop is not abandoned:
 * its force action must make the original stop promise settle before teardown
 * advances to the next owner.
 * @param options The resources, the hold check, and the write-admission hooks.
 * @returns The lifetime.
 */
function createCanvasApplicationLifetime(options: CanvasApplicationLifetimeOptions) {
	for (const resource of options.resources) {
		if (resource.stopGraceMs === undefined) {
			continue;
		}
		if (!Number.isFinite(resource.stopGraceMs) || resource.stopGraceMs < 0) {
			throw new Error(`${resource.name} has an invalid stop grace.`);
		}
		if (resource.forceStop === undefined) {
			throw new Error(`${resource.name} has a stop grace but no forceStop action.`);
		}
	}

	let phase: CanvasApplicationPhase = "idle";
	let startPromise: Promise<void> | null = null;
	let stopPromise: Promise<void> | null = null;
	let unwindPromise: Promise<void> | null = null;
	let cleanupProven = false;
	const startup = new AbortController();
	const entered: CanvasApplicationResource[] = [];
	/**
	 * Tell the observer what just happened.
	 * @param action What happened.
	 * @param resource Which resource it happened to, or null for a phase change.
	 * @returns Whatever the observer returns; nothing rides on it.
	 */
	const emit = (action: CanvasApplicationEvent["action"], resource: string | null = null): void =>
		options.observe?.({ phase, action, resource });
	/**
	 * Move to the next phase and announce it.
	 * @param next The phase.
	 */
	const setPhase = (next: CanvasApplicationPhase): void => {
		phase = next;
		emit("phase");
	};
	/**
	 * Which boards are held in this process's memory, in a stable order.
	 * @returns The held board keys.
	 */
	const holds = (): string[] => [...(options.heldBoards?.() ?? [])].toSorted();

	/**
	 * Stop one resource, forcing it if it has a grace and does not settle within
	 * it. forceStop terminalizes the resource; the graceful stop still has to
	 * settle so no cleanup work is left running past this boundary.
	 * @param resource The resource.
	 * @param reason Why the canvas is stopping.
	 */
	const stopResource = async (
		resource: CanvasApplicationResource,
		reason: CanvasApplicationStopReason,
	): Promise<void> => {
		const graceful = beginGracefulStop(resource, reason);
		await waitOutStopGrace(resource, graceful.settled);
		if (graceful.state.settled && graceful.state.failure === null) {
			return;
		}
		if (resource.forceStop === undefined) {
			throw graceful.state.failure;
		}
		emit("force", resource.name);
		let forceFailure: Error | null = null;
		try {
			await resource.forceStop(reason);
		} catch (error) {
			forceFailure = failure(error);
		}
		// forceStop terminalizes the resource. The graceful owner still has to
		// settle so no cleanup work is left running after this boundary.
		await graceful.settled;
		if (forceFailure !== null) {
			throw forceFailure;
		}
		emit("forced", resource.name);
	};

	/**
	 * Stop every resource that entered ownership, in reverse order, keeping
	 * every failure so one aggregate names them all.
	 * @param reason Why the canvas is stopping.
	 * @returns Resolves once every resource has reached its terminal state.
	 */
	const unwind = (reason: CanvasApplicationStopReason): Promise<void> => {
		if (unwindPromise !== null) {
			return unwindPromise;
		}
		unwindPromise = (async () => {
			const failures: Error[] = [];
			for (const resource of entered.toReversed()) {
				emit("stop", resource.name);
				try {
					// oxlint-disable-next-line no-await-in-loop -- resources stop in reverse acquisition order, each fully before the next
					await stopResource(resource, reason);
					emit("stopped", resource.name);
				} catch (error) {
					failures.push(failure(error));
					emit("failed", resource.name);
				}
			}
			entered.length = 0;
			if (failures.length > 0) {
				throw new AggregateError(
					failures,
					`Canvas application cleanup failed: ${failures.map((item) => item.message).join(" ")}`,
				);
			}
			cleanupProven = true;
		})();
		return unwindPromise;
	};

	/**
	 * Stop a canvas that is still starting: cancel the startup and unwind
	 * whatever it had already acquired.
	 * @param reason Why the canvas is stopping.
	 * @returns Resolves once it has stopped.
	 */
	const stopStarting = (reason: CanvasApplicationStopReason): Promise<void> => {
		startup.abort(reason);
		setPhase("stopping");
		stopPromise = unwind(reason).then(
			() => setPhase("stopped"),
			(error) => {
				setPhase("failed");
				throw error;
			},
		);
		return stopPromise;
	};

	/**
	 * Take ownership of every resource and start it, in declaration order.
	 */
	const enterResources = async (): Promise<void> => {
		for (const resource of options.resources) {
			requireStartupNotCancelled(startup.signal);
			emit("start", resource.name);
			entered.push(resource);
			const starting = resource.start?.(startup.signal);
			if (starting !== undefined) {
				// oxlint-disable-next-line no-await-in-loop -- resources start in declaration order, each fully before the next
				await starting;
			}
			emit("started", resource.name);
		}
	};

	/**
	 * Unwind a startup that failed, and rethrow: the startup failure alone when
	 * a stop was already running or cleanup succeeded, and both together when
	 * cleanup failed as well.
	 * @param startupError What startup threw.
	 */
	const unwindFailedStartup = async (startupError: unknown): Promise<never> => {
		if (stopPromise !== null) {
			await stopPromise;
			throw startupError;
		}
		let combined = failure(startupError);
		startup.abort("startup-failed");
		setPhase("stopping");
		try {
			await unwind("startup-failed");
		} catch (cleanupError) {
			combined = new AggregateError(
				[combined, cleanupError],
				"Canvas application startup and cleanup failed.",
			);
		}
		setPhase("failed");
		throw combined;
	};

	return Object.freeze({
		/**
		 * Which phase the canvas is in.
		 * @returns The phase.
		 */
		phase: (): CanvasApplicationPhase => phase,
		/**
		 * Whether every resource this generation acquired has been proven to have
		 * stopped, which is what the startup protocol's terminal record reports.
		 * @returns True once cleanup completed without failure.
		 */
		cleanupProven: (): boolean => cleanupProven,
		/**
		 * Start every resource in declaration order, unwinding what was acquired
		 * if one of them fails.
		 * @returns Resolves once the canvas is running.
		 */
		start: (): Promise<void> => {
			if (startPromise !== null) {
				return startPromise;
			}
			if (phase !== "idle") {
				return Promise.reject(new Error(`Canvas application cannot start from ${phase}.`));
			}
			setPhase("starting");
			startPromise = (async () => {
				try {
					await enterResources();
					setPhase("running");
				} catch (startupError) {
					await unwindFailedStartup(startupError);
				}
			})();
			return startPromise;
		},
		/**
		 * Stop the canvas: refuse while a board is held only in memory, quiesce
		 * writes, then unwind every resource. A refused stop leaves the canvas
		 * running and admitting writes again.
		 * @param reason Why the canvas is stopping.
		 * @returns Resolves once it has stopped.
		 */
		stop: (reason: CanvasApplicationStopReason): Promise<void> => {
			if (stopPromise !== null) {
				return stopPromise;
			}
			if (phase === "stopped") {
				return Promise.resolve();
			}
			if (phase === "starting") {
				return stopStarting(reason);
			}
			if (phase !== "running") {
				return Promise.reject(new Error(`Canvas application cannot stop from ${phase}.`));
			}

			const preflight = holds();
			if (preflight.length > 0) {
				return Promise.reject(new CanvasApplicationHeldError(preflight));
			}

			let teardownStarted = false;
			setPhase("quiescing");
			const attempt = (async () => {
				try {
					await options.quiesce?.();
					const authoritative = holds();
					if (authoritative.length > 0) {
						throw new CanvasApplicationHeldError(authoritative);
					}
					teardownStarted = true;
					startup.abort(reason);
					setPhase("stopping");
					await unwind(reason);
					setPhase("stopped");
				} catch (error) {
					if (!teardownStarted) {
						try {
							await options.resume?.();
						} finally {
							setPhase("running");
							stopPromise = null;
						}
					} else {
						setPhase("failed");
					}
					throw error;
				}
			})();
			stopPromise = attempt;
			return attempt;
		},
	});
}

export {
	type CanvasApplicationPhase,
	type CanvasApplicationStopReason,
	type CanvasMutationLease,
	type CanvasMutationAdmissionOptions,
	type CanvasActiveMutation,
	CanvasApplicationBusyError,
	createCanvasMutationAdmission,
	type CanvasApplicationResource,
	type CanvasApplicationEvent,
	type CanvasApplicationLifetimeOptions,
	CanvasApplicationHeldError,
	CanvasApplicationStartupCancelledError,
	createCanvasApplicationLifetime,
};
