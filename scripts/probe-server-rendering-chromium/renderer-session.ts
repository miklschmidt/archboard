// One server-owned headless Chromium: acquired with every resource guarded,
// driven through DevTools one job at a time, and shut down with an audit.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CodexProcessGroupIdentity } from "@/runtime/codex-process/process-group";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { Cdp } from "./devtools-client.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { chromium, cleanupTimeoutMs, jobTimeoutMs, root, setsid } from "./proof-environment.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { describeValue, isRecord, snippet, type JsonRecord } from "./proof-values.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { RendererAcquisitionError, RendererJobError } from "./renderer-errors.ts";
import {
	auditRendererCleanup,
	type CleanupAudit,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
} from "./renderer-cleanup.ts";
import {
	captureRendererProcessGroup,
	captureRendererProcessGroupCandidate,
	injectAcquisitionFailure,
	ownedProcessIds,
	pipe,
	reserveLoopbackPort,
	residentBytes,
	terminateProcessGroupForProof,
	type RendererAcquisitionFailure,
	type RendererProcessGroupCandidate,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
} from "./renderer-process.ts";

type RendererJobMode = "normal" | "missing-image" | "stall" | "immediate-evaluation-failure";

interface MemorySample {
	pids: number[];
	residentBytes: number;
}

interface JobEvidence {
	name: string;
	durationMs: number;
	result: JsonRecord;
	phase: JsonRecord;
}

/**
 * The page expression a job mode evaluates.
 * @param mode The job mode.
 * @returns The JavaScript to evaluate.
 */
function jobExpression(mode: RendererJobMode): string {
	return mode === "immediate-evaluation-failure"
		? '(() => { throw new Error("intentional immediate evaluation failure"); })()'
		: `window.runArchboardRendererProof?.(${JSON.stringify(mode)})`;
}

/**
 * Whether the DevTools HTTP endpoint answers.
 * @param base The DevTools HTTP base URL.
 * @returns Whether `/json/version` returned OK.
 */
async function devToolsAnswers(base: string): Promise<boolean> {
	try {
		return (await fetch(`${base}/json/version`)).ok;
	} catch {
		// The private DevTools server has not bound its loopback port yet.
		return false;
	}
}

/**
 * Poll the private DevTools port until it answers, the child exits or five seconds pass.
 * @param child The Chromium child.
 * @param base The DevTools HTTP base URL.
 * @param stderrText Reads the child's stderr for the exit message.
 * @throws {Error} When Chromium exits or never binds the port.
 */
async function waitForDevTools(
	child: Bun.Subprocess,
	base: string,
	stderrText: () => Promise<string>,
): Promise<void> {
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(
				// oxlint-disable-next-line no-await-in-loop -- the loop ends here; the exit message needs the settled stderr
				`Chromium exited during startup (${child.exitCode}): ${snippet(await stderrText())}`,
			);
		}
		// oxlint-disable-next-line no-await-in-loop -- polling one port; each probe waits for the previous
		if (await devToolsAnswers(base)) {
			return;
		}
		// oxlint-disable-next-line no-await-in-loop -- polling one port; each sleep follows the previous probe
		await Bun.sleep(50);
	}
	if (child.exitCode !== null || !(await devToolsAnswers(base))) {
		throw new Error("Chromium did not bind its private DevTools loopback port within 5 seconds.");
	}
}

/**
 * Create a blank renderer target and return its debugger socket URL.
 * @param base The DevTools HTTP base URL.
 * @returns The WebSocket debugger URL.
 * @throws {Error} When no target with a socket URL was created.
 */
async function openRendererTarget(base: string): Promise<string> {
	const response = await fetch(`${base}/json/new?${encodeURIComponent("about:blank")}`, {
		method: "PUT",
	});
	const target: unknown = await response.json();
	const url = isRecord(target) ? target["webSocketDebuggerUrl"] : undefined;
	if (typeof url !== "string") {
		throw new Error("Chromium did not create the private renderer target.");
	}
	return url;
}

/**
 * Stage the page at the intentional-timeout phase so an immediate failure
 * can be told apart from a timeout.
 * @param cdp The DevTools client.
 * @param name The job name.
 * @throws {Error} When the page did not stage the job.
 */
async function stageImmediateFailure(cdp: Cdp, name: string): Promise<void> {
	const staged = await cdp.evaluate(
		`window.stageArchboardRendererProof?.(${JSON.stringify(name)}, "intentional-timeout")`,
	);
	if (!isRecord(staged) || staged["job"] !== name || staged["phase"] !== "intentional-timeout") {
		throw new Error(
			`Immediate failure did not stage ${name} at intentional-timeout: ${JSON.stringify(staged)}.`,
		);
	}
}

