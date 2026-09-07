import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";

import { processIdentity, type ProcessIdentity } from "@/runtime/engine/process-group";
import type { CodexProcessGroupIdentity } from "@/runtime/codex-process/process-group";
import type {
	BoardRendererJob,
	BoardRendererJobResult,
	RendererPageState,
} from "@/server/board-rendering/lib/contract";
import type { RendererFixtureTestHooks } from "@/server/board-rendering/lib/fixture";
import { Cdp } from "@/server/board-rendering/lib/renderer-devtools";
import { BoardRendererError, type JsonRecord } from "@/server/board-rendering/lib/renderer-failure";
import {
	abortReason,
	abortable,
	captureGroup,
	capturePipe,
	ownedProcessIds,
	readablePipe,
	rendererTempParent,
	repositoryRoot,
	requiredExecutable,
	reserveLoopbackPort,
	type CapturedPipe,
} from "@/server/board-rendering/lib/renderer-process";
import {
	isRendererJobResult,
	isRendererPageState,
} from "@/server/board-rendering/lib/renderer-results";
import {
	tearDownRendererSession,
	type RendererSessionCleanup,
} from "@/server/board-rendering/lib/renderer-teardown";

/** Deterministic fault and scheduling controls used only by the focused owner test. */
interface BoardRenderingOwnerTestHooks extends RendererFixtureTestHooks {
	beforeRun?(job: BoardRendererJob, signal?: AbortSignal): Promise<void> | void;
	afterCdpDispatch?(job: BoardRendererJob, pid: number): void;
	adjustSessionCleanup?(cleanup: RendererSessionCleanup): RendererSessionCleanup;
	onTempRoot?(root: string): void;
	onChromiumStart?(pid: number): void;
}

/** What the owner settled on, for the session it starts. */
interface ResolvedOwnerOptions {
	readonly chromiumPath: string;
	readonly setsidPath: string;
	readonly jobTimeoutMs: number;
	readonly startupTimeoutMs: number;
	readonly cleanupTimeoutMs: number;
	readonly testHooks: BoardRenderingOwnerTestHooks;
}

/** How long each poll waits before looking again. */
const RENDERER_POLL_MS = 25;

/** One headless Chromium, its renderer page, and the proof that it is gone. */
class RendererSession {
	#tempRoot: string | null = null;
	#profile: string | null = null;
	#port: number | null = null;
	#child: Bun.Subprocess | null = null;
	#candidate: ProcessIdentity | null = null;
	#group: CodexProcessGroupIdentity | null = null;
	#stdout: CapturedPipe | null = null;
	#stderr: CapturedPipe | null = null;
	#cdp: Cdp | null = null;
	#closePromise: Promise<RendererSessionCleanup> | null = null;
	readonly #observed = new Set<number>();

	/**
	 * A session is started through acquire, which is what owns the teardown of
	 * a start that fails part way.
	 * @param options What the owner settled on.
	 */
	private constructor(readonly options: ResolvedOwnerOptions) {}

	/**
	 * The Chromium process this session leads.
	 * @returns Its pid, or null before it starts.
	 */
	get pid(): number | null {
		return this.#child?.pid ?? null;
	}

	/**
	 * The browser profile directory this session owns.
	 * @returns The path, or null before it starts.
	 */
	get profile(): string | null {
		return this.#profile;
	}

	/**
	 * The temporary root everything this session writes lives under.
	 * @returns The path, or null before it starts.
	 */
	get tempRoot(): string | null {
		return this.#tempRoot;
	}

	/**
	 * The private loopback port Chromium's DevTools endpoint is on.
	 * @returns The port, or null before it starts.
	 */
	get port(): number | null {
		return this.#port;
	}

	/**
	 * Start Chromium on the renderer page, in its own process group and its own
	 * temporary root, and connect to it. A start that fails part way tears down
	 * whatever it acquired, and says so when that teardown was not clean.
	 * @param url The renderer page.
	 * @param options What the owner settled on.
	 * @returns The started session.
	 */
	static async acquire(url: string, options: ResolvedOwnerOptions): Promise<RendererSession> {
		const session = new RendererSession(options);
		try {
			await session.spawnChromium(options);
			await session.connect(url);
			return session;
		} catch (error) {
			const cleanup = await session.close();
			const diagnostics = session.processDiagnostics();
			const acquisition = new BoardRendererError(
				"Board renderer could not start.",
				"startup",
				diagnostics,
				error,
			);
			if (!cleanup.clean) {
				throw new BoardRendererError(
					"Board renderer startup and cleanup failed.",
					"startup-cleanup",
					[...diagnostics, { cleanup }],
					acquisition,
				);
			}
			throw acquisition;
		}
	}

