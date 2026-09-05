export type CanvasApplicationPhase =
	| "idle"
	| "starting"
	| "running"
	| "quiescing"
	| "stopping"
	| "stopped"
	| "failed";

export type CanvasApplicationStopReason =
	| NodeJS.Signals
	| "server-error"
	| "startup-failed"
	| "test";

export interface CanvasMutationLease {
	readonly signal: AbortSignal;
	abort(reason?: unknown): void;
	finish(): void;
	track<T>(name: string, work: (signal: AbortSignal) => Promise<T> | T): Promise<T>;
}

export interface CanvasMutationAdmissionOptions {
	readonly drainTimeoutMs: number;
}

export interface CanvasActiveMutation {
	readonly name: string;
	readonly kind: "request" | "work";
	readonly startedAt: number;
}

export class CanvasApplicationBusyError extends Error {
	readonly code = "CANVAS_BUSY";

	constructor(
		readonly timeoutMs: number,
		readonly active: readonly CanvasActiveMutation[],
	) {
		const now = Date.now();
		const details = active
			.map(
				(entry) => `${entry.name} (${entry.kind}, active ${Math.max(0, now - entry.startedAt)} ms)`,
			)
			.join("; ");
		super(
			`Canvas shutdown refused because mutation work did not settle within ${timeoutMs} ms: ${details}. ` +
				"No resource was torn down; the canvas resumed write admission. Finish or cancel the named work, then retry stop.",
		);
		this.name = "CanvasApplicationBusyError";
	}
}

/**
 * Admit request parsing separately from mutation work that can outlive a
 * response. A disconnected request aborts waitable work, while work already in
 * a synchronous critical section remains counted until that section returns.
 */
export function createCanvasMutationAdmission(options: CanvasMutationAdmissionOptions) {
	if (!Number.isFinite(options.drainTimeoutMs) || options.drainTimeoutMs < 0) {
		throw new Error("Canvas mutation drain timeout must be a non-negative finite duration.");
	}

	let accepting = true;
	let nextId = 0;
	const active = new Map<number, CanvasActiveMutation>();
	const drained = new Set<() => void>();
	const settle = (): void => {
		if (active.size !== 0) {
			return;
		}
		for (const resolve of drained) {
			resolve();
		}
		drained.clear();
	};
	const enter = (entry: CanvasActiveMutation): (() => void) => {
		const id = nextId++;
		active.set(id, entry);
		let finished = false;
		return () => {
			if (finished) {
				return;
			}
			finished = true;
			active.delete(id);
			settle();
		};
	};

	return Object.freeze({
		admit: (name: string): CanvasMutationLease | null => {
			if (!accepting) {
				return null;
			}
			const controller = new AbortController();
			const finishRequest = enter({ name, kind: "request", startedAt: Date.now() });
			return Object.freeze({
				signal: controller.signal,
				abort: (reason?: unknown): void => {
					if (!controller.signal.aborted) {
						controller.abort(reason ?? new Error(`${name} disconnected.`));
					}
					finishRequest();
				},
				finish: finishRequest,
				track: async <T>(
					workName: string,
					work: (signal: AbortSignal) => Promise<T> | T,
				): Promise<T> => {
					const finishWork = enter({ name: workName, kind: "work", startedAt: Date.now() });
					try {
						controller.signal.throwIfAborted();
						return await work(controller.signal);
					} finally {
						finishWork();
					}
				},
			});
		},
		quiesce: async (): Promise<void> => {
			accepting = false;
			if (active.size === 0) {
				return;
			}

			let timeout: ReturnType<typeof setTimeout> | null = null;
			let onDrain!: () => void;
			const settled = await Promise.race([
				new Promise<true>((resolve) => {
					onDrain = () => resolve(true);
					drained.add(onDrain);
				}),
				new Promise<false>((resolve) => {
					timeout = setTimeout(() => resolve(false), options.drainTimeoutMs);
				}),
			]);
			if (timeout !== null) {
				clearTimeout(timeout);
			}
			drained.delete(onDrain);
			if (settled || active.size === 0) {
				return;
			}
			throw new CanvasApplicationBusyError(
				options.drainTimeoutMs,
				[...active.values()].toSorted((left, right) =>
					left.startedAt === right.startedAt
						? left.name.localeCompare(right.name)
						: left.startedAt - right.startedAt,
				),
			);
		},
		resume: (): void => {
			accepting = true;
		},
		accepting: (): boolean => accepting,
		active: (): number => active.size,
		activeMutations: (): readonly CanvasActiveMutation[] => [...active.values()],
	});
}

