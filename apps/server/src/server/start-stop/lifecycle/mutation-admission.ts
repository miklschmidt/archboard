import { TimedOut, within } from "@archboard/timing";

interface ServerMutationLease {
	readonly signal: AbortSignal;
	abort(reason?: unknown): void;
	finish(): void;
	track<T>(name: string, work: (signal: AbortSignal) => Promise<T> | T): Promise<T>;
}

interface ServerActiveMutation {
	readonly name: string;
	readonly kind: "request" | "work";
	readonly startedAt: number;
}

class ServerApplicationBusyError extends Error {
	readonly code = "SERVER_BUSY";

	/**
	 * Refuse a stop, naming the mutation work that did not settle so whoever
	 * asked can finish or cancel it.
	 * @param drain The drain's timeout.
	 * @param active The work still running when it gave up.
	 */
	constructor(
		drain: TimedOut,
		readonly active: readonly ServerActiveMutation[],
	) {
		const now = Date.now();
		const details = active
			.map(
				(entry) => `${entry.name} (${entry.kind}, active ${Math.max(0, now - entry.startedAt)} ms)`,
			)
			.join("; ");
		super(
			`Archboard server shutdown refused. ${drain.message} Still running: ${details}. ` +
				"No resource was torn down; the server resumed write admission. Finish or cancel the named work, then retry stop.",
		);
		this.name = "ServerApplicationBusyError";
	}
}

/**
 * Admit request parsing separately from mutation work that can outlive a
 * response. A disconnected request aborts waitable work, while work already in
 * a synchronous critical section remains counted until that section returns.
 * @returns The admission owner.
 */
function createServerMutationAdmission() {
	let accepting = true;
	let nextId = 0;
	const active = new Map<number, ServerActiveMutation>();
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
	const enter = (entry: ServerActiveMutation): (() => void) => {
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
		 * Admit one mutation request, unless the server has stopped admitting them.
		 * @param name What the request is.
		 * @returns Its lease, or null when the server is stopping.
		 */
		admit: (name: string): ServerMutationLease | null => {
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

			let onDrain!: () => void;
			const drain = await within(
				"server.mutationDrain",
				() =>
					new Promise<undefined>((resolve) => {
						/**
						 * Settle the race as drained.
						 * @returns Nothing; the resolver's own return value is unused.
						 */
						onDrain = () => resolve(undefined);
						drained.add(onDrain);
					}),
			).catch((error: unknown) => {
				if (error instanceof TimedOut) return error;
				throw error;
			});
			drained.delete(onDrain);
			if (drain === undefined || active.size === 0) {
				return;
			}
			throw new ServerApplicationBusyError(
				drain,
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
		 * @returns True while the server accepts them.
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
		activeMutations: (): readonly ServerActiveMutation[] => [...active.values()],
	});
}
export { ServerApplicationBusyError, createServerMutationAdmission, type ServerMutationLease };