/**
 * Whether a page proof state has settled, and how.
 * @param state The page's proof state.
 * @returns `ready`, `failed`, or undefined while the fixture is still working.
 */
function readyOrFailed(state: JsonRecord): "ready" | "failed" | undefined {
	if (state["phase"] === "ready") {
		return "ready";
	}
	return state["status"] === "failed" ? "failed" : undefined;
}

/** One acquired headless Chromium and the jobs run in it. */
class RendererSession {
	readonly startedAt = performance.now();
	#profile: string | null = null;
	#port: number | null = null;
	#child: Bun.Subprocess | null = null;
	#processGroupCandidate: RendererProcessGroupCandidate | null = null;
	#processGroup: CodexProcessGroupIdentity | null = null;
	#stdout: Promise<string> | null = null;
	#stderr: Promise<string> | null = null;
	#cdp: Cdp | null = null;
	#running = false;
	#maxConcurrentJobs = 0;
	readonly #observed = new Set<number>();

	/** Sessions are created through `acquire`. */
	private constructor() {}

	/**
	 * The renderer's profile directory.
	 * @returns The directory path.
	 * @throws {Error} Before the profile is acquired.
	 */
	get profile(): string {
		if (!this.#profile) {
			throw new Error("Renderer profile is not acquired.");
		}
		return this.#profile;
	}

	/**
	 * The renderer's DevTools port.
	 * @returns The port number.
	 * @throws {Error} Before the port is acquired.
	 */
	get port(): number {
		if (this.#port === null) {
			throw new Error("Renderer port is not acquired.");
		}
		return this.#port;
	}

	/**
	 * The Chromium child.
	 * @returns The subprocess.
	 * @throws {Error} Before the process is spawned.
	 */
	get child(): Bun.Subprocess {
		if (!this.#child) {
			throw new Error("Renderer process is not acquired.");
		}
		return this.#child;
	}

	/**
	 * Acquire a renderer, cleaning up everything acquired so far when a stage fails.
	 * @param injectedFailure The acquisition stage the proof asked to fail, if any.
	 * @returns The acquired session.
	 * @throws {RendererAcquisitionError} When a stage fails and cleanup was clean.
	 * @throws {AggregateError} When a stage fails and cleanup leaked.
	 */
	static async acquire(injectedFailure?: RendererAcquisitionFailure): Promise<RendererSession> {
		const session = new RendererSession();
		let stage = "before-profile";
		try {
			await session.acquireStages(injectedFailure, (reached) => {
				stage = reached;
			});
			return session;
		} catch (error) {
			const cleanup = await session.shutdown();
			const acquisitionFailure = new RendererAcquisitionError(stage, cleanup, error);
			if (!cleanup.clean || !cleanup.profileRemoved || !cleanup.portReleased) {
				throw new AggregateError(
					[
						acquisitionFailure,
						new Error(`Partial renderer acquisition leaked: ${JSON.stringify(cleanup)}`),
					],
					"Partial renderer acquisition cleanup failed.",
					{ cause: error },
				);
			}
			throw acquisitionFailure;
		}
	}