	/**
	 * Render one job on the page, and answer what it produced.
	 * @param job The job.
	 * @param signal Cancels the job.
	 * @returns The job's result.
	 */
	async run(job: BoardRendererJob, signal?: AbortSignal): Promise<BoardRendererJobResult> {
		const { cdp, child } = this.readyRenderer();
		try {
			const evaluation = cdp.evaluate(
				`window.archboardBoardRenderer?.run(${JSON.stringify(job)})`,
				this.options.jobTimeoutMs,
			);
			this.options.testHooks.afterCdpDispatch?.(job, child.pid);
			const value = await abortable(evaluation, signal);
			signal?.throwIfAborted();
			if (!isRendererJobResult(value)) {
				throw new Error("Renderer page returned no structured result.");
			}
			return value;
		} catch (error) {
			throw await this.jobFailure(error, cdp, signal);
		}
	}

	/**
	 * What a failed job throws: the caller's own cancellation, or a renderer
	 * failure naming the phase the page was in and what it had logged.
	 * @param error What the job threw.
	 * @param cdp The DevTools connection, for its diagnostics.
	 * @param signal The caller's signal, when it had one.
	 * @returns The failure to throw.
	 */
	private async jobFailure(error: unknown, cdp: Cdp, signal?: AbortSignal): Promise<Error> {
		if (signal?.aborted) {
			return abortReason(signal);
		}
		const phase = await this.currentPhase();
		return new BoardRendererError(
			"Board renderer job failed.",
			phase?.phase ?? "unavailable",
			cdp.diagnostics(),
			error,
		);
	}

	/**
	 * The connection and process a job runs against, which must both be there
	 * and the process still running.
	 * @returns The DevTools connection and the Chromium process.
	 */
	private readyRenderer(): { cdp: Cdp; child: Bun.Subprocess } {
		const cdp = this.#cdp;
		const child = this.#child;
		if (!cdp || !child) {
			throw new BoardRendererError("Board renderer is not ready.", "startup");
		}
		if (child.exitCode !== null) {
			throw new BoardRendererError(
				`Board renderer Chromium exited with code ${child.exitCode}.`,
				"process-exit",
				cdp.diagnostics(),
			);
		}
		return { cdp, child };
	}

	/**
	 * Stop this session, once, and prove what became of everything it owned.
	 * @returns What the teardown proved.
	 */
	close(): Promise<RendererSessionCleanup> {
		this.#closePromise ??= this.closeOnce();
		return this.#closePromise;
	}

