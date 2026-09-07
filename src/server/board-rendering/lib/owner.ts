import {
	BOARD_RENDER_CLEANUP_MS,
	BOARD_RENDER_JOB_TIMEOUT_MS,
	BOARD_RENDER_STARTUP_TIMEOUT_MS,
} from "@/shared/timing/timing";
import type {
	BoardRendererJob,
	BoardRendererJobResult,
} from "@/server/board-rendering/lib/contract";
import { createRendererFixture, type RendererFixture } from "@/server/board-rendering/lib/fixture";
import { BoardRendererError } from "@/server/board-rendering/lib/renderer-failure";
import { abortReason, abortable } from "@/server/board-rendering/lib/renderer-process";
import {
	RendererSession,
	type BoardRenderingOwnerTestHooks,
	type RendererSessionCleanup,
	type ResolvedOwnerOptions,
} from "@/server/board-rendering/lib/renderer-session";

/** What a caller may settle about the renderer this owner runs. */
interface BoardRenderingOwnerOptions {
	readonly chromiumPath?: string;
	readonly setsidPath?: string;
	readonly jobTimeoutMs?: number;
	readonly startupTimeoutMs?: number;
	readonly cleanupTimeoutMs?: number;
	/** Deterministic fault and scheduling controls used only by the focused owner test. */
	readonly testHooks?: BoardRenderingOwnerTestHooks;
}

/** What the renderer owner is doing now, for the health report. */
interface BoardRenderingOwnerStatus {
	readonly started: boolean;
	readonly accepting: boolean;
	readonly active: boolean;
	readonly queued: number;
	readonly chromiumStarts: number;
	readonly chromiumPid: number | null;
	readonly tempRoot: string | null;
	readonly profile: string | null;
	readonly controlPort: number | null;
	readonly fixturePort: number | null;
}

/** What a stopped renderer proved about its own teardown, fixture included. */
interface BoardRendererCleanup extends RendererSessionCleanup {
	readonly fixtureClosed: boolean;
}

/**
 * Where the executables the renderer spawns are: what the caller gave, else
 * what the environment names, else what this machine has. An empty path is
 * refused later, by name, when the renderer first starts.
 * @param options What the caller settled.
 * @returns The two paths.
 */
function resolvedExecutables(options: BoardRenderingOwnerOptions): {
	chromiumPath: string;
	setsidPath: string;
} {
	return {
		chromiumPath:
			options.chromiumPath ??
			process.env["ARCHBOARD_RENDERER_CHROMIUM"] ??
			Bun.which("chromium") ??
			"",
		setsidPath: options.setsidPath ?? Bun.which("setsid") ?? "",
	};
}

/**
 * Everything the renderer needs settled, from what the caller gave, the
 * environment, and this machine's own executables.
 * @param options What the caller settled.
 * @param countStart Called as each Chromium starts, before the caller's own hook.
 * @returns The resolved options.
 */
function resolveOwnerOptions(
	options: BoardRenderingOwnerOptions,
	countStart: () => void,
): ResolvedOwnerOptions {
	const configuredHooks = options.testHooks ?? {};
	return {
		...resolvedExecutables(options),
		jobTimeoutMs: options.jobTimeoutMs ?? BOARD_RENDER_JOB_TIMEOUT_MS,
		startupTimeoutMs: options.startupTimeoutMs ?? BOARD_RENDER_STARTUP_TIMEOUT_MS,
		cleanupTimeoutMs: options.cleanupTimeoutMs ?? BOARD_RENDER_CLEANUP_MS,
		testHooks: {
			...configuredHooks,
			/**
			 * Count each Chromium this owner starts, then tell the test's own hook.
			 * @param pid The started process.
			 */
			onChromiumStart(pid) {
				countStart();
				configuredHooks.onChromiumStart?.(pid);
			},
		},
	};
}

/**
 * What the running renderer session is, for the status report.
 * @param session The session, or null when none is running.
 * @returns The session's part of the status.
 */
function sessionStatus(session: RendererSession | null): {
	chromiumPid: number | null;
	tempRoot: string | null;
	profile: string | null;
	controlPort: number | null;
} {
	if (session === null) {
		return { chromiumPid: null, tempRoot: null, profile: null, controlPort: null };
	}
	return {
		chromiumPid: session.pid,
		tempRoot: session.tempRoot,
		profile: session.profile,
		controlPort: session.port,
	};
}

/**
 * The failure a job that took its renderer down with it throws, carrying both
 * what the job said and what the teardown proved.
 * @param error What the job threw.
 * @param cleanup What the teardown proved.
 * @returns The failure.
 */