	/**
	 * Run the acquisition stages in order: profile, port, spawn, group capture.
	 * @param injectedFailure The acquisition stage the proof asked to fail, if any.
	 * @param reach Records the stage being entered, for the failure report.
	 */
	private async acquireStages(
		injectedFailure: RendererAcquisitionFailure | undefined,
		reach: (stage: string) => void,
	): Promise<void> {
		injectAcquisitionFailure("before-profile", injectedFailure);
		reach("profile");
		this.#profile = mkdtempSync(join(tmpdir(), "archboard-server-rendering-chromium-"));
		reach("after-profile");
		injectAcquisitionFailure("after-profile", injectedFailure);
		reach("port");
		this.#port = reserveLoopbackPort();
		reach("after-port");
		injectAcquisitionFailure("after-port", injectedFailure);
		reach("spawn");
		this.spawn();
		reach("post-spawn-candidate");
		const candidate = this.captureCandidate();
		reach("after-spawn-before-group-capture");
		injectAcquisitionFailure("after-spawn-before-group-capture", injectedFailure);
		reach("group-capture");
		this.#processGroup = await captureRendererProcessGroup(
			candidate,
			Date.now() + cleanupTimeoutMs,
			injectedFailure,
		);
		reach("after-spawn");
		injectAcquisitionFailure("after-spawn", injectedFailure);
	}

	/** Spawn Chromium in its own session with the acquired profile and port. */
	private spawn(): void {
		this.#child = Bun.spawn({
			cmd: [
				setsid,
				chromium,
				"--headless=new",
				"--disable-gpu",
				"--no-first-run",
				"--no-default-browser-check",
				"--disable-crash-reporter",
				`--user-data-dir=${this.profile}`,
				`--remote-debugging-port=${this.port}`,
				"about:blank",
			],
			cwd: root,
			stdout: "pipe",
			stderr: "pipe",
		});
	}

	/**
	 * Record the spawned leader's identity and start reading its pipes.
	 * @returns The process-group candidate to prove.
	 */
	private captureCandidate(): RendererProcessGroupCandidate {
		const candidate = captureRendererProcessGroupCandidate(this.child.pid);
		this.#processGroupCandidate = candidate;
		this.observe(ownedProcessIds(this.child.pid));
		this.#stdout = new Response(pipe(this.child.stdout)).text();
		this.#stderr = new Response(pipe(this.child.stderr)).text();
		return candidate;
	}

	/**
	 * Wait for DevTools, open the fixture page and wait for it to report ready.
	 * @param url The fixture page URL.
	 * @returns The startup memory sample and duration.
	 * @throws {Error} When Chromium or the fixture does not come up.
	 */
	async start(url: string): Promise<{ startup: MemorySample; startupMs: number }> {
		const child = this.child;
		const base = `http://127.0.0.1:${this.port}`;
		await waitForDevTools(child, base, () => this.stderrText());
		const startupPids = ownedProcessIds(child.pid);
		this.observe(startupPids);
		const cdp = await Cdp.connect(await openRendererTarget(base));
		this.#cdp = cdp;
		for (const domain of ["Page.enable", "Runtime.enable", "Network.enable", "Log.enable"]) {
			// oxlint-disable-next-line no-await-in-loop -- DevTools domains are enabled one at a time, in order
			await cdp.call(domain);
		}
		await cdp.call("Page.navigate", { url });
		await this.waitForReady();
		return {
			startup: { pids: startupPids, residentBytes: residentBytes(startupPids) },
			startupMs: performance.now() - this.startedAt,
		};
	}

	/**
	 * Refuse a job the renderer cannot take: not started, exited, or busy.
	 * @param name The job name.
	 * @returns The DevTools client.
	 * @throws {Error} When the job cannot run.
	 */
	private requireIdle(name: string): Cdp {
		const cdp = this.#cdp;
		if (!cdp) {
			throw new Error("Renderer has not started.");
		}
		if (this.child.exitCode !== null) {
			throw new Error(`Renderer ${name} cannot run: Chromium exited (${this.child.exitCode}).`);
		}
		if (this.#running) {
			throw new Error(`Renderer already owns a job; refused concurrent ${name}.`);
		}
		return cdp;
	}

	/**
	 * Run one render job in the page and collect its result and phase.
	 * @param cdp The DevTools client.
	 * @param name The job name.
	 * @param mode The job mode.
	 * @param startedAt The job's start on the monotonic clock.
	 * @returns The job evidence.
	 * @throws {Error} When the page returned no structured result.
	 */
	private async evaluateJob(
		cdp: Cdp,
		name: string,
		mode: RendererJobMode,
		startedAt: number,
	): Promise<JobEvidence> {
		const value = await cdp.evaluate(jobExpression(mode), jobTimeoutMs);
		if (!isRecord(value)) {
			throw new Error(`Renderer ${name} returned no structured result.`);
		}
		const phase = await this.proofState();
		return { name, durationMs: performance.now() - startedAt, result: value, phase };
	}

	/**
	 * Run one job, refusing concurrency, and wrap any failure with the page's state.
	 * @param name The job name.
	 * @param mode The job mode.
	 * @returns The job evidence.
	 * @throws {RendererJobError} When the job fails for any reason.
	 */
	async runJob(name: string, mode: RendererJobMode = "normal"): Promise<JobEvidence> {
		const cdp = this.requireIdle(name);
		this.#running = true;
		this.#maxConcurrentJobs = Math.max(this.#maxConcurrentJobs, 1);
		const startedAt = performance.now();
		let stagedImmediateFailure = false;
		try {
			if (mode === "immediate-evaluation-failure") {
				await stageImmediateFailure(cdp, name);
				stagedImmediateFailure = true;
			}
			return await this.evaluateJob(cdp, name, mode, startedAt);
		} catch (error) {
			const phase = await this.proofState().catch(() => ({ phase: "unavailable" }));
			throw new RendererJobError(name, phase, cdp.diagnostics(), phase, error);
		} finally {
			if (stagedImmediateFailure) {
				await cdp.evaluate("window.releaseArchboardRendererProof?.()").catch(() => undefined);
			}
			this.#running = false;
		}
	}

	/**
	 * Sample the renderer tree's memory.
	 * @returns The pids and their resident bytes.
	 */
	memory(): MemorySample {
		const pids = ownedProcessIds(this.child.pid);
		this.observe(pids);
		return { pids, residentBytes: residentBytes(pids) };
	}

	/**
	 * Evidence that jobs never overlapped.
	 * @returns The highest number of concurrent jobs seen.
	 */
	serialEvidence(): { maxConcurrentJobs: number } {
		return { maxConcurrentJobs: this.#maxConcurrentJobs };
	}

	/**
	 * Terminate the renderer's group from outside, for the child-exit proof.
	 * @throws {Error} Before the group is proven.
	 */
	terminateProcessGroupForProof(): void {
		if (!this.#processGroup) {
			throw new Error("Renderer process group is not acquired.");
		}
		terminateProcessGroupForProof(this.#processGroup);
	}

	/**
	 * Close DevTools and release every resource, proving the release.
	 * @returns The cleanup audit.
	 */
	async shutdown(): Promise<CleanupAudit> {
		this.#cdp?.close();
		if (this.#child) {
			this.observe(ownedProcessIds(this.#child.pid));
		}
		return await auditRendererCleanup({
			child: this.#child,
			candidate: this.#processGroupCandidate,
			processGroup: this.#processGroup,
			stdout: this.#stdout,
			stderr: this.#stderr,
			profile: this.#profile,
			port: this.#port,
			pids: [...this.#observed].toSorted((left, right) => left - right),
		});
	}

	/**
	 * Poll the fixture's proof state until it is ready or fails.
	 * @throws {Error} When the fixture fails or the job timeout passes.
	 */
	private async waitForReady(): Promise<void> {
		const deadline = Date.now() + jobTimeoutMs;
		let state: JsonRecord = { phase: "unavailable" };
		while (Date.now() < deadline) {
			// oxlint-disable-next-line no-await-in-loop -- polling one page state; each read follows the previous
			state = await this.proofState();
			const settled = readyOrFailed(state);
			if (settled === "ready") {
				return;
			}
			if (settled === "failed") {
				break;
			}
			// oxlint-disable-next-line no-await-in-loop -- polling one page state; each sleep follows the previous read
			await Bun.sleep(50);
		}
		throw new Error(this.notReadyMessage(state));
	}

	/**
	 * The message for a fixture that failed or never reported ready, with the
	 * page's last state and its diagnostics.
	 * @param state The last proof state read.
	 * @returns The error message.
	 */
	private notReadyMessage(state: JsonRecord): string {
		const diagnostics = this.#cdp?.diagnostics() ?? [];
		return (
			`Renderer fixture did not become ready in phase ${describeValue(state["phase"] ?? "unknown")}; ` +
			`page diagnostics=${JSON.stringify(diagnostics)}; proof=${JSON.stringify(state)}`
		);
	}

	/**
	 * The page's proof state, as the fixture publishes it.
	 * @returns The state, or an `unavailable` or `unparseable` placeholder.
	 */
	private async proofState(): Promise<JsonRecord> {
		if (!this.#cdp) {
			return { phase: "unavailable" };
		}
		const encoded = await this.#cdp.evaluate(
			"JSON.stringify(window.__archboardRendererProof ?? null)",
		);
		if (typeof encoded !== "string") {
			return { phase: "unavailable" };
		}
		try {
			const parsed: unknown = JSON.parse(encoded);
			return isRecord(parsed) ? parsed : { phase: "unparseable", value: encoded };
		} catch {
			return { phase: "unparseable", value: encoded };
		}
	}

	/**
	 * Remember pids seen in the renderer tree so cleanup can audit them.
	 * @param pids The pids observed.
	 */
	private observe(pids: readonly number[]): void {
		for (const pid of pids) {
			this.#observed.add(pid);
		}
	}

	/**
	 * The child's stderr so far, once it settles.
	 * @returns The stderr text, empty before spawn.
	 */
	private async stderrText(): Promise<string> {
		return await (this.#stderr ?? Promise.resolve(""));
	}
}

export {
	RendererAcquisitionError,
	RendererJobError,
	RendererSession,
	type JobEvidence,
	type MemorySample,
	type RendererJobMode,
};
