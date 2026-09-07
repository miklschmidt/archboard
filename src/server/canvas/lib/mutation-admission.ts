interface CanvasMutationLease {
	readonly signal: AbortSignal;
	abort(reason?: unknown): void;
	finish(): void;
	track<T>(name: string, work: (signal: AbortSignal) => Promise<T> | T): Promise<T>;
}

interface CanvasMutationAdmissionOptions {
	readonly drainTimeoutMs: number;
}

interface CanvasActiveMutation {
	readonly name: string;
	readonly kind: "request" | "work";
	readonly startedAt: number;
}

class CanvasApplicationBusyError extends Error {
	readonly code = "CANVAS_BUSY";

	/**
	 * Refuse a stop, naming the mutation work that did not settle so whoever
	 * asked can finish or cancel it.
	 * @param timeoutMs How long the drain waited.
	 * @param active The work still running when it gave up.
	 */
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
 * @param options How long a stop's drain waits.
 * @returns The admission owner.
 */
function createCanvasMutationAdmission(options: CanvasMutationAdmissionOptions) {
	if (!Number.isFinite(options.drainTimeoutMs) || options.drainTimeoutMs < 0) {
		throw new Error("Canvas mutation drain timeout must be a non-negative finite duration.");
	}

	let accepting = true;
	let nextId = 0;
	const active = new Map<number, CanvasActiveMutation>();
	const drained = new Set<() => void>();
	/** Release every waiter once nothing is in flight. */
	const settle = (): void => {
		if (active.size !== 0) {
			return;
		}
		for (const resolve of drained) {
			resolve();
		}
		drained.clear();
	};
	/**
	 * Count one piece of work as in flight.
	 * @param entry What the work is.
	 * @returns Stops counting it, the first time it is called.
	 */
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
		/**
		 * Admit one mutation request, unless the canvas has stopped admitting them.
		 * @param name What the request is.
		 * @returns Its lease, or null when the canvas is stopping.
		 */
		admit: (name: string): CanvasMutationLease | null => {
			if (!accepting) {
				return null;
			}
			const controller = new AbortController();
			const finishRequest = enter({ name, kind: "request", startedAt: Date.now() });
			return Object.freeze({
				signal: controller.signal,
				/**
				 * Cancel this request's waitable work and stop counting the request.
				 * @param reason Why it was cancelled.
				 */
				abort: (reason?: unknown): void => {
					if (!controller.signal.aborted) {
						controller.abort(reason ?? new Error(`${name} disconnected.`));
					}
					finishRequest();
				},
				finish: finishRequest,
				/**
				 * Run one piece of work under this lease, counted separately so a
				 * response that has already gone out cannot hide unfinished work.
				 * @param workName What the work is.
				 * @param work The work.
				 * @returns The work's result.
				 */
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
		/**
		 * Stop admitting writes and wait for the admitted ones to settle, refusing
		 * the stop when they do not.
		 */
		quiesce: async (): Promise<void> => {
			accepting = false;
			if (active.size === 0) {
				return;
			}

			let timeout: ReturnType<typeof setTimeout> | null = null;
			let onDrain!: () => void;
			const settled = await Promise.race([
				new Promise<true>((resolve) => {
					/**
					 * Settle the race as drained.
					 * @returns Nothing; the resolver's own return value is unused.
					 */
					onDrain = () => resolve(true);
					drained.add(onDrain);
				}),
				new Promise<false>((resolve) => {
					timeout = setTimeout(() => resolve(false), options.drainTimeoutMs);
				}),
			]);
			clearTimeout(timeout ?? undefined);
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
		/** Admit writes again, after a refused stop. */
		resume: (): void => {
			accepting = true;
		},
		/**
		 * Whether writes are being admitted.
		 * @returns True while the canvas accepts them.
		 */
		accepting: (): boolean => accepting,
		/**
		 * How much work is in flight.
		 * @returns The count.
		 */
		active: (): number => active.size,
		/**
		 * What is in flight, for the health report.
		 * @returns One entry per piece of work.
		 */
		activeMutations: (): readonly CanvasActiveMutation[] => [...active.values()],
	});
}
export {
	CanvasApplicationBusyError,
	createCanvasMutationAdmission,
	type CanvasActiveMutation,
	type CanvasMutationAdmissionOptions,
	type CanvasMutationLease,
};