export interface CanvasApplicationResource {
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

export interface CanvasApplicationEvent {
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

export interface CanvasApplicationLifetimeOptions {
	readonly resources: readonly CanvasApplicationResource[];
	readonly heldBoards?: () => readonly string[];
	/** Stop admitting writes and settle every admitted write. */
	readonly quiesce?: () => Promise<void> | void;
	/** Restore write admission when the authoritative hold check refuses stop. */
	readonly resume?: () => Promise<void> | void;
	readonly observe?: (event: CanvasApplicationEvent) => void;
}

export class CanvasApplicationHeldError extends Error {
	readonly code = "CANVAS_HELD";

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

export class CanvasApplicationStartupCancelledError extends Error {
	constructor(readonly reason: CanvasApplicationStopReason) {
		super(`Canvas application startup was canceled by ${reason}.`);
		this.name = "CanvasApplicationStartupCancelledError";
	}
}

const failure = (error: unknown): Error =>
	error instanceof Error ? error : new Error(String(error));

/**
 * Own one canvas process generation.
 *
 * Resources enter ownership before start is invoked, start in declaration
 * order, and stop in reverse order. A signal can therefore stop an owner that
 * has acquired only part of its startup state. A timed stop is not abandoned:
 * its force action must make the original stop promise settle before teardown
 * advances to the next owner.
 */
export function createCanvasApplicationLifetime(options: CanvasApplicationLifetimeOptions) {
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
	const emit = (action: CanvasApplicationEvent["action"], resource: string | null = null): void =>
		options.observe?.({ phase, action, resource });
	const setPhase = (next: CanvasApplicationPhase): void => {
		phase = next;
		emit("phase");
	};
	const holds = (): string[] => [...(options.heldBoards?.() ?? [])].toSorted();

	const stopResource = async (
		resource: CanvasApplicationResource,
		reason: CanvasApplicationStopReason,
	): Promise<void> => {
		let stopFailure: Error | null = null;
		let stopSettled = false;
		const graceful = Promise.resolve()
			.then(() => resource.stop(reason))
			.then(
				() => {
					stopSettled = true;
					return undefined;
				},
				(error: unknown) => {
					stopSettled = true;
					stopFailure = failure(error);
					return undefined;
				},
			);

		if (resource.stopGraceMs !== undefined) {
			let timeout: ReturnType<typeof setTimeout> | null = null;
			try {
				await Promise.race([
					graceful,
					new Promise<void>((resolve) => {
						timeout = setTimeout(resolve, resource.stopGraceMs);
					}),
				]);
			} finally {
				if (timeout !== null) {
					clearTimeout(timeout);
				}
			}
		} else {
			await graceful;
		}

		if (!stopSettled || stopFailure !== null) {
			if (resource.forceStop === undefined) {
				throw stopFailure;
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
			await graceful;
			if (forceFailure !== null) {
				throw forceFailure;
			}
			emit("forced", resource.name);
		}
	};

	const unwind = (reason: CanvasApplicationStopReason): Promise<void> => {
		if (unwindPromise !== null) {
			return unwindPromise;
		}
		unwindPromise = (async () => {
			const failures: Error[] = [];
			for (const resource of entered.toReversed()) {
				emit("stop", resource.name);
				try {
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

	return Object.freeze({
		phase: (): CanvasApplicationPhase => phase,
		cleanupProven: (): boolean => cleanupProven,
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
					for (const resource of options.resources) {
						if (startup.signal.aborted) {
							throw new CanvasApplicationStartupCancelledError(
								(startup.signal.reason as CanvasApplicationStopReason | undefined) ?? "test",
							);
						}
						emit("start", resource.name);
						entered.push(resource);
						const starting = resource.start?.(startup.signal);
						if (starting !== undefined) {
							await starting;
						}
						emit("started", resource.name);
					}
					setPhase("running");
				} catch (startupError) {
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
				}
			})();
			return startPromise;
		},
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