	/**
	 * Close the DevTools connection, note every process still under the leader,
	 * and hand the rest to the teardown.
	 * @returns What the teardown proved.
	 */
	private async closeOnce(): Promise<RendererSessionCleanup> {
		this.#cdp?.close();
		this.observe();
		const cleanup = await tearDownRendererSession({
			child: this.#child,
			candidate: this.#candidate,
			group: this.#group,
			stdout: this.#stdout,
			stderr: this.#stderr,
			observed: [...this.#observed],
			profile: this.#profile,
			tempRoot: this.#tempRoot,
			port: this.#port,
			cleanupTimeoutMs: this.options.cleanupTimeoutMs,
		});
		return this.options.testHooks.adjustSessionCleanup?.(cleanup) ?? cleanup;
	}

	/**
	 * Spawn Chromium under setsid, in a temporary root of its own, and start
	 * watching its output and its process group.
	 * @param options What the owner settled on.
	 */
	private async spawnChromium(options: ResolvedOwnerOptions): Promise<void> {
		const chromiumPath = requiredExecutable("chromium", options.chromiumPath || undefined);
		const setsidPath = requiredExecutable("setsid", options.setsidPath || undefined);
		this.#tempRoot = mkdtempSync(join(rendererTempParent, "archboard-board-renderer-"));
		options.testHooks.onTempRoot?.(this.#tempRoot);
		this.#profile = join(this.#tempRoot, "profile");
		mkdirSync(this.#profile, { mode: 0o700 });
		this.#port = await reserveLoopbackPort();
		const child = Bun.spawn({
			cmd: [
				setsidPath,
				chromiumPath,
				"--headless=new",
				"--disable-gpu",
				"--no-first-run",
				"--no-default-browser-check",
				"--disable-crash-reporter",
				`--user-data-dir=${this.#profile}`,
				`--remote-debugging-port=${this.#port}`,
				"about:blank",
			],
			cwd: repositoryRoot,
			env: { ...process.env, TMPDIR: this.#tempRoot },
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
		this.#child = child;
		this.#stdout = capturePipe(readablePipe(child.stdout));
		this.#stderr = capturePipe(readablePipe(child.stderr));
		options.testHooks.onChromiumStart?.(child.pid);
		this.#candidate = processIdentity(child.pid);
		this.observe();
		this.#group = await captureGroup(this.#candidate, Date.now() + options.cleanupTimeoutMs);
	}

	/**
	 * Wait for Chromium to bind its private loopback control port, failing if
	 * it exits while we wait.
	 * @param base The control endpoint.
	 * @param deadline When to give up.
	 */
	private async waitForControlPort(base: string, deadline: number): Promise<void> {
		const child = this.#child;
		while (Date.now() < deadline) {
			if (child?.exitCode != null) {
				throw new Error(`Chromium exited during startup with code ${child.exitCode}.`);
			}
			try {
				// oxlint-disable-next-line no-await-in-loop -- the port is polled: each probe waits for the last to answer
				if ((await fetch(`${base}/json/version`)).ok) {
					return;
				}
			} catch {
				// Chromium has not bound the private loopback control port yet.
			}
			// oxlint-disable-next-line no-await-in-loop -- the poll interval is the pause between sequential probes
			await Bun.sleep(RENDERER_POLL_MS);
		}
	}

	/**
	 * Open a private target on the control endpoint and answer its DevTools
	 * socket URL.
	 * @param base The control endpoint.
	 * @returns The socket URL.
	 */
	private async openRendererTarget(base: string): Promise<string> {
		let version: Response;
		try {
			version = await fetch(`${base}/json/version`);
		} catch (error) {
			throw new Error("Chromium did not bind its private control port.", { cause: error });
		}
		if (!version.ok) {
			throw new Error("Chromium did not bind its private control port.");
		}
		const created: unknown = await (
			await fetch(`${base}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" })
		).json();
		const socketUrl =
			created !== null && typeof created === "object"
				? Reflect.get(created, "webSocketDebuggerUrl")
				: undefined;
		if (typeof socketUrl !== "string") {
			throw new Error("Chromium did not create the private renderer target.");
		}
		return socketUrl;
	}

	/**
	 * Wait for the renderer page to report itself ready.
	 * @param deadline When to give up.
	 */
	private async waitForPageReady(deadline: number): Promise<void> {
		while (Date.now() < deadline) {
			// oxlint-disable-next-line no-await-in-loop -- readiness is polled: each read waits for the last to answer
			const state = await this.pageState().catch(() => null);
			if (state?.phase === "ready") {
				return;
			}
			// oxlint-disable-next-line no-await-in-loop -- the poll interval is the pause between sequential reads
			await Bun.sleep(RENDERER_POLL_MS);
		}
		throw new Error("Renderer page did not become ready before its startup deadline.");
	}

	/**
	 * Connect to Chromium's DevTools endpoint and put the renderer page on it.
	 * @param url The renderer page.
	 */
	private async connect(url: string): Promise<void> {
		if (!this.#child || this.#port === null) {
			throw new Error("Renderer process is incomplete.");
		}
		const base = `http://127.0.0.1:${this.#port}`;
		const deadline = Date.now() + this.options.startupTimeoutMs;
		await this.waitForControlPort(base, deadline);
		const socketUrl = await this.openRendererTarget(base);
		const cdp = await Cdp.connect(socketUrl, this.options.startupTimeoutMs);
		this.#cdp = cdp;
		for (const domain of ["Page.enable", "Runtime.enable", "Network.enable", "Log.enable"]) {
			// oxlint-disable-next-line no-await-in-loop -- DevTools domains are enabled one at a time, in order
			await cdp.call(domain, {}, this.options.startupTimeoutMs);
		}
		await cdp.call("Page.navigate", { url }, this.options.startupTimeoutMs);
		await this.waitForPageReady(deadline);
	}

	/**
	 * The phase the renderer page is in, or none when it cannot say.
	 * @returns The page state, or null.
	 */
	private async currentPhase(): Promise<RendererPageState | null> {
		try {
			return await this.pageState();
		} catch {
			// A page that cannot answer its own state names no phase.
			return null;
		}
	}

	/**
	 * What the renderer page says about itself.
	 * @returns Its state, or null when there is no connection or no state.
	 */
	private async pageState(): Promise<RendererPageState | null> {
		if (!this.#cdp) {
			return null;
		}
		const value = await this.#cdp.evaluate(
			"window.archboardBoardRenderer?.state ?? null",
			this.options.startupTimeoutMs,
		);
		return isRendererPageState(value) ? value : null;
	}

	/**
	 * The tail of each output pipe, which is what a failed render reports.
	 * @returns One record per pipe that produced anything.
	 */
	private processDiagnostics(): JsonRecord[] {
		return [
			...(this.#stdout?.tail() ? [{ stream: "stdout", tail: this.#stdout.tail() }] : []),
			...(this.#stderr?.tail() ? [{ stream: "stderr", tail: this.#stderr.tail() }] : []),
		];
	}

	/** Note every process now under this session's leader, so teardown can prove they went. */
	private observe(): void {
		if (!this.#child) {
			return;
		}
		for (const pid of ownedProcessIds(this.#child.pid)) {
			this.#observed.add(pid);
		}
	}
}

export { RendererSession };
export type { BoardRenderingOwnerTestHooks, RendererSessionCleanup, ResolvedOwnerOptions };
