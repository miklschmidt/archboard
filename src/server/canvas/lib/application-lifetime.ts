export type CanvasApplicationPhase =
	| "idle"
	| "starting"
	| "running"
	| "stopping"
	| "stopped"
	| "failed";

export type CanvasApplicationStopReason = NodeJS.Signals | "startup-failed" | "test";

export interface CanvasApplicationResource {
	readonly name: string;
	readonly start?: () => Promise<void> | void;
	readonly stop: (reason: CanvasApplicationStopReason) => Promise<void> | void;
}

export interface CanvasApplicationEvent {
	readonly phase: CanvasApplicationPhase;
	readonly resource: string | null;
	readonly action: "phase" | "start" | "started" | "stop" | "stopped" | "failed";
}

export interface CanvasApplicationLifetimeOptions {
	readonly resources: readonly CanvasApplicationResource[];
	readonly heldBoards?: () => readonly string[];
	readonly observe?: (event: CanvasApplicationEvent) => void;
	readonly stopTimeoutMs?: number;
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

/**
 * Own one canvas process generation.
 *
 * Resources start in declaration order and always stop in reverse order. A
 * partial startup is unwound before its error escapes, and shutdown continues
 * after individual cleanup failures so one bad owner cannot strand the rest.
 */
export function createCanvasApplicationLifetime(options: CanvasApplicationLifetimeOptions) {
	let phase: CanvasApplicationPhase = "idle";
	let stopPromise: Promise<void> | null = null;
	const started: CanvasApplicationResource[] = [];
	const emit = (action: CanvasApplicationEvent["action"], resource: string | null = null): void =>
		options.observe?.({ phase, action, resource });
	const setPhase = (next: CanvasApplicationPhase): void => {
		phase = next;
		emit("phase");
	};
	const stopResource = async (
		resource: CanvasApplicationResource,
		reason: CanvasApplicationStopReason,
		deadline: number | null,
	): Promise<void> => {
		if (deadline === null) return void (await resource.stop(reason));
		const remainingMs = Math.max(0, deadline - Date.now());
		let timeout: ReturnType<typeof setTimeout> | null = null;
		try {
			await Promise.race([
				resource.stop(reason),
				new Promise<never>((_resolve, reject) => {
					timeout = setTimeout(
						() =>
							reject(
								new Error(
									`${resource.name} did not stop within the ${options.stopTimeoutMs}ms application shutdown cap.`,
								),
							),
						remainingMs,
					);
				}),
			]);
		} finally {
			if (timeout !== null) clearTimeout(timeout);
		}
	};

	const unwind = async (reason: CanvasApplicationStopReason): Promise<void> => {
		const failures: Error[] = [];
		const deadline =
			options.stopTimeoutMs === undefined ? null : Date.now() + options.stopTimeoutMs;
		for (const resource of started.toReversed()) {
			emit("stop", resource.name);
			try {
				await stopResource(resource, reason, deadline);
				emit("stopped", resource.name);
			} catch (error) {
				const failure = error instanceof Error ? error : new Error(String(error));
				failures.push(failure);
				emit("failed", resource.name);
			}
		}
		started.length = 0;
		if (failures.length > 0)
			throw new AggregateError(
				failures,
				`Canvas application cleanup failed: ${failures.map((failure) => failure.message).join(" ")}`,
			);
	};

	return Object.freeze({
		phase: (): CanvasApplicationPhase => phase,
		start: async (): Promise<void> => {
			if (phase !== "idle") throw new Error(`Canvas application cannot start from ${phase}.`);
			setPhase("starting");
			try {
				for (const resource of options.resources) {
					emit("start", resource.name);
					await resource.start?.();
					started.push(resource);
					emit("started", resource.name);
				}
				setPhase("running");
			} catch (startupError) {
				let failure =
					startupError instanceof Error ? startupError : new Error(String(startupError));
				try {
					await unwind("startup-failed");
				} catch (cleanupError) {
					failure = new AggregateError(
						[failure, cleanupError],
						"Canvas application startup and cleanup failed.",
					);
				}
				setPhase("failed");
				throw failure;
			}
		},
		stop: (reason: CanvasApplicationStopReason): Promise<void> => {
			if (stopPromise !== null) return stopPromise;
			if (phase === "stopped") return Promise.resolve();
			if (phase !== "running")
				return Promise.reject(new Error(`Canvas application cannot stop from ${phase}.`));
			const held = [...(options.heldBoards?.() ?? [])].toSorted();
			if (held.length > 0) return Promise.reject(new CanvasApplicationHeldError(held));
			setPhase("stopping");
			stopPromise = (async () => {
				try {
					await unwind(reason);
					setPhase("stopped");
				} catch (error) {
					setPhase("failed");
					throw error;
				}
			})();
			return stopPromise;
		},
	});
}