function jobAndCleanupFailure(error: unknown, cleanup: RendererSessionCleanup): BoardRendererError {
	const rendererFailure = error instanceof BoardRendererError ? error : null;
	return new BoardRendererError(
		"Board renderer job and cleanup failed.",
		rendererFailure === null ? "cleanup" : rendererFailure.phase,
		[...(rendererFailure === null ? [] : rendererFailure.diagnostics), { cleanup }],
		error,
	);
}

/** What a stopped session that never started proved, which is everything. */
const NOTHING_TO_CLEAN: RendererSessionCleanup = {
	clean: true,
	pids: [],
	processesGone: true,
	survivors: [],
	groupAbsent: true,
	leaderSettled: true,
	stdoutSettled: true,
	stderrSettled: true,
	profileRemoved: true,
	tempRootRemoved: true,
	portReleased: true,
	errors: [],
};

/**
 * The board renderer this canvas runs: one headless Chromium at a time,
 * started on demand, running one job at a time, and torn down provably.
 * @param options What the caller settles about the renderer.
 * @returns The owner.
 */
function createBoardRenderingOwner(options: BoardRenderingOwnerOptions = {}) {
	let chromiumStarts = 0;
	const resolved = resolveOwnerOptions(options, () => {
		chromiumStarts += 1;
	});
	let started = false;
	let accepting = false;
	let stopping = false;
	let active = false;
	let queued = 0;
	let fixture: RendererFixture | null = null;
	let session: RendererSession | null = null;
	let acquisition: Promise<RendererSession> | null = null;
	let tail: Promise<void> = Promise.resolve();
	let stopPromise: Promise<BoardRendererCleanup> | null = null;
	let lastCleanup: BoardRendererCleanup | null = null;

	/** Begin accepting render work; the renderer itself starts with the first job. */
	const start = (): void => {
		if (started) {
			return;
		}
		started = true;
		accepting = true;
	};

	/**
	 * The running renderer session, started with its page fixture if this is the
	 * first job, and refused when the owner stopped meanwhile.
	 * @returns The session.
	 */
	const acquire = async (): Promise<RendererSession> => {
		if (session) {
			return session;
		}
		if (acquisition) {
			return acquisition;
		}
		acquisition = (async () => {
			if (!fixture) {
				try {
					fixture = await createRendererFixture(resolved.testHooks);
				} catch (error) {
					throw new BoardRendererError(
						"Board renderer fixture could not start.",
						"fixture-startup",
						[],
						error,
					);
				}
			}
			if (stopping) {
				throw new Error("Board renderer stopped during startup.");
			}
			const acquired = await RendererSession.acquire(fixture.url, resolved);
			if (stopping) {
				await acquired.close();
				throw new Error("Board renderer stopped during startup.");
			}
			session = acquired;
			return acquired;
		})().finally(() => {
			acquisition = null;
		});
		return acquisition;
	};

	/**
	 * Run one render job: queued behind whatever is already running, cancellable
	 * while it waits, and answered with what the renderer produced. A job that
	 * fails inside the renderer takes that renderer down with it.
	 * @param job The job.
	 * @param signal Cancels it.
	 * @returns The job's result.
	 */
	const execute = async (
		job: BoardRendererJob,
		signal?: AbortSignal,
	): Promise<BoardRendererJobResult> => {
		if (!started || !accepting) {
			throw new Error("Board renderer is not accepting work.");
		}
		signal?.throwIfAborted();
		queued += 1;
		const state: { value: "queued" | "active" | "settled" } = { value: "queued" };
		let resolveResult!: (result: BoardRendererJobResult) => void;
		let rejectResult!: (error: unknown) => void;
		const result = new Promise<BoardRendererJobResult>((resolveJob, rejectJob) => {
			resolveResult = resolveJob;
			rejectResult = rejectJob;
		});
		/** Settle a queued job the caller cancelled before it began. */
		const onAbort = (): void => {
			if (state.value !== "queued" || !signal) {
				return;
			}
			state.value = "settled";
			queued -= 1;
			rejectResult(abortReason(signal));
		};
		signal?.addEventListener("abort", onAbort, { once: true });
		const before = tail;
		tail = (async () => {
			await before;
			if (state.value === "settled") {
				return undefined;
			}
			queued -= 1;
			state.value = "active";
			if (!accepting) {
				rejectResult(
					new BoardRendererError("Board renderer stopped before queued work began.", "shutdown"),
				);
				state.value = "settled";
				return undefined;
			}
			active = true;
			try {
				resolveResult(await runOnRenderer(job, signal));
			} catch (error) {
				rejectResult(error);
			} finally {
				active = false;
				state.value = "settled";
				signal?.removeEventListener("abort", onAbort);
			}
			return undefined;
		})();
		return result;
	};

	/**
	 * Run one job on the renderer, taking the renderer down when the job failed
	 * inside it: a renderer that failed a job is not trusted with the next one.
	 * @param job The job.
	 * @param signal Cancels it.
	 * @returns The job's result.
	 */
	const runOnRenderer = async (
		job: BoardRendererJob,
		signal?: AbortSignal,
	): Promise<BoardRendererJobResult> => {
		let enteredRenderer = false;
		try {
			const current = await acquire();
			signal?.throwIfAborted();
			await abortable(Promise.resolve(resolved.testHooks.beforeRun?.(job, signal)), signal);
			signal?.throwIfAborted();
			enteredRenderer = true;
			return await current.run(job, signal);
		} catch (error) {
			throw enteredRenderer ? await retireFailedRenderer(error) : error;
		}
	};

	/**
	 * Close the renderer a job failed inside, and say so when that close was
	 * itself unclean.
	 * @param error What the job threw.
	 * @returns The failure to throw.
	 */
	const retireFailedRenderer = async (error: unknown): Promise<unknown> => {
		const failed = session;
		if (failed === null) {
			return error;
		}
		session = null;
		const cleanup = await failed.close();
		return cleanup.clean ? error : jobAndCleanupFailure(error, cleanup);
	};

	/**
	 * The session a stop has to tear down: the running one, or the one a start
	 * still in flight produced. Its close begins at once, before the queue is
	 * drained, so work already inside the renderer settles against a closing one.
	 * @returns The session, or null when none was ever started.
	 */
	const stoppingSession = async (): Promise<RendererSession | null> => {
		const acquired = (await acquisition?.catch(() => null)) ?? null;
		const current = session ?? acquired;
		session = null;
		void current?.close();
		return current;
	};

	/**
	 * Close the page fixture, if one was started, and say whether it really
	 * stopped listening.
	 * @param errors Where to record a close that failed.
	 * @returns Whether the fixture is closed.
	 */
	const closeFixture = async (errors: string[]): Promise<boolean> => {
		if (fixture === null) {
			return true;
		}
		try {
			await fixture.close();
			return !fixture.listening();
		} catch (error) {
			errors.push(error instanceof Error ? error.message : String(error));
			return false;
		}
	};

	/**
	 * Stop accepting work, finish what is running, and tear the renderer and its
	 * page fixture down, refusing to report success unless both went cleanly.
	 * @returns What the teardown proved.
	 */
	const stop = (): Promise<BoardRendererCleanup> => {
		if (stopPromise) {
			return stopPromise;
		}
		accepting = false;
		stopping = true;
		stopPromise = (async () => {
			const current = await stoppingSession();
			await tail;
			const sessionCleanup = current === null ? NOTHING_TO_CLEAN : await current.close();
			const errors = [...sessionCleanup.errors];
			const fixtureClosed = await closeFixture(errors);
			const cleanup: BoardRendererCleanup = {
				...sessionCleanup,
				fixtureClosed,
				errors,
				clean: sessionCleanup.clean && fixtureClosed && errors.length === 0,
			};
			fixture = null;
			lastCleanup = cleanup;
			if (!cleanup.clean) {
				throw new Error(`Board renderer cleanup failed: ${JSON.stringify(cleanup)}`);
			}
			return cleanup;
		})();
		return stopPromise;
	};

	return Object.freeze({
		start,
		execute,
		stop,
		forceStop: stop,
		/**
		 * What the renderer is doing now, for the health report.
		 * @returns The status.
		 */
		status: (): BoardRenderingOwnerStatus => ({
			started,
			accepting,
			active,
			queued,
			chromiumStarts,
			...sessionStatus(session),
			fixturePort: fixture === null ? null : fixture.port,
		}),
		/**
		 * What the last teardown proved, for a caller checking after a stop.
		 * @returns The cleanup, or null before the first stop.
		 */
		lastCleanup: (): BoardRendererCleanup | null => lastCleanup,
	});
}

export {
	type BoardRenderingOwnerOptions,
	type BoardRenderingOwnerTestHooks,
	type BoardRenderingOwnerStatus,
	type RendererSessionCleanup,
	type BoardRendererCleanup,
	BoardRendererError,
	createBoardRenderingOwner,
};
